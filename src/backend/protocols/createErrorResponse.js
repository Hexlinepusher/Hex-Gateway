export default function createErrorResponse(error, protocol, uid) {
  const message = error?.message ?? '网关请求失败。';
  const type = error?.type ?? 'api_error';
  const code = error?.code ?? 'gateway_error';

  if (protocol === 'anthropic') {
    return {
      type: 'error',
      error: { type, message, code },
      request_id: uid,
    };
  }

  return {
    error: { message, type, param: null, code },
  };
}
