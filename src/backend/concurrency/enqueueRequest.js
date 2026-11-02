import cancelRequest from './cancelRequest.js';
import dispatchRequests from './dispatchRequests.js';

export default function enqueueRequest(scheduler, { uid, deadline, signal, request, onChunk }) {
  return new Promise((resolve, reject) => {
    const task = {
      uid,
      deadline,
      signal,
      request,
      onChunk,
      resolve,
      reject,
      attempt: 0,
      activeAttempt: null,
      settled: false,
      committed: false,
    };
    task.abortListener = () => cancelRequest(scheduler, task, signal.reason);
    signal?.addEventListener('abort', task.abortListener, { once: true });
    scheduler.queue.push(task);
    if (signal?.aborted) {
      task.abortListener();
      return;
    }
    scheduler.log('info', '请求进入队列', { requestId: uid });
    dispatchRequests(scheduler);
  });
}
