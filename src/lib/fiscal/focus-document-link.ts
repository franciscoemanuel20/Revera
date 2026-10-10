type DocumentLink = { reference: string | null; storage_path: string | null; source: string };

/** Reconcile a failed insert without overwriting an existing fiscal document. */
export async function reconcileFocusDocumentLink(
  expected: { reference: string; storage_path: string },
  read: () => Promise<DocumentLink | null>,
  insert: () => Promise<void>,
): Promise<void> {
  const matches = (doc: DocumentLink) => doc.source === "external" &&
    doc.reference === expected.reference && doc.storage_path === expected.storage_path;
  const existing = await read();
  if (existing) {
    if (!matches(existing)) throw new Error("Vínculo fiscal divergente");
    return;
  }
  try { await insert(); }
  catch {
    // Another consultation may have inserted the same link concurrently.
    const concurrent = await read();
    if (!concurrent || !matches(concurrent)) throw new Error("Vínculo fiscal não persistido");
  }
}
