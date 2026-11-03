import { randomUUID } from 'node:crypto';

export default function createRequestContext(httpRequest, httpResponse) {
  return {
    uid: randomUUID(),
    httpRequest,
    httpResponse,
    receivedAt: Date.now(),
    pathname: null,
    protocol: 'openai',
    parsedBody: null,
    downstreamAbortController: new AbortController(),
    terminationReason: null,
  };
}
