export default function createOverview(serviceName, requestQueue, consumers, metrics) {
  const availableConsumers = consumers.filter((consumer) => consumer.available === true);
  return {
    serviceName,
    queue: { length: requestQueue.entries.length, capacity: requestQueue.capacity },
    consumers: {
      idleAvailable: availableConsumers.filter((consumer) => !consumer.currentExecution).length,
      available: availableConsumers.length,
    },
    metrics,
  };
}
