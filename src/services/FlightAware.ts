import storage from 'node-persist';
import { ChronoUnit, Instant, LocalDateTime } from '@js-joda/core'
import { IService } from './Service';
import Logger from '../logger';

export interface IFlightAwareCacheReturn {
    useCache: boolean
    flightAwareFlight: Record<string, any> | null
    error?: string
}

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

    constructor() {}

    async init() {}

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

    async getCacheCount(): Promise<number> {
        const flightAwareCache = await storage.getItem('flight_aware') ?? {};
        const numFlightsInCache = Object.keys(flightAwareCache).length

        return numFlightsInCache;
    }

    async pullFromCacheForFlightAware(flightAwareCache: Record<string, any>, callsign: string): Promise<IFlightAwareCacheReturn> {
        if(!flightAwareCache) {
            return {
                useCache: false,
                flightAwareFlight: null,
                error: 'no cache'
            };
        }

        let flightAwareFlight = flightAwareCache[callsign]
        if(!flightAwareFlight || !flightAwareFlight?.created_at_timestamp) {
            return {
                useCache: false,
                flightAwareFlight: null,
                error: 'no flight in cache / missing created_at_timestamp'
            };
        }

        const now = LocalDateTime.now();
        const created = LocalDateTime.ofInstant(
            Instant.ofEpochSecond(flightAwareFlight.created_at_timestamp)
        );

        return {
            useCache: (created.until(now, ChronoUnit.HOURS) <= this.refreshCacheEveryXHours),
            flightAwareFlight
        };
    }

    async getFlightAwareFlight(callsign: string): Promise<IFlightAware> {
        const flightAwareCache = await storage.getItem('flight_aware') ?? {};

        const pullFromCache = await this.pullFromCacheForFlightAware(flightAwareCache, callsign);
        if(pullFromCache?.useCache) {
            Logger.debug(`[FlightAware] Cache hit for ${callsign}`);
            return {
                useCache: pullFromCache.useCache,
                flightAwareFlight: pullFromCache.flightAwareFlight
            };
        }

        let data: string;
        try {
            const response = await fetch('https://www.flightaware.com/live/flight/' + callsign);
            data = await response.text();
        } catch (e: any) {
            Logger.error(`[FlightAware] HTTP fetch failed for ${callsign}: ` + (e?.message ?? e));
            return { flightAwareFlight: null, error: e?.message ?? 'fetch failed' };
        }

        const variableMatch = data.match(/var trackpollBootstrap = (\{.*?\});/);
        if(!variableMatch) {
            Logger.warn(`[FlightAware] Could not parse response for ${callsign} — page structure may have changed`);
            return {
                flightAwareFlight: null,
                error: 'No variable match from FlightAware.'
            };
        }

        const variableString = variableMatch[1];
        const flightAwareResults = JSON.parse(variableString);

        if(!flightAwareResults || !flightAwareResults?.flights) {
            Logger.warn(`[FlightAware] No flights object in response for ${callsign}`);
            return {
                error: 'No flightAwareResults.',
                flightAwareFlight: null,
            };
        }

        const firstFlight = Object.keys(flightAwareResults.flights)[0] ?? null
        if(!firstFlight) {
            Logger.debug(`[FlightAware] No flight entries for ${callsign}`);
            return {
                error: 'No flights from FlightAware.',
                flightAwareFlight: null,
            };
        }

        //Remove activityLog, track and waypoints
        delete flightAwareResults.flights[firstFlight].activityLog;
        delete flightAwareResults.flights[firstFlight].track;
        delete flightAwareResults.flights[firstFlight].waypoints;

        //Set timestamp
        flightAwareResults.created_at_timestamp = Instant.now().epochSecond();

        const flightAwareFlight = flightAwareResults;
        flightAwareCache[callsign] = flightAwareFlight;
        await storage.setItem('flight_aware', flightAwareCache);

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
                error: flightAwareFlight?.error,
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
