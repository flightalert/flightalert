import assert from 'assert';
import storage from '/Users/preston/Documents/sites/flightalert1/node_modules/node-persist/src/node-persist.js';
import receiver from '/Users/preston/Documents/sites/flightalert1/src/models/receiver';
import Logger from '/Users/preston/Documents/sites/flightalert1/src/logger';
import { FlightAware } from '/Users/preston/Documents/sites/flightalert1/src/services/FlightAware';
import NotificationManager from '/Users/preston/Documents/sites/flightalert1/src/notifications/NotificationManager';

// direction at many latitudes, both hemispheres of longitude
const r: any = receiver;
for (const lat of [-33, 0, 12, 25, 30, 34, 38, 41, 45, 52, 60]) for (const lon of [-118, -90, -3, 2, 87, 151]) {
  const d = 0.01, k = 1 / Math.cos(lat * Math.PI / 180);          // equal ground distance E/W
  const dir = (dl: number, dn: number) => r.calculateCardinalDirection(lat, lon, lat + dn, lon + dl * k);
  const got = [dir(0, d), dir(d, 0), dir(0, -d), dir(-d, 0), dir(d, d), dir(-d, d), dir(d, -d), dir(-d, -d)].join(',');
  if (lat !== 0 && lon !== 0) assert.equal(got, 'N,E,S,W,NE,NW,SE,SW', lat + ',' + lon + ' => ' + got);
}
console.log('direction ok');

// trace guard
Logger.setLevel('INFO'); assert.equal(Logger.isEnabled('TRACE'), false); assert.equal(Logger.isEnabled('INFO'), true);
Logger.setLevel('TRACE'); assert.equal(Logger.isEnabled('TRACE'), true); Logger.setLevel('INFO');
console.log('logger ok');

// error bodies are cancelled
{
  await storage.init({ dir: '/private/tmp/claude-501/-Users-preston-Documents-sites-flightalert1/7ea92fbd-1826-41ad-9667-0fc34c428e9d/scratchpad/store10', ttl: true, forgiveParseErrors: true });
  const fa = new FlightAware(); await fa.init();
  let cancelled = 0; const ow = console.warn; console.warn = () => {};
  globalThis.fetch = (async (u: string) => ({ status: String(u).includes('BAD') ? 503 : 404, ok: false,
    body: { cancel: async () => { cancelled++; } }, text: async () => '' })) as any;
  await fa.check('BAD1', 'h'); (fa as any).backoffUntil = 0; await fa.check('MISSING1', 'h');
  console.warn = ow; assert.equal(cancelled, 2); console.log('body cancel ok');
}

// hex-only aircraft: one alert; callsign appearing later does not re-alert
{
  receiver.initialized = true; receiver.receiverData = { lat: 41, lon: -87, refresh: 1, history: 1 } as any;
  const posts: string[] = []; (NotificationManager as any).notify = async (a: any) => { posts.push(a.hex + '/' + a.callsign); return true; };
  const { processFlight, queue } = await import('/Users/preston/Documents/sites/flightalert1/src/flightQueue');
  const send = async (m: any) => { await processFlight({ lat: 41.001, lon: -87, alt_baro: 1000, ...m }); await queue.onIdle(); };
  for (let i = 0; i < 5; i++) await send({ hex: 'abc123' });
  assert.deepEqual(posts, ['abc123/']);
  await send({ hex: 'abc123', flight: 'UAL9 ' });                 // callsign decoded later
  assert.equal(posts.length, 1, 'same hex, new callsign: no second alert');
  await send({ hex: 'def456', flight: 'DAL1' }); assert.equal(posts.length, 2, 'a different aircraft still alerts');
  console.log('hex cache ok');
}
process.exit(0);
