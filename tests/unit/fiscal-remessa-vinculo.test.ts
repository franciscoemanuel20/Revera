import {describe,it,expect} from "vitest";
import {remessaDhlEmAvaliacao,escolherModoInvoicePedido,guiaDhlValida} from "@/lib/internacional/processo-exportacao";
describe("invoice fixada na remessa avaliada",()=>{
 const failed={id:"old",provider:"dhl",status:"error",tracking_code:null,mode:"external"};
 const final={id:"new",provider:"dhl",status:"label_created",tracking_code:"1234567890",mode:"api"};
 it("ignora tentativa antiga falhada e mantém invoice api após mudança global",()=>{
  const r=remessaDhlEmAvaliacao([failed,final]);expect(r?.id).toBe("new");
  expect(escolherModoInvoicePedido(true,r!.mode,undefined,"external")).toBe("api");
  expect(guiaDhlValida([failed,final])).toBe("1234567890");
 });
 it("duas remessas finalizadas exigem reconciliação",()=>{
  expect(remessaDhlEmAvaliacao([final,{...final,id:"another"}])).toBeNull();
  expect(guiaDhlValida([final,{...final,id:"another"}])).toBeNull();
 });
});
