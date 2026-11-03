export default function findModel(modelCatalog, modelId) {
  return modelCatalog.find((model) => model.id === modelId);
}
