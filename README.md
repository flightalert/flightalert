

# FlightAlert

FlightAlert monitors nearby aircraft and sends notifications based on your configuration. When an aircraft is within a certain distance and altitude, you will receive a notification. Supports ADS-B Ultrafeeder receivers and integrates with [Apprise](https://github.com/caronc/apprise) for notifications.

<a href="https://www.buymeacoffee.com/sportsreport2" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-blue.png" alt="Buy Me A Coffee" height="41" width="174"></a>

---

## Quick Start

**Prerequisites:** Docker and an ADS-B Ultrafeeder with port `30047` accessible. Verify with `nc <ultrafeeder_host> 30047`.

Create a `docker-compose.yml`:

```yaml
services:
  flightalert:
    image: ghcr.io/flightalert/flightalert:latest
    environment:
      RECEIVER_HOST: "<your_receiver_host>"
      ULTRAFEEDER_HOST: "<your_ultrafeeder_host>"
      APPRISE_NOTIFY_URLS: "<your_apprise_notify_urls>"
    volumes:
      - ./.my-storage:/app/.my-storage
    restart: unless-stopped
  apprise:
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
    restart: unless-stopped
```

```bash
docker compose up -d
```

---

## Required Configuration

| Key                   | Description                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RECEIVER_HOST`       | Host for receiver data. Can be a Piaware or ADS-B Ultrafeeder IP/Domain.                                                                                 |
| `ULTRAFEEDER_HOST`    | ADS-B Ultrafeeder host IP/Domain.                                                                                                                        |
| `APPRISE_NOTIFY_URLS` | Notification URLs from Apprise (comma-separated). See [Apprise notification services](https://github.com/caronc/apprise/wiki#notification-services). |

Additional optional variables are in the [full environment variable reference](#environment-variables).

---

## Optional Features

- [Web Dashboard](#web-dashboard) — live flight counts and receiver info (EJS + Socket.IO)
- [Prometheus Metrics](#prometheus-metrics) — Prometheus-compatible metrics endpoint
- [Custom Notifications](#custom-notifications) — override the notification message and title templates

---

## Environment Variables

### Required

| Key                   | Description                                                                                                                                              | Required |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `RECEIVER_HOST`       | Host for receiver data. Can be a Piaware or ADS-B Ultrafeeder IP/Domain.                                                                                 | ✅        |
| `ULTRAFEEDER_HOST`    | ADS-B Ultrafeeder host IP/Domain.                                                                                                                        | ✅        |
| `APPRISE_NOTIFY_URLS` | Notification URLs from Apprise (comma-separated). See [Apprise notification services](https://github.com/caronc/apprise/wiki#notification-services). | ✅        |

### Optional

| Key                      | Description                                                                                                                                  | Default                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `APP_ENV`                | Application environment (`development` / `production`).                                                                                      | `production`                 |
| `NOTIFY_DISTANCE`        | Distance (nautical miles) from receiver a plane must be within to trigger a notification.                                                    | `0.5`                        |
| `NOTIFY_ALTITUDE`        | Altitude (feet) a plane must be under to trigger a notification.                                                                             | `3000`                       |
| `RECEIVER_PORT`          | Port for the receiver (Piaware/Ultrafeeder web port). Leave empty if using a reverse proxy.                                                  | *empty*                      |
| `ULTRAFEEDER_PORT`       | ADS-B Ultrafeeder port for incoming flight data (JSON position output).                                                                      | `30047`                      |
| `SOCKET_RETRY_INTERVAL`  | Interval (ms) to wait before retrying a socket connection after disconnect.                                                                  | `15000`                      |
| `SOCKET_MAX_RETRIES`     | Maximum number of socket reconnection attempts before failing.                                                                               | `5`                          |
| `SERVICES`               | Comma-separated list of services for retrieving flight source/destination. Valid options: `flightaware`, `adsbdb`.                           | `flightaware`                |
| `SERVICES_ALWAYS_CHECK`  | Retrieve source/destination for **every** message (`true`), or only when thresholds are met (`false`).                                       | `false`                      |
| `APPRISE_API_URL`        | Apprise API URL for sending notifications.                                                                                                   | `http://apprise:8000/notify` |
| `LOG_LEVEL`              | Logging level: `DEBUG` (all messages), `INFO` (only notifications), or `ERROR` (only errors).                                                | `INFO`                       |
| `APP_SERVER_ENABLED`     | Enable the optional web dashboard (EJS + Socket.IO).                                                                                         | `false`                      |
| `APP_PORT`               | Port for the web dashboard server.                                                                                                           | `8080`                       |
| `METRICS_SERVER_ENABLED` | Enable the optional Prometheus metrics server.                                                                                               | `false`                      |
| `METRICS_PORT`           | Port for the metrics server.                                                                                                                 | `9090`                       |

---

## Web Dashboard

Enable with `APP_SERVER_ENABLED=true`. Add to your `docker-compose.yml`:

```yaml
environment:
  APP_SERVER_ENABLED: "true"
  APP_PORT: "8080"
ports:
  - "8080:8080"
```

Endpoints:
- `GET /` — live dashboard showing processed/notified flight counts and receiver info
- `GET /status` — health check returning `{"up": true}`

---

## Prometheus Metrics

Enable with `METRICS_SERVER_ENABLED=true`. Runs as a separate server from the web dashboard so Prometheus can scrape it independently. Add to your `docker-compose.yml`:

```yaml
environment:
  METRICS_SERVER_ENABLED: "true"
  METRICS_PORT: "9090"
ports:
  - "9090:9090"
```

Endpoints:
- `GET /metrics` — Prometheus text format
- `GET /metrics_json` — same metrics as JSON

Available metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `flight_alert_flight_notification_totals` | Counter | Total flights that met notification criteria, labeled by `departure_city` |

---

## Custom Notifications

### Message Body

Mount a custom template:

```yaml
volumes:
  - ./notification.ejs:/app/dist/notifications/templates/notification.ejs
```

Default template:

```text
<% if(flight.services?.flightAware?.from?.location && flight.services?.flightAware?.to?.location) { %>
<%= flight.direction %>: <%= flight.services?.flightAware?.from?.location ?? 'No From' %> -> <%= flight.services?.flightAware?.to?.location ?? 'No To' %>
<% } else { %>
<% if(flight.services?.flightAware?.blocked) { %>
<%= flight.direction %>: Blocked
<% } else { %>
<%= flight.direction %>: No Route
<% } %>
<% } %>

<% if(flight.callsign) { %>
Callsign: <%= flight.callsign %>
<% } %>

<% if(flight.flightUrl) { %>
[Info](<%= flight.flightUrl + ')' %>
<% } %>

[Map](http://flightaware.com)

<% if(flight.services?.flightAware?.planeImage) { %>
![](<%= flight.services.flightAware.planeImage %>)
<% } %>
```

Templates use [EJS](https://ejs.co/) and receive a `flight` object with the following keys:

| Key | Description | Possible Values |
|-----|-------------|-----------------|
| `direction` | Direction of the flight relative to the receiver | N, NE, E, SE, S, SW, W, NW |
| `notify` | Whether the flight met altitude and distance thresholds | `true` / `false` |
| `notifyReason` | Reason a notification was not sent | Too far away, Too high, Notified recently |
| `callsign` | Flight callsign or registration number | String |
| `flightUrl` | Link to FlightAware | URL |
| `distanceFromReceiver` | Haversine distance from receiver | Number (nautical miles) |
| `updatedAt` | When this flight was processed | Timestamp (mm/dd/yyyy hh:mm:ss 24h) |
| `services` | Route data from external services | Object (see below) |
| `rawAircraft` | Raw ADS-B data from Ultrafeeder | [Object](https://github.com/wiedehopf/readsb/blob/dev/README-json.md) |

### Services

Controlled by the `SERVICES` env var. Available: `flightaware`, `adsbdb`.

#### FlightAware

```json
{
  "flightAware": {
    "useCache": true,
    "blocked": false,
    "from": { "code": "KMKE", "location": "Milwaukee, Wisconsin" },
    "to":   { "code": "KORD", "location": "Chicago, Illinois" }
  }
}
```

On error:

```json
{ "flightAware": { "error": "<error_message>" } }
```

#### adsbdb

```json
{
  "adsbdb": {
    "from": { "code": "CYYC", "location": "Calgary, Alberta" },
    "to":   { "code": "CYYZ", "location": "Toronto, Ontario" }
  }
}
```

On error:

```json
{ "adsbdb": { "error": "<error_message>" } }
```

### Message Title

Mount a custom title template:

```yaml
volumes:
  - ./title.ejs:/app/dist/notifications/templates/title.ejs
```

The title receives the same `flight` object plus an `env` key (`development` / `production`). Default template:

```text
<%= (env === 'development' ? 'Local ' : '') + 'Flight' %>
```

### Full Flight Object Reference

<details>
<summary>Example flight JSON object</summary>

```json
{
  "alt_baro": 43000,
  "direction": "NE",
  "notify": false,
  "notifyReason": "Too far away; Too high",
  "callsign": "N183T",
  "flightUrl": "https://www.flightaware.com/live/flight/N183T",
  "distanceFromReceiver": 14.31278254376311,
  "updatedAt": "9/3/2025 23:42:03",
  "services": {
    "flightAware": {
      "useCache": true,
      "blocked": true,
      "from": { "code": "", "location": "" },
      "to":   { "code": "", "location": "" }
    },
    "adsbdb": {
      "error": "Failed to get aircraft information from ADSB DB."
    }
  },
  "rawAircraft": {
    "hex": "a14d7a",
    "type": "adsb_icao",
    "flight": "N183T   ",
    "alt_baro": 43000,
    "alt_geom": 43450,
    "gs": 483.6,
    "track": 317.93,
    "baro_rate": 0,
    "emergency": "none",
    "category": "A3",
    "nav_qnh": 1013.6,
    "nav_altitude_mcp": 43008,
    "nav_modes": ["autopilot", "althold", "tcas"],
    "lat": 43.367366,
    "lon": -89.068647,
    "nic": 8,
    "rc": 186,
    "seen_pos": 0,
    "version": 2,
    "nic_baro": 1,
    "nac_p": 10,
    "nac_v": 2,
    "sil": 3,
    "sil_type": "perhour",
    "gva": 2,
    "sda": 2,
    "mlat": [],
    "tisb": [],
    "messages": 186,
    "seen": 0,
    "rssi": -24.7,
    "alert": 0,
    "spi": 0,
    "r": "N183T",
    "t": "GA6C",
    "dbFlags": 8,
    "distanceFromReceiver": 14.31278254376311,
    "cardinalDirection": "NE",
    "notify": false,
    "notifyReason": "Too far away; Too high",
    "services": {
      "flightAware": {
        "useCache": true,
        "blocked": true,
        "from": { "code": "", "location": "" },
        "to":   { "code": "", "location": "" }
      },
      "adsbdb": {
        "error": "Failed to get aircraft information from ADSB DB."
      }
    },
    "updatedAt": "2025-09-03T23:42:03.827"
  }
}
```

</details>

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Funding

<a href="https://www.buymeacoffee.com/sportsreport2" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-blue.png" alt="Buy Me A Coffee" height="41" width="174"></a>
