export default function observeDownstreamConnection(requestContext, onCancel) {
  const { httpRequest, httpResponse } = requestContext;
  const onClose = () => {
    if (!httpResponse.writableFinished) onCancel();
  };
  httpRequest.once('aborted', onCancel);
  httpRequest.once('error', onCancel);
  httpResponse.once('close', onClose);
  httpResponse.once('error', onCancel);
  if (httpRequest.aborted || httpResponse.destroyed) onClose();
  return () => {
    httpRequest.off('aborted', onCancel);
    httpRequest.off('error', onCancel);
    httpResponse.off('close', onClose);
    httpResponse.off('error', onCancel);
  };
}
