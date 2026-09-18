"use client";

import { useEffect } from "react";

export function AutoRetryPagamento({
  ativo,
  intervaloMs = 2500,
  maxTentativas = 6,
}: {
  ativo: boolean;
  intervaloMs?: number;
  maxTentativas?: number;
}) {
  useEffect(() => {
    if (!ativo) return;

    const url = new URL(window.location.href);
    const tentativas = Number(url.searchParams.get("tentativas_pagamento") ?? "0");
    if (!Number.isFinite(tentativas) || tentativas >= maxTentativas) return;

    const timer = window.setTimeout(() => {
      url.searchParams.set("tentativas_pagamento", String(tentativas + 1));
      window.location.replace(url.toString());
    }, intervaloMs);

    return () => window.clearTimeout(timer);
  }, [ativo, intervaloMs, maxTentativas]);

  return null;
}
