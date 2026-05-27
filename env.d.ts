declare global {
    namespace NodeJS {
        interface ProcessEnv {
            APP_ENV: string;
            APP_SERVER_ENABLED: string;
            APP_PORT: number;
            METRICS_SERVER_ENABLED: string;
            METRICS_PORT: number;
            NOTIFY_DISTANCE: number;
            NOTIFY_ALTITUDE: number;
            FLIGHT_LINK_HOST: string;
            FLIGHT_LINK_PORT: number;
            ULTRAFEEDER_HOST: string;
            ULTRAFEEDER_PORT: number;
            SOCKET_RETRY_INTERVAL: number;
            SOCKET_MAX_RETRIES: number;
            APPRISE_NOTIFY_URLS: string;
            APPRISE_API_URL: string;
            SERVICES: string;
            SERVICES_ALWAYS_CHECK: string;
            LOG_LEVEL: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
            HA_ENABLED?: string;
            HA_URL?: string;
            HA_TOKEN?: string;
            HA_GATE_ENTITIES?: string;
            HA_POLL_INTERVAL?: string;
        }
    }
}

export {};
