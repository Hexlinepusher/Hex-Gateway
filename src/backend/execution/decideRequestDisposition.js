export default function decideRequestDisposition(scheduler, execution, result) {
  const { queueEntry, consumer } = execution;
  const context = queueEntry.requestContext;
  if (
    context.downstreamAbortController.signal.aborted ||
    context.terminationReason !== null ||
    !scheduler.requestQueue.entries.includes(queueEntry)
  )
    return 'discard';
  if (scheduler.lifecycle.isStopping || scheduler.lifecycle.shutdownController.signal.aborted) {
    return 'shutdown';
  }
  if (
    !result.retryRequested ||
    context.httpResponse.headersSent ||
    context.httpResponse.writableEnded ||
    consumer.available !== false
  )
    return 'respond';
  return queueEntry.executionCount - 1 < scheduler.configuration.retryTimes
    ? 'retry'
    : 'retry_limit';
}
