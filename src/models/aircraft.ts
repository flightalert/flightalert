import { ChronoUnit, DateTimeFormatter, Instant, LocalDateTime } from '@js-joda/core'

export interface IFlight {
    id?: number
    alt_baro?: string
    direction?: string
    notify?: boolean
    notifyReason: string
    callsign?: string
    flightUrl?: string
    distanceFromReceiver: number|null
    updatedAt?: string
    services: Record<string, any>
    rawAircraft?: Record<string,any>
}

export class Aircraft {
    hex?: string
    type?: string
    flight?: string
    alt_baro?: string
    alt_geom?: string
    gs?: string
    ias?: string
    tas?: string
    mach?: string
    track?: string
    track_rate?: string
    roll?: string
    mag_heading?: string
    true_heading?: string
    baro_rate?: string
    geom_rate?: string
    squawk?: string
    emergency?: string
    category?: string
    nav_qnh?: string
    nav_altitude_mcp?: string
    nav_altitude_fms?: string
    nav_heading?: string
    nav_modes?: string
    lat?: string
    lon?: string
    nic?: string
    rc?: string
    seen_pos?: string
    version?: string
    nic_baro?: string
    nac_p?: string
    nac_v?: string
    sil?: string
    sil_type?: string
    gva?: string
    sda?: string
    mlat?: string
    tisb?: string
    messages?: string
    seen?: string
    rssi?: string
    alert?: string
    spi?: string
    wd?: string
    ws?: string
    oat?: string
    tat?: string
    acas_ra?: string
    gpsOkBefore?: string

    r?: string
    t?: string
    dbFlags?: string
    lastPosition?: string
    rr_lat?: string
    rr_lon?: string

    id?: number;
    distanceFromReceiver: number | null = null
    cardinalDirection: string | null = null
    notify: boolean = false;
    notifyReason: string = '';
    services: Record<string, any> = {};
    lastNotified?: number;

    updatedAt?: LocalDateTime;

    constructor(flightData: Record<string, any>) {
        this.setFlightData(flightData);
    }

    async setFlightData(flightData: Record<string, any>) {
        this.hex = flightData?.hex;
        this.type = flightData?.type;
        this.flight = flightData?.flight;
        this.alt_baro = flightData?.alt_baro;
        this.alt_geom = flightData?.alt_geom;
        this.gs = flightData?.gs;
        this.ias = flightData?.ias;
        this.tas = flightData?.tas;
        this.mach = flightData?.mach;
        this.track = flightData?.track;
        this.track_rate = flightData?.track_rate;
        this.roll = flightData?.roll;
        this.mag_heading = flightData?.mag_heading;
        this.true_heading = flightData?.true_heading;
        this.baro_rate = flightData?.baro_rate;
        this.geom_rate = flightData?.geom_rate;
        this.squawk = flightData?.squawk;
        this.emergency = flightData?.emergency;
        this.category = flightData?.category;
        this.nav_qnh = flightData?.nav_qnh;
        this.nav_altitude_mcp = flightData?.nav_altitude_mcp;
        this.nav_altitude_fms = flightData?.nav_altitude_fms;
        this.nav_heading = flightData?.nav_heading;
        this.nav_modes = flightData?.nav_modes;
        this.lat = flightData?.lat;
        this.lon = flightData?.lon;
        this.nic = flightData?.nic;
        this.rc = flightData?.rc;
        this.seen_pos = flightData?.seen_pos;
        this.track = flightData?.track;
        this.version = flightData?.version;
        this.nic_baro = flightData?.nic_baro;
        this.nac_p = flightData?.nac_p;
        this.nac_v = flightData?.nac_v;
        this.sil = flightData?.sil;
        this.sil_type = flightData?.sil_type;
        this.gva = flightData?.gva;
        this.sda = flightData?.sda;
        this.mlat = flightData?.mlat;
        this.tisb = flightData?.tisb;
        this.messages = flightData?.messages;
        this.seen = flightData?.seen;
        this.rssi = flightData?.rssi;
        this.alert = flightData?.alert;
        this.spi = flightData?.spi;
        this.wd = flightData?.wd;
        this.ws = flightData?.ws;
        this.oat = flightData?.oat;
        this.tat = flightData?.tat;
        this.acas_ra = flightData?.acas_ra;
        this.gpsOkBefore = flightData?.gpsOkBefore;

        this.r = flightData?.r;
        this.t = flightData?.t;
        this.dbFlags = flightData?.dbFlags;
        this.lastPosition = flightData?.lastPosition;
        this.rr_lat = flightData?.rr_lat;
        this.rr_lon = flightData?.rr_lon;
    }

    get callsign() {
        return this.flight?.trim() ?? this.r ?? '';
    }

    get flightAwareUrl() {
        return this.callsign ? 'https://www.flightaware.com/live/flight/' + this.callsign : '';
    }

    getDistanceFromReceiver() {
        return this.distanceFromReceiver;
    }

    setDistanceFromReceiver(distanceFromReceiver: number | null) {
        this.distanceFromReceiver = distanceFromReceiver
        return this;
    }

    getCardinalDirection() {
        return this.cardinalDirection;
    }

    setCardinalDirection(cardinalDirection: string | null) {
        this.cardinalDirection = cardinalDirection;
        return this;
    }

    setUpdatedAt() {
        this.updatedAt = LocalDateTime.ofInstant(Instant.now());
    }

    async shouldNotify() {
        this.notify = await this.calculateIfShouldNotify()
        return this.notify;
    }

    async calculateIfShouldNotify(): Promise<boolean> {
        let notifyReasons = [];

        //Only send if, has not notified in last 5 minutes
        // (to catch when its already past the receiver and still within distanceFromReceiver parameter)
        if(this.lastNotified) {
            const now = LocalDateTime.now();
            const lastNotified = LocalDateTime.ofInstant(
                Instant.ofEpochSecond(this.lastNotified)
            );
            const difference = lastNotified.until(now, ChronoUnit.MINUTES);
            if(difference <= 5) {
                notifyReasons.push('Notified recently');
            }
        }

        if(
            this.distanceFromReceiver === null ||
            this.distanceFromReceiver > (process.env.NOTIFY_DISTANCE ?? 0.5)
        ){
            notifyReasons.push('Too far away');
        }

        if(
            this.alt_baro === null ||
            Number(this.alt_baro) > (process.env.NOTIFY_ALTITUDE ?? 3000)
        ) {
            notifyReasons.push('Too high');
        }

        this.notifyReason = notifyReasons.join('; ');

        return notifyReasons.length === 0;
    }

    async setServices(serviceName: string, serviceCheck: Record<string, any>) {
        this.services[serviceName] = serviceCheck;
        return this;
    }

    toJson(withRawData: boolean = false): IFlight {
        const json: IFlight = {
            id: this?.id,
            alt_baro: this.alt_baro,
            direction: this.cardinalDirection ?? 'Missing data',
            notify: this.notify,
            notifyReason: this.notifyReason,
            callsign: this.callsign,
            flightUrl: this.flightAwareUrl,
            distanceFromReceiver: this.distanceFromReceiver,
            updatedAt: this.updatedAt?.format(DateTimeFormatter.ofPattern('M/d/yyyy HH:mm:ss')),
            services: this.services
        }

        if(withRawData) {
            json.rawAircraft = JSON.parse(JSON.stringify(this));
        }

        return json;
    }
}
