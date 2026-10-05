import { afterEach, describe, expect, it, vi } from 'vitest';
import { processarPurchasePendente } from '@/lib/tracking/despachar';
import { FakeSupabase, UNICOS_REAIS } from '../stubs/fake-supabase';
vi.mock('@/lib/tracking/meta-capi', () => ({ enviarPurchaseMeta: vi.fn() }));
vi.mock('@/lib/tracking/ga4', () => ({ enviarPurchaseGa4: vi.fn() }));
import { enviarPurchaseMeta } from '@/lib/tracking/meta-capi';
import { enviarPurchaseGa4 } from '@/lib/tracking/ga4';
const id='11111111-1111-4111-8111-111111111111';
const job={order_id:id,provider:'infinitepay',event_time:'2026-10-01T10:00:00Z',value_cents:9000,currency:'BRL',lease_token:'lease-test'};
function db(status='paid',consent=true,metaAceita=false){
 const fake=new FakeSupabase({orders:[{id,status,tracking_consent:consent,total_cents:11000,shipping_cents:2000,order_number:'TEST'}],pixel_event_log:[{event_name:'Purchase',event_id:id,sent_capi:metaAceita,sent_ga4:false}],order_items:[{order_id:id,variant_id:'v1',quantity:1,unit_price_cents:9000}]},UNICOS_REAIS);
 const rpc=vi.fn().mockResolvedValueOnce({data:[job],error:null}).mockResolvedValue({data:true,error:null});
 return {from:fake.from.bind(fake),rpc};
}
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs()});
describe('recuperação durável de Purchase',()=>{
 it('não envia se não há job elegível',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:[],error:null});
  expect(await processarPurchasePendente({rpc} as any)).toBe(false);
  expect(enviarPurchaseMeta).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('falha fechado se a fila não pode ser lida',async()=>{
  await expect(processarPurchasePendente({rpc:vi.fn().mockResolvedValue({error:{code:'erro'}})} as any)).rejects.toThrow('claim_failed');
  expect(enviarPurchaseMeta).not.toHaveBeenCalled();
 });
 it('conserva hora, valor e ID da compra na recuperação',async()=>{
  vi.stubEnv('VERCEL_ENV','production');
  vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:true,httpStatus:200,resposta:{events_received:1}});
  vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:true});
  const c=db();expect(await processarPurchasePendente(c as any,id)).toBe(true);
  expect(enviarPurchaseMeta).toHaveBeenCalledWith(expect.objectContaining({eventId:id,eventTimeSegundos:1790848800,valorCents:9000,currency:'BRL'}));
  expect(enviarPurchaseGa4).toHaveBeenCalledWith(expect.objectContaining({eventId:id,eventTimeSegundos:1790848800,currency:'BRL'}));
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_order_id:id,p_lease_token:'lease-test',p_delivered:true}));
 });
 it('preserva ID, hora, valor e USD entre duas tentativas reais do dispatcher',async()=>{
  vi.stubEnv('VERCEL_ENV','production');
  vi.mocked(enviarPurchaseMeta)
    .mockResolvedValueOnce({sucesso:false,httpStatus:503})
    .mockResolvedValueOnce({sucesso:true,httpStatus:200,resposta:{events_received:1}});
  vi.mocked(enviarPurchaseGa4)
    .mockResolvedValueOnce({sucesso:false,httpStatus:503})
    .mockResolvedValueOnce({sucesso:true});
  const c=db();
  const snapshot={...job,currency:'USD',value_cents:19900};
  c.rpc.mockReset()
    .mockResolvedValueOnce({data:[snapshot],error:null})
    .mockResolvedValueOnce({data:true,error:null})
    .mockResolvedValueOnce({data:[{...snapshot,lease_token:'lease-retry'}],error:null})
    .mockResolvedValueOnce({data:true,error:null});

  await processarPurchasePendente(c as any,id);
  await processarPurchasePendente(c as any,id);

  expect(enviarPurchaseMeta).toHaveBeenCalledTimes(2);
  expect(enviarPurchaseGa4).toHaveBeenCalledTimes(2);
  for(const [payload] of vi.mocked(enviarPurchaseMeta).mock.calls){
   expect(payload).toEqual(expect.objectContaining({eventId:id,eventTimeSegundos:1790848800,valorCents:19900,currency:'USD'}));
  }
  for(const [payload] of vi.mocked(enviarPurchaseGa4).mock.calls){
   expect(payload).toEqual(expect.objectContaining({eventId:id,eventTimeSegundos:1790848800,currency:'USD'}));
  }
 });
 it('mantém tentativa pendente quando a Meta não aceitou',async()=>{
  vi.stubEnv('VERCEL_ENV','production');
  vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:false,httpStatus:503});
  vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:true});
  const c=db();await processarPurchasePendente(c as any);
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_delivered:false,p_http_status:503}));
 });
 it.each(['new','canceled'])('não envia pedido %s',async(status)=>{
  vi.stubEnv('VERCEL_ENV','production');const c=db(status);await processarPurchasePendente(c as any);
  expect(enviarPurchaseMeta).not.toHaveBeenCalled();
 });
 it('não envia sem consentimento',async()=>{
  vi.stubEnv('VERCEL_ENV','production');const c=db('paid',false);await processarPurchasePendente(c as any);
  expect(enviarPurchaseMeta).not.toHaveBeenCalled();
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_blocked:true,p_delivered:false}));
 });
 it('bloqueia retry impossível quando GA4 não tem client_id',async()=>{
  vi.stubEnv('VERCEL_ENV','production');
  vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:true,httpStatus:200});
  vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:false,motivoPulado:'pedido sem ga_client_id — cookie ausente'});
  const c=db();await processarPurchasePendente(c as any);
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_blocked:true,p_delivered:false,p_meta_delivered:true,p_ga4_delivered:false}));
 });
 it('bloqueia retry impossível quando passou a janela de 72 horas do GA4',async()=>{
  vi.stubEnv('VERCEL_ENV','production');
  vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:true,httpStatus:200});
  vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:false,motivoPulado:'evento fora da janela de 72 horas do GA4 — não enviado'});
  const c=db();await processarPurchasePendente(c as any);
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_blocked:true,p_delivered:false,p_meta_delivered:true,p_ga4_delivered:false}));
 });
 it('continua tentando Meta após GA4 expirar quando a falha da Meta é transitória',async()=>{
  vi.stubEnv('VERCEL_ENV','production');
  vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:false,httpStatus:503});
  vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:false,motivoPulado:'evento fora da janela de 72 horas do GA4 — não enviado'});
  const c=db();await processarPurchasePendente(c as any);
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_blocked:false,p_delivered:false,p_meta_delivered:false,p_ga4_delivered:false}));
 });
 it('Meta aceita + GA4 falha mantém fila pendente e preserva aceite Meta',async()=>{
  vi.stubEnv('VERCEL_ENV','production');vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:true,httpStatus:200});vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:false,httpStatus:503});
  const c=db();await processarPurchasePendente(c as any);
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_delivered:false,p_meta_delivered:true,p_ga4_delivered:false}));
 });
 it('recupera somente GA4 quando Meta já aceitou',async()=>{
  vi.stubEnv('VERCEL_ENV','production');vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:false,httpStatus:503});
  const c=db('paid',true,true);await processarPurchasePendente(c as any);
  expect(enviarPurchaseMeta).not.toHaveBeenCalled();
  expect(enviarPurchaseGa4).toHaveBeenCalledTimes(1);
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_delivered:false,p_meta_delivered:true,p_ga4_delivered:false}));
 });
 it('falha da finalização não reenvia plataformas com aceite persistido',async()=>{
  vi.stubEnv('VERCEL_ENV','production');vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:true,httpStatus:200});vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:true});
  const c=db();c.rpc.mockReset().mockResolvedValueOnce({data:[job],error:null}).mockResolvedValueOnce({data:null,error:{code:'timeout'}}).mockResolvedValueOnce({data:[job],error:null}).mockResolvedValueOnce({data:true,error:null});
  await expect(processarPurchasePendente(c as any)).rejects.toThrow('finish_failed');
  await processarPurchasePendente(c as any);
  expect(enviarPurchaseMeta).toHaveBeenCalledTimes(1);expect(enviarPurchaseGa4).toHaveBeenCalledTimes(1);
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_delivered:true,p_meta_delivered:true,p_ga4_delivered:true}));
 });
 it('sem prova persistida de aceite não finaliza a fila como entregue',async()=>{
  vi.stubEnv('VERCEL_ENV','production');vi.mocked(enviarPurchaseMeta).mockResolvedValue({sucesso:true,httpStatus:200});vi.mocked(enviarPurchaseGa4).mockResolvedValue({sucesso:true});
  const c=db();const from=c.from;c.from=(table:string)=>{const q=from(table);if(table==='conversion_logs')q.insert=()=>Promise.resolve({error:{code:'timeout'}}) as any;return q;};
  await expect(processarPurchasePendente(c as any)).rejects.toThrow('read_failed');
  expect(c.rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_delivered:false,p_infrastructure_failure:true,p_meta_delivered:false,p_ga4_delivered:false}));
 });
 it('falha de leitura não consome tentativa de entrega',async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:[job],error:null}).mockResolvedValue({data:true,error:null});
  const c={rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:{code:'timeout'}})})})})};
  await expect(processarPurchasePendente(c as any)).rejects.toThrow('read_failed');
  expect(enviarPurchaseMeta).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenLastCalledWith('finish_purchase_outbox',expect.objectContaining({p_infrastructure_failure:true,p_delivered:false}));
 });
 it('não declara sucesso se o lease não pode ser finalizado',async()=>{
  vi.stubEnv('VERCEL_ENV','production');const c=db('new');c.rpc.mockResolvedValueOnce({data:[job],error:null}).mockResolvedValueOnce({data:false,error:null});
  await expect(processarPurchasePendente(c as any)).rejects.toThrow('finish_failed');
 });
});
