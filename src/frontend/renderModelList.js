export default function renderModelList(element, models) {
  element.replaceChildren(
    ...models.map((model) => {
      const item = document.createElement('li');
      item.textContent = model.id;
      return item;
    })
  );
}
