import executeRequest from '../execution/executeRequest.js';

import findAvailableConsumer from './findAvailableConsumer.js';
import findNextQueueEntry from './findNextQueueEntry.js';
import lockRequest from './lockRequest.js';

export default function dispatchRequests(scheduler) {
  if (
    scheduler.isDispatching ||
    scheduler.lifecycle.isStopping ||
    scheduler.lifecycle.shutdownController.signal.aborted ||
    typeof scheduler.execute !== 'function'
  )
    return;
  scheduler.isDispatching = true;
  try {
    while (
      !scheduler.lifecycle.isStopping &&
      !scheduler.lifecycle.shutdownController.signal.aborted
    ) {
      const queueEntry = findNextQueueEntry(scheduler.requestQueue);
      const consumer = findAvailableConsumer(scheduler.consumers);
      if (!queueEntry || !consumer) break;
      const execution = lockRequest(queueEntry, consumer);
      if (!execution) continue;
      execution.completion = Promise.resolve().then(() => executeRequest(scheduler, execution));
      void execution.completion.catch(() => undefined);
      scheduler.log('execution.started', {
        uid: queueEntry.requestContext.uid,
        attempt: execution.number,
        consumerId: consumer.id,
      });
    }
  } finally {
    scheduler.isDispatching = false;
  }
}
