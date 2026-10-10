import { describe, expect, it, vi } from "vitest";
import { reconcileFocusDocumentLink } from "../../src/lib/fiscal/focus-document-link";

const expected = { reference: "authorized-key", storage_path: "order/focus/danfe.pdf" };
const matching = { ...expected, source: "external" };
describe("reconciliação do vínculo fiscal", () => {
  it("recupera uma consulta cujo primeiro insert falhou sem duplicar documento", async () => {
    const insert = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const read = vi.fn().mockResolvedValue(null);
    await expect(reconcileFocusDocumentLink(expected, read, insert)).rejects.toThrow();
    await expect(reconcileFocusDocumentLink(expected, read, insert)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(2);
  });
  it("aceita insert concorrente somente quando o vínculo é igual", async () => {
    const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(matching);
    await expect(reconcileFocusDocumentLink(expected, read, async () => { throw new Error("unique"); })).resolves.toBeUndefined();
  });
  it("não sobrescreve documento divergente", async () => {
    const insert = vi.fn();
    await expect(reconcileFocusDocumentLink(expected, async () => ({ ...matching, reference: "other" }), insert)).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
  it("propaga falha de leitura e não tenta insert", async () => {
    const insert = vi.fn();
    await expect(reconcileFocusDocumentLink(expected, async () => { throw new Error("read"); }, insert)).rejects.toThrow("read");
    expect(insert).not.toHaveBeenCalled();
  });
});
