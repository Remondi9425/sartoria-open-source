/** Eyeball the calculator across the whole catalogue for one body.
 *    npm run fit-table
 *  Different brands must produce different sizes — if this table is uniform,
 *  the product has nothing to say. */
import { PRODUCTS } from "../lib/catalog";
import { sizeCalculator } from "../lib/engine/advisor";
import { referenceTwin } from "../test/fixtures";

const twin = referenceTwin();
for (const p of PRODUCTS) {
  const f = sizeCalculator.recommend(twin, p);
  const areas = f.areas
    .map((a) => `${a.area}${a.detail ? " " + a.detail : a.verdict === "good" ? " ✓" : " " + a.verdict}`)
    .join(", ");
  console.log(
    `${p.brand.padEnd(14)} ${p.name.padEnd(19)} ${(f.size ?? "—").padEnd(9)} ` +
    `${f.headline.padEnd(34)} ${areas}`);
}
