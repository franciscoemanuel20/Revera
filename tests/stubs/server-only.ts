// Stub de `server-only` para o vitest.
//
// O pacote real lança ao ser importado fora do ambiente de servidor do Next
// (é exatamente o trabalho dele). Módulos como src/lib/payments/index.ts o
// importam para impedir que cheguem ao bundle do navegador — e isso não pode
// ser afrouxado. Este stub existe só para o teste conseguir carregar esses
// módulos e verificar a REGRA que eles contêm (P0-2: falhar fechado sem
// PAYMENT_PROVIDER), sem enfraquecer a proteção em produção.
export {};
