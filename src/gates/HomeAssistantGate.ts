import axios from 'axios';
import Logger from '../logger';
import eventEmitter, { GATE_STATE_CHANGED } from '../events';

class HomeAssistantGate {
    public enabled: boolean = false;
    public entityIds: string[] = [];
    public haUrl: string = '';
    public haToken: string = '';
    public pollIntervalMs: number = 30_000;
    public entityStates: Map<string, string> = new Map();
    public lastFetched: number | null = null;
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
                Logger.debug(`[HA Gate] Poll: ${entityId}=${result.value}`);
                anySuccess = true;
            }
            // On failure, keep the existing state value — stale is better than lost
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
                    timeout: 5000,
                }
            );

            const data = response.data as Record<string, any>

            return data.state as string;
        } catch (e: any) {
            Logger.warn(`[HA Gate] Could not fetch state for ${entityId}: ${e?.message ?? e}`);
            return null;
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    isOpen(): boolean {
        if (!this.enabled || this.entityIds.length === 0) return true;
        // Never successfully polled — fail open so startup doesn't suppress notifications
        if (this.lastFetched === null) return true;

        for (const entityId of this.entityIds) {
            const state = this.entityStates.get(entityId);
            // Entity never fetched — fail open
            if (state === undefined) return true;
            if (state !== 'on') return false;
        }
        return true;
    }

    destroy(): void {
        if (this.pollTimer !== null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
}

export default new HomeAssistantGate();
