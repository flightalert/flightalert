import assert from 'assert';
import storage from '/Users/preston/Documents/sites/flightalert1/node_modules/node-persist/src/node-persist.js';
import { FlightAware } from '/Users/preston/Documents/sites/flightalert1/src/services/FlightAware';
import { Aircraft } from '/Users/preston/Documents/sites/flightalert1/src/models/aircraft';
import receiver from '/Users/preston/Documents/sites/flightalert1/src/models/receiver';
import NotificationManager from '/Users/preston/Documents/sites/flightalert1/src/notifications/NotificationManager';

// alt_geom fallback
assert.equal(Aircraft.isTooHigh(undefined, 1200), false, 'alt_geom used when alt_baro absent');
assert.equal(Aircraft.isTooHigh(undefined, 9000), true);
assert.equal(Aircraft.isTooHigh('ground', 1200), true, '"ground" alt_baro is NOT replaced by alt_geom');
assert.equal(Aircraft.isTooHigh(undefined, undefined), true);
assert.equal(Aircraft.isTooHigh(null, 'abc'), true);
assert.equal(Aircraft.isTooHigh(1000, 99999), false, 'alt_baro wins when present');
const ac = new Aircraft({ hex: 'a', flight: 'MLAT1', lat: 41.001, lon: -87, alt_geom: 1200 });
ac.setDistanceFromReceiver(0.1);
assert.equal(await ac.shouldNotify(), true, 'missing alt_baro + low alt_geom notifies');
console.log('alt_geom ok');

// receiver distance: one implementation
receiver.initialized = true; receiver.receiverData = { lat: 41, lon: -87, refresh: 1, history: 1 } as any;
const d1 = receiver.distanceTo(41.01, -87.01)!; const d2 = await receiver.calculateDistanceFrom(41.01, -87.01);
assert.equal(d1, d2); assert.ok(d1 > 0 && d1 < 2);
assert.equal(receiver.distanceTo(0, 0), null); assert.equal(await receiver.calculateDistanceFrom(NaN as any, 1), null);
receiver.initialized = false; assert.equal(receiver.distanceTo(41, -87), null);
await assert.rejects(() => receiver.calculateDistanceFrom(41, -87), /not initialized/);
receiver.initialized = true;
console.log('receiver ok');

// disk cache still served during a backoff
{
  await storage.init({ dir: '/private/tmp/claude-501/-Users-preston-Documents-sites-flightalert1/7ea92fbd-1826-41ad-9667-0fc34c428e9d/scratchpad/store8', ttl: true, forgiveParseErrors: true });
  const warm = new FlightAware(); await warm.init();
  globalThis.fetch = (async () => new Response('var trackpollBootstrap = ' + JSON.stringify({ flights: { F: { origin: { iata: 'ORD' }, destination: { iata: 'LAX' } } } }) + ';')) as any;
  await warm.check('UAL1', 'h');
  const restarted = new FlightAware();           // empty memory, file on disk
  (restarted as any).backoffUntil = Date.now() + 60000; (restarted as any).backoffMs = 30000;
  const r = await restarted.check('UAL1', 'h');
  assert.equal(r.from.code, 'ORD', 'disk-cached route served during backoff'); assert.equal(r.useCache, true);
  const miss = await restarted.check('NEW1', 'h'); assert.match(miss.error, /backing off/);
  console.log('disk during backoff ok');
}

// Apprise timeout counts as maybe-delivered: no repeat alert
{
  const calls: string[] = []; let mode: 'timeout' | 'fail' | 'ok' = 'timeout';
  (NotificationManager as any).notify = async (a: any) => {
    calls.push(a.callsign);
    if (mode === 'timeout') { const e: any = new Error('timeout of 30000ms exceeded'); e.code = 'ECONNABORTED'; throw e; }
    if (mode === 'fail') throw new Error('connect ECONNREFUSED');
    return true;
  };
  const { processFlight, queue } = await import('/Users/preston/Documents/sites/flightalert1/src/flightQueue');
  const ow = console.error, ww = console.warn; console.error = () => {}; console.warn = () => {};
  const mk = (id: string) => ({ hex: id, flight: id.toUpperCase(), lat: 41.001, lon: -87, alt_baro: 1000 });
  await processFlight(mk('tmo1')); await queue.onIdle();
  await processFlight(mk('tmo1')); await queue.onIdle();
  assert.deepEqual(calls, ['TMO1'], 'timed-out alert is not re-sent: ' + calls);
  mode = 'fail';
  await processFlight(mk('bad1')); await queue.onIdle(); await processFlight(mk('bad1')); await queue.onIdle();
  assert.deepEqual(calls, ['TMO1', 'BAD1', 'BAD1'], 'a real failure (not a timeout) still retries: ' + calls);
  console.error = ow; console.warn = ww;
  assert.equal((queue as any).timeout, 90000);
  console.log('apprise timeout ok');
}
process.exit(0);
