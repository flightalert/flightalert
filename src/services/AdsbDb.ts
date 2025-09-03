import axios from 'axios';
import { IService } from './Service';
import { getState, getAirportInfo } from '../helpers'
import Logger from '../logger';

export interface IAirport {
    code: string
    location: string
}

export interface IAdsbDBReturn {
    error?: string
    origin: IAirport | Record<string, any>
    destination: IAirport | Record<string, any>
}

export class AdsbDb implements IService {
    name = 'adsbdb';

    constructor() {}

    async init() {}

    async check(callsign: string, hex: string): Promise<Record<string, any>> {
        const adsbDBResults = await this.checkAdsbDB(callsign, hex)

        let adsbdb: Record<string, any> = {
            from: adsbDBResults?.origin,
            to: adsbDBResults?.destination
        }
        if(adsbDBResults?.error) {
            adsbdb = {
                error: adsbDBResults.error
            }
        }

        return adsbdb;
    }

    async checkAdsbDB(callsign: string, hex: string,): Promise<IAdsbDBReturn> {
        const aircraftInfo = await this.getAircraftInfoAndRouteFromAdsbDB(callsign, hex)
        if(!aircraftInfo || aircraftInfo?.error) {
            return {
                error: "Failed to get aircraft information from ADSB DB.",
                origin: {},
                destination: {}
            }
        }

        let originAirport;
        let originLocation = '';

        let destinationLocation = '';
        let destinationAirport;

        const originAirportCode = aircraftInfo?.flightroute?.origin?.icao_code ?? 'No origin code from flight';
        if(originAirportCode !== '') {
            originAirport = await getAirportInfo(originAirportCode);
            if(originAirport?.city && originAirport?.state) {
                originLocation = [originAirport?.city, (getState(originAirport?.state) ?? originAirport?.state)].join(', ');
            }
        }

        const destinationAirportCode = aircraftInfo?.flightroute?.destination?.icao_code ?? 'No dest code from flight';
        if(destinationAirportCode !== '') {
            destinationAirport = await getAirportInfo(destinationAirportCode);
            if(destinationAirport?.city && destinationAirport?.state) {
                destinationLocation = [destinationAirport?.city, (getState(destinationAirport?.state) ?? destinationAirport?.state)].join(', ');
            }
        }

        return {
            origin: {
                code: originAirportCode,
                location: originLocation,
            },
            destination: {
                code: destinationAirportCode,
                location: destinationLocation
            }
        }
    }

    async getAircraftInfoAndRouteFromAdsbDB(callsign: string, hex: string,): Promise<Record<string, any> | null> {
        try {
            const response = await axios.get('https://api.adsbdb.com/v0/aircraft/' + hex + '?callsign=' + callsign);
            /* @ts-ignore */
            return response.data.response as Record<string, any>;
        } catch (e: any) {
            return null;
        }
    }

    async getAircraftInfo(hex: string) {
        try {
            const response = await axios.get('https://api.adsbdb.com/v0/aircraft/' + hex);
            /* @ts-ignore */
            return response.data.response.aircraft;
        } catch (e) {
            Logger.error('Failed to get aircraft information from ADSB DB.');
            throw e;
        }
    }
}
