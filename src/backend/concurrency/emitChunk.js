import enforceRequestDeadline from './enforceRequestDeadline.js';
import isAttemptActive from './isAttemptActive.js';

export default async function emitChunk(scheduler, task, attempt, chunk) {
  if (!isAttemptActive(task, attempt) || !enforceRequestDeadline(scheduler, task)) return;
  task.committed = true;
  await task.onChunk(chunk, attempt.controller.signal);
}
