export default function getStatisticsDates(date) {
  const currentDate = new Date(date);
  const dates = [];
  for (let offset = 0; offset < 3; offset += 1) {
    dates.push(currentDate.toISOString().slice(0, 10));
    currentDate.setUTCDate(currentDate.getUTCDate() - 1);
  }
  return dates;
}
