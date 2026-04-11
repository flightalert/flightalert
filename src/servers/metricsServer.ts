import express from 'express';
import { createServer } from 'node:http';
import Logger from '@/logger';
import metrics from '../metrics';

const setupMetricsServer = async () => {
    const app = express();

    app.get('/', async (req, res) => {
        res.send('Visit /metrics or /metrics_json for prometheus metrics')
    });

    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', metrics.register.contentType);
        res.end(await metrics.register.metrics());
    });

    app.get('/metrics_json', async (req, res) => {
        res.json(await metrics.register.getMetricsAsJSON());
    });

    const httpServer = createServer(app);
    httpServer.listen(process.env.METRICS_PORT, () => {
        Logger.info('Metrics Server: listening on port ' + process.env.METRICS_PORT);
    });

    return httpServer;
}

export { setupMetricsServer };
