import storage from 'node-persist';
import { Instant } from '@js-joda/core'
import { IService } from './Service';
import Logger from '../logger';

export interface IFlightAware {
    error?: string
    useCache?: boolean
    flightAwareFlight: Record<string, any> | null
}

export interface IFlightAwareCheckReturn {
    flightBlocked: boolean
    useCache: boolean
    planeImage?: string
    origin: Record<string, any>
    destination: Record<string, any>
    error?: string
}

export class FlightAware implements IService {
    name = 'flightAware';
    refreshCacheEveryXHours = 12;

    private static readonly PERSIST_PREFIX = 'flight_aware:';
    private static readonly LEGACY_KEY = 'flight_aware';
    private static readonly FAILURE_TTL_MS = 10 * 60 * 1000;
    private static readonly FETCH_TIMEOUT_MS = 10_000;
    private static readonly PRUNE_INTERVAL_MS = 10 * 60 * 1000;
    private static readonly MAX_MEMORY_ENTRIES = 5000;
    private static readonly BACKOFF_START_MS = 30_000;
    private static readonly BACKOFF_MAX_MS = 5 * 60 * 1000;

    constructor() {}

    async init() {
        // Older versions kept every flight under one key (100+ MB, re-read and
        // re-written on each lookup). Drop it; per-callsign entries rebuild on demand.
        try {
            await storage.removeItem(FlightAware.LEGACY_KEY);
        } catch (e: any) {
            Logger.warn(`[FlightAware] Could not remove legacy cache: ${e?.message ?? e}`);
        }

        this.pruneTimer = setInterval(() => this.prune(), FlightAware.PRUNE_INTERVAL_MS);
        this.pruneTimer.unref();
    }

    async check(callsign: string, hex: string): Promise<Record<string, any>> {
        const flightAwareCheck = await this.checkFlightAware(callsign)

        let flightAware: Record<string, any> = {
            'useCache': flightAwareCheck?.useCache,
            'blocked': flightAwareCheck?.flightBlocked,
            'planeImage': flightAwareCheck?.planeImage,
            from: flightAwareCheck?.origin,
            to: flightAwareCheck?.destination,
        }
        if(flightAwareCheck?.error) {
            flightAware = {
                error: flightAwareCheck.error
            }
        }
        return flightAware;
    }

    /**
     * Cache layout:
     *  - `memory`: hot, in-process copy keyed by callsign. Never read from disk on a hit.
     *  - node-persist, one small key per callsign (`flight_aware:<callsign>`), so a
     *    restart does not trigger a burst of scrapes and nothing ever re-serializes
     *    the whole cache. Each key carries its own TTL.
     *  - `failures`: short-lived, in-memory negative cache so a flight FlightAware
     *    cannot resolve is not re-scraped on every message.
     */
    private memory = new Map<string, Record<string, any>>();
    private failures = new Map<string, { error: string, expiresAt: number }>();
    private pruneTimer: ReturnType<typeof setInterval> | null = null;

    private get cacheTtlMs(): number {
        return this.refreshCacheEveryXHours * 60 * 60 * 1000;
    }

    private persistKey(callsign: string): string {
        return `${FlightAware.PERSIST_PREFIX}${callsign}`;
    }

    private isFresh(flight: Record<string, any> | undefined | null): boolean {
        if(!flight?.created_at_timestamp) return false;
        return (Instant.now().epochSecond() - flight.created_at_timestamp) * 1000 <= this.cacheTtlMs;
    }

    private prune(): void {
        const now = Date.now();
        for (const [callsign, flight] of this.memory) {
            if(!this.isFresh(flight)) this.memory.delete(callsign);
        }
        for (const [callsign, failure] of this.failures) {
            if(failure.expiresAt <= now) this.failures.delete(callsign);
        }
    }

