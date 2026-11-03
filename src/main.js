import registerShutdownSignals from './backend/lifecycle/registerShutdownSignals.js';
import startGateway from './backend/lifecycle/startGateway.js';
import stopGateway from './backend/lifecycle/stopGateway.js';

try {
  const gateway = await startGateway();
  registerShutdownSignals(() => stopGateway(gateway));
} catch {
  process.exitCode = 1;
}
