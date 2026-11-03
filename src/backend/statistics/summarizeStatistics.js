export default function summarizeStatistics(statistics) {
  const latency = Object.values(statistics.latencyByDate).reduce(
    (sum, day) => ({
      totalMs: sum.totalMs + day.totalMs,
      sampleCount: sum.sampleCount + day.sampleCount,
    }),
    { totalMs: 0, sampleCount: 0 }
  );
  const duration = Object.values(statistics.durationByDate).reduce(
    (sum, day) => ({
      totalMs: sum.totalMs + day.totalMs,
      sampleCount: sum.sampleCount + day.sampleCount,
    }),
    { totalMs: 0, sampleCount: 0 }
  );
  const results = Object.values(statistics.resultsByDate).reduce(
    (sum, day) => ({ total: sum.total + day.total, succeeded: sum.succeeded + day.succeeded }),
    { total: 0, succeeded: 0 }
  );
  return {
    averageUpstreamLatencyMs: latency.sampleCount ? latency.totalMs / latency.sampleCount : null,
    averageExecutionDurationMs: duration.sampleCount
      ? duration.totalMs / duration.sampleCount
      : null,
    successRate: results.total ? results.succeeded / results.total : null,
  };
}
