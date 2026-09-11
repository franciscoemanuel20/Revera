/** Conversão comercial autorizada pelo Francisco. Sem --aplicar é somente leitura. */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export function destinoReveraValido(supabaseUrl, databaseUrl) {
  try {
    const ref = 'ngnaemfiytutyplolgxb';
    const api = new URL(supabaseUrl), db = new URL(databaseUrl);
    return api.protocol === 'https:' && api.hostname === `${ref}.supabase.co` &&
      ['postgres:','postgresql:'].includes(db.protocol) && db.pathname === '/postgres' &&
      (db.hostname === `db.${ref}.supabase.co` ||
       (db.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(db.username) === `postgres.${ref}`));
  } catch { return false; }
}

export function precoProtegido(baseCents, rate, anterior = 0, fixoCents = 39) {
  if (!Number.isSafeInteger(baseCents) || baseCents <= 0 || !Number.isFinite(rate) || rate <= 0 ||
      !Number.isSafeInteger(anterior) || anterior < 0) throw new Error('Base monetária inválida');
  // 3,99% + 2% internacional + R$0,39 (stripe.com/br/pricing, 10/09/2026).
  // Arredondamento para unidade inteira superior. Nunca reduz preço anterior.
  return Math.max(anterior, Math.ceil((baseCents + fixoCents) / (1 - 0.0599) / rate / 100) * 100);
}

export async function executar() {
  const aplicar = process.argv.includes('--aplicar');
  const data = process.argv.find(a => a.startsWith('--data='))?.split('=')[1];
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe --data=AAAA-MM-DD');
  const idade = Date.now() - Date.parse(`${data}T00:00:00Z`);
  if (idade < 0 || idade > 5 * 86400000) throw new Error('Cotação deve ser recente, não futura');
  if (!destinoReveraValido(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.DATABASE_URL)) {
    throw new Error('Projeto inesperado');
  }
  const moedas = ['USD','EUR','GBP','AUD','CAD'];
  const cambio = {};
  for (const moeda of moedas) {
    const u = new URL('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)');
    const [ano,mes,dia] = data.split('-');
    u.searchParams.set('@moeda', `'${moeda}'`);
    u.searchParams.set('@dataCotacao', `'${mes}-${dia}-${ano}'`);
    u.searchParams.set('$format', 'json');
    const resposta = JSON.parse(execFileSync('curl', ['-fsSL','--max-time','20',u.href], { encoding:'utf8' }));
    const fechamento = resposta.value.find(v => v.tipoBoletim === 'Fechamento PTAX');
    if (!fechamento || !fechamento.dataHoraCotacao.startsWith(data) || !(fechamento.cotacaoCompra > 0)) {
      throw new Error(`Sem fechamento confirmado: ${moeda}`);
    }
    cambio[moeda] = { rate: fechamento.cotacaoCompra, saleRate: fechamento.cotacaoVenda, date: data, source: u.href };
  }
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('begin');
    // Evita precificar um catálogo que esteja mudando durante esta operação.
    if (aplicar) await db.query('lock table products, product_variants, variant_prices, intl_shipping_quotes in share row exclusive mode');
    const { rows: variantes } = await db.query("select v.id,v.price_cents,p.name from product_variants v join products p on p.id=v.product_id where v.is_active and p.status='active' order by v.id");
    const { rows: antigos } = await db.query('select variant_id,currency,price_cents from variant_prices');
    if (!variantes.length) throw new Error('Catálogo vazio');
    const plano = [];
    for (const v of variantes) for (const currency of moedas) {
      const anterior = antigos.find(p => p.variant_id === v.id && p.currency === currency)?.price_cents ?? 0;
      const price = precoProtegido(v.price_cents, cambio[currency].rate, anterior);
      const basis = { base_brl_cents: v.price_cents, ...cambio[currency], rate_side: 'compra', fee_percent: 5.99, fee_fixed_brl_cents: 39, fee_source:'https://stripe.com/br/pricing', rounding:'whole-unit-ceiling', previous_price_cents:anterior, note:'Referência de precificação; câmbio e tarifa efetivos da liquidação podem variar.' };
      plano.push({produto:v.name,brl:v.price_cents,currency,anterior,novo:price});
      if (aplicar) await db.query('insert into variant_prices (variant_id,currency,price_cents,is_active,pricing_basis) values ($1,$2,$3,true,$4) on conflict (variant_id,currency) do update set price_cents=excluded.price_cents,is_active=true,compare_at_price_cents=null,pricing_basis=excluded.pricing_basis,updated_at=now()', [v.id,currency,price,basis]);
    }
    // Reexpressa custos DHL já documentados. Não cria nem renova uma cotação.
    const custos = {US:32657,PT:42007,GB:42007,AU:44339,CA:36095};
    const {rows: quotes} = await db.query("select distinct on (country,currency) id,country,currency,price_cents,quoted_at,valid_until from intl_shipping_quotes where is_active and carrier='DHL' and valid_until >= current_date and quoted_at <= current_date order by country,currency,quoted_at desc,created_at desc");
    const fretes = [];
    for (const q of quotes) {
      if (!custos[q.country] || !cambio[q.currency]) continue;
      const date = new Date(q.quoted_at).toISOString().slice(0,10);
      if (date !== (q.country === 'US' ? '2026-08-29' : '2026-09-02')) throw new Error('Cotação DHL mudou; confira o custo original');
      const price = precoProtegido(custos[q.country],cambio[q.currency].rate,q.price_cents,0);
      fretes.push({pais:q.country,moeda:q.currency,anterior:q.price_cents,novo:price,validade:q.valid_until});
      if (aplicar && price !== q.price_cents) await db.query("insert into intl_shipping_quotes (country,carrier,service_name,currency,price_cents,max_weight_g,eta_days_min,eta_days_max,quoted_at,valid_until,is_active,notes) select country,carrier,service_name,currency,$1,max_weight_g,eta_days_min,eta_days_max,quoted_at,valid_until,true,coalesce(notes,'') || $2 from intl_shipping_quotes where id=$3", [price,` | Nova versão comercial ${data}: custo BRL ${custos[q.country]/100}, PTAX compra ${cambio[q.currency].rate}, tarifa percentual 5,99%, arredondado para cima; datas DHL e versão anterior preservadas.`,q.id]);
    }
    if (aplicar) await db.query('commit'); else await db.query('rollback');
    console.log(JSON.stringify({aplicado:aplicar,variantes:variantes.length,precos:plano.length,cambio,plano:[...new Map(plano.map(p=>[p.produto+p.currency,p])).values()],fretes},null,2));
  } catch(e) { await db.query('rollback'); throw e; }
  finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executar().catch(() => { console.error('Precificação interrompida; nenhuma credencial é exibida. Confira conexão, data e estrutura do banco.'); process.exitCode=1; });
}
