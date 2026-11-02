export default async function waitForResponseFinish(response, signal) {
  if (response.writableFinished || response.destroyed) return;
  let onFinish;
  let onClose;
  let onAbort;
  try {
    await new Promise((resolve, reject) => {
      onFinish = resolve;
      onClose = resolve;
      onAbort = () => reject(signal.reason);
      response.once('finish', onFinish);
      response.once('close', onClose);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  } finally {
    response.off('finish', onFinish);
    response.off('close', onClose);
    signal.removeEventListener('abort', onAbort);
  }
}
