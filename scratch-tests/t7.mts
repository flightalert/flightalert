import assert from 'assert';
import storage from '/Users/preston/Documents/sites/flightalert1/node_modules/node-persist/src/node-persist.js';
import { FlightAware } from '/Users/preston/Documents/sites/flightalert1/src/services/FlightAware';
await storage.init({ dir: '/private/tmp/claude-501/-Users-preston-Documents-sites-flightalert1/7ea92fbd-1826-41ad-9667-0fc34c428e9d/scratchpad/store7', ttl: true, forgiveParseErrors: true });
const fa = new FlightAware(); await fa.init();
const big = 'x'.repeat(6000);
const page = { flights: { F1: {
  origin: { iata: 'ORD', friendlyLocation: 'Chicago, IL', extra: big },
  destination: { iata: 'LAX', friendlyLocation: 'Los Angeles, CA', extra: big },
  relatedThumbnails: [{ thumbnail: 'http://t/1.jpg', link: big }, { thumbnail: 'http://t/2.jpg' }],
  blockedForUser: true, activityLog: big, track: [big], waypoints: [big], codeShare: big,
} } };
let fetches = 0;
globalThis.fetch = (async () => { fetches++; return new Response('var trackpollBootstrap = ' + JSON.stringify(page) + ';'); }) as any;
const fresh = await fa.check('UAL1', 'h');
const cachedMem = await fa.check('UAL1', 'h');
const fa2 = new FlightAware(); const cachedDisk = await fa2.check('UAL1', 'h');
assert.equal(fetches, 1);
for (const r of [fresh, cachedMem, cachedDisk]) {
  assert.deepEqual(r.from, { code: 'ORD', location: 'Chicago, IL' });
  assert.deepEqual(r.to, { code: 'LAX', location: 'Los Angeles, CA' });
  assert.equal(r.planeImage, 'http://t/1.jpg'); assert.equal(r.blocked, true);
}
assert.equal(fresh.useCache, false); assert.equal(cachedMem.useCache, true); assert.equal(cachedDisk.useCache, true);
const size = JSON.stringify((fa as any).memory.get('UAL1')).length;
console.log('slim entry bytes', size); assert.ok(size < 400);

// no thumbnail / missing origin stay safe
page.flights.F1 = { destination: {} } as any;
const bare = await fa.check('BARE1', 'h'); assert.equal(bare.planeImage, undefined); assert.equal(bare.from.code, ''); assert.equal(bare.blocked, false);

// size cap evicts oldest
const m = (fa as any).memory as Map<string, any>; m.clear();
for (let i = 0; i < 5003; i++) m.set('C' + i, { created_at_timestamp: 1 });
await (fa as any).storeFlight('NEW', { created_at_timestamp: 1 });
assert.equal(m.size, 5000); assert.ok(!m.has('C0') && !m.has('C3') && m.has('C4') && m.has('NEW'));
console.log('slim + cap ok');
process.exit(0);
