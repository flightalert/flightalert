import assert from 'assert';
import storage from '/Users/preston/Documents/sites/flightalert1/node_modules/node-persist/src/node-persist.js';
import { FlightAware } from '/Users/preston/Documents/sites/flightalert1/src/services/FlightAware';
import { Aircraft } from '/Users/preston/Documents/sites/flightalert1/src/models/aircraft';
import receiver from '/Users/preston/Documents/sites/flightalert1/src/models/receiver';
import NotificationManager from '/Users/preston/Documents/sites/flightalert1/src/notifications/NotificationManager';
import metrics from '/Users/preston/Documents/sites/flightalert1/src/metrics';
import eventEmitter, { PROCESSED_FLIGHT } from '/Users/preston/Documents/sites/flightalert1/src/events';

// ---- altitude
for (const v of ['ground', 'N/A', '', null, undefined, NaN, 'abc', 3001, '3001'])
  assert.equal(Aircraft.isTooHigh(v), true, 'too high: ' + String(v));
for (const v of [0, 1000, '1000', 3000, -50])
  assert.equal(Aircraft.isTooHigh(v), false, 'ok: ' + String(v));
assert.equal(Aircraft.isTooFar(NaN), true); assert.equal(Aircraft.isTooFar(null), true);
assert.equal(Aircraft.isTooFar(0.4), false); assert.equal(Aircraft.isTooFar(0.6), true);
console.log('altitude ok');

// ---- FlightAware backoff behaviors
{
  await storage.init({ dir: '/private/tmp/claude-501/-Users-preston-Documents-sites-flightalert1/7ea92fbd-1826-41ad-9667-0fc34c428e9d/scratchpad/store6', ttl: true, forgiveParseErrors: true });
  const fa = new FlightAware(); await fa.init();
  const ow = console.warn; console.warn = () => {};
  let mode = 'bodyfail'; let fetches = 0;
  globalThis.fetch = (async () => {
    fetches++;
    if (mode === 'bodyfail') return { status: 200, ok: true, text: async () => { throw new Error('body stalled'); } } as any;
    if (mode === 'challenge') return new Response('<html>captcha</html>');
    return new Response('var trackpollBootstrap = ' + JSON.stringify({ flights: { X: { origin: { iata: 'ORD' }, destination: { iata: 'LAX' } } } }) + ';');
  }) as any;
  await fa.check('AAA1','h'); assert.equal((fa as any).backoffMs, 30000);
  (fa as any).backoffUntil = 0; await fa.check('BBB2','h');
  assert.equal((fa as any).backoffMs, 60000, 'stalled body escalates (no premature reset)');
  (fa as any).backoffUntil = 0; mode = 'challenge'; await fa.check('CCC3','h');
  assert.equal((fa as any).backoffMs, 60000, '200 challenge page does not clear backoff');
  mode = 'ok'; (fa as any).backoffUntil = 0; await fa.check('DDD4','h');
  assert.equal((fa as any).backoffMs, 0, 'real data clears backoff');

  console.warn = ow; console.log('backoff ok');
}

// ---- Queue: cap exemption, drop metric, timeout
{
  receiver.initialized = true; receiver.receiverData = { lat: 41.0, lon: -87.0, refresh: 1, history: 1 } as any;
  const notified: string[] = []; let hang = false;
  (NotificationManager as any).notify = async (ac: any) => {
    if (hang) await new Promise(() => {});          // never resolves
    notified.push(ac.callsign); return true;
  };
  const { processFlight, queue, takeDroppedCount } = await import('/Users/preston/Documents/sites/flightalert1/src/flightQueue');
  const processed: string[] = []; eventEmitter.on(PROCESSED_FLIGHT, (ac: any) => processed.push(ac.callsign));
  const mk = (id: string, lat: number, alt: any = 1000) => ({ hex: id, flight: id.toUpperCase(), lat, lon: -87.0, alt_baro: alt });
  process.env.NOTIFY_DISTANCE='0.5'; process.env.NOTIFY_ALTITUDE='3000'; process.env.QUEUE_MAX_SIZE='2';
  queue.pause();
  await processFlight(mk('far1', 42, 30000)); await processFlight(mk('far2', 42, 30000));
  await processFlight(mk('far3', 42, 30000));                 // dropped
  await processFlight(mk('gnd1', 41.001, 'ground'));          // "ground" is not in range => dropped
  assert.equal(queue.size, 2); assert.equal(takeDroppedCount(), 2); assert.equal(takeDroppedCount(), 0);
  await processFlight(mk('near', 41.001));                    // in range => accepted over cap
  assert.equal(queue.size, 3, 'in-range bypasses cap');
  const dropMetric = (await metrics.register.getMetricsAsJSON()).find((m: any) => m.name === 'flight_alert_queue_dropped_total') as any;
  assert.equal(dropMetric.values[0].value, 2, 'drop metric');
  queue.start(); await queue.onIdle();
  assert.deepEqual(notified, ['NEAR']);

  // a hung job times out, is counted as failed, and the queue keeps draining
  (queue as any).timeout = 200; hang = true;
  const ow = console.error; const errs: string[] = []; console.error = (...a: any[]) => errs.push(a.join(' '));
  await processFlight(mk('hang', 41.001)); await processFlight(mk('after', 41.2, 30000));
  await queue.onIdle(); console.error = ow;
  assert.ok(processed.includes('AFTER'), 'queue moved on after the hung job: ' + processed);
  assert.ok(errs.some(e => /imed out/.test(e)), 'timeout logged: ' + errs.join('|'));
  console.log('queue ok');
}
process.exit(0);
