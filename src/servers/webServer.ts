import express from 'express';
import { Server } from 'socket.io';
import { createServer, Server as HttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Logger from '@/logger';
import eventEmitter, { PROCESSED_FLIGHT, QUEUED_FLIGHT, NOTIFIED_FLIGHT, FAILED_FLIGHT, RECEIVER_SETUP, GATE_STATE_CHANGED } from '@/events';
import { Aircraft } from '@/models/aircraft';
import { queue, totalProcessed, totalNotified, totalFailed } from '@/flightQueue';
import receiver, { IReceiverData } from '@/models/receiver';
import haGate from '@/gates/HomeAssistantGate';

interface IServers {
    httpServer: HttpServer,
    io: Server
}

const setupWebServer = async (): Promise<IServers> => {
    const app = express();
    const __dirname = dirname(fileURLToPath(import.meta.url));
    app.set('view engine', 'ejs');
    app.set('views', join(__dirname))
    app.use('/public', express.static('./public'));
    const httpServer = createServer(app);
    const io = new Server(httpServer);

    app.get('/', (req, res) => {
        res.render('index', {
            RECEIVER_HOST: process.env.RECEIVER_HOST,
            TOTAL_PROCESSED: totalProcessed,
            TOTAL_NOTIFIED: totalNotified,
            RECEIVER_DATA: JSON.stringify(receiver?.receiverData ?? {}),
            GATE_ENABLED: haGate.isEnabled(),
            GATE_OPEN: haGate.isOpen(),
        });
    });

    app.get('/status', (req, res) => {
        res.json({
            'up': true,
        })
    });

    io.on('connection', (socket) => {
        Logger.info('IO: A user connected');

        // Send current server state so the client has accurate counts immediately
        socket.emit('state', {
            processed: totalProcessed,
            notified: totalNotified,
            failed: totalFailed,
            queued: queue.size,
            gateEnabled: haGate.isEnabled(),
            gateOpen: haGate.isOpen(),
        });

        if (receiver?.receiverData) {
            socket.emit('receiver_setup', receiver.receiverData);
        }

        socket.on('disconnect', () => {
            Logger.info('IO: A user disconnected');
        });
    });

    httpServer.listen(process.env.APP_PORT, () => {
        Logger.info('Http Server: listening on port ' + process.env.APP_PORT);
    });

    setupServerEventListeners(io);

    return {
        httpServer,
        io
    }
}

const setupServerEventListeners = (io: Server) => {
    eventEmitter.on(RECEIVER_SETUP, async (receiverData: IReceiverData) => {
        io.emit('receiver_setup', receiverData);
    });

    eventEmitter.on(PROCESSED_FLIGHT, async (flight: Aircraft) => {
        io.emit('flight', flight.toJson(true));
        io.emit('completed_flight', totalProcessed)
    });

    eventEmitter.on(QUEUED_FLIGHT, async (aircraft) => {
        io.emit('queued_flight', queue.size);
    });

    eventEmitter.on(NOTIFIED_FLIGHT, async (totalNotified) => {
        io.emit('notified_flight', totalNotified);
    });

    eventEmitter.on(FAILED_FLIGHT, async (totalFailed) => {
        io.emit('failed_flight', totalFailed);
    });

    eventEmitter.on(GATE_STATE_CHANGED, async (open: boolean) => {
        io.emit('gate_state', { open });
    });
}

export { IServers, setupWebServer }
