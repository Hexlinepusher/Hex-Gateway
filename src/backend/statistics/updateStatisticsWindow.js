import createStatistics from './createStatistics.js';

export default function updateStatisticsWindow(statistics, date) {
  const emptyWindow = createStatistics(date);
  for (const [metric, days] of Object.entries(emptyWindow)) {
    for (const day of Object.keys(statistics[metric])) {
      if (!Object.hasOwn(days, day)) delete statistics[metric][day];
    }
    for (const [day, initialValue] of Object.entries(days)) {
      if (!Object.hasOwn(statistics[metric], day)) statistics[metric][day] = initialValue;
    }
  }
}
