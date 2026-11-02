import cancelRequest from './cancelRequest.js';
import enforceRequestDeadline from './enforceRequestDeadline.js';
import executeRequest from './executeRequest.js';

export default function dispatchRequests(scheduler) {
  if (scheduler.dispatching || typeof scheduler.execute !== 'function') return;
  scheduler.dispatching = true;
  try {
    while (scheduler.queue.length > 0) {
      const task = scheduler.queue[0];
      if (task.signal?.aborted) {
        cancelRequest(scheduler, task, task.signal.reason);
        continue;
      }
      if (!enforceRequestDeadline(scheduler, task)) continue;
      const consumer = scheduler.consumers.find(
        (candidate) => candidate.available !== false && !candidate.busy
      );
      if (!consumer) break;
      scheduler.queue.shift();
      void executeRequest(scheduler, task, consumer);
    }
  } finally {
    scheduler.dispatching = false;
  }
}
