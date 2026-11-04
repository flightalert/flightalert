import { NdjsonParser } from '/Users/preston/Documents/sites/flightalert1/src/ndjson';
import storage from '/Users/preston/Documents/sites/flightalert1/node_modules/node-persist/src/node-persist.js';
import { FlightAware } from '/Users/preston/Documents/sites/flightalert1/src/services/FlightAware';
import gate from '/Users/preston/Documents/sites/flightalert1/src/gates/HomeAssistantGate';
import assert from 'assert';

const p = new NdjsonParser();
assert.equal(p.push('{"a":1}\n').length, 1);
assert.equal(p.push('{"a":1}\n{"a":2}\n{"a":3}\n').length, 3);          // multi-line chunk (was dropped)
assert.equal(p.push('{"a":1}\n{"a":2').length, 1);                        // line + partial
assert.deepEqual(p.push(',"b":9}\n'), [{a:2,b:9}]);                        // partial completed
assert.deepEqual(p.push('{"x":1}'), [{x:1}]);                              // unterminated but complete
assert.equal(p.push('{"a":').length, 0); assert.deepEqual(p.push('5}\n'), [{a:5}]);
assert.equal(p.push('\n\n  \n').length, 0);
assert.equal(p.push('garbage\n{"ok":1}\n').length, 1);
assert.equal(p.push('[{"a":1},{"a":2}]\n').length, 2);
console.log('parser ok');

await storage.init({ dir: '/private/tmp/claude-501/-Users-preston-Documents-sites-flightalert1/7ea92fbd-1826-41ad-9667-0fc34c428e9d/scratchpad/store', ttl: true, forgiveParseErrors: true });
await storage.setItem('flight_aware', { big: 'legacy' });
const fa = new FlightAware();
await fa.init();
assert.equal(await storage.getItem('flight_aware'), undefined);
await fa.init(); // legacy already gone: no throw
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, opts: any) => {
  calls++;
  if (String(url).includes('BAD')) return new Response('nope', { status: 500 });
  const body = 'var trackpollBootstrap = ' + JSON.stringify({ flights: { X: { origin: { iata: 'ORD', friendlyLocation: 'Chicago' }, destination: { iata: 'LAX', friendlyLocation: 'LA' }, track: [1] } } }) + ';';
  return new Response(body);
}) as any;
const r1 = await fa.check('UAL1', 'abc'); assert.equal(r1.from.code, 'ORD'); assert.equal(r1.useCache, false);
const r2 = await fa.check('UAL1', 'abc'); assert.equal(r2.useCache, true); assert.equal(calls, 1);
// new instance (restart) reads the per-callsign file, no fetch
const fa2 = new FlightAware(); await storage.forEach(async () => {});
const r3 = await fa2.check('UAL1', 'abc'); assert.equal(r3.useCache, true); assert.equal(calls, 1);
await fa.check('BAD1', 'x'); await fa.check('BAD1', 'x'); assert.equal(calls, 2); // failure cached
console.log('cache ok, count', fa.getCacheCount());

// gate
gate.enabled = true; gate.entityIds = ['a','b']; gate.failMode = 'open'; gate.staleAfterMs = 1000;
assert.equal(gate.isOpen(), true);                        // never fetched, fail-open
gate.failMode = 'closed'; assert.equal(gate.isOpen(), false);
const now = Date.now();
gate.entityStates.set('a','on'); gate.entityStates.set('b','on'); gate.entityFetchedAt.set('a',now); gate.entityFetchedAt.set('b',now);
assert.equal(gate.isOpen(), true);
gate.entityStates.set('b','off'); assert.equal(gate.isOpen(), false);
gate.entityStates.set('b','on'); gate.entityFetchedAt.set('b', now - 5000);   // stale
assert.equal(gate.isOpen(), false);  // closed
gate.failMode = 'open'; assert.equal(gate.isOpen(), true);
gate.entityStates.set('a','off'); assert.equal(gate.isOpen(), false);          // fresh off beats fail-open
console.log('gate ok');
process.exit(0);
