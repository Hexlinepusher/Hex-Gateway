import formatDuration from './formatDuration.js';
import formatSuccessRate from './formatSuccessRate.js';

export default function renderOverview(elements, overview) {
  elements.serviceName.textContent = overview.serviceName;
  elements.queueLength.textContent = `${overview.queue.length}/${overview.queue.capacity}`;
  elements.consumerCapacity.textContent = `${overview.consumers.idleAvailable}/${overview.consumers.available}`;
  elements.upstreamLatency.textContent = formatDuration(overview.metrics.averageUpstreamLatencyMs);
  elements.executionDuration.textContent = formatDuration(
    overview.metrics.averageExecutionDurationMs
  );
  elements.successRate.textContent = formatSuccessRate(overview.metrics.successRate);
}
