export default function findNextQueueEntry(requestQueue) {
  return requestQueue.entries.find(
    (entry) =>
      entry.lockedExecution === null &&
      !entry.requestContext.downstreamAbortController.signal.aborted &&
      entry.requestContext.terminationReason === null
  );
}
