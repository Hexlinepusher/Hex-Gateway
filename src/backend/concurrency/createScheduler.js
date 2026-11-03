import dispatchRequests from './dispatchRequests.js';

export default function createScheduler({
  requestQueue,
  consumers,
  execute,
  configuration,
  statistics,
  lifecycle,
  log,
}) {
  for (const consumer of consumers) consumer.currentExecution = null;
  const scheduler = {
    requestQueue,
    consumers,
    execute,
    configuration,
    statistics,
    lifecycle,
    log,
    isDispatching: false,
  };
  scheduler.dispatch = () => dispatchRequests(scheduler);
  return scheduler;
}
