import EventEmitter from 'node:events';

const RECEIVER_SETUP = 'receiver_setup';

const PROCESSING_FLIGHT = 'processing_flight';
const PROCESSED_FLIGHT = 'processed_flight';

const PROCESSING_FLIGHTS = 'processing_flights';
const PROCESSED_FLIGHTS = 'processed_flights';

const QUEUED_FLIGHT = 'queued_flight';
const NOTIFIED_FLIGHT = 'notified_flight';

const events = {
    'receiver_setup': RECEIVER_SETUP,

    'processing_flight': PROCESSING_FLIGHT,
    'processed_flight': PROCESSED_FLIGHT,
    'processing_flights': PROCESSING_FLIGHTS,
    'processed_flights': PROCESSED_FLIGHTS,

    'queued_flight': QUEUED_FLIGHT,
    'notified_flight': NOTIFIED_FLIGHT
}

const emitter = new EventEmitter();

export default emitter;

export {
    RECEIVER_SETUP,
    PROCESSING_FLIGHT,
    PROCESSED_FLIGHT,
    PROCESSING_FLIGHTS,
    PROCESSED_FLIGHTS,
    QUEUED_FLIGHT,
    NOTIFIED_FLIGHT,
    events
}