    private async cachedFlight(callsign: string): Promise<Record<string, any> | null> {
        const inMemory = this.memory.get(callsign);
        if(inMemory) {
            if(this.isFresh(inMemory)) return inMemory;
            this.memory.delete(callsign);
        }

        // Memory miss: one small file read, e.g. first sight of a flight after a restart
        try {
            const persisted = await storage.getItem(this.persistKey(callsign));
            if(this.isFresh(persisted)) {
                this.memory.set(callsign, persisted);
                return persisted;
            }
        } catch (e: any) {
            Logger.warn(`[FlightAware] Could not read cache for ${callsign}: ${e?.message ?? e}`);
        }

        return null;
    }

    // Keeps only what checkFlightAware reads, in the same shape as the page data
    private slimFlight(results: Record<string, any>, flightId: string): Record<string, any> {
        const flight = results.flights[flightId];
        const thumbnail = flight?.relatedThumbnails?.[0]?.thumbnail;

        return {
            created_at_timestamp: Instant.now().epochSecond(),
            flights: {
                [flightId]: {
                    blocked: flight?.blocked,
                    blockedForUser: flight?.blockedForUser,
                    userBlockMessage: flight?.userBlockMessage,
                    origin: {
                        iata: flight?.origin?.iata,
                        friendlyLocation: flight?.origin?.friendlyLocation,
                    },
                    destination: {
                        iata: flight?.destination?.iata,
                        friendlyLocation: flight?.destination?.friendlyLocation,
                    },
                    ...(thumbnail ? { relatedThumbnails: [{ thumbnail }] } : {}),
                },
            },
        };
    }

    private async storeFlight(callsign: string, flight: Record<string, any>): Promise<void> {
        this.memory.delete(callsign);
        this.memory.set(callsign, flight);
        // A Map iterates in insertion order, so the first key is the oldest entry
        while(this.memory.size > FlightAware.MAX_MEMORY_ENTRIES) {
            this.memory.delete(this.memory.keys().next().value!);
        }

        try {
            await storage.setItem(this.persistKey(callsign), flight, { ttl: this.cacheTtlMs });
        } catch (e: any) {
            // Memory copy still serves this process
            Logger.warn(`[FlightAware] Could not persist cache for ${callsign}: ${e?.message ?? e}`);
        }
    }

    private failLookup(callsign: string, error: string): IFlightAware {
        this.failures.set(callsign, { error, expiresAt: Date.now() + FlightAware.FAILURE_TTL_MS });
        return { flightAwareFlight: null, error };
    }

    // Service-wide backoff: timeouts, rate limits, blocks and server errors say nothing
    // about one callsign, so stop all live requests for a while (doubling up to a cap)
    // instead of blocking the serialized queue on each new callsign.
    private backoffUntil = 0;
    private backoffMs = 0;

    private clearBackoff(): void {
        this.backoffMs = 0;
        this.backoffUntil = 0;
    }

    private startBackoff(error: string): IFlightAware {
        this.backoffMs = Math.min(
            this.backoffMs ? this.backoffMs * 2 : FlightAware.BACKOFF_START_MS,
            FlightAware.BACKOFF_MAX_MS
        );
        this.backoffUntil = Date.now() + this.backoffMs;
        Logger.warn(`[FlightAware] ${error}; pausing live lookups for ${this.backoffMs / 1000}s`);
        return { flightAwareFlight: null, error };
    }

