

# FlightAlert

FlightAlert monitors nearby aircraft and sends notifications based on your configuration. When an aircraft is within a certain distance an altitude, you will receive a notification. The notifications are configurable by overriding the template used in the container.
It supports ADS-B Ultrafeeder receivers, and integrates with [Apprise](https://github.com/caronc/apprise) for notifications.

---

## Installation

FlightAlert runs as a pre-built Docker image. Follow these steps to get started:

### Prerequisites

- Docker
- ADS-B Ultrafeeder instance with json position output port 30047 accessible (https://github.com/sdr-enthusiasts/docker-adsb-ultrafeeder)
	- Forward port 30047 from your ultrafeeder docker configuration
	- Verify this is working by using `nc <ultrafeeder_host> 30047`
		- [Netcat](https://netcat.sourceforge.net/)

### Steps

1. **Create a working directory**

   ```bash
   mkdir flightalert
   cd flightalert
   ```

2. **Run with Docker Compose**
   Create a `docker-compose.yml` file:

   ```yaml
    services:
      flightalert:
          image: ghcr.io/flightalert/flightalert:latest
        environment:
          RECEIVER_HOST: "<your_receiver_host>"
          ULTRAFEEDER_HOST: "<your_ultrafeeder_host>"
          APPRISE_NOTIFY_URLS: "<your_apprise_notify_urls>"
        volumes:
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

   Fill out the environment variables using the table below as your guide.

   Optional: you can still use a `.env` file for additional optional environment variables and reference it with `env_file`:

   ```yaml
   env_file:
     - .env
   ```

   Start the service:

   ```bash
   docker compose up -d
   ```

---

## Environment Variables

FlightAlert is configured via environment variables. Required variables must be set; optional variables have defaults.

### ✅ Required Environment Variables

| Key                   | Description                                                                                                                                               | Required |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `RECEIVER_HOST`       | Host to use for receiver data. Can be Piaware IP/Domain or ADS-B Ultrafeeder IP/Domain.                                                                    | ✅        |
| `ULTRAFEEDER_HOST`    | ADS-B Ultrafeeder host IP/Domain.                                                                                                                          | ✅        |
| `APPRISE_NOTIFY_URLS` | Notification URLs from Apprise (comma-separated list). See [Apprise notification services](https://github.com/caronc/apprise/wiki#notification-services). | ✅        |

---

### ⚙️ Optional Environment Variables

| Key                     | Description                                                                                                                                  | Required | Default                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| `APP_ENV`               | Application environment (`development` / `production`).                                                                                      | ❌        | `production`                   |
| `NOTIFY_DISTANCE`       | Distance (nautical miles) from receiver a plane must be within to trigger a notification.                                                    | ❌        | `0.5`                          |
| `NOTIFY_ALTITUDE`       | Altitude (feet) a plane must be under to trigger a notification.                                                                             | ❌        | `3000`                         |
| `RECEIVER_PORT`         | Port to use for the receiver (Piaware/Ultrafeeder web port). Leave empty if using a reverse proxy.                                           | ❌        | *empty*                        |
| `ULTRAFEEDER_PORT`      | ADS-B Ultrafeeder port for incoming flight data (JSON position output).                                                                       | ❌        | `30047`                        |
| `SOCKET_RETRY_INTERVAL` | Interval (ms) to wait before retrying a socket connection after disconnect.                                                                  | ❌        | `15000`                        |
| `SOCKET_MAX_RETRIES`    | Maximum number of socket reconnection attempts before failing.                                                                               | ❌        | `5`                            |
| `SERVICES`              | Comma-separated list of services for retrieving flight source/destination. Valid options: `flightaware`, `adsbdb`.                           | ❌        | `flightaware`                  |
| `SERVICES_ALWAYS_CHECK` | Retrieve source/destination for **every** message (`true`), or only when `NOTIFY_DISTANCE` / `NOTIFY_ALTITUDE` thresholds are met (`false`). | ❌        | `false`                        |
| `APPRISE_API_URL`       | Apprise API URL for sending notifications. Defaults to internal service, but can be overridden.                                              | ❌        | `http://localhost:8000/notify` |
| `LOG_LEVEL`             | Logging level: `DEBUG` (all messages), `INFO` (only notifications), or `ERROR` (only errors).                                                | ❌        | `INFO`                         |

## Custom Notification Message
If you would like to customize the notification message you receive, you can add the following volume to your docker-compose file.
`- ./notification.ejs:/app/dist/notifications/templates/notification.ejs`

Add the following content to your notification.ejs file. This is the default notification message:
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

The notification template is built using [EJS](https://ejs.co/). The following JSON object is available to the EJS template through the `flight` key. Most of these keys are directly from the Ultrafeeder json output. More information about each key can be found [here](https://github.com/wiedehopf/readsb/blob/dev/README-json.md).

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
    "services":
    {
        "flightAware":
        {
            "useCache": true,
            "blocked": true,
            "from":
            {
                "code": "",
                "location": ""
            },
            "to":
            {
                "code": "",
                "location": ""
            }
        },
        "adsbdb":
        {
            "error": "Failed to get aircraft information from ADSB DB."
        }
    },
    "rawAircraft":
    {
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
        "nav_modes":
        [
            "autopilot",
            "althold",
            "tcas"
        ],
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
        "services":
        {
            "flightAware":
            {
                "useCache": true,
                "blocked": true,
                "from":
                {
                    "code": "",
                    "location": ""
                },
                "to":
                {
                    "code": "",
                    "location": ""
                }
            },
            "adsbdb":
            {
                "error": "Failed to get aircraft information from ADSB DB."
            }
        },
        "updatedAt": "2025-09-03T23:42:03.827"
    }
}
   ```

### Custom Keys
|Key|Description|Possible Values|
|--|--|--|
| direction |The direction of the flight in relation to the receiver |N, NE, E SE, S, SW, W, NW |
|notify|If the flight is within the configured altitude and distance to notify you|true/false
|notifyReason|Reason why a notification was not sent|Too far away, too high, Notified recently
|callsign|flight or r from Ultrafeeder json output|Callsign or registration number of aircraft
|flightUrl|Link to [FlightAware](https://flightaware.com)|URL
|distanceFromReceiver|Haversine calculation of flight distance from receiver|Number in nautical miles
|updatedAt|When this flight was processed|Timestamp (mm/dd/yyyy hh:ii:mm 24 hour format)
|services|External services called to retrieve route information|Object of services (see services section for more information)
|rawAircraft|Raw data from [Ultrafeeder json output](https://github.com/wiedehopf/readsb/blob/dev/README-json.md) | Object

### Services
Available services are flightaware and adsbdb, controlled by the `SERVICES` env key.

#### FlightAware
```json
{
	"flightAware":
    {
        "useCache": true,
        "blocked": true,
        "from":
        {
            "code": "",
            "location": ""
        },
        "to":
        {
            "code": "",
            "location": ""
        }
    }
}
```
If there is an error the output will just be error:
```json
{
	"flightAware":
    {
        "error": "<error_message>"
    }
}
```

#### adsbdb
```json
{
	"adsbdb":
	{
	   "from":
	   {
	      "code": "CYYC",
	      "location": "Calgary, Alberta"
	   },
	   "to":
	   {
	      "code": "CYYZ",
	      "location": "Toronto, Ontario"
	   }
	}
}
```
If there is an error the output will just be error:
```json
{
	"adsbdb":
    {
        "error": "<error_message>"
    }
}
```

## Funding

<a href="https://www.buymeacoffee.com/sportsreport2" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-blue.png" alt="Buy Me A Coffee" height="41" width="174"></a>

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md)  file for details.
