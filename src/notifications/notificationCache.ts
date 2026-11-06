const MAX_AGE_SECONDS = 60 * 60;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

class Cache {
    cache: Record<string, any> = {}
    private lastSweep = Date.now();

    constructor() {}

    async get(key: string) {
        return this.cache[key];
    }

    async set(key: string, value: any) {
        this.cache[key] = value;
        this.sweep();
        return this;
    }

    // Values are last-notified epoch seconds; only the recent window matters
    private sweep() {
        if (Date.now() - this.lastSweep < SWEEP_INTERVAL_MS) return;
        this.lastSweep = Date.now();

        const cutoff = Math.floor(Date.now() / 1000) - MAX_AGE_SECONDS;
        for (const key of Object.keys(this.cache)) {
            if (typeof this.cache[key] === 'number' && this.cache[key] < cutoff) {
                delete this.cache[key];
            }
        }
    }
}

export default new Cache();
