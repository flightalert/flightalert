import assert from 'assert';
import axios from '/Users/preston/Documents/sites/flightalert1/node_modules/axios/index.js';
import storage from '/Users/preston/Documents/sites/flightalert1/node_modules/node-persist/src/node-persist.js';
import { NdjsonParser } from '/Users/preston/Documents/sites/flightalert1/src/ndjson';
import gate from '/Users/preston/Documents/sites/flightalert1/src/gates/HomeAssistantGate';
import { FlightAware } from '/Users/preston/Documents/sites/flightalert1/src/services/FlightAware';
import receiver from '/Users/preston/Documents/sites/flightalert1/src/models/receiver';
import NotificationManager from '/Users/preston/Documents/sites/flightalert1/src/notifications/NotificationManager';
import eventEmitter, { PROCESSED_FLIGHT, GATE_STATE_CHANGED } from '/Users/preston/Documents/sites/flightalert1/src/events';

// ---- UTF-8 split across chunks
{
  const p = new NdjsonParser();
  const buf = Buffer.from('{"owner":"Café ✈"}\n');
  const cut = buf.indexOf(0xc3) + 1;             // split inside the 2-byte é
  const a = p.push(buf.subarray(0, cut)), b = p.push(buf.subarray(cut));
  assert.deepEqual([...a, ...b], [{ owner: 'Café ✈' }]);
  const e = Buffer.from('{"x":"✈"}\n'), k = e.indexOf(0xe2) + 1;   // split inside 3-byte char
  assert.deepEqual([...p.push(e.subarray(0, k)), ...p.push(e.subarray(k))], [{ x: '✈' }]);
  console.log('utf8 ok');
}

// ---- Gate: isOpen rules
{
  const now = Date.now();
  const set = (id: string, st: string, at = now) => { gate.entityStates.set(id, st); gate.entityFetchedAt.set(id, at); };
  gate.enabled = true; gate.entityIds = ['a']; gate.staleAfterMs = 150000;
  gate.failMode = 'open';
  set('a', 'off', now - 999999);  assert.equal(gate.isOpen(), false, 'stale off stays closed (open mode)');
  set('a', 'unavailable');        assert.equal(gate.isOpen(), true,  'unavailable => fail-open');
  gate.failMode = 'closed';       assert.equal(gate.isOpen(), false, 'unavailable => fail-closed');
  set('a', 'unknown');            assert.equal(gate.isOpen(), false);
  set('a', 'on', now - 999999);   assert.equal(gate.isOpen(), false, 'stale on, closed mode');
  gate.failMode = 'open';         assert.equal(gate.isOpen(), true,  'stale on, open mode');
  set('a', 'on');                 assert.equal(gate.isOpen(), true);
  gate.entityIds = ['a','b']; set('b','off'); assert.equal(gate.isOpen(), false, 'one off closes');
  console.log('gate isOpen ok');
}

// ---- Gate: poll() with mocked axios (401 then recovery), stale clamp, state-change event
{
  process.env.HA_ENABLED='true'; process.env.HA_URL='http://ha'; process.env.HA_TOKEN='t';
  process.env.HA_GATE_ENTITIES='x,y'; process.env.HA_POLL_INTERVAL='30'; process.env.HA_STALE_AFTER='10';
  (gate as any).parseConfig();
  assert.equal(gate.staleAfterMs, 40000, 'HA_STALE_AFTER clamped to poll+timeout+5s');
  gate.entityStates.clear(); gate.entityFetchedAt.clear(); gate.lastFetched = null; gate.lastEmittedOpen = null;
  const warns: string[] = []; const origWarn = console.warn; console.warn = (...a: any[]) => warns.push(a.join(' '));
  let mode: '401'|'on'|'off' = '401';
  (axios as any).get = async (url: string) => {
    if (mode === '401') { const e: any = new Error('Request failed with status code 401'); e.response = { status: 401 }; throw e; }
    return { data: { state: mode } };
  };
  const events: boolean[] = []; eventEmitter.on(GATE_STATE_CHANGED, (o: boolean) => events.push(o));
  await gate.poll(); await gate.poll(); await gate.poll();
  console.warn = origWarn;
  const authWarns = warns.filter(w => w.includes('rejected HA_TOKEN'));
  assert.equal(authWarns.length, 2, 'one auth warning per entity, throttled across 3 polls: ' + warns.length);
  assert.equal(gate.isOpen(), true, '401 + never fetched => fail-open');
  mode = 'off'; await gate.poll();
  assert.equal(gate.isOpen(), false); assert.deepEqual(events, [false]);
  mode = '401'; await gate.poll();
  assert.equal(gate.isOpen(), false, 'last known off survives HA going away');
  mode = 'on'; await gate.poll();
  assert.equal(gate.isOpen(), true); assert.deepEqual(events, [false, true]);
  console.log('gate poll ok');
}

