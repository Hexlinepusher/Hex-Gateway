import createGatewayError from '../errors/createGatewayError.js';

export default async function readRequestBody(request, downstreamSignal, shutdownSignal) {
  const signal = AbortSignal.any([downstreamSignal, shutdownSignal]);
  const chunks = [];
  const onData = (chunk) => chunks.push(chunk);
  let onEnd;
  let onError;
  let onAbort;
  let onDisconnect;
  try {
    await new Promise((resolve, reject) => {
      onEnd = resolve;
      onError = reject;
      onAbort = () => reject(signal.reason);
      onDisconnect = () =>
        reject(
          createGatewayError('请求体未完整接收。', {
            statusCode: 400,
            code: 'incomplete_request',
            type: 'invalid_request_error',
          })
        );
      request.on('data', onData);
      request.once('end', onEnd);
      request.once('error', onError);
      request.once('aborted', onDisconnect);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return Buffer.concat(chunks);
  } finally {
    request.off('data', onData);
    request.off('end', onEnd);
    request.off('error', onError);
    request.off('aborted', onDisconnect);
    signal.removeEventListener('abort', onAbort);
    if (!request.readableEnded) request.resume();
  }
}
