export default function lockRequest(queueEntry, consumer, startedAt = Date.now()) {
  if (
    queueEntry.lockedExecution !== null ||
    consumer.currentExecution ||
    consumer.available !== true ||
    queueEntry.requestContext.downstreamAbortController.signal.aborted ||
    queueEntry.requestContext.terminationReason !== null
  )
    return null;
  queueEntry.executionCount += 1;
  const execution = {
    queueEntry,
    consumer,
    number: queueEntry.executionCount,
    startedAt,
    firstUpstreamDataAt: null,
    endedAt: null,
    activeUpstreamCalls: new Set(),
    callbackError: null,
    completion: null,
  };
  queueEntry.lockedExecution = execution;
  consumer.currentExecution = execution;
  return execution;
}
