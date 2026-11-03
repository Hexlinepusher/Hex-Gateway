export default async function requestOverview() {
  const response = await fetch('/api/overview', { cache: 'no-store' });
  if (!response.ok) throw new Error(`运行概览读取失败（HTTP ${response.status}）。`);
  return response.json();
}
