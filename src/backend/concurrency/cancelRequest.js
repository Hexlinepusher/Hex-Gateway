import createGatewayError from '../errors/createGatewayError.js';

import settleRequest from './settleRequest.js';

export default function cancelRequest(scheduler, task, reason) {
  if (task.settled) return;
  const error =
    reason instanceof Error
      ? reason
      : createGatewayError('请求已取消', {
          statusCode: 499,
          code: 'request_cancelled',
          type: 'request_cancelled',
        });
  const queueIndex = scheduler.queue.indexOf(task);
  if (queueIndex !== -1) scheduler.queue.splice(queueIndex, 1);
  settleRequest(task, error);
  task.activeAttempt?.controller.abort(error);
  scheduler.log('warn', '请求取消', {
    requestId: task.uid,
    attempt: task.attempt,
    code: error.code,
  });
}
