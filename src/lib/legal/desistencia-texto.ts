import { EMPRESA, PRAZO_DESISTENCIA_DIAS as DIAS } from "@/lib/legal/empresa";
import type { Idioma } from "@/lib/internacional/idioma";

/**
 * Informação de desistência em TEXTO, para ir no e-mail de confirmação
 * (07/10/2026).
 *
 * A UE exige que o cliente receba essa informação "em suporte durável"
 * depois da compra (Diretiva 2011/83/UE art. 8(7); § 312f BGB) — um link
 * para a página não basta, porque a página pode mudar. O conteúdo é o mesmo
 * de src/components/legal/PaginasLegaisUE.tsx; mudou lá, muda aqui.
 * O alemão é o texto do Muster-Widerrufsbelehrung oficial.
 */

const E = EMPRESA.endereco;
const ENDERECO = `${E.linha1}, ${E.bairro}, ${E.cidade} – ${E.estado}, ${E.cep}, ${E.paisEn}`;
const CONTATO = `${EMPRESA.razaoSocial}, ${ENDERECO}, e-mail ${EMPRESA.email}, WhatsApp ${EMPRESA.whatsapp}`;
const ENDERECO_PT = `${E.linha1}, ${E.bairro}, ${E.cidade}/${E.estado}, CEP ${E.cep}, ${E.pais}`;
const CONTATO_PT = `${EMPRESA.razaoSocial}, ${ENDERECO_PT}, e-mail ${EMPRESA.email}, WhatsApp ${EMPRESA.whatsapp}`;

