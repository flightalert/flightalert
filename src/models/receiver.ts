import axios from 'axios';
import haversine from 'haversine';
import Logger from '../logger';

export interface IReceiverData {
    refresh: number;
    history: number
    lat: number
    lon: number
    jaeroTimeout?: number
    readsb?: boolean
    dbServer?: boolean
    binCraft?: boolean
    zstd?: boolean
    outlineJson?: boolean
    version?: string
}

export class Receiver {
    initialized: boolean = false;
    receiverData?: IReceiverData;

    constructor() {}

    async init() {
        await this.pullReceiverData()
        if(
            this.receiverData &&
            this.receiverData?.lat &&
            this.receiverData?.lon
        ) {
            this.initialized = true;
        }
    }

    async getReceiverData(force: boolean = false) {
        if(this.receiverData && !force) {
            return this.receiverData;
        }

        await this.pullReceiverData();
        return this.receiverData;
    }

    async pullReceiverData(): Promise<IReceiverData> {
        try {
            Logger.info('Pulling receiver data');
            const receiverHost = process.env.RECEIVER_HOST;
            const receiverPort = process.env.RECEIVER_PORT;
            const response = await axios.get(receiverHost + (receiverPort ? ':' + receiverPort : '') + '/data/receiver.json');
            this.receiverData = response.data as IReceiverData;
            return this.receiverData;
    } catch(e) {
            Logger.error('Failed to get receiver information')
            throw e;
        }
    }

    async calculateDistanceFrom(lat: number, lon: number): Promise<number | null> {
        if(!this.initialized) {
            throw Error('Receiver data not initialized.')
        }

        if(
            !this.receiverData?.lat ||
            !this.receiverData?.lon ||
            !lat ||
            !lon
        ) {
            Logger.info('not enough data for distance');
            return null;
        }

        return this.calculateDistanceFromReceiver(
            this.receiverData.lat,
            this.receiverData.lon,
            lat,
            lon
        )
    }

    async calculateDirectionTo(lat: number, lon: number): Promise<string | null> {
        if(!this.initialized) {
            throw Error('Receiver data not initialized.')
        }

        if(
            !this.receiverData?.lat ||
            !this.receiverData?.lon ||
            !lat ||
            !lon
        ) {
            return null;
        }

        return this.calculateCardinalDirection(
            this.receiverData.lat,
            this.receiverData.lon,
            lat,
            lon
        )
    }

    async calculateDistanceFromReceiver(lat1: number, lon1: number, lat2: number, lon2: number): Promise<number | null> {
        if(
            !lat1 ||
            !lon1 ||
            !lat2 ||
            !lon2
        ) {
            Logger.info('calc: not enough data for distance');
            return null;
        }

        return haversine(
            {
                latitude: lat1,
                longitude: lon1
            },
            {
                latitude: lat2,
                longitude: lon2
            },
            {
                unit: 'nmi'
            }
        )
    }

    calculateCardinalDirection(lat1: number, lon1: number, lat2: number, lon2: number): string | null {
        if(!lat1 || !lon1) {
            return null;
        }

        if(!lat2 || !lon2) {
            return null;
        }

        const dLon = lon2 - lon1;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        bearing = (bearing + 360) % 360; // Normalize to 0-360 range

        const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const index = Math.round(bearing / 45) % 8;
        return directions[index];
    }
}

export default new Receiver();
