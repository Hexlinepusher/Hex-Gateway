export default function createTestRequestSnapshot(requestContext, rawBody) {
  const { httpRequest, uid, receivedAt } = requestContext;
  return {
    uid,
    receivedAt,
    method: httpRequest.method,
    requestTarget: httpRequest.url,
    httpVersion: httpRequest.httpVersion,
    rawHeaders: [...httpRequest.rawHeaders],
    rawBody: Buffer.from(rawBody),
  };
}
