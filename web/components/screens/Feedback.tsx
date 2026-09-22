"use client";

import { useState } from "react";
import { Body, Eyebrow, Note, Screen, Title } from "@/components/ui";
import type { Product } from "@/lib/engine/types";

type Answer = "tight" | "right" | "loose";

const OPTIONS: { id: Answer; label: string; sub: string; icon: string }[] = [
  { id: "tight", label: "Too tight", sub: "I sent them back or should have", icon: "≈" },
  { id: "right", label: "Just right", sub: "Keeping them", icon: "✓" },
  { id: "loose", label: "Too loose", sub: "Roomier than I wanted", icon: "≋" },
];

export function Feedback({
  product, size, onAnswer,
}: { product: Product; size: string; onAnswer: (a: Answer) => void }) {
  const [picked, setPicked] = useState<Answer | null>(null);

  return (
    <Screen>
      <Body>
        <Eyebrow>
          {product.brand} · {size.split(" ")[0]} · delivered Friday
        </Eyebrow>
        <Title>How did they fit?</Title>
        <p className="pt-3.5 text-[14px] leading-[1.5] text-mute">
          Two taps. It is the only way we learn how this brand really runs.
        </p>

        <div className="space-y-3 pt-7">
          {OPTIONS.map((o) => (
            <button key={o.id} type="button"
                    onClick={() => { setPicked(o.id); onAnswer(o.id); }}
                    className={`flex w-full items-center gap-4 rounded-xl border px-5 py-4
                      text-left transition
                      ${picked === o.id
                        ? "border-navy bg-white"
                        : "border-line-soft bg-white hover:border-line"}`}>
              <span className={`figure w-5 text-center text-[17px]
                                ${picked === o.id ? "text-navy" : "text-rust"}`}>
                {picked === o.id ? "✓" : o.icon}
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{o.label}</span>
                <span className="block pt-0.5 text-[11.5px] text-mute">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>

        {picked && (
          <div className="mt-6 rounded-xl bg-paper px-4 py-3.5">
            <p className="text-[12px] leading-[1.5] text-mute">
              This is where the answer would go against {product.brand}&rsquo;s
              chart. Nothing is saved yet — the loop that learns from it is not
              built. One answer would change nothing on its own; a thousand
              would move the calibration.
            </p>
          </div>
        )}

        <div className="pt-8 pb-4 text-center">
          <Note>
            Your answer only ever changes sizing advice. Never shared with your name.
          </Note>
        </div>
      </Body>
    </Screen>
  );
}
