import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PaginaLegal } from "@/components/legal/PaginaLegal";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  return (
    <PaginaLegal titulo="Política de Privacidade" atualizadoEm="9 de setembro de 2026">
      <p>
        A Reverá trata os dados necessários para vender, cobrar, entregar e atender quem entra em contato com a loja. Esta página explica, em linguagem direta, como esses dados são usados.
      </p>
      <Secao titulo="Dados que coletamos">
        <p>No checkout, coletamos nome, e-mail, telefone, CPF e endereço de entrega. Também registramos dados técnicos necessários para segurança e atribuição da compra, como endereço IP, navegador, identificadores de sessão e origem de campanha.</p>
        <p>No formulário de ajuda para escolha de cor, coletamos nome, e-mail e/ou WhatsApp e a foto enviada voluntariamente. A foto fica em armazenamento privado e não é exibida publicamente.</p>
      </Secao>
      <Secao titulo="Para que usamos os dados">
        <ul className="list-disc space-y-2 pl-5">
          <li>criar e administrar pedidos, pagamentos, prevenção a fraude e atendimento;</li>
          <li>emitir e entregar a encomenda, inclusive cotar frete e acompanhar o rastreio;</li>
          <li>responder pedidos de ajuda sobre cor e outras solicitações feitas pela pessoa;</li>
          <li>medir a origem das vendas e melhorar campanhas, somente após a autorização de cookies opcionais.</li>
        </ul>
      </Secao>
      <Secao titulo="Com quem os dados podem ser compartilhados">
        <p>Compartilhamos apenas o necessário com prestadores que viabilizam a operação: intermediadores de pagamento, transportadoras e plataformas de frete, hospedagem e banco de dados. Quando você autoriza os cookies opcionais, ferramentas de medição e publicidade, como Meta e Google, podem receber identificadores técnicos e eventos de navegação. Dados enviados a essas ferramentas são minimizados e, quando aplicável, transformados antes do envio.</p>
      </Secao>
      <Secao titulo="Retenção e segurança">
        <p>Os dados são mantidos pelo tempo necessário para cumprir o pedido, prestar suporte, atender obrigações legais e resolver disputas. Os prazos específicos de retenção por categoria estão em revisão jurídica e operacional; esta página será atualizada quando forem definidos. A Reverá aplica controles de acesso e armazenamento privado para dados que não devem ser públicos, mas nenhum sistema conectado à internet elimina todos os riscos.</p>
      </Secao>
      <Secao titulo="Seus direitos e contato">
        <p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, eliminação quando cabível, informação sobre compartilhamentos ou revisão de consentimento. Para isso, fale com a equipe pelo WhatsApp <a className="underline hover:text-ink" href="https://wa.me/5512981409901?text=Olá%2C%20preciso%20de%20ajuda%20sobre%20meus%20dados%20pessoais.">+55 12 98140-9901</a>.</p>
        <p>Identificação do controlador (razão social, CNPJ e endereço): <strong>pendente de confirmação jurídica e cadastral antes da revisão final desta política.</strong></p>
      </Secao>
    </PaginaLegal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <section><h2 className="font-display text-2xl text-ink">{titulo}</h2><div className="mt-3 space-y-3">{children}</div></section>;
}
