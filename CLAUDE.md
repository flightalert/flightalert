# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

FlightAlert is a Node.js/TypeScript service that monitors nearby aircraft using ADS-B data. It connects to an ADSB-Ultrafeeder (or PiAware) via TCP socket, receives real-time JSON position data, and sends push notifications via [Apprise](https://github.com/caronc/apprise) when aircraft are within a configurable distance and altitude from the receiver.

## Commands

```bash
# Development (run directly with tsx, no build step)
npm run dev

# Development with hot reload
npm run hot

# Build for production (tsc + tsc-alias + copy EJS templates to dist/)
npm run build

# Run built output
npm start
```

There are no tests in this project.

## Architecture

### Data Flow

1. **TCP Socket** (`src/index.ts`) — connects to ADSB-Ultrafeeder on `ULTRAFEEDER_HOST:ULTRAFEEDER_PORT` (default 30047), receives raw JSON aircraft position data, uses `jsonrepair` to handle partial/malformed JSON frames
2. **Flight Queue** (`src/flightQueue.ts`) — serializes processing via `p-queue` (concurrency 1). For each aircraft: calculates distance/direction from receiver, checks `shouldNotify()`, optionally enriches with service data, sends notification if criteria met
3. **Notification** (`src/notifications/NotificationManager.ts`) — renders EJS templates and POSTs to Apprise API. Errors are caught in `flightQueue.ts` so a failed notification logs the error and increments `totalFailed` without crashing the queue.
4. **Event Bus** (`src/events.ts`) — singleton `EventEmitter` used to broadcast lifecycle events (`QUEUED_FLIGHT`, `PROCESSING_FLIGHT`, `PROCESSED_FLIGHT`, `NOTIFIED_FLIGHT`, `FAILED_FLIGHT`, `RECEIVER_SETUP`) to the optional web server

### Key Models

- **`Aircraft`** (`src/models/aircraft.ts`) — wraps raw ADS-B data fields. `shouldNotify()` returns true when: not notified in last 5 minutes, within `NOTIFY_DISTANCE` nautical miles, and below `NOTIFY_ALTITUDE` feet. `callsign` getter returns `flight` (trimmed) or falls back to `r` (registration)
- **`Receiver`** (`src/models/receiver.ts`) — singleton that fetches its own lat/lon from `RECEIVER_HOST/data/receiver.json` on startup; used for haversine distance and cardinal direction calculations

### Services (Flight Enrichment)

Configured via `SERVICES` env var (comma-separated). Only called when notify criteria are met, unless `SERVICES_ALWAYS_CHECK=true`. Add new services by implementing `IService` (`src/services/Service.ts`) and registering in `ServiceManager`.

- **FlightAware** — scrapes FlightAware HTML for origin/destination; caches results for 12 hours in `node-persist`
- **AdsbDb** — queries `api.adsbdb.com` for route info; resolves ICAO codes to city names using bundled `src/static/airports.json`

### Notification Cache

`src/notifications/notificationCache.ts` is an in-memory cache keyed by callsign, storing last-notified epoch seconds. Not persisted across restarts.

### Optional Web Server

Enabled via `APP_SERVER_ENABLED=true`. Runs Express + Socket.IO on `APP_PORT` (`src/servers/webServer.ts`):
- `GET /` — EJS dashboard
- `GET /status` — health check

Socket.IO emits real-time events to connected clients using the same event bus.

### Optional Metrics Server

Enabled via `METRICS_SERVER_ENABLED=true`. Runs a minimal Express server on `METRICS_PORT` (default `9090`) (`src/servers/metricsServer.ts`):
- `GET /metrics` — Prometheus metrics (prom-client)
- `GET /metrics_json` — same metrics as JSON

Intentionally separate from the web server so Prometheus can scrape without enabling the full dashboard.

### Persistence

`node-persist` (file-based, stored in `.my-storage/`) is used for FlightAware cache. Initialized at startup with TTL support and `forgiveParseErrors: true`.

### Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json` paths + `tsc-alias` for compiled output).

## Environment Variables

Required: `RECEIVER_HOST`, `ULTRAFEEDER_HOST`, `APPRISE_NOTIFY_URLS`

Key optional: `NOTIFY_DISTANCE` (nm, default 0.5), `NOTIFY_ALTITUDE` (ft, default 3000), `SERVICES` (default `"flightaware"`), `LOG_LEVEL` (DEBUG/INFO/ERROR, default INFO), `APP_SERVER_ENABLED`, `APP_PORT`, `METRICS_SERVER_ENABLED`, `METRICS_PORT` (default 9090)

See `.env.example` for the full list with descriptions.

## Adding a New Service

1. Create `src/services/MyService.ts` implementing `IService` (requires `name`, `init()`, `check(callsign, hex)`)
2. Register it in the `switch` block in `src/services/ServiceManager.ts`
3. Add the service name to `SERVICES` env var
