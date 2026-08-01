import eventEmitter, { FAILED_FLIGHT, NOTIFIED_FLIGHT, PROCESSED_FLIGHT, PROCESSING_FLIGHT, QUEUED_FLIGHT } from './events';
import receiver from './models/receiver';
import { Aircraft } from './models/aircraft';
import PQueue from 'p-queue';
import cache from './notifications/notificationCache';
import { Instant } from '@js-joda/core'
import Logger from './logger';
import ServiceManager from './services/ServiceManager';
import NotificationManager from './notifications/NotificationManager';
import metrics from './metrics';
import haGate from './gates/HomeAssistantGate';

let totalProcessed = 0;
let totalNotified = 0;
let totalFailed = 0;
const queue = new PQueue({ concurrency: 1 });

queue.on('error', error => {
    Logger.error('[Queue]', error);
    totalFailed++;
    eventEmitter.emit(FAILED_FLIGHT, totalFailed);
});

const processFlight = async (aircraft: Record<string, any>) => {
    return enqueueFlight(aircraft);
}

const enqueueFlight = async (aircraft: Record<string, any>) => {
    queue.add(() => workFlight(aircraft));
    eventEmitter.emit(QUEUED_FLIGHT, aircraft);
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

    const gateOpen = haGate.isOpen();
    if (notify && !gateOpen) {
        Logger.info(`[HA Gate] Suppressed notification for ${aircraftModel.callsign}`);
    }

    //Only call service checks if notifying (and gate is open) or explicitly set to always call services
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
        await metrics.increment('flight_alert_flight_notification_totals', {
            'departure_city': aircraftModel.services?.flightAware?.from?.location
        });
    }

    if(notify && gateOpen) {
        try {
            const notified = await NotificationManager.notify(aircraftModel);
            if(notified) {
                Logger.info('Notified: ' + aircraftModel.callsign)
                totalNotified++;
                aircraftModel.lastNotified = Instant.now().epochSecond();
                if(aircraftModel?.callsign) {
                    await cache.set(aircraftModel.callsign, aircraftModel.lastNotified);
                }
            }
        } catch (e: any) {
            Logger.error('Failed to notify for ' + aircraftModel.callsign + ': ' + (e?.message ?? e));
            totalFailed++;
            eventEmitter.emit(FAILED_FLIGHT, totalFailed);
        }
    }

    totalProcessed++;
    eventEmitter.emit(PROCESSED_FLIGHT, aircraftModel);

    eventEmitter.emit(NOTIFIED_FLIGHT, totalNotified);

    // flights.set(callsign, aircraftModel);
    return aircraftModel;
}

export {
    processFlight,
    queue,
    totalProcessed,
    totalNotified,
    totalFailed,
};
