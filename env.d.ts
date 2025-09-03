declare global {
    namespace NodeJS {
        interface ProcessEnv {
            APP_ENV: string;
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
        }
    }
}

export {};
