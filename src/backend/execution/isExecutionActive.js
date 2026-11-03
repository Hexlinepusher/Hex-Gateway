export default function isExecutionActive(execution) {
  return (
    execution.endedAt === null &&
    execution.queueEntry.lockedExecution === execution &&
    execution.consumer.currentExecution === execution
  );
}
