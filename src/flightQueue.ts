import eventEmitter, { PROCESSED_FLIGHT, PROCESSING_FLIGHT, QUEUED_FLIGHT } from './events';
import receiver from './models/receiver';
import { Aircraft } from './models/aircraft';
import PQueue from 'p-queue';
import cache from './notifications/notificationCache';
import { Instant } from '@js-joda/core'
import Logger from './logger';
import ServiceManager from './services/ServiceManager';
import NotificationManager from './notifications/NotificationManager';

let totalProcessed = 0;
const queue = new PQueue({ concurrency: 1 });

queue.on('error', error => {
	Logger.error(error);
});

const processFlight = async (aircraft: Record<string, any>) => {
    return enqueueFlight(aircraft);
}

const enqueueFlight = async (aircraft: Record<string, any>) => {
    eventEmitter.emit(QUEUED_FLIGHT, aircraft);
    queue.add(() => workFlight(aircraft));
}

const workFlight = async (aircraft: Record<string, any>): Promise<Aircraft> => {
    const aircraftModel = new Aircraft(aircraft);
    aircraftModel.lastNotified = await cache.get(aircraftModel.callsign);

    eventEmitter.emit(PROCESSING_FLIGHT, {
        callsign: aircraftModel.callsign
    });

    aircraftModel.setDistanceFromReceiver(
        await receiver.calculateDistanceFrom(
            Number(aircraftModel?.lat),
            Number(aircraftModel?.lon)
        ) ?? null
    );

    aircraftModel.setCardinalDirection(
        await receiver.calculateDirectionTo(
            Number(aircraftModel?.lat),
            Number(aircraftModel?.lon)
        )
    );

    const notify = await aircraftModel.shouldNotify();

    //Only call service checks if notifying or explicitly set to always call services
    if((notify || process.env.SERVICES_ALWAYS_CHECK === 'true') && aircraftModel?.hex) {
        for await (const service of ServiceManager.services) {
            aircraftModel.setServices(
                service.name,
                await service.check(aircraftModel.callsign, aircraftModel.hex)
            );
        }
    }

    aircraftModel.setUpdatedAt();

    if(notify) {
        const notified = await NotificationManager.notify(aircraftModel);
        if(notified) {
            Logger.info('Notified: ' + aircraftModel.callsign + '\n\n')
        }

        aircraftModel.lastNotified = Instant.now().epochSecond();
        if(aircraftModel?.callsign) {
            await cache.set(aircraftModel.callsign, aircraftModel.lastNotified);
        }
    }

    totalProcessed++;
    eventEmitter.emit(PROCESSED_FLIGHT, aircraftModel);

    // flights.set(callsign, aircraftModel);
    return aircraftModel;
}

export {
    processFlight,
    queue,
    totalProcessed
};
