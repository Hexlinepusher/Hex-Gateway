import createGatewayError from '../errors/createGatewayError.js';

import cancelRequest from './cancelRequest.js';

export default function enforceRequestDeadline(scheduler, task) {
  if (!task.settled && Date.now() >= task.deadline) {
    cancelRequest(
      scheduler,
      task,
      createGatewayError('请求整体超时', {
        statusCode: 504,
        code: 'total_timeout',
        type: 'timeout_error',
      })
    );
  }
  return !task.settled;
}
