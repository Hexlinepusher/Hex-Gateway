import createGatewayError from '../errors/createGatewayError.js';

export default function authorizeRequest(request, apiKey) {
  if (!apiKey) return;
  const bearerToken = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : undefined;
  if (bearerToken === apiKey || request.headers['x-api-key'] === apiKey) return;
  throw createGatewayError('Invalid API Key', {
    statusCode: 403,
    code: 'invalid_api_key',
    type: 'authentication_error',
  });
}
