import createStatistics from './createStatistics.js';
import updateStatisticsWindow from './updateStatisticsWindow.js';

export default function resetStatisticsMetric(statistics, metric, date) {
  const definitions = {
    upstreamLatency: { field: 'latencyByDate', label: '上游平均延迟' },
    executionDuration: { field: 'durationByDate', label: '请求平均耗时' },
    successRate: { field: 'resultsByDate', label: '请求成功率' },
  };
  if (!Object.hasOwn(definitions, metric)) return null;
  const { field, label } = definitions[metric];
  updateStatisticsWindow(statistics, date);
  statistics[field] = createStatistics(date)[field];
  return label;
}