export function textoDesistencia(idioma: Idioma, entregaNoBrasil: boolean): string {
  switch (idioma) {
    case "pt":
      return [
        "DIREITO DE DESISTÊNCIA",
        `Você pode desistir da compra em até ${DIAS} dias, sem explicar o motivo, contados do recebimento do produto (ou da última entrega, se o pedido chegar em partes).`,
        ...(entregaNoBrasil
          ? ["Compras entregues no Brasil: nos primeiros 7 dias após o recebimento (art. 49 do Código de Defesa do Consumidor), a desistência não tem exceções nem custo — o frete de volta é por nossa conta e o reembolso é imediato. Do 8º ao 14º dia valem as condições abaixo."]
          : []),
        `Como desistir: envie uma mensagem clara com o número do pedido para ${EMPRESA.email} ou pelo WhatsApp ${EMPRESA.whatsapp}.`,
        `Devolução: envie o produto em até ${DIAS} dias após o aviso para ${EMPRESA.razaoSocial}, ${ENDERECO_PT}. O custo do envio de volta é seu. Se o produto tiver sido usado além do necessário para conferi-lo (colado, cortado ou aplicado), podemos descontar a perda de valor.`,
        `Reembolso: devolvemos o valor pago, incluindo o frete de ida no serviço padrão, em até ${DIAS} dias após o seu aviso, pelo mesmo meio de pagamento, sem custo. Podemos aguardar o produto ou o comprovante de envio, o que acontecer primeiro.`,
        "Exceção: itens entregues lacrados por motivo de higiene (como cola e removedor) não podem ser devolvidos se o lacre tiver sido rompido após a entrega.",
        ...(entregaNoBrasil
          ? []
          : ["Impostos de importação pagos à alfândega do seu país não são pagos a nós. Marque o pacote de volta como \"devolução de mercadoria\"."]),
        "",
        "MODELO DE FORMULÁRIO DE DESISTÊNCIA",
        `Para: ${CONTATO_PT}`,
        "Comunico que desisto da compra do(s) seguinte(s) produto(s):",
        "Pedido nº / data do pedido / data do recebimento:",
        "Nome e endereço:",
        "Data e assinatura (se em papel):",
      ].join("\n");
    case "en":
      return [
        "RIGHT OF WITHDRAWAL",
        `You may withdraw from this contract within ${DIAS} days without giving any reason. The period starts on the day you, or a third party you name other than the carrier, take possession of the goods — or of the last item, if your order is delivered in several parcels.`,
        `To withdraw, send us a clear statement (for example by email) to ${CONTATO}. You may use the model form below, but it is not required. Sending your notice before the period ends is enough.`,
        `Return the goods without undue delay and no later than ${DIAS} days after notifying us, to ${EMPRESA.razaoSocial}, ${ENDERECO}. You bear the direct cost of returning the goods and are only liable for diminished value caused by handling beyond what is necessary to establish their nature, characteristics and functioning.`,
        `We will refund all payments received, including standard delivery costs, without undue delay and no later than ${DIAS} days after receiving your notice, using the same means of payment, at no cost to you. We may withhold the refund until we receive the goods back or you supply proof of having sent them, whichever is the earliest.`,
        "The right of withdrawal does not apply to sealed goods unsuitable for return for health or hygiene reasons (such as adhesive and remover) if unsealed after delivery.",
        "Import duties and taxes paid to your customs authority are not payments to us. Mark the return parcel as \"returned goods\".",
        "",
        "MODEL WITHDRAWAL FORM",
        `To: ${CONTATO}`,
        "I hereby give notice that I withdraw from my contract of sale of the following goods:",
        "Ordered on / received on:",
        "Name and address of consumer:",
        "Signature (only if on paper) and date:",
      ].join("\n");
    case "es":
      return [
        "DERECHO DE DESISTIMIENTO",
        `Puedes desistir de este contrato en un plazo de ${DIAS} días sin indicar el motivo. El plazo empieza el día en que tú, o un tercero indicado por ti distinto del transportista, recibes los bienes — o el último de ellos, si el pedido llega en varias entregas.`,
        `Para desistir, envíanos una declaración clara (por ejemplo, por correo electrónico) a ${CONTATO}. Puedes usar el modelo siguiente, aunque no es obligatorio. Basta con enviar el aviso antes de que termine el plazo.`,
        `Devuelve los bienes sin demora indebida y a más tardar ${DIAS} días después de avisarnos, a ${EMPRESA.razaoSocial}, ${ENDERECO}. El coste directo de la devolución corre de tu cuenta y solo respondes de la disminución de valor por una manipulación distinta de la necesaria para comprobar su naturaleza y funcionamiento.`,
        `Te reembolsaremos todos los pagos recibidos, incluidos los gastos de envío estándar, sin demora indebida y a más tardar ${DIAS} días después de recibir tu aviso, por el mismo medio de pago y sin coste. Podemos retener el reembolso hasta recibir los bienes o la prueba de su envío, según qué condición se cumpla primero.`,
        "El derecho de desistimiento no se aplica a bienes precintados no aptos para devolución por razones de salud o higiene (como adhesivo y removedor) desprecintados tras la entrega.",
        "Los aranceles e impuestos pagados a la aduana de tu país no son pagos a nosotros. Marca el paquete como \"devolución de mercancía\".",
        "",
        "MODELO DE FORMULARIO DE DESISTIMIENTO",
        `A la atención de: ${CONTATO}`,
        "Por la presente le comunico que desisto de mi contrato de venta del siguiente bien:",
        "Pedido el / recibido el:",
        "Nombre y dirección del consumidor:",
        "Firma (solo en papel) y fecha:",
      ].join("\n");
    case "fr":
      return [
        "DROIT DE RÉTRACTATION",
        `Vous avez le droit de vous rétracter du présent contrat sans donner de motif dans un délai de ${DIAS} jours à compter du jour où vous, ou un tiers désigné par vous autre que le transporteur, prenez physiquement possession des biens — ou du dernier, en cas de livraison en plusieurs colis.`,
        `Pour exercer ce droit, adressez-nous une déclaration dénuée d’ambiguïté (par exemple par e-mail) : ${CONTATO}. Vous pouvez utiliser le modèle ci-dessous, mais ce n’est pas obligatoire. Il suffit d’envoyer votre notification avant l’expiration du délai.`,
        `Renvoyez les biens sans retard excessif et au plus tard ${DIAS} jours après nous avoir informés, à ${EMPRESA.razaoSocial}, ${ENDERECO}. Les frais directs de renvoi sont à votre charge ; votre responsabilité n’est engagée qu’à l’égard de la dépréciation résultant de manipulations autres que celles nécessaires pour établir la nature et le fonctionnement des biens.`,
        `Nous vous rembourserons tous les paiements reçus, y compris les frais de livraison standard, sans retard excessif et au plus tard ${DIAS} jours après réception de votre notification, par le même moyen de paiement et sans frais. Nous pouvons différer le remboursement jusqu’à réception des biens ou de la preuve de leur expédition, la date retenue étant celle du premier de ces faits.`,
        "Le droit de rétractation ne s’applique pas aux biens scellés ne pouvant être renvoyés pour des raisons d’hygiène ou de santé (comme la colle et le dissolvant) descellés après la livraison.",
        "Les droits et taxes payés à la douane de votre pays ne nous sont pas versés. Indiquez « marchandise retournée » sur le colis.",
        "",
        "MODÈLE DE FORMULAIRE DE RÉTRACTATION",
        `À l’attention de : ${CONTATO}`,
        "Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :",
        "Commandé le / reçu le :",
        "Nom et adresse du consommateur :",
        "Signature (uniquement sur papier) et date :",
      ].join("\n");
    case "de":
      return [
        "WIDERRUFSBELEHRUNG",
        "",
        "Widerrufsrecht",
        "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.",
        "Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat. Werden die Waren einer Bestellung getrennt geliefert, beträgt die Frist vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die letzte Ware in Besitz genommen haben bzw. hat.",
        `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${EMPRESA.razaoSocial}, ${ENDERECO}, Telefon/WhatsApp ${EMPRESA.whatsapp}, E-Mail ${EMPRESA.email}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.`,
        "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.",
        "",
        "Folgen des Widerrufs",
        "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet. Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je nachdem, welches der frühere Zeitpunkt ist.",
        `Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns (${EMPRESA.razaoSocial}, ${ENDERECO}) zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden.`,
        "Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.",
        "Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.",
        "– Ende der Widerrufsbelehrung –",
        "",
        "Das Widerrufsrecht erlischt vorzeitig bei versiegelten Waren, die aus Gründen des Gesundheitsschutzes oder der Hygiene nicht zur Rückgabe geeignet sind, wenn ihre Versiegelung nach der Lieferung entfernt wurde (etwa versiegelter Kleber und Entferner).",
        "",
        "MUSTER-WIDERRUFSFORMULAR",
        "(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)",
        `An ${EMPRESA.razaoSocial}, ${ENDERECO}, E-Mail: ${EMPRESA.email}:`,
        "Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*):",
        "Bestellt am (*) / erhalten am (*):",
        "Name des/der Verbraucher(s):",
        "Anschrift des/der Verbraucher(s):",
        "Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):",
        "Datum:",
        "(*) Unzutreffendes streichen.",
      ].join("\n");
  }
}
