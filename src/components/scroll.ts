/** Each stage scrolls inside the workspace, beneath the fixed navigation. */
export function scrollContentToTop() {
  document.querySelector<HTMLElement>('.app-content')?.scrollTo({ top: 0 });
}
