/** Taste reorders the rail and is not allowed to do anything else.
 *
 *  The constraint worth testing is the negative one: a preference must never
 *  change which jeans fit, only which appear first. A recommender that quietly
 *  drops a pair because somebody once said "slim" is worse than no recommender.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS } from "../lib/catalog";
import {
  EMPTY_TASTE, isEmpty, rankByTaste, reasonFor, tasteScore,
} from "../lib/preferences";

test("stating nothing leaves the catalogue exactly as it was", () => {
  assert.ok(isEmpty(EMPTY_TASTE));
  assert.deepEqual(rankByTaste(PRODUCTS, EMPTY_TASTE).map((p) => p.id),
                   PRODUCTS.map((p) => p.id));
  assert.deepEqual(rankByTaste(PRODUCTS, { ease: "standard" }).map((p) => p.id),
                   PRODUCTS.map((p) => p.id));
});

test("reordering never adds or removes a pair", () => {
  for (const taste of [{ fit: "slim" as const }, { wash: "black" },
                       { fit: "relaxed" as const, wash: "light" },
                       { ease: "close" as const }]) {
    const out = rankByTaste(PRODUCTS, taste);
    assert.equal(out.length, PRODUCTS.length, "a pair went missing");
    assert.deepEqual(new Set(out.map((p) => p.id)),
                     new Set(PRODUCTS.map((p) => p.id)));
  }
});

test("the cut they asked for comes first", () => {
  for (const fit of ["slim", "straight", "relaxed", "tapered"] as const) {
    const wanted = PRODUCTS.filter((p) => p.fit === fit);
    if (wanted.length === 0) continue;
    const first = rankByTaste(PRODUCTS, { fit })[0];
    assert.equal(first.fit, fit, `asked for ${fit}, got ${first.fit} first`);
  }
});

test("a cut one step away beats one three steps away", () => {
  const slim = PRODUCTS.find((p) => p.fit === "slim");
  const tapered = PRODUCTS.find((p) => p.fit === "tapered");
  const relaxed = PRODUCTS.find((p) => p.fit === "relaxed");
  if (!slim || !tapered || !relaxed) return;
  const t = { fit: "slim" as const };
  assert.ok(tasteScore(tapered, t) > tasteScore(relaxed, t));
  assert.ok(tasteScore(slim, t) > tasteScore(tapered, t));
});

test("a wash is either offered or it is not", () => {
  for (const p of PRODUCTS) {
    const has = p.colours.some((c) => c.id === "black");
    assert.equal(tasteScore(p, { wash: "black" }), has ? 1 : 0);
  }
});

test("a pair that comes in the wash they asked for outranks one that does not", () => {
  const withBlack = PRODUCTS.find((p) => p.colours.some((c) => c.id === "black"));
  const without = PRODUCTS.find((p) => !p.colours.some((c) => c.id === "black"));
  if (!withBlack || !without) return;
  const ranked = rankByTaste([without, withBlack], { wash: "black" });
  assert.equal(ranked[0].id, withBlack.id);
});

test("equal scores keep the catalogue's own order", () => {
  // Every pair scores the same on a wash none of them carry, so nothing should
  // move — a sort that felt free to reorder ties would shuffle the rail for no
  // stated reason.
  const ranked = rankByTaste(PRODUCTS, { wash: "no-such-colour" });
  assert.deepEqual(ranked.map((p) => p.id), PRODUCTS.map((p) => p.id));
});

test("the score never leaves the zero-to-one range", () => {
  for (const p of PRODUCTS) {
    for (const taste of [{ fit: "slim" as const }, { wash: "mid" },
                         { ease: "easy" as const },
                         { fit: "relaxed" as const, wash: "dark", ease: "close" as const }]) {
      const s = tasteScore(p, taste);
      assert.ok(s >= 0 && s <= 1, `${p.id} scored ${s}`);
    }
  }
});

test("the reason given is one the customer actually said", () => {
  const slim = PRODUCTS.find((p) => p.fit === "slim");
  if (!slim) return;
  assert.match(reasonFor(slim, { fit: "slim" })!, /slim/);
  // Nothing stated, nothing claimed.
  assert.equal(reasonFor(slim, {}), null);
  // And never a reason the pair does not support.
  const notBlack = PRODUCTS.find((p) => !p.colours.some((c) => c.id === "black"));
  if (notBlack) assert.equal(reasonFor(notBlack, { wash: "black" }), null);
});
