import assert from 'assert';
import axios from '/Users/preston/Documents/sites/flightalert1/node_modules/axios/index.js';
import gate from '/Users/preston/Documents/sites/flightalert1/src/gates/HomeAssistantGate';
import eventEmitter, { GATE_STATE_CHANGED } from '/Users/preston/Documents/sites/flightalert1/src/events';

gate.enabled = true; gate.entityIds = ['a','b']; gate.haUrl = 'http://ha';
const events: boolean[] = []; eventEmitter.on(GATE_STATE_CHANGED, (o: boolean) => events.push(o));
let resp: Record<string, any> = { a: { state: 'on' }, b: { state: 'on' } };
let fail: string | null = null;
(axios as any).get = async (url: string) => {
  const id = url.split('/').pop()!;
  if (fail === '401') { const e: any = new Error('401'); e.response = { status: 401 }; throw e; }
  if (fail === 'net') throw new Error('ECONNREFUSED');
  return { data: resp[id] };
};
const warns: string[] = []; const ow = console.warn; console.warn = (...a: any[]) => warns.push(a.join(' '));

assert.equal(gate.isOpen(), true, 'never fetched => open');
fail = '401'; await gate.poll(); await gate.poll(); await gate.poll();
assert.equal(gate.isOpen(), true, '401 => open');
assert.equal(warns.filter(w => w.includes('rejected HA_TOKEN')).length, 2, 'auth warning throttled');
fail = null; await gate.poll(); assert.equal(gate.isOpen(), true, 'all on => open');

resp.b = { state: 'off' }; await gate.poll();
assert.equal(gate.isOpen(), false, 'any off => closed');

resp.b = { state: 'unavailable' }; await gate.poll();
assert.equal(gate.isOpen(), false, 'unavailable is ignored: last real off is kept (not refreshed)');
resp.b = '<html>login</html>'; await gate.poll();
assert.equal(gate.isOpen(), false, '200 w/o state is ignored, off kept');
resp.b = {}; await gate.poll(); assert.equal(gate.isOpen(), false);
assert.equal(gate.entityStates.get('b'), 'off', 'bad readings never overwrite state');

fail = 'net'; await gate.poll();
assert.equal(gate.isOpen(), false, 'HA briefly unreachable: off still honored');

// off ages out after 5 minutes without a fresh reading
gate.entityFetchedAt.set('b', Date.now() - 5 * 60 * 1000 - 1000);
assert.equal(gate.isOpen(), true, 'stale off ignored => open');
await gate.poll(); // still failing, still stale
assert.equal(gate.isOpen(), true);

fail = null; resp.b = { state: 'off' }; await gate.poll();
assert.equal(gate.isOpen(), false, 'fresh off closes again');
resp.b = { state: 'on' }; await gate.poll();
assert.equal(gate.isOpen(), true);
console.warn = ow;
assert.deepEqual(events, [false, true, false, true], 'events: ' + events);
console.log('simplified gate ok');
process.exit(0);
