export default function unlockRequest(queueEntry, execution) {
  if (queueEntry.lockedExecution === execution) queueEntry.lockedExecution = null;
}
