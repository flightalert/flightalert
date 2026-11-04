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
// Safety net for any stalled job: the queue moves on (and records a failure) instead of
// blocking every later aircraft. Must stay above the slowest legitimate job (the
// 30s Apprise timeout plus service lookups); individual calls have their own timeouts.
const queue = new PQueue({ concurrency: 1, timeout: 90_000, throwOnTimeout: true });

queue.on('error', error => {
    Logger.error('[Queue]', error);
    totalFailed++;
    eventEmitter.emit(FAILED_FLIGHT, totalFailed);
});

const processFlight = async (aircraft: Record<string, any>) => {
    return enqueueFlight(aircraft);
}

// Latest payload per aircraft that is waiting in the queue (not yet started).
// A newer message for the same aircraft replaces the waiting one instead of adding
// another job, so arrival rate above processing rate cannot grow the queue per aircraft.
const pendingByAircraft = new Map<string, Record<string, any>>();
// Read lazily: this module is imported before dotenv.config() runs
const getMaxQueueSize = () => Math.max(1, parseInt(process.env.QUEUE_MAX_SIZE ?? '500') || 500);
let totalDropped = 0;
let droppedSinceHeartbeat = 0;
let lastDropWarning = 0;

// Messages dropped for capacity since the last call (for the heartbeat log)
const takeDroppedCount = (): number => {
    const dropped = droppedSinceHeartbeat;
    droppedSinceHeartbeat = 0;
    return dropped;
}

const aircraftKey = (aircraft: Record<string, any>): string | null => {
    const key = aircraft?.hex ?? aircraft?.flight?.trim?.() ?? aircraft?.r ?? null;
    return key ? String(key) : null;
}

// True when this message alone would satisfy the distance and altitude criteria
const isInNotifyRange = (aircraft: Record<string, any>): boolean => {
    const distance = receiver.distanceTo(Number(aircraft?.lat), Number(aircraft?.lon));
    return !Aircraft.isTooFar(distance) && !Aircraft.isTooHigh(aircraft?.alt_baro, aircraft?.alt_geom);
}

const enqueueFlight = async (aircraft: Record<string, any>) => {
    const key = aircraftKey(aircraft);

    if (key && pendingByAircraft.has(key)) {
        // Normally the newest message wins. But if the waiting one is in notify range
        // and the newer one is not (the aircraft has passed), keep the waiting one so
        // the alert is not lost behind a backlog.
        const waiting = pendingByAircraft.get(key)!;
        if (isInNotifyRange(waiting) && !isInNotifyRange(aircraft)) {
            Logger.debug(`[Queue] Kept in-range message for ${key} over newer out-of-range one`);
        } else {
            pendingByAircraft.set(key, aircraft);
            Logger.debug(`[Queue] Coalesced newer message for ${key}`);
        }
        return;
    }

    // At capacity, only messages that could trigger an alert are still accepted. Each
    // aircraft has at most one waiting job, so this cannot grow without bound.
    const maxQueueSize = getMaxQueueSize();
    if (queue.size >= maxQueueSize && !isInNotifyRange(aircraft)) {
        totalDropped++;
        droppedSinceHeartbeat++;
        metrics.increment('flight_alert_queue_dropped_total', {});
        // Per-drop detail would flood the log; the heartbeat reports the running count
        if (Date.now() - lastDropWarning > 60_000) {
            Logger.warn(`[Queue] At capacity (${maxQueueSize}); dropping out-of-range messages (${totalDropped} dropped so far)`);
            lastDropWarning = Date.now();
        }
        return;
    }

    if (key) pendingByAircraft.set(key, aircraft);

    queue.add(() => {
        let latest = aircraft;
        if (key) {
            latest = pendingByAircraft.get(key) ?? aircraft;
            pendingByAircraft.delete(key);
        }
        return workFlight(latest);
    }).catch(() => {
        // Already counted and logged by the queue 'error' handler
    });
    eventEmitter.emit(QUEUED_FLIGHT, aircraft);
}

const workFlight = async (aircraft: Record<string, any>): Promise<Aircraft> => {
    const aircraftModel = new Aircraft(aircraft);
    // Key on hex: it is unique and always present, while the callsign can be empty or
    // change as the feed decodes more of the aircraft's messages
    const notifyKey = aircraftModel.hex || aircraftModel.callsign;
    aircraftModel.lastNotified = notifyKey ? await cache.get(notifyKey) : undefined;

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
                if(notifyKey) {
                    await cache.set(notifyKey, aircraftModel.lastNotified);
                }
                eventEmitter.emit(NOTIFIED_FLIGHT, totalNotified);
            }
        } catch (e: any) {
            Logger.error('Failed to notify for ' + aircraftModel.callsign + ': ' + (e?.message ?? e));

            // A timeout means Apprise may still have delivered. Record the attempt so the
            // next message does not send the same alert again (a missed alert is the
            // lesser evil compared with repeated ones).
            if((e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT') && notifyKey) {
                Logger.warn(`Notification for ${aircraftModel.callsign} timed out; it may have been delivered, suppressing retries for the usual window`);
                await cache.set(notifyKey, Instant.now().epochSecond());
            }

            totalFailed++;
            eventEmitter.emit(FAILED_FLIGHT, totalFailed);
        }
    }

    totalProcessed++;
    eventEmitter.emit(PROCESSED_FLIGHT, aircraftModel);

    // flights.set(callsign, aircraftModel);
    return aircraftModel;
}

export {
    processFlight,
    takeDroppedCount,
    queue,
    totalProcessed,
    totalNotified,
    totalFailed,
};
