import createGatewayError from '../errors/createGatewayError.js';

export default function parseRequestBody(body) {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw createGatewayError('请求体必须是有效的 JSON。', {
      statusCode: 400,
      code: 'invalid_json',
      type: 'invalid_request_error',
    });
  }
}
