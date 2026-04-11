import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as dotenv from 'dotenv';
import storage from 'node-persist';
import { jsonrepair } from 'jsonrepair'
import net from 'net';
import { processFlight } from './flightQueue';
import { IService } from './services/Service';
import eventEmitter, { PROCESSED_FLIGHT, PROCESSING_FLIGHT, RECEIVER_SETUP } from './events';
import receiver from './models/receiver';
import { Aircraft } from './models/aircraft';
import Logger from './logger';
import ServiceManager from './services/ServiceManager';
import NotificationManager from './notifications/NotificationManager';
import { setupWebServer } from './servers/webServer';
import { setupMetricsServer } from './servers/metricsServer';
import metrics from './metrics';

dotenv.config();
await storage.init({
    dir: './.my-storage',
    ttl: true,
    forgiveParseErrors: true,
})
await metrics.init();
Logger.setLevel(process.env.LOG_LEVEL);

let retrying = false;
let retries = 0;

const processFlightData = async (
    flights: Array<Record<string, any>>
) => {
    try {
        for await (const flight of flights) {
            await processFlight(flight);
        };
    } catch (e: any) {
        Logger.error(e.message)
        throw e;
    }
}

const processWithDataFromSocket = async () => {
    if(retrying) {
        retries++;
        Logger.info('TCP Socket: Retry #' + retries)
    }

    const client = new net.Socket();
    const port = process.env.ULTRAFEEDER_PORT ?? 30047;
    const host = process.env.ULTRAFEEDER_HOST;
    const retryInterval = process.env.SOCKET_RETRY_INTERVAL ?? 15000;
    const maxRetries = process.env.SOCKET_MAX_RETRIES ?? 5;

    client.connect(port, host, async () => {
        Logger.info('TCP Socket: listening on port ' + port);
        retrying = false;
        retries = 0;
    });

    client.on('data', async (data) => {
        try {
            const repaired = jsonrepair(data.toString());
            const repairedJson = JSON.parse(repaired);

            let flights: Array<Record<string, any>> = [];
            if(! Array.isArray(repairedJson)) {
                flights = [repairedJson];
            }

            await processFlightData(
                flights
            );

        } catch (e: any) {
            console.log(data.toString());
            Logger.error(e);
        }
    });

    client.on('close', () => {
        Logger.info('TCP Socket: Disconnected.');
        Logger.info('TCP Socket: Setting up connect retry')
        retrying = true;
        if(retries >= maxRetries) {
            Logger.error('TCP Socket: Reached maximum connect retries: ' + maxRetries)
            throw new Error('TCP Socket: Reached maximum connect retries: ' + maxRetries)
        }
        setTimeout(processWithDataFromSocket, retryInterval);
    });

    client.on('error', (err: any) => {
        Logger.error('TCP Socket: Error: ', err);
    });
}

const setupEventListeners = async () => {
    eventEmitter.on(PROCESSING_FLIGHT, (data: Record<string, any>) => {
        Logger.info('Processing: ' + data?.callsign)
    });

    eventEmitter.on(PROCESSED_FLIGHT, async (flight: Aircraft) => {
        Logger.debug(JSON.stringify(flight.toJson(true), null, 3));
        Logger.info('Processed: ' + flight.callsign + (flight.notify ? '' : '\n\n'));
    });
}

const setupReceiverData = async () => {
    await receiver.init();
    if(!receiver.initialized) {
        Logger.error('Issue setting up receiver data.');
        throw Error('Issue setting up receiver data.')
    }
    eventEmitter.emit(RECEIVER_SETUP, receiver.receiverData);
}

const setupTemplates = async () => {
    const modulePath = dirname(fileURLToPath(import.meta.url));
    const titleTemplateFilePath = resolve(modulePath, 'notifications/templates/title.ejs');
    NotificationManager.addTemplate('title', titleTemplateFilePath);

    const bodyTemplateFilePath = resolve(modulePath, 'notifications/templates/notification.ejs');
    NotificationManager.addTemplate('body', bodyTemplateFilePath);
}

const init = async () => {
    await setupTemplates();
    await setupReceiverData();
    await ServiceManager.init(process.env.SERVICES);
    await setupEventListeners();
    await processWithDataFromSocket();

    if(process.env.APP_SERVER_ENABLED === 'true') {
        await setupWebServer()
    }

    if(process.env.METRICS_SERVER_ENABLED === 'true') {
        await setupMetricsServer()
    }
}

await init();
