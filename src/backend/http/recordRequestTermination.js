export default function recordRequestTermination(requestContext, log, reason) {
  if (requestContext.terminationReason !== null) return;
  requestContext.terminationReason = reason;
  log('request.terminated', { uid: requestContext.uid, reason });
}
