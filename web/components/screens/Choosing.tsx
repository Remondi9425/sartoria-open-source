"use client";

import { useMemo, useState } from "react";
import { Jeans } from "@/components/art/Jeans";
import { Body, Eyebrow, Note, Screen, Title, euro } from "@/components/ui";
import { PRODUCTS, BRANDS } from "@/lib/catalog";
import { EMPTY_TASTE, rankByTaste, type Taste } from "@/lib/preferences";
import { calculator } from "@/lib/engine";
import type { DigitalTwin, Product } from "@/lib/engine/types";

type Filter = "yours" | "slim" | "straight";

export function Choosing({
  twin, onPick, taste = EMPTY_TASTE,
}: { twin: DigitalTwin; onPick: (p: Product) => void; taste?: Taste }) {
  const [filter, setFilter] = useState<Filter>("yours");

  // The size is computed per product, because "W31" is not the same number
  // in two different brands — which is the whole point of the product.
  //
  // Taste only ever reorders. It cannot promote a pair that does not fit or
  // hide one that does: the filter below still decides what is shown, and the
  // size still decides what fits.
  const rows = useMemo(
    () => rankByTaste(PRODUCTS, taste)
      .map((p) => ({ p, fit: calculator.recommend(twin, p) })),
    [twin, taste]);

  const shown = rows.filter(({ p, fit }) =>
    filter === "yours" ? fit.size !== null
    : filter === "slim" ? p.fit === "slim" || p.fit === "tapered"
    : p.fit === "straight" || p.fit === "relaxed");

  return (
    <Screen>
      <Body>
        <Eyebrow>{shown.length} pairs · {BRANDS.length} brands</Eyebrow>
        <Title>Jeans that fit you.</Title>

        <div className="flex gap-2 pt-5">
          {([["yours", "Your size only"], ["slim", "Slim"], ["straight", "Straight"]] as const)
            .map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)}
                      className={`rounded-full px-4 py-2 text-[12.5px] font-medium transition
                        ${filter === id
                          ? "bg-navy text-white"
                          : "bg-paper text-mute hover:text-ink"}`}>
                {label}
              </button>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-3.5 pt-5 pb-2">
          {shown.map(({ p, fit }) => (
            <button key={p.id} type="button" onClick={() => onPick(p)}
                    className="group text-left">
              <div className="relative overflow-hidden rounded-xl bg-paper p-3">
                <Jeans denim={p.colours[0].denim} fit={p.fit}
                       className="mx-auto h-32 transition group-hover:scale-[1.04]" />
                <span className="figure absolute left-2.5 top-2.5 rounded-md bg-navy
                                 px-2 py-1 text-[10.5px] font-semibold text-white">
                  {fit.size?.split(" ")[0] ?? "?"}
                </span>
              </div>
              <p className="pt-2.5 text-[13.5px] font-semibold leading-tight">{p.name}</p>
              <p className="pt-0.5 text-[11.5px] text-mute">
                {p.brand.replace(" Denim", "")} · {euro(p.price_eur)}
              </p>
            </button>
          ))}
        </div>

        <div className="pb-4 text-center">
          <Note>
            The badge is your size <em>in that brand</em> — not the same number
            everywhere.
          </Note>
        </div>
      </Body>
    </Screen>
  );
}
