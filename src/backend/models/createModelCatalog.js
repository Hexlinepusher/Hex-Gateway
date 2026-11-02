export default function createModelCatalog(serviceName, additionalModels = []) {
  if (typeof serviceName !== 'string' || serviceName.trim() === '') {
    throw new TypeError('上游服务名必须是非空字符串。');
  }
  if (!Array.isArray(additionalModels)) {
    throw new TypeError('附加模型必须是数组。');
  }

  const entries = [
    { id: `${serviceName}-default` },
    { id: `${serviceName}-test` },
    ...additionalModels,
  ];
  const identifiers = new Set();
  const models = [];

  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || entry.id.trim() === '') {
      throw new TypeError('每个模型必须提供非空的 id。');
    }
    if (identifiers.has(entry.id)) {
      throw new TypeError(`模型 ID 重复：${entry.id}`);
    }
    const created = entry.created ?? 0;
    if (!Number.isSafeInteger(created) || created < 0 || created > 8640000000000) {
      throw new TypeError(`模型时间无效：${entry.id}`);
    }
    identifiers.add(entry.id);
    models.push({
      id: entry.id,
      displayName: entry.displayName ?? entry.id,
      created,
      ownedBy: entry.ownedBy ?? serviceName,
    });
  }

  return models;
}
