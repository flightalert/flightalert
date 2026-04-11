import storage from 'node-persist';
import client, { Counter, Metric, MetricObjectWithValues, MetricValue, Registry } from 'prom-client';

class Metrics {
    register: Registry;
    metrics: Record<string, Metric> = {};

    constructor() {
        this.register = new client.Registry();
        this.registerDefaultMetrics();
    }

    async init() {
        // const register = this.register;
        // client.collectDefaultMetrics({ register });

        // await this.setMetricsFromCache();
    }

    async registerDefaultMetrics() {
        const flightNotificationCounter = new Counter({
            name: 'flight_alert_flight_notification_totals',
            help: 'Total number of flights that met notification criteria',
            labelNames: ['departure_city'],
            registers: [this.register]
        });

        this.registerMetric('flight_alert_flight_notification_totals', flightNotificationCounter)
    }

    // async setMetricsFromCache() {
    //     const cachedMetrics = await storage.getItem('metrics') ?? [];
    //     cachedMetrics.forEach((cachedMetric: Record<string, any>) => {
    //         let metric: Counter = this.getMetric(cachedMetric?.name) as Counter;
    //         if(
    //             cachedMetric?.type === 'counter' &&
    //             metric
    //         ) {
    //             metric = this.getMetric(cachedMetric?.name) as Counter;
    //             cachedMetric.values.forEach((value: MetricValue<string>) => {
    //                 metric.inc(value?.labels, value?.value)
    //             });
    //         }
    //     })
    // }

    registerMetric(name: string, metric: Metric): this {
        this.metrics[name] = metric;
        return this;
    }

    getMetric(name: string): Metric | undefined {
        return this.metrics[name];
    }

    async increment(metricName: string, labels: Record<string, any>): Promise<void> {
        const metric: Counter = this.getMetric(metricName) as Counter;

        if(metric) {
            metric.inc(labels);
        }

        // storage.setItem('metrics', await this.register.getMetricsAsJSON());
    }
}

export default new Metrics();
