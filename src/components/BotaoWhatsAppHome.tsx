import { linkWhatsApp } from "@/lib/config/whatsapp";

/**
 * Botão flutuante de WhatsApp — só na home, de propósito (pedido do
 * Francisco em 08/09/2026: "bem visível e profissional" na página inicial,
 * abrindo direto uma conversa).
 *
 * NÃO entra em produto/checkout: espalhar WhatsApp por ali continua sendo
 * decisão em aberto (ver o comentário em src/lib/config/whatsapp.ts —
 * "o cliente que vai para o WhatsApp sai do carrinho", decisão que o
 * Francisco não tinha tomado). Aqui ele resolveu só para a home, que não é
 * uma tela de conversão em andamento como o produto ou o checkout são.
 *
 * `target="_blank"` abre o WhatsApp numa aba própria — clicar não navega
 * para fora do site, então não interrompe quem ainda está lendo a home.
 */
export function BotaoWhatsAppHome() {
  const href = linkWhatsApp(
    "Olá! Vim pelo site da Reverá e gostaria de saber mais sobre as próteses."
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.87 9.87 0 0 0 12.04 2zm5.8 14.1c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11-.41-.13-.94-.31-1.62-.6-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.08.99-2.37.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.58.81 2 .88 2.15.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.52 1.9 1.05.94 1.93 1.23 2.21 1.37.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.19-.27.37-.22.62-.13.26.09 1.63.77 1.91.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
      </svg>
    </a>
  );
}
