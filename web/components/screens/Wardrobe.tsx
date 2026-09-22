"use client";

import { useState } from "react";
import { Body, Button, Eyebrow, Footer, Note, Screen, Title } from "@/components/ui";
import { PRODUCTS } from "@/lib/catalog";
import type { Product } from "@/lib/engine/types";

export function Wardrobe({
  onAnchor, onBack,
}: { onAnchor: (p: Product, size: string) => void; onBack: () => void }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [size, setSize] = useState<string | null>(null);

  return (
    <Screen>
      <Body>
        <button type="button" onClick={onBack}
                className="pt-6 text-[12.5px] text-mute hover:text-ink">
          ← Back
        </button>

        <Eyebrow>No camera needed</Eyebrow>
        <Title>Which pair that you own fits you best?</Title>
        <p className="pt-3.5 text-[14px] leading-[1.5] text-mute">
          Nobody knows their waist in centimetres. Everybody knows which jeans
          they reach for first.
        </p>

        <p className="eyebrow pt-8 pb-2.5">The pair</p>
        <div className="space-y-2">
          {PRODUCTS.map((p) => (
            <button key={p.id} type="button"
                    onClick={() => { setProduct(p); setSize(null); }}
                    className={`flex w-full items-baseline justify-between rounded-xl
                      border px-4 py-3 text-left transition
                      ${product?.id === p.id
                        ? "border-navy bg-white" : "border-line-soft bg-white hover:border-line"}`}>
              <span className="text-[13.5px] font-medium">{p.name}</span>
              <span className="text-[11.5px] text-mute">{p.brand.replace(" Denim", "")}</span>
            </button>
          ))}
        </div>

        {product && (
          <>
            <p className="eyebrow pt-7 pb-2.5">The size on the label</p>
            <div className="flex flex-wrap gap-2 pb-2">
              {product.chart.rows.map((r) => (
                <button key={r.label} type="button" onClick={() => setSize(r.label)}
                        className={`figure rounded-lg px-3 py-2 text-[12.5px] transition
                          ${size === r.label
                            ? "bg-navy text-white" : "bg-paper text-mute hover:text-ink"}`}>
                  {r.label.split(" ")[0]}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="pt-6 pb-2">
          <Note>
            This is weaker than a scan — it gives a range, not a body. We will
            say so on every recommendation that comes from it.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button disabled={!product || !size}
                onClick={() => product && size && onAnchor(product, size)}>
          Use this instead
        </Button>
      </Footer>
    </Screen>
  );
}
