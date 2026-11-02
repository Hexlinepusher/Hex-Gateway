import createGatewayError from '../errors/createGatewayError.js';

export default function authorizeRequest(request, apiKey) {
  if (!apiKey) return;
  const bearerToken = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : undefined;
  if (bearerToken === apiKey || request.headers['x-api-key'] === apiKey) return;
  throw createGatewayError('网关 API Key 不正确。', {
    statusCode: 401,
    code: 'invalid_api_key',
    type: 'authentication_error',
  });
}
