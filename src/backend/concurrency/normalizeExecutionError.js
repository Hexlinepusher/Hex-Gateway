import createGatewayError from '../errors/createGatewayError.js';

export default function normalizeExecutionError(error) {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599) {
    return error;
  }
  return createGatewayError(error?.message || '上游调用失败', {
    statusCode: 502,
    code: 'upstream_error',
    type: 'api_error',
  });
}
