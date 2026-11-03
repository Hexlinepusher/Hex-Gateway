import createGatewayError from '../errors/createGatewayError.js';

export default function validateChatRequest(body, protocol) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body.model !== 'string' ||
    body.model.trim() === '' ||
    (body.stream !== undefined &&
      typeof body.stream !== 'boolean' &&
      !(protocol === 'openai' && body.stream === null))
  ) {
    throw createGatewayError('Invalid Request Body', {
      statusCode: 400,
      code: 'invalid_request_error',
      type: 'invalid_request_error',
    });
  }
}
