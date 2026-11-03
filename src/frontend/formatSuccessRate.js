export default function formatSuccessRate(rate) {
  return rate === null ? '??%' : `${(rate * 100).toFixed(1)}%`;
}
