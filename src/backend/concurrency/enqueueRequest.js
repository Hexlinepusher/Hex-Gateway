import createGatewayError from '../errors/createGatewayError.js';

export default function enqueueRequest(scheduler, requestContext) {
  if (scheduler.lifecycle.isStopping || scheduler.lifecycle.shutdownController.signal.aborted) {
    throw createGatewayError('Gateway Is Stopping', {
      statusCode: 503,
      code: 'gateway_stopping',
    });
  }
  requestContext.downstreamAbortController.signal.throwIfAborted();
  if (scheduler.requestQueue.entries.length >= scheduler.requestQueue.capacity) {
    throw createGatewayError('Out of Request Queue Capacity', {
      statusCode: 429,
      code: 'request_queue_full',
      type: 'rate_limit_error',
    });
  }
  const queueEntry = { requestContext, executionCount: 0, lockedExecution: null };
  scheduler.requestQueue.entries.push(queueEntry);
  return queueEntry;
}
