import type { ReactNode } from "react";
import { PaginaLegal } from "./PaginaLegal";
import { EMPRESA, PRAZO_DESISTENCIA_DIAS as DIAS } from "@/lib/legal/empresa";
import type { SiteLocale } from "@/lib/i18n/site";

/**
 * Devolução (direito de desistência) e Aviso legal / Impressum — 07/10/2026.
 *
 * Nasceram com a primeira venda para a Alemanha: a UE exige informar o
 * direito de desistir em 14 dias (Diretiva 2011/83/UE, com formulário-modelo)
 * e identificar o vendedor; a Alemanha exige o Impressum numa página própria.
 * O prazo de 14 dias vale para todos os países — no Brasil é mais que os 7
 * dias do CDC. Decisões do Francisco ainda abertas (padrão legal aplicado):
 * frete de volta por conta do cliente; reembolso em até 14 dias.
 */

export type PaginaUE = "devolucao" | "aviso-legal";
type Copia = { titulo: string; atualizado: string; intro?: string; secoes: Array<{ titulo: string; corpo: ReactNode }> };

const EMAIL = <a className="underline hover:text-ink" href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>;
const ZAP = <a className="underline hover:text-ink" href={EMPRESA.whatsappLink}>{EMPRESA.whatsapp}</a>;
const E = EMPRESA.endereco;
const ENDERECO_PT = `${E.linha1}, ${E.bairro}, ${E.cidade}/${E.estado}, CEP ${E.cep}, ${E.pais}`;
const ENDERECO_INT = `${E.linha1}, ${E.bairro}, ${E.cidade} – ${E.estado}, ${E.cep}, ${E.paisEn}`;

