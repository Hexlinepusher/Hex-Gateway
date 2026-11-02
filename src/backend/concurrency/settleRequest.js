export default function settleRequest(task, error, result) {
  if (task.settled) return;
  task.settled = true;
  task.signal?.removeEventListener('abort', task.abortListener);
  if (task.activeAttempt) {
    task.activeAttempt.active = false;
    clearTimeout(task.activeAttempt.idleTimer);
  }
  if (error) {
    task.reject(error);
  } else {
    task.resolve(result);
  }
}
