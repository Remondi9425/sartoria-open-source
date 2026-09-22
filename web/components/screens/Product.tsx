"use client";

import { useState } from "react";
import { Jeans } from "@/components/art/Jeans";
import { Body, Button, Footer, Screen, euro } from "@/components/ui";
import { calculator } from "@/lib/engine";
import type { AreaNote, DigitalTwin, Product as P } from "@/lib/engine/types";

const CHIP: Record<AreaNote["verdict"], string> = {
  good: "bg-white/12 text-white/80",
  snug: "bg-amber/20 text-amber",
  roomy: "bg-white/12 text-white/80",
};

function chipLabel(a: AreaNote) {
  if (a.detail) return `${a.area} ${a.detail}`;
  return a.verdict === "good" ? `${a.area} ✓` : `${a.area} ${a.verdict}`;
}

export function Product({
  product, twin, onBuy, onBack,
}: { product: P; twin: DigitalTwin; onBuy: (colourId: string) => void; onBack: () => void }) {
  const [colour, setColour] = useState(product.colours[0]);
  const [why, setWhy] = useState(false);
  const fit = calculator.recommend(twin, product);

  return (
    <Screen>
      <Body>
        <button type="button" onClick={onBack}
                className="pt-6 text-[12.5px] text-mute hover:text-ink">
          ← All jeans
        </button>

        <div className="relative mt-3 rounded-2xl bg-paper py-7">
          <Jeans denim={colour.denim} fit={product.fit} className="mx-auto h-60" />
          {fit.size && (
            <span className="absolute left-3.5 top-3.5 rounded-lg bg-white px-3 py-1.5
                             text-[11px] font-medium shadow-sm">
              Your size · <span className="figure font-semibold">{fit.size}</span>
            </span>
          )}
        </div>

        <p className="eyebrow pt-5">{product.brand}</p>
        <h1 className="pt-1 text-[21px] font-bold leading-tight">
          {product.name} · {colour.name.toLowerCase()}
        </h1>
        <div className="flex items-baseline justify-between pt-2">
          <p className="figure text-[19px] font-semibold">{euro(product.price_eur)}</p>
          <p className="text-[11.5px] text-mute">{product.composition}</p>
        </div>

        <div className="flex gap-2.5 pt-5">
          {product.colours.map((c) => (
            <button key={c.id} type="button" onClick={() => setColour(c)}
                    aria-label={c.name}
                    className={`h-7 w-7 rounded-full transition
                      ${colour.id === c.id ? "ring-2 ring-navy ring-offset-2" : ""}`}
                    style={{ background: c.hex }} />
          ))}
        </div>

        <div className="mt-5 rounded-2xl bg-navy px-6 py-6 text-white">
          {fit.size ? (
            <>
              <p className="figure text-[42px] font-bold leading-none">{fit.size.split(" ")[0]}</p>
              <p className="pt-2 text-[13px] font-semibold text-amber">{fit.headline}</p>
              <div className="flex flex-wrap gap-1.5 pt-3.5">
                {fit.areas.map((a) => (
                  <span key={a.area}
                        className={`figure rounded-md px-2 py-1 text-[10.5px] ${CHIP[a.verdict]}`}>
                    {chipLabel(a)}
                  </span>
                ))}
              </div>
              {fit.length_confidence === "low" && (
                <p className="pt-3 text-[11.5px] leading-[1.5] text-amber">
                  We could not read your inseam well enough from that video to
                  say whether these need turning up. Try them on before you cut
                  anything.
                </p>
              )}
              {fit.confidence === "medium" && (
                <p className="pt-2 text-[11.5px] leading-[1.5] text-white/60">
                  Your waist came out a little differently across the video, so
                  treat this as the likelier of two sizes rather than a
                  certainty.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[17px] font-bold leading-snug">{fit.headline}</p>
              <p className="pt-2 text-[12.5px] leading-[1.5] text-white/70">
                We would rather say nothing than guess. Closest on their chart is{" "}
                <span className="figure font-semibold text-amber">{fit.alternative}</span>.
              </p>
            </>
          )}

          {why && (
            <div className="mt-4 space-y-1.5 border-t border-white/15 pt-4
                            text-[11.5px] leading-[1.55] text-white/70">
              <p>
                Their chart is a{" "}
                <span className="text-white">
                  {product.chart.kind === "body" ? "body chart" : "garment-flat chart"}
                </span>
                {product.chart.kind === "flat" && ", so the ease is added back before comparing"}.
              </p>
              <p>
                Decided from your{" "}
                <span className="figure text-white">
                  {fit.used.map((u) => `${u} ${twin.measurements_cm[u]}`).join(" · ")}
                </span>.
              </p>
              <p>Confidence: {fit.confidence}. {fit.alternative && `Next size along is ${fit.alternative}.`}</p>
            </div>
          )}
        </div>

        <div className="pb-2" />
      </Body>

      <Footer>
        <Button onClick={() => onBuy(colour.id)} disabled={!fit.size}>
          Add to bag
        </Button>
        <div className="pt-2.5 text-center">
          <button type="button" onClick={() => setWhy((w) => !w)}
                  className="text-[12.5px] text-navy underline underline-offset-4 hover:text-rust">
            {why ? "Hide the reasoning" : "Why this size?"}
          </button>
        </div>
      </Footer>
    </Screen>
  );
}
