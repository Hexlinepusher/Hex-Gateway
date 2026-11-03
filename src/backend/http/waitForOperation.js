export default async function waitForOperation(operation, signal) {
  let onAbort;
  try {
    const cancelled = new Promise((resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return await Promise.race([operation, cancelled]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
