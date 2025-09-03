class Cache {
    cache: Record<string, any> = {}

    constructor() {}

    async get(key: string) {
        return this.cache[key];
    }

    async set(key: string, value: any) {
        this.cache[key] = value;
        return this;
    }
}

export default new Cache();
