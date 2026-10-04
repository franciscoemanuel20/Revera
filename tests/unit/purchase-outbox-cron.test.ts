import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({process:vi.fn(),admin:vi.fn()}));
vi.mock('@/lib/tracking/despachar',()=>({processarPurchasePendente:mocks.process}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:mocks.admin}));
import { GET } from '@/app/api/cron/conversoes/route';
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs()});
function req(auth?:string){return new NextRequest('https://example.test/api/cron/conversoes',{headers:auth?{authorization:auth}:{}})}
describe('cron da fila Purchase',()=>{
 it('não lê nem envia sem credencial válida',async()=>{vi.stubEnv('CRON_SECRET','teste');expect((await GET(req())).status).toBe(404);expect(mocks.process).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled()});
 it('processa mais de dois jobs e informa backlog sem expor IDs',async()=>{
  vi.stubEnv('CRON_SECRET','teste');mocks.process.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const eq=vi.fn().mockResolvedValue({count:0,error:null});mocks.admin.mockReturnValue({from:()=>({select:()=>({eq})})});
  const r=await GET(req('Bearer teste'));expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true,processed:3,backlog:{pending:0,processing:0,blocked:0,exhausted:0},hasMore:false});
 });
 it('falha de processamento não é apresentada como fila saudável',async()=>{vi.stubEnv('CRON_SECRET','teste');mocks.admin.mockReturnValue({});mocks.process.mockRejectedValue(new Error('failure'));expect((await GET(req('Bearer teste'))).status).toBe(503)});
});
