export default async function requestModelList() {
  const response = await fetch('/api/models', { cache: 'no-store' });
  if (!response.ok) throw new Error(`模型列表读取失败（HTTP ${response.status}）。`);
  return response.json();
}
