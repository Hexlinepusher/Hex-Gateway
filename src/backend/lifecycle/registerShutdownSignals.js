export default function registerShutdownSignals(stop) {
  const onSignal = async () => {
    try {
      await stop();
    } catch {
      process.exitCode = 1;
    }
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  return () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };
}
