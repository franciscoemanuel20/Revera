type Session = { dialog: HTMLElement; previous: HTMLElement | null };
const sessions: Session[] = [];
const originalInert = new Map<HTMLElement, boolean>();
const top = () => sessions[sessions.length - 1];

// Só o diálogo superior fica acessível. Cada atributo é restaurado ao
// estado anterior quando nenhum diálogo gerenciado precisa mais isolá-lo.
function syncIsolation() {
  const desired = new Set<HTMLElement>();
  let branch = top()?.dialog;
  while (branch?.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) desired.add(sibling);
    }
    if (branch.parentElement === document.body) break;
    branch = branch.parentElement;
  }
  for (const [element, wasInert] of originalInert) {
    if (!desired.has(element)) {
      if (!wasInert) element.removeAttribute("inert");
      originalInert.delete(element);
    }
  }
  for (const element of desired) {
    if (!originalInert.has(element)) originalInert.set(element, element.hasAttribute("inert"));
    element.setAttribute("inert", "");
  }
}

export function isTopDialog(dialog: HTMLElement): boolean {
  return top()?.dialog === dialog;
}

/** Isola apenas a navegação do diálogo; não executa nenhuma ação da sacola. */
export function activateDialogFocus(dialog: HTMLElement): () => void {
  const session: Session = { dialog, previous: document.activeElement instanceof HTMLElement ? document.activeElement : null };
  sessions.push(session);
  syncIsolation();

  function controls() {
    return [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'
    )].filter(element => element.tabIndex >= 0 && !element.matches(":disabled") &&
      !element.closest("[hidden], [inert]") && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden");
  }
  const focusFirst = () => (controls()[0] ?? dialog).focus({ preventScroll: true });
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Tab" || !isTopDialog(dialog)) return;
    const elements = controls();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
    } else if (!elements.includes(document.activeElement as HTMLElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }
  function onFocus(event: FocusEvent) {
    if (isTopDialog(dialog) && event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
  }
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("focusin", onFocus);
  focusFirst();

  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("focusin", onFocus);
    const index = sessions.indexOf(session);
    if (index < 0) return;
    const wasTop = isTopDialog(dialog);
    sessions.splice(index, 1);
    // Se um diálogo inferior desmonta antes do superior, preserva a cadeia
    // de retorno ao botão que o abriu, sem focar atrás do diálogo ativo.
    for (const other of sessions) {
      if (other.previous && dialog.contains(other.previous)) other.previous = session.previous;
    }
    syncIsolation();
    if (wasTop && session.previous?.isConnected) session.previous.focus({ preventScroll: true });
  };
}