function Bloco({ linhas }: { linhas: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="font-medium text-ink">{rotulo}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Formulario({ titulo, linhas }: { titulo: string; linhas: string[] }) {
  return (
    <div className="rounded-md border border-sand p-4 text-sm">
      <p className="font-medium text-ink">{titulo}</p>
      <div className="mt-2 space-y-2">
        {linhas.map((l) => <p key={l}>{l}</p>)}
      </div>
    </div>
  );
}

/** Bloco "quem é o controlador" para as políticas de privacidade. */
export function controlador(locale: SiteLocale): { titulo: string; corpo: ReactNode } {
  const r = {
    pt: ["Responsável pelo tratamento (controlador)", "Razão social", "Endereço", "E-mail", "WhatsApp"],
    en: ["Data controller", "Company", "Address", "Email", "WhatsApp"],
    es: ["Responsable del tratamiento", "Razón social", "Dirección", "Correo electrónico", "WhatsApp"],
    fr: ["Responsable du traitement", "Raison sociale", "Adresse", "E-mail", "WhatsApp"],
    de: ["Verantwortlicher", "Firma", "Anschrift", "E-Mail", "WhatsApp"],
  }[locale];
  return {
    titulo: r[0]!,
    corpo: (
      <Bloco linhas={[
        [r[1]!, `${EMPRESA.razaoSocial} (CNPJ ${EMPRESA.cnpj})`],
        [r[2]!, locale === "pt" ? ENDERECO_PT : ENDERECO_INT],
        [r[3]!, EMAIL],
        [r[4]!, ZAP],
      ]} />
    ),
  };
}

const COPIA: Record<SiteLocale, Record<PaginaUE, Copia>> = {
  pt: {
    devolucao: {
      titulo: "Devolução e direito de desistência",
      atualizado: "7 de outubro de 2026",
      intro: `Você pode desistir da compra em até ${DIAS} dias, sem precisar explicar o motivo. O prazo vale para compras no Brasil e no exterior — no Brasil, é mais que os 7 dias previstos no Código de Defesa do Consumidor.`,
      secoes: [
        { titulo: "Compras entregues no Brasil", corpo: <p>Nos primeiros 7 dias depois do recebimento (art. 49 do Código de Defesa do Consumidor), a desistência não tem exceções nem custo: o frete de volta é por nossa conta e o reembolso é imediato. Do 8º ao 14º dia valem as condições abaixo.</p> },
        { titulo: "Prazo", corpo: <p>O prazo de {DIAS} dias começa no dia em que você (ou alguém indicado por você, que não seja a transportadora) recebe o produto — ou, se o pedido chegar em mais de uma entrega, a última delas. Basta nos avisar antes de o prazo terminar.</p> },
        { titulo: "Como desistir", corpo: <><p>Envie uma mensagem clara com o número do pedido para {EMAIL} ou pelo WhatsApp {ZAP}. Você pode usar o modelo abaixo, mas não é obrigatório.</p><Formulario titulo="Modelo de formulário de desistência" linhas={[`Para: ${EMPRESA.razaoSocial}, ${ENDERECO_PT}, ${EMPRESA.email}`, "Comunico que desisto da compra do(s) seguinte(s) produto(s):", "Pedido nº / data do pedido / data do recebimento:", "Nome e endereço:", "Data e assinatura (se em papel):"]} /></> },
        { titulo: "Devolução do produto", corpo: <p>Fora dos 7 primeiros dias garantidos às compras entregues no Brasil: depois de avisar, envie o produto em até {DIAS} dias para {EMPRESA.razaoSocial}, {ENDERECO_PT}. O custo do envio de volta fica por sua conta. Se o produto tiver sido usado além do necessário para conferi-lo — por exemplo, colado, cortado ou aplicado —, podemos descontar do reembolso a perda de valor. Em compras internacionais, marque o pacote como "devolução de mercadoria" para evitar cobrança de imposto de importação no Brasil.</p> },
        { titulo: "Reembolso", corpo: <p>Devolvemos o valor pago, incluindo o frete de ida no serviço padrão, em até {DIAS} dias a partir do seu aviso, pelo mesmo meio de pagamento, sem custo para você. Podemos aguardar o produto chegar, ou o comprovante de envio — o que acontecer primeiro —, antes de reembolsar. Impostos de importação pagos à alfândega do seu país não são pagos a nós; a restituição deles é pedida à alfândega ou à transportadora.</p> },
        { titulo: "Exceção por higiene", corpo: <p>Fora dos 7 primeiros dias garantidos às compras entregues no Brasil, itens entregues lacrados por motivo de higiene (como cola e removedor) não podem ser devolvidos se o lacre tiver sido rompido depois da entrega.</p> },
        { titulo: "Defeito de fabricação", corpo: <p>Desistir é diferente de garantia. Se o produto tiver defeito, veja a <a className="underline hover:text-ink" href="/garantia">página de garantia</a>; seus direitos legais continuam valendo.</p> },
      ],
    },
    "aviso-legal": {
      titulo: "Aviso legal",
      atualizado: "7 de outubro de 2026",
      secoes: [
        { titulo: "Identificação da empresa", corpo: <Bloco linhas={[["Razão social", EMPRESA.razaoSocial], ["Nome comercial", EMPRESA.nomeFantasia], ["CNPJ", EMPRESA.cnpj], ["Natureza jurídica", EMPRESA.naturezaJuridica], ["Endereço", ENDERECO_PT], ["Sócio-administrador", EMPRESA.representanteLegal], ["E-mail", EMAIL], ["WhatsApp", ZAP]]} /> },
        { titulo: "Conteúdo", corpo: <p>Textos, fotos, marca e demais elementos deste site pertencem à Reverá ou são usados com autorização.</p> },
      ],
    },
  },
  en: {
    devolucao: {
      titulo: "Returns and right of withdrawal",
      atualizado: "October 7, 2026",
      intro: `You may withdraw from your purchase within ${DIAS} days without giving any reason.`,
      secoes: [
        { titulo: "Withdrawal period", corpo: <p>The {DIAS}-day period starts on the day you, or a third party you name other than the carrier, take physical possession of the goods or, if your order is delivered in several parcels, of the last one. Notifying us before the period ends is enough.</p> },
        { titulo: "How to withdraw", corpo: <><p>Send us a clear statement with your order number to {EMAIL} or via WhatsApp {ZAP}. You may use the model form below, but it is not required.</p><Formulario titulo="Model withdrawal form" linhas={[`To: ${EMPRESA.razaoSocial}, ${ENDERECO_INT}, ${EMPRESA.email}`, "I hereby give notice that I withdraw from my contract of sale of the following goods:", "Order number / ordered on / received on:", "Name and address of consumer:", "Signature (only if on paper) and date:"]} /></> },
        { titulo: "Returning the goods", corpo: <p>Send the goods back without undue delay and no later than {DIAS} days after notifying us, to {EMPRESA.razaoSocial}, {ENDERECO_INT}. You bear the direct cost of returning the goods. You are only liable for any diminished value resulting from handling beyond what is necessary to establish their nature, characteristics and functioning — for example if the hair system was glued, cut or applied. Mark the parcel as "returned goods" so that no Brazilian import tax is charged.</p> },
        { titulo: "Refund", corpo: <p>We will refund all payments received, including standard outbound delivery costs, within {DIAS} days of receiving your notice, using the same means of payment, at no cost to you. We may withhold the refund until we have received the goods back or you have supplied proof of having sent them, whichever is the earliest. Import duties and taxes you paid to your customs authority are not payments to us; you may reclaim them from customs or the carrier.</p> },
        { titulo: "Hygiene exception", corpo: <p>The right of withdrawal does not apply to sealed goods that are not suitable for return for health or hygiene reasons (such as adhesive and remover) if they were unsealed after delivery.</p> },
        { titulo: "Defects", corpo: <p>Withdrawal is separate from the legal guarantee. If a product is defective, see our <a className="underline hover:text-ink" href="/en/garantia">warranty page</a>; your statutory rights are not affected.</p> },
      ],
    },
    "aviso-legal": {
      titulo: "Legal notice",
      atualizado: "October 7, 2026",
      secoes: [
        { titulo: "Company information", corpo: <Bloco linhas={[["Company", EMPRESA.razaoSocial], ["Legal form", "Brazilian limited liability company (Sociedade Empresária Limitada)"], ["Trading name", EMPRESA.nomeFantasia], ["Brazilian company number (CNPJ)", EMPRESA.cnpj], ["Address", ENDERECO_INT], ["Represented by (managing partner)", EMPRESA.representanteLegal], ["Email", EMAIL], ["WhatsApp", ZAP]]} /> },
        { titulo: "Content", corpo: <p>Texts, photographs, trademarks and other website elements belong to Revera or are used with permission.</p> },
      ],
    },
  },
  es: {
    devolucao: {
      titulo: "Devoluciones y derecho de desistimiento",
      atualizado: "7 de octubre de 2026",
      intro: `Puedes desistir de tu compra en un plazo de ${DIAS} días sin indicar el motivo.`,
      secoes: [
        { titulo: "Plazo", corpo: <p>El plazo de {DIAS} días empieza el día en que tú, o un tercero indicado por ti distinto del transportista, recibes los bienes o, si el pedido llega en varias entregas, el último de ellos. Basta con avisarnos antes de que termine.</p> },
        { titulo: "Cómo desistir", corpo: <><p>Envíanos una declaración clara con tu número de pedido a {EMAIL} o por WhatsApp {ZAP}. Puedes usar el modelo siguiente, aunque no es obligatorio.</p><Formulario titulo="Modelo de formulario de desistimiento" linhas={[`A la atención de: ${EMPRESA.razaoSocial}, ${ENDERECO_INT}, ${EMPRESA.email}`, "Por la presente le comunico que desisto de mi contrato de venta del siguiente bien:", "Número de pedido / pedido el / recibido el:", "Nombre y dirección del consumidor:", "Firma (solo en papel) y fecha:"]} /></> },
        { titulo: "Devolución de los bienes", corpo: <p>Devuelve los bienes sin demora indebida y como máximo {DIAS} días después de avisarnos, a {EMPRESA.razaoSocial}, {ENDERECO_INT}. El coste directo de la devolución corre de tu cuenta. Solo respondes de la disminución de valor por una manipulación distinta de la necesaria para comprobar su naturaleza y funcionamiento, por ejemplo si la prótesis se pegó, cortó o aplicó. Marca el paquete como "devolución de mercancía" para que no se cobre impuesto de importación en Brasil.</p> },
        { titulo: "Reembolso", corpo: <p>Te reembolsaremos todos los pagos recibidos, incluidos los gastos de envío estándar, en un plazo de {DIAS} días desde tu aviso, por el mismo medio de pago y sin coste. Podemos retener el reembolso hasta recibir los bienes o la prueba de su envío, según qué condición se cumpla primero. Los aranceles e impuestos pagados a la aduana de tu país no son pagos a nosotros; su devolución se solicita a la aduana o al transportista.</p> },
        { titulo: "Excepción por higiene", corpo: <p>El derecho de desistimiento no se aplica a bienes precintados que no sean aptos para ser devueltos por razones de protección de la salud o de higiene (como adhesivo y removedor) y que hayan sido desprecintados tras la entrega.</p> },
        { titulo: "Defectos", corpo: <p>El desistimiento es distinto de la garantía legal. Si un producto tiene un defecto, consulta nuestra <a className="underline hover:text-ink" href="/es/garantia">página de garantía</a>; tus derechos legales no se ven afectados.</p> },
      ],
    },
    "aviso-legal": {
      titulo: "Aviso legal",
      atualizado: "7 de octubre de 2026",
      secoes: [
        { titulo: "Datos de la empresa", corpo: <Bloco linhas={[["Razón social", EMPRESA.razaoSocial], ["Forma jurídica", "Sociedad limitada brasileña (Sociedade Empresária Limitada)"], ["Nombre comercial", EMPRESA.nomeFantasia], ["Número fiscal brasileño (CNPJ)", EMPRESA.cnpj], ["Dirección", ENDERECO_INT], ["Representante legal (socio administrador)", EMPRESA.representanteLegal], ["Correo electrónico", EMAIL], ["WhatsApp", ZAP]]} /> },
        { titulo: "Contenido", corpo: <p>Los textos, fotos, marcas y demás elementos del sitio pertenecen a Reverá o se utilizan con autorización.</p> },
      ],
    },
  },
  fr: {
    devolucao: {
      titulo: "Retours et droit de rétractation",
      atualizado: "7 octobre 2026",
      intro: `Vous pouvez vous rétracter de votre achat dans un délai de ${DIAS} jours sans avoir à justifier de motif.`,
      secoes: [
        { titulo: "Délai", corpo: <p>Le délai de {DIAS} jours court à compter du jour où vous, ou un tiers désigné par vous autre que le transporteur, prenez physiquement possession des biens ou, en cas de livraison en plusieurs colis, du dernier. Il suffit de nous informer avant son expiration.</p> },
        { titulo: "Comment se rétracter", corpo: <><p>Envoyez-nous une déclaration claire avec votre numéro de commande à {EMAIL} ou par WhatsApp {ZAP}. Vous pouvez utiliser le modèle ci-dessous, mais ce n’est pas obligatoire.</p><Formulario titulo="Modèle de formulaire de rétractation" linhas={[`À l’attention de : ${EMPRESA.razaoSocial}, ${ENDERECO_INT}, ${EMPRESA.email}`, "Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :", "Numéro de commande / commandé le / reçu le :", "Nom et adresse du consommateur :", "Signature (uniquement sur papier) et date :"]} /></> },
        { titulo: "Renvoi des biens", corpo: <p>Renvoyez les biens sans retard excessif et au plus tard {DIAS} jours après nous avoir informés, à {EMPRESA.razaoSocial}, {ENDERECO_INT}. Les frais directs de renvoi sont à votre charge. Votre responsabilité n’est engagée qu’à l’égard de la dépréciation résultant de manipulations autres que celles nécessaires pour établir la nature et le fonctionnement des biens, par exemple si le système capillaire a été collé, coupé ou posé. Indiquez « marchandise retournée » sur le colis afin qu’aucune taxe d’importation ne soit perçue au Brésil.</p> },
        { titulo: "Remboursement", corpo: <p>Nous vous rembourserons tous les paiements reçus, y compris les frais de livraison standard, dans un délai de {DIAS} jours à compter de votre notification, par le même moyen de paiement et sans frais. Nous pouvons différer le remboursement jusqu’à réception des biens ou de la preuve de leur expédition, la date retenue étant celle du premier de ces faits. Les droits et taxes payés à la douane de votre pays ne nous sont pas versés ; leur remboursement se demande à la douane ou au transporteur.</p> },
        { titulo: "Exception d’hygiène", corpo: <p>Le droit de rétractation ne s’applique pas aux biens scellés qui ne peuvent être renvoyés pour des raisons d’hygiène ou de protection de la santé (comme la colle et le dissolvant) et qui ont été descellés après la livraison.</p> },
        { titulo: "Défauts", corpo: <p>La rétractation est distincte de la garantie légale. Si un produit est défectueux, consultez notre <a className="underline hover:text-ink" href="/fr/garantia">page garantie</a> ; vos droits légaux ne sont pas affectés.</p> },
      ],
    },
    "aviso-legal": {
      titulo: "Mentions légales",
      atualizado: "7 octobre 2026",
      secoes: [
        { titulo: "Éditeur du site", corpo: <Bloco linhas={[["Raison sociale", EMPRESA.razaoSocial], ["Forme juridique", "Société à responsabilité limitée de droit brésilien (Sociedade Empresária Limitada)"], ["Nom commercial", EMPRESA.nomeFantasia], ["Numéro d’entreprise brésilien (CNPJ)", EMPRESA.cnpj], ["Adresse", ENDERECO_INT], ["Représentant légal (associé gérant)", EMPRESA.representanteLegal], ["E-mail", EMAIL], ["WhatsApp", ZAP]]} /> },
        { titulo: "Contenu", corpo: <p>Les textes, photos, marques et autres éléments du site appartiennent à Reverá ou sont utilisés avec autorisation.</p> },
      ],
    },
  },
  de: {
    devolucao: {
      titulo: "Widerrufsbelehrung",
      atualizado: "7. Oktober 2026",
      secoes: [
        { titulo: "Widerrufsrecht", corpo: <>
          <p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.</p>
          <p>Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat. Werden die Waren einer Bestellung getrennt geliefert, beträgt die Frist vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die letzte Ware in Besitz genommen haben bzw. hat.</p>
          <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns ({EMPRESA.razaoSocial}, {ENDERECO_INT}, Telefon/WhatsApp {ZAP}, E-Mail {EMAIL}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.</p>
          <p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.</p>
        </> },
        { titulo: "Folgen des Widerrufs", corpo: <>
          <p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet. Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je nachdem, welches der frühere Zeitpunkt ist.</p>
          <p>Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns ({EMPRESA.razaoSocial}, {ENDERECO_INT}) zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden.</p>
          <p>Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.</p>
          <p>Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.</p>
          <p>– Ende der Widerrufsbelehrung –</p>
        </> },
        { titulo: "Ausschluss des Widerrufsrechts", corpo: <p>Das Widerrufsrecht erlischt vorzeitig bei der Lieferung versiegelter Waren, die aus Gründen des Gesundheitsschutzes oder der Hygiene nicht zur Rückgabe geeignet sind, wenn ihre Versiegelung nach der Lieferung entfernt wurde (etwa versiegelter Kleber und Entferner).</p> },
        { titulo: "Muster-Widerrufsformular", corpo: <Formulario titulo="(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)" linhas={[`An ${EMPRESA.razaoSocial}, ${ENDERECO_INT}, E-Mail: ${EMPRESA.email}:`, "Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*):", "Bestellt am (*) / erhalten am (*):", "Name des/der Verbraucher(s):", "Anschrift des/der Verbraucher(s):", "Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):", "Datum:", "(*) Unzutreffendes streichen."]} /> },
        { titulo: "Hinweise zur Rücksendung ins Ausland", corpo: <p>Bitte kennzeichnen Sie das Paket als „Rücksendung“ (returned goods), damit in Brasilien keine Einfuhrabgaben anfallen. Einfuhrabgaben und Steuern, die Sie bei Erhalt an den Zoll Ihres Landes gezahlt haben, sind keine Zahlungen an uns; ihre Erstattung beantragen Sie beim Zoll oder beim Zusteller.</p> },
        { titulo: "Mängel", corpo: <p>Der Widerruf ist von der gesetzlichen Gewährleistung getrennt. Bei einem Mangel lesen Sie bitte unsere <a className="underline hover:text-ink" href="/de/garantia">Garantieseite</a>; Ihre gesetzlichen Rechte bleiben unberührt.</p> },
      ],
    },
    "aviso-legal": {
      titulo: "Impressum",
      atualizado: "7. Oktober 2026",
      secoes: [
        { titulo: "Angaben zum Anbieter", corpo: <Bloco linhas={[["Firma", EMPRESA.razaoSocial], ["Rechtsform", "Gesellschaft mit beschränkter Haftung nach brasilianischem Recht (Sociedade Empresária Limitada)"], ["Handelsname", EMPRESA.nomeFantasia], ["Brasilianische Unternehmensnummer (CNPJ)", EMPRESA.cnpj], ["Anschrift", ENDERECO_INT], ["Vertreten durch den geschäftsführenden Gesellschafter", EMPRESA.representanteLegal], ["Telefon/WhatsApp", ZAP], ["E-Mail", EMAIL]]} /> },
        { titulo: "Verbraucherstreitbeilegung", corpo: <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p> },
        { titulo: "Inhalte", corpo: <p>Texte, Fotos, Marken und sonstige Inhalte dieser Website gehören Reverá oder werden mit Genehmigung verwendet.</p> },
      ],
    },
  },
};

export function PaginaLegalUE({ locale, pagina }: { locale: SiteLocale; pagina: PaginaUE }) {
  const c = COPIA[locale][pagina];
  return (
    <PaginaLegal titulo={c.titulo} atualizadoEm={c.atualizado} locale={locale}>
      {c.intro ? <p>{c.intro}</p> : null}
      {c.secoes.map((s) => (
        <section key={s.titulo}>
          <h2 className="font-display text-2xl text-ink">{s.titulo}</h2>
          <div className="mt-3 space-y-3">{s.corpo}</div>
        </section>
      ))}
    </PaginaLegal>
  );
}
