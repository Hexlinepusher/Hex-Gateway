import dispatchRequests from './dispatchRequests.js';

export default function createScheduler({
  consumers = [],
  execute,
  idleTimeoutMs = 300_000,
  log = () => undefined,
} = {}) {
  const scheduler = {
    consumers,
    execute,
    idleTimeoutMs,
    log,
    queue: [],
    dispatching: false,
  };
  scheduler.dispatch = () => dispatchRequests(scheduler);
  return scheduler;
}