    async getFlightAwareFlight(callsign: string): Promise<IFlightAware> {
        // Cheapest checks first: a known-failing callsign must not cost a disk read
        const failure = this.failures.get(callsign);
        if(failure && failure.expiresAt > Date.now()) {
            Logger.debug(`[FlightAware] Skipping ${callsign}, recent failure: ${failure.error}`);
            return { flightAwareFlight: null, error: failure.error };
        }

        const cached = await this.cachedFlight(callsign);
        if(cached) {
            Logger.debug(`[FlightAware] Cache hit for ${callsign}`);
            return {
                useCache: true,
                flightAwareFlight: cached
            };
        }

        if(Date.now() < this.backoffUntil) {
            Logger.debug(`[FlightAware] Backing off, skipping live lookup for ${callsign}`);
            return { flightAwareFlight: null, error: 'FlightAware lookups paused (backing off)' };
        }

        let data: string;
        try {
            const response = await fetch('https://www.flightaware.com/live/flight/' + encodeURIComponent(callsign), {
                signal: AbortSignal.timeout(FlightAware.FETCH_TIMEOUT_MS),
            });
            if(response.status === 403 || response.status === 429 || response.status >= 500) {
                await response.body?.cancel().catch(() => {});
                return this.startBackoff(`FlightAware HTTP ${response.status}`);
            }

            if(!response.ok) {
                // e.g. 404: FlightAware answered, this callsign just has no page
                this.clearBackoff();
                await response.body?.cancel().catch(() => {});
                const error = `FlightAware HTTP ${response.status}`;
                Logger.warn(`[FlightAware] ${error} for ${callsign}`);
                return this.failLookup(callsign, error);
            }
            data = await response.text();
        } catch (e: any) {
            return this.startBackoff(`HTTP fetch failed for ${callsign}: ${e?.message ?? e}`);
        }

        const variableMatch = data.match(/var trackpollBootstrap = (\{.*?\});/);
        if(!variableMatch) {
            Logger.warn(`[FlightAware] Could not parse response for ${callsign} — page structure may have changed`);
            return this.failLookup(callsign, 'No variable match from FlightAware.');
        }

        let flightAwareResults: Record<string, any>;
        try {
            flightAwareResults = JSON.parse(variableMatch[1]);
        } catch (e: any) {
            Logger.warn(`[FlightAware] Invalid JSON in response for ${callsign}: ${e?.message ?? e}`);
            return this.failLookup(callsign, 'Invalid JSON from FlightAware.');
        }

        // Real data came back, so the service is healthy. (Headers alone, or a 200
        // challenge page without the data, are not proof of that.)
        this.clearBackoff();

        if(!flightAwareResults || !flightAwareResults?.flights) {
            Logger.warn(`[FlightAware] No flights object in response for ${callsign}`);
            return this.failLookup(callsign, 'No flightAwareResults.');
        }

        const firstFlight = Object.keys(flightAwareResults.flights)[0] ?? null
        if(!firstFlight) {
            Logger.debug(`[FlightAware] No flight entries for ${callsign}`);
            return this.failLookup(callsign, 'No flights from FlightAware.');
        }

        const flightAwareFlight = this.slimFlight(flightAwareResults, firstFlight);

        this.failures.delete(callsign);
        await this.storeFlight(callsign, flightAwareFlight);

        return {
            useCache: false,
            flightAwareFlight
        };
    }

    async checkFlightAware(callsign: string): Promise<IFlightAwareCheckReturn | null> {

        const flightAwareResults = await this.getFlightAwareFlight(callsign);
        const flightAwareFlight = flightAwareResults.flightAwareFlight;
        if(!flightAwareFlight || flightAwareFlight?.error) {
            return {
                error: flightAwareResults.error ?? flightAwareFlight?.error,
                flightBlocked: false,
                useCache: false,
                origin: {},
                destination: {}
            };
        }

        const firstFlight = Object.keys(flightAwareFlight.flights)[0] ?? null
        if(!firstFlight || !flightAwareFlight.flights[firstFlight]) {
            return null;
        }

        const flight = flightAwareFlight.flights[firstFlight]

        const result: IFlightAwareCheckReturn = {
            flightBlocked: (flight?.blocked || flight?.blockedForUser || flight?.userBlockMessage) ?? false,
            useCache: flightAwareResults?.useCache ?? false,
            origin: {
                code: flight.origin?.iata ?? '',
                location: flight.origin?.friendlyLocation ?? ''
            },
            destination: {
                code: flight.destination?.iata ?? '',
                location: flight.destination?.friendlyLocation ?? ''
            }
        }

        if(flight?.relatedThumbnails?.length > 0) {
            result.planeImage = flight?.relatedThumbnails[0]?.thumbnail;
        }

        return result;
    }
}
