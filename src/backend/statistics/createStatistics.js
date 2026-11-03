import getStatisticsDates from './getStatisticsDates.js';

export default function createStatistics(date) {
  const statistics = {
    resultsByDate: {},
    latencyByDate: {},
    durationByDate: {},
  };
  for (const day of getStatisticsDates(date)) {
    statistics.resultsByDate[day] = { total: 0, succeeded: 0, failed: 0, unknown: 0 };
    statistics.latencyByDate[day] = { totalMs: 0, sampleCount: 0 };
    statistics.durationByDate[day] = { totalMs: 0, sampleCount: 0 };
  }
  return statistics;
}
