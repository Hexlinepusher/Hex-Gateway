import createGatewayError from '../errors/createGatewayError.js';

export default function validateChatRequest(body, models, protocol) {
  const invalidRequest = {
    statusCode: 400,
    code: 'invalid_request_error',
    type: 'invalid_request_error',
  };

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createGatewayError('请求体必须是 JSON 对象。', invalidRequest);
  }
  if (typeof body.model !== 'string' || body.model.trim() === '') {
    throw createGatewayError('model 必须是非空字符串。', invalidRequest);
  }
  if (!models.some((model) => model.id === body.model)) {
    throw createGatewayError(`模型不存在：${body.model}`, {
      statusCode: 404,
      code: 'model_not_found',
      type: 'not_found_error',
    });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw createGatewayError('messages 必须是非空数组。', invalidRequest);
  }
  if (body.stream !== undefined && typeof body.stream !== 'boolean') {
    throw createGatewayError('stream 必须是布尔值。', invalidRequest);
  }
  if (protocol === 'anthropic' && (!Number.isSafeInteger(body.max_tokens) || body.max_tokens < 0)) {
    throw createGatewayError('max_tokens 必须是非负整数。', invalidRequest);
  }
}