// ---- FlightAware: backoff, failure-before-disk, surfaced errors
{
  await storage.init({ dir: '/private/tmp/claude-501/-Users-preston-Documents-sites-flightalert1/7ea92fbd-1826-41ad-9667-0fc34c428e9d/scratchpad/store', ttl: true, forgiveParseErrors: true });
  const fa = new FlightAware(); await fa.init();
  let fetches = 0; let behavior: 'throw'|'500'|'404'|'ok' = 'throw';
  globalThis.fetch = (async () => {
    fetches++;
    if (behavior === 'throw') throw new Error('timeout');
    if (behavior === '500') return new Response('x', { status: 500 });
    if (behavior === '404') return new Response('x', { status: 404 });
    return new Response('var trackpollBootstrap = ' + JSON.stringify({ flights: { X: { origin: { iata: 'ORD', friendlyLocation: 'Chicago' }, destination: { iata: 'LAX', friendlyLocation: 'LA' } } } }) + ';');
  }) as any;
  const origWarn = console.warn; console.warn = () => {};
  const r1 = await fa.check('AAA1', 'h'); assert.equal(fetches, 1); assert.match(r1.error, /timeout/, 'error text surfaced');
  await fa.check('BBB2', 'h'); await fa.check('CCC3', 'h');
  assert.equal(fetches, 1, 'service-wide backoff blocks other callsigns');
  assert.equal((fa as any).backoffMs, 30000);
  (fa as any).backoffUntil = 0; behavior = '500'; await fa.check('DDD4', 'h');
  assert.equal((fa as any).backoffMs, 60000, 'backoff doubles');
  (fa as any).backoffUntil = 0; behavior = '404'; await fa.check('EEE5', 'h'); const before = fetches;
  assert.equal((fa as any).backoffMs, 0, 'a reachable response resets backoff');
  await fa.check('EEE5', 'h'); assert.equal(fetches, before, '404 cached per-callsign');
  behavior = 'ok'; const ok = await fa.check('FFF6', 'h'); assert.equal(ok.from.code, 'ORD');
  console.warn = origWarn;
  console.log('flightaware ok');
}

// ---- Queue: coalescing keeps in-range, cap, lazy env
{
  receiver.initialized = true; receiver.receiverData = { lat: 41.0, lon: -87.0, refresh: 1, history: 1 } as any;
  const notified: string[] = [];
  (NotificationManager as any).notify = async (ac: any) => { notified.push(ac.callsign + '@' + ac.lat); return true; };
  const { processFlight, queue } = await import('/Users/preston/Documents/sites/flightalert1/src/flightQueue');
  const processed: string[] = [];
  eventEmitter.on(PROCESSED_FLIGHT, (ac: any) => processed.push(ac.callsign + '@' + ac.lat));
  const near = (id: string, lat: number, alt = 1000) => ({ hex: id, flight: id.toUpperCase() + ' ', lat, lon: -87.0, alt_baro: alt });
  process.env.NOTIFY_DISTANCE='0.5'; process.env.NOTIFY_ALTITUDE='3000';
  process.env.QUEUE_MAX_SIZE='3';                  // set AFTER import: must be read lazily
  queue.pause();
  await processFlight(near('a1', 41.001));         // ~0.06nm, in range
  await processFlight(near('a1', 41.2));           // ~12nm, passed: must NOT replace
  await processFlight(near('b2', 41.2));           // out of range
  await processFlight(near('b2', 41.3));           // newer out-of-range replaces older
  await processFlight(near('c3', 41.001, 9000));   // too high
  assert.equal(queue.size, 3, 'one job per aircraft');
  await processFlight(near('d4', 41.001));         // over cap of 3
  assert.equal(queue.size, 3, 'cap enforced with env read lazily');
  queue.start(); await queue.onIdle();
  assert.deepEqual(notified, ['A1@41.001'], 'in-range alert kept: ' + notified);
  assert.ok(processed.includes('B2@41.3') && !processed.includes('B2@41.2'), 'newest wins when neither in range: ' + processed);
  console.log('queue ok');
}
process.exit(0);
