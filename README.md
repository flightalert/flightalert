
# FlightAlert

FlightAlert monitors nearby aircraft and sends notifications based on your configuration.
It supports Piaware and ADSB-Ultrafeeder receivers, and integrates with [Apprise](https://github.com/caronc/apprise) for notifications.

---

## Installation

FlightAlert runs as a pre-built Docker image. Follow these steps to get started:

### Prerequisites

- Docker
- ADSB-Ultrafeeder instance with json position output port 30047 accessible (https://github.com/sdr-enthusiasts/docker-adsb-ultrafeeder)

### Steps

1. **Create a working directory**

   ```bash
   mkdir flightalert
   cd flightalert
   ```

2. **Run with Docker Compose**
   Create a `docker-compose.yml` file in the directory with the required environment variables defined directly:

   ```yaml
    services:
      flightalert:
          image: ghcr.io/flightalert/flightalert:latest
        environment:
          RECEIVER_HOST: "<your_receiver_host>"
          ULTRAFEEDER_HOST: "<your_ultrafeeder_host>"
          APPRISE_NOTIFY_URLS: "<your_apprise_notify_urls>"
        volumes:
          #Required for passing in your .env options
          - ./.env:/app/.env
          #Persistent cache storage
          - ./.my-storage:/app/.my-storage
        restart: unless-stopped
      apprise:
        container_name: apprise
        image: caronc/apprise:latest
        ports:
          - 8000:8000
        environment:
          - APPRISE_STATEFUL_MODE=simple
          - APPRISE_WORKER_COUNT=1
        volumes:
          - ./apprise/config:/config
          - ./apprise/plugin:/plugin
          - ./apprise/attach:/attach

   ```

   Optional: you can still use a `.env` file for additional optional environment variables and reference it with `env_file`:

   ```yaml
   env_file:
     - .env
   ```

   Start the service:

   ```bash
   docker compose up -d
   ```

   Or, run directly with Docker using the required environment variables inline:

   ```bash
   docker run -d --name flightalert \
     -e RECEIVER_HOST="<your_receiver_host>" \
     -e ULTRAFEEDER_HOST="<your_ultrafeeder_host>" \
     -e APPRISE_NOTIFY_URLS="<your_apprise_notify_urls>" \
     ghcr.io/flightalert/flightalert:latest
   ```

---

## Environment Variables

FlightAlert is configured via environment variables. Required variables must be set; optional variables have defaults.

### ✅ Required Environment Variables

| Key                   | Description                                                                                                                                               | Required |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `RECEIVER_HOST`       | Host to use for receiver data. Can be Piaware IP/Domain or ADSB-Ultrafeeder IP/Domain.                                                                    | ✅        |
| `ULTRAFEEDER_HOST`    | ADSB-Ultrafeeder host IP/Domain.                                                                                                                          | ✅        |
| `APPRISE_NOTIFY_URLS` | Notification URLs from Apprise (comma-separated list). See [Apprise notification services](https://github.com/caronc/apprise/wiki#notification-services). | ✅        |

---

### ⚙️ Optional Environment Variables

| Key                     | Description                                                                                                                                  | Required | Default                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| `APP_ENV`               | Application environment (`development` / `production`).                                                                                      | ❌        | `production`                   |
| `NOTIFY_DISTANCE`       | Distance (nautical miles) from receiver a plane must be within to trigger a notification.                                                    | ❌        | `0.5`                          |
| `NOTIFY_ALTITUDE`       | Altitude (feet) a plane must be under to trigger a notification.                                                                             | ❌        | `3000`                         |
| `RECEIVER_PORT`         | Port to use for the receiver (Piaware/Ultrafeeder web port). Leave empty if using a reverse proxy.                                           | ❌        | *empty*                        |
| `ULTRAFEEDER_PORT`      | ADSB-Ultrafeeder port for incoming flight data (JSON position output).                                                                       | ❌        | `30047`                        |
| `SOCKET_RETRY_INTERVAL` | Interval (ms) to wait before retrying a socket connection after disconnect.                                                                  | ❌        | `15000`                        |
| `SOCKET_MAX_RETRIES`    | Maximum number of socket reconnection attempts before failing.                                                                               | ❌        | `5`                            |
| `SERVICES`              | Comma-separated list of services for retrieving flight source/destination. Valid options: `flightaware`, `adsbdb`.                           | ❌        | `flightaware`                  |
| `SERVICES_ALWAYS_CHECK` | Retrieve source/destination for **every** message (`true`), or only when `NOTIFY_DISTANCE` / `NOTIFY_ALTITUDE` thresholds are met (`false`). | ❌        | `false`                        |
| `APPRISE_API_URL`       | Apprise API URL for sending notifications. Defaults to internal service, but can be overridden.                                              | ❌        | `http://localhost:8000/notify` |
| `LOG_LEVEL`             | Logging level: `DEBUG` (all messages), `INFO` (only notifications), or `ERROR` (only errors).                                                | ❌        | `INFO`                         |

## Funding

<a href="https://www.buymeacoffee.com/sportsreport2" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-blue.png" alt="Buy Me A Coffee" height="41" width="174"></a>

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md)  file for details.
