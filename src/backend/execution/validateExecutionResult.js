export default function validateExecutionResult(result) {
  if (
    !result ||
    !['succeeded', 'failed', 'unknown'].includes(result.outcome) ||
    (result.retryRequested !== undefined && typeof result.retryRequested !== 'boolean') ||
    (result.outcome === 'failed' && typeof result.reason !== 'string') ||
    (result.outcome === 'unknown' &&
      (!Number.isInteger(result.upstreamResponse?.code) ||
        typeof result.upstreamResponse?.status !== 'string'))
  )
    throw new TypeError('消费者未返回有效的执行结果。');
  const response = result.response;
  if (!response || typeof response !== 'object') {
    throw new TypeError('消费者未提供终态响应。');
  }
  const hasBody = response.body !== undefined;
  const hasError = response.error !== undefined;
  const hasStreamEnd = response.streamed === true;
  if (Number(hasBody) + Number(hasError) + Number(hasStreamEnd) !== 1) {
    throw new TypeError('终态响应必须指定响应体、错误或流式结束之一。');
  }
  if (
    (hasError && typeof response.error?.message !== 'string') ||
    (response.statusCode !== undefined &&
      (!Number.isInteger(response.statusCode) ||
        response.statusCode < 200 ||
        response.statusCode > 599))
  )
    throw new TypeError('终态响应内容无效。');
}
