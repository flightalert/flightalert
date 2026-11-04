import receiver from '/Users/preston/Documents/sites/flightalert1/src/models/receiver';
import NotificationManager from '/Users/preston/Documents/sites/flightalert1/src/notifications/NotificationManager';
const r: any = receiver;
console.log('expected  actual (receiver lat, 0.01deg offset)');
for (const lat of [30, 34, 38, 41, 45]) {
  const lon = -90;
  console.log(lat, 'N:', r.calculateCardinalDirection(lat, lon, lat + 0.01, lon),
              ' E:', r.calculateCardinalDirection(lat, lon, lat, lon + 0.01),
              ' S:', r.calculateCardinalDirection(lat, lon, lat - 0.01, lon),
              ' W:', r.calculateCardinalDirection(lat, lon, lat, lon - 0.01));
}
// hex-only aircraft: repeat alerts?
receiver.initialized = true; receiver.receiverData = { lat: 41, lon: -87, refresh: 1, history: 1 } as any;
let posts = 0; (NotificationManager as any).notify = async () => { posts++; return true; };
const { processFlight, queue } = await import('/Users/preston/Documents/sites/flightalert1/src/flightQueue');
for (let i = 0; i < 5; i++) { await processFlight({ hex: 'abc123', lat: 41.001, lon: -87, alt_baro: 1000 }); await queue.onIdle(); }
console.log('hex-only aircraft, 5 messages => alerts sent:', posts);
process.exit(0);
