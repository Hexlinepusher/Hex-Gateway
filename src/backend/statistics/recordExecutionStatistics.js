import updateStatisticsWindow from './updateStatisticsWindow.js';

export default function recordExecutionStatistics(
  statistics,
  { startedAt, firstUpstreamDataAt, endedAt, outcome }
) {
  const date = new Date(endedAt);
  updateStatisticsWindow(statistics, date);
  const day = date.toISOString().slice(0, 10);
  statistics.resultsByDate[day].total += 1;
  statistics.resultsByDate[day][outcome] += 1;
  statistics.durationByDate[day].totalMs += endedAt - startedAt;
  statistics.durationByDate[day].sampleCount += 1;
  if (firstUpstreamDataAt !== null) {
    statistics.latencyByDate[day].totalMs += firstUpstreamDataAt - startedAt;
    statistics.latencyByDate[day].sampleCount += 1;
  }
}
