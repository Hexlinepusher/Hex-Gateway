export default function createGatewayError(
  message,
  { statusCode = 500, code = 'gateway_error', type = 'api_error' } = {}
) {
  return Object.assign(new Error(message), { statusCode, code, type });
}
