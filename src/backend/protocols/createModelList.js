export default function createModelList(models, protocol) {
  if (protocol === 'anthropic') {
    return {
      data: models.map((model) => ({
        id: model.id,
        type: 'model',
        created_at: new Date(model.created * 1000).toISOString(),
        display_name: model.displayName,
      })),
      has_more: false,
      first_id: models[0]?.id ?? null,
      last_id: models.at(-1)?.id ?? null,
    };
  }

  return {
    object: 'list',
    data: models.map((model) => ({
      id: model.id,
      object: 'model',
      created: model.created,
      owned_by: model.ownedBy,
    })),
  };
}
