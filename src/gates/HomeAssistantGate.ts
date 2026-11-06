import axios from 'axios';
import Logger from '../logger';
import eventEmitter, { GATE_STATE_CHANGED } from '../events';

// The gate is open unless Home Assistant has reported an entity as 'off' recently.
// An 'off' reading older than this is ignored (HA unreachable, bad token, etc.), so a
// problem with HA can never leave notifications suppressed indefinitely.
// Keep this well above HA_POLL_INTERVAL (default 30s).
const STALE_AFTER_MS = 5 * 60 * 1000;

class HomeAssistantGate {
    private static readonly REQUEST_TIMEOUT_MS = 5000;

    public enabled: boolean = false;
    public entityIds: string[] = [];
    public haUrl: string = '';
    public haToken: string = '';
    public pollIntervalMs: number = 30_000;
    public entityStates: Map<string, string> = new Map();
    public lastFetched: number | null = null;
    // Per-entity time of last successful fetch (epoch ms)
    public entityFetchedAt: Map<string, number> = new Map();
    private lastFailureLog: Map<string, { signature: string, at: number }> = new Map();
    public pollTimer: ReturnType<typeof setInterval> | null = null;
    public lastEmittedOpen: boolean | null = null;

    async init(): Promise<void> {
        this.parseConfig();

        if (!this.enabled) {
            Logger.debug('[HA Gate] Disabled — no entity checks will be performed');
            return;
        }

        if (!this.haUrl || !this.haToken || this.entityIds.length === 0) {
            throw new Error('[HA Gate] HA_ENABLED is true but HA_URL, HA_TOKEN, and HA_GATE_ENTITIES are all required');
        }

        try {
            await this.poll();
        } catch {
            // poll() catches internally; safety net only
        }

        this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
        Logger.info(`[HA Gate] Initialized with ${this.entityIds.length} ${this.entityIds.length === 1 ? 'entity' : 'entities'}, polling every ${this.pollIntervalMs / 1000}s`);
        if (this.lastFetched === null) {
            Logger.error('[HA Gate] No entity state could be read on startup; notifications stay enabled until Home Assistant responds');
        }
    }

    private parseConfig(): void {
        this.enabled = process.env.HA_ENABLED === 'true';
        this.haUrl = (process.env.HA_URL ?? '').replace(/\/$/, '');
        this.haToken = process.env.HA_TOKEN ?? '';
        this.entityIds = (process.env.HA_GATE_ENTITIES ?? '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        this.pollIntervalMs = Number(process.env.HA_POLL_INTERVAL ?? 30) * 1000;
    }

    async poll(): Promise<void> {
        const results = await Promise.allSettled(
            this.entityIds.map(entityId => this.fetchEntityState(entityId))
        );

        let anySuccess = false;
        results.forEach((result, index) => {
            const entityId = this.entityIds[index];
            if (result.status === 'fulfilled' && result.value !== null) {
                this.entityStates.set(entityId, result.value);
                this.entityFetchedAt.set(entityId, Date.now());
                Logger.debug(`[HA Gate] Poll: ${entityId}=${result.value}`);
                anySuccess = true;
            }
            // On failure keep the last value; isOpen() ignores an 'off' once it is stale
        });

        if (anySuccess) {
            this.lastFetched = Date.now();
        }

        const currentlyOpen = this.isOpen();
        if (this.lastEmittedOpen !== null && currentlyOpen !== this.lastEmittedOpen) {
            Logger.info(`[HA Gate] State changed: ${currentlyOpen ? 'open' : 'closed'}`);
            eventEmitter.emit(GATE_STATE_CHANGED, currentlyOpen);
        }
        this.lastEmittedOpen = currentlyOpen;
    }

    private async fetchEntityState(entityId: string): Promise<string | null> {
        try {
            const response = await axios.get(
                `${this.haUrl}/api/states/${entityId}`,
                {
                    headers: { Authorization: `Bearer ${this.haToken}` },
                    timeout: HomeAssistantGate.REQUEST_TIMEOUT_MS,
                }
            );

            const state = (response.data as Record<string, any> | undefined)?.state;

            // Not a usable reading: a malformed response (e.g. a proxy login page), or HA
            // saying it cannot tell. Treat like an unreachable HA so the last real reading
            // is neither overwritten nor refreshed.
            if (typeof state !== 'string' || state === '' || state === 'unavailable' || state === 'unknown') {
                Logger.debug(`[HA Gate] Ignoring unusable state for ${entityId}: ${JSON.stringify(state)}`);
                return null;
            }

            return state;
        } catch (e: any) {
            this.logFetchFailure(entityId, e);
            return null;
        }
    }

    // Auth failures are called out explicitly; repeats are throttled so a bad token
    // does not fill the log every poll.
    private logFetchFailure(entityId: string, e: any): void {
        const status: number | undefined = e?.response?.status;
        let signature: string;
        let message: string;

        if (status === 401 || status === 403) {
            signature = `http-${status}`;
            message = `Home Assistant rejected HA_TOKEN (HTTP ${status}) fetching ${entityId}. Create a new long-lived token; the gate cannot read entity states until then`;
        } else if (status === 404) {
            signature = 'http-404';
            message = `Entity ${entityId} not found in Home Assistant (HTTP 404). Check HA_GATE_ENTITIES`;
        } else if (status) {
            signature = `http-${status}`;
            message = `Home Assistant returned HTTP ${status} fetching ${entityId}`;
        } else {
            signature = e?.code ?? 'error';
            message = `Could not reach Home Assistant at ${this.haUrl} for ${entityId}: ${e?.message ?? e}`;
        }

        const previous = this.lastFailureLog.get(entityId);
        const now = Date.now();
        if (!previous || previous.signature !== signature || now - previous.at > 10 * 60 * 1000) {
            Logger.warn(`[HA Gate] ${message}`);
            this.lastFailureLog.set(entityId, { signature, at: now });
        } else {
            Logger.debug(`[HA Gate] ${message}`);
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    // Open unless HA has recently reported an entity as 'off'. Anything else (never
    // fetched, unreachable, unusable state, a stale reading) leaves notifications on.
    isOpen(): boolean {
        if (!this.enabled || this.entityIds.length === 0) return true;

        const now = Date.now();
        return !this.entityIds.some(entityId => {
            const fetchedAt = this.entityFetchedAt.get(entityId);
            return this.entityStates.get(entityId) === 'off' &&
                fetchedAt !== undefined &&
                now - fetchedAt <= STALE_AFTER_MS;
        });
    }

    destroy(): void {
        if (this.pollTimer !== null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
}

export default new HomeAssistantGate();
