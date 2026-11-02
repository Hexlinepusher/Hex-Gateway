export default function isAttemptActive(task, attempt) {
  return (
    !task.settled &&
    task.activeAttempt === attempt &&
    attempt.active &&
    !task.signal?.aborted &&
    !attempt.controller.signal.aborted
  );
}
