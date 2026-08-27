/**
 * Supabase falso, em memória — o mínimo do PostgREST que o código de
 * Purchase usa de verdade.
 *
 * Existe porque os cenários do P0-3 que mais importam (refresh não duplica,
 * webhook repetido não duplica, duas abas simultâneas dão UM evento) não são
 * regra pura: dependem de leitura-e-escrita condicional. Testá-los com um
 * mock que só devolve valores fixos provaria nada — o teste passaria mesmo
 * com a trava removida.
 *
 * Por isso este fake emula as três coisas de que essas travas dependem:
 *
 *   1. `unique` — um insert repetido devolve o código 23505, como o Postgres;
 *   2. `update ... where` que NÃO acha linha devolve null, sem escrever;
 *   3. filtros `eq` encadeados.
 *
 * Não é um banco. É só o suficiente para que remover uma trava do código
 * QUEBRE um teste — que é a única coisa que se pede de um teste.
 */

interface Linha {
  [coluna: string]: unknown;
}

interface Unico {
  tabela: string;
  colunas: string[];
}

export class FakeSupabase {
  private dados: Record<string, Linha[]> = {};
  private unicos: Unico[] = [];

  constructor(dados: Record<string, Linha[]> = {}, unicos: Unico[] = []) {
    this.dados = JSON.parse(JSON.stringify(dados));
    this.unicos = unicos;
  }

  tabela(nome: string): Linha[] {
    return this.dados[nome] ?? [];
  }

  from(nome: string) {
    if (!this.dados[nome]) this.dados[nome] = [];
    return new Consulta(this.dados[nome], nome, this.unicos);
  }
}

type Filtro = { coluna: string; valor: unknown };

class Consulta {
  private filtros: Filtro[] = [];
  private operacao: "select" | "insert" | "update" | "delete" = "select";
  private patch: Linha | null = null;
  private paraInserir: Linha[] = [];
  private limite: number | null = null;

  constructor(
    private linhas: Linha[],
    private nome: string,
    private unicos: Unico[]
  ) {}

  select(_colunas?: string) {
    if (this.operacao === "select") this.operacao = "select";
    return this;
  }

  insert(valor: Linha | Linha[]) {
    this.operacao = "insert";
    this.paraInserir = Array.isArray(valor) ? valor : [valor];
    return this;
  }

  update(patch: Linha) {
    this.operacao = "update";
    this.patch = patch;
    return this;
  }

  delete() {
    this.operacao = "delete";
    return this;
  }

  eq(coluna: string, valor: unknown) {
    this.filtros.push({ coluna, valor });
    return this;
  }

  order(_coluna: string, _opcoes?: unknown) {
    return this;
  }

  limit(n: number) {
    this.limite = n;
    return this;
  }

  private casam(): Linha[] {
    const achadas = this.linhas.filter((l) =>
      this.filtros.every((f) => l[f.coluna] === f.valor)
    );
    return this.limite != null ? achadas.slice(0, this.limite) : achadas;
  }

  private violaUnico(linha: Linha): boolean {
    const regras = this.unicos.filter((u) => u.tabela === this.nome);
    return regras.some((u) =>
      this.linhas.some((existente) =>
        u.colunas.every((c) => existente[c] === linha[c])
      )
    );
  }

  private executar(): { data: Linha[] | null; error: { code: string; message: string } | null } {
    if (this.operacao === "insert") {
      for (const linha of this.paraInserir) {
        if (this.violaUnico(linha)) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
      }
      // Só grava depois de conferir todas — como uma transação.
      for (const linha of this.paraInserir) this.linhas.push({ ...linha });
      return { data: this.paraInserir.map((l) => ({ ...l })), error: null };
    }

    if (this.operacao === "update") {
      const alvos = this.casam();
      for (const alvo of alvos) Object.assign(alvo, this.patch);
      return { data: alvos.map((l) => ({ ...l })), error: null };
    }

    if (this.operacao === "delete") {
      const alvos = this.casam();
      for (const alvo of alvos) {
        const i = this.linhas.indexOf(alvo);
        if (i >= 0) this.linhas.splice(i, 1);
      }
      return { data: alvos, error: null };
    }

    return { data: this.casam().map((l) => ({ ...l })), error: null };
  }

  async maybeSingle() {
    const { data, error } = this.executar();
    if (error) return { data: null, error };
    return { data: data && data.length > 0 ? data[0] : null, error: null };
  }

  async single() {
    return this.maybeSingle();
  }

  // Await direto na consulta (sem maybeSingle), como o supabase-js permite.
  then(
    resolve: (v: { data: Linha[] | null; error: unknown }) => unknown,
    reject?: (e: unknown) => unknown
  ) {
    try {
      return Promise.resolve(this.executar()).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  }
}

/** Os índices únicos reais do schema que importam para o Purchase. */
export const UNICOS_REAIS: Unico[] = [
  { tabela: "pixel_event_log", colunas: ["event_name", "event_id"] },
  { tabela: "payment_events", colunas: ["provider", "provider_event_id"] },
];
