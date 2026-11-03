export default async function waitForResponseFinish(httpResponse) {
  if (httpResponse.writableFinished || httpResponse.destroyed) return;
  let onFinish;
  let onClose;
  let onError;
  try {
    await new Promise((resolve, reject) => {
      onFinish = resolve;
      onClose = resolve;
      onError = reject;
      httpResponse.once('finish', onFinish);
      httpResponse.once('close', onClose);
      httpResponse.once('error', onError);
      if (httpResponse.writableFinished || httpResponse.destroyed) resolve();
    });
  } finally {
    httpResponse.off('finish', onFinish);
    httpResponse.off('close', onClose);
    httpResponse.off('error', onError);
  }
}
