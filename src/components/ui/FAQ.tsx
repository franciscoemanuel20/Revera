"use client";
import { useState } from "react";

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface FAQProps {
  items: FAQItem[];
}

// Acordeão simples, um item aberto por vez. Os itens reais vêm de
// seeds/faq.json — repare que vários nascem is_visible=false lá porque a
// resposta ainda é "TODO: aguardando definição"; quem monta a página filtra
// isso antes de passar pra cá, este componente não sabe (nem deveria saber)
// o que é TODO.
export function FAQ({ items }: FAQProps) {
  const [abertoId, setAbertoId] = useState<string | null>(null);

  return (
    <dl className="flex flex-col divide-y divide-sand">
      {items.map((item) => {
        const aberto = item.id === abertoId;
        return (
          <div key={item.id}>
            <dt>
              <button
                type="button"
                aria-expanded={aberto}
                onClick={() => setAbertoId(aberto ? null : item.id)}
                className="flex min-h-toque w-full items-center justify-between py-4 text-left font-display text-ink"
              >
                {item.question}
                <span aria-hidden="true">{aberto ? "−" : "+"}</span>
              </button>
            </dt>
            {aberto ? <dd className="pb-4 text-ink/80">{item.answer}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}
