export default async function requestMetricReset(metric) {
  const response = await fetch(`/api/statistics/${encodeURIComponent(metric)}/reset`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`统计重置失败（HTTP ${response.status}）。`);
  return response.json();
}
