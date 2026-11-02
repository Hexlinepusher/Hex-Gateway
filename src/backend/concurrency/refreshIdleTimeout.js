import createGatewayError from '../errors/createGatewayError.js';

import cancelRequest from './cancelRequest.js';
import enforceRequestDeadline from './enforceRequestDeadline.js';
import isAttemptActive from './isAttemptActive.js';

export default function refreshIdleTimeout(scheduler, task, attempt) {
  if (!isAttemptActive(task, attempt) || !enforceRequestDeadline(scheduler, task)) return;
  clearTimeout(attempt.idleTimer);
  attempt.idleTimer = setTimeout(() => {
    if (!isAttemptActive(task, attempt)) return;
    cancelRequest(
      scheduler,
      task,
      createGatewayError('上游响应空闲超时', {
        statusCode: 504,
        code: 'idle_timeout',
        type: 'timeout_error',
      })
    );
  }, scheduler.idleTimeoutMs);
}
