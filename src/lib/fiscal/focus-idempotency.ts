// A reserva é permanente. Depois de qualquer tentativa, inclusive timeout,
// repetir a operação só pode consultar a referência; nunca chama POST de novo.
export async function issueWithPermanentReservation<T, R>(
  reserve: () => Promise<T | null>,
  onReserved: (row: T) => Promise<void>,
  post: (row: T) => Promise<R>,
): Promise<{ state: "existing" } | { state: "sent"; row: T; result: R } |
  { state: "unknown"; row: T; error: unknown }> {
  const row = await reserve();
  if (!row) return { state: "existing" };
  try {
    await onReserved(row);
    return { state: "sent", row, result: await post(row) };
  } catch (error) {
    return { state: "unknown", row, error };
  }
}
