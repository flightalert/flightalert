import gate from '/Users/preston/Documents/sites/flightalert1/src/gates/HomeAssistantGate';
const now = Date.now();
gate.enabled = true; gate.entityIds = ['a']; gate.failMode = 'open'; gate.staleAfterMs = 150000;
gate.entityStates.set('a','off'); gate.entityFetchedAt.set('a', now - 200000);
console.log('stale off, fail-open => isOpen', gate.isOpen());
gate.entityStates.set('a','unavailable'); gate.entityFetchedAt.set('a', now);
console.log('fresh unavailable, fail-open => isOpen', gate.isOpen());
process.exit(0);
