/** The size calculator is the one piece of real logic in this app — the
 *  measurement engine is still a stub — so it is the one piece with tests. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCTS, productById } from "../lib/catalog";
import { sizeCalculator } from "../lib/engine/advisor";
import { twinFromWardrobe } from "../lib/engine/wardrobe";
import { referenceTwin } from "./fixtures";

const marea = productById("marea-slim-tapered")!;

test("a body on a size boundary belongs to exactly one size", () => {
  // 82 cm sits on the edge of W30 [78,82] and W31 [82,86]. Closed ranges put it
  // in both and the winner came down to array order.
  for (const p of PRODUCTS) {
    for (let waist = 66; waist <= 100; waist += 0.5) {
      const rows = p.chart.rows;
      const hits = rows.filter((r, i) => {
        const lo = r.waist_cm[0] + (p.chart.kind === "flat" ? p.chart.ease_cm.waist : 0);
        const hi = r.waist_cm[1] + (p.chart.kind === "flat" ? p.chart.ease_cm.waist : 0);
        return waist >= lo && (i === rows.length - 1 ? waist <= hi : waist < hi);
      });
      assert.ok(hits.length <= 1,
        `${p.id}: waist ${waist} matches ${hits.length} sizes`);
    }
  }
});

test("the same body gets different sizes in different brands", () => {
  const twin = referenceTwin();
  const sizes = new Set(PRODUCTS.map((p) => sizeCalculator.recommend(twin, p).size));
  assert.ok(sizes.size > 1,
    "every brand returned the same size — the product would have nothing to say");
});

test("the reference body is true to size in the reference product", () => {
  const fit = sizeCalculator.recommend(referenceTwin(), marea);
  assert.equal(fit.size, "W31 L32");
  assert.equal(fit.headline, "True to size for you");
  const waist = fit.areas.find((a) => a.area === "waist");
  assert.equal(waist?.verdict, "good");
});

test("the headline describes the fit, not the hem", () => {
  // A 6 cm hem difference must not turn a perfect waist into "a little room".
  const long = sizeCalculator.recommend(referenceTwin({ inseam: 75 }), marea);
  assert.equal(long.headline, "True to size for you");
  assert.ok(long.areas.some((a) => a.area === "hem"),
    "the hem should still be reported, just not in the headline");
});

test("hem sign says which way it is wrong", () => {
  // Marea's W31 is cut for an 82 cm inseam.
  const shortLegs = sizeCalculator.recommend(referenceTwin({ inseam: 76 }), marea);
  assert.equal(shortLegs.areas.find((a) => a.area === "hem")?.detail, "+6 cm");
  const longLegs = sizeCalculator.recommend(referenceTwin({ inseam: 88 }), marea);
  assert.equal(longLegs.areas.find((a) => a.area === "hem")?.detail, "−6 cm");
});

test("a garment-flat chart is not read as a body chart", () => {
  const flat = PRODUCTS.find((p) => p.chart.kind === "flat")!;
  const twin = referenceTwin();
  const withEase = sizeCalculator.recommend(twin, flat);
  const asIfBody = sizeCalculator.recommend(twin, {
    ...flat, chart: { ...flat.chart, kind: "body" as const },
  });
  assert.notEqual(withEase.size, asIfBody.size,
    "ignoring the ease produced the same answer — the distinction is not doing any work");
});

test("it refuses rather than guesses when the waist is off the chart", () => {
  const huge = sizeCalculator.recommend(referenceTwin({ waist: 140 }), marea);
  assert.equal(huge.size, null);
  assert.equal(huge.confidence, "low");
  assert.ok(huge.alternative, "a refusal should still name the nearest size");
});

test("it refuses when the waist measurement itself is not trusted", () => {
  const unsure = sizeCalculator.recommend(referenceTwin({}, "low"), marea);
  assert.equal(unsure.size, null);
});

test("identical input gives identical output, every time", () => {
  const a = sizeCalculator.recommend(referenceTwin(), marea);
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(sizeCalculator.recommend(referenceTwin(), marea), a);
  }
});

test("the reasoning names the measurements it used", () => {
  const fit = sizeCalculator.recommend(referenceTwin(), marea);
  assert.deepEqual(fit.used, ["waist", "hip", "inseam"]);
});

test("the wardrobe anchor recovers roughly the body that size is cut for", () => {
  const twin = twinFromWardrobe(marea, "W31 L32", 174)!;
  assert.ok(Math.abs(twin.measurements_cm.waist - 82) <= 2);
  assert.equal(twin.data_quality_tier, "C");
  assert.notEqual(twin.measurement_confidence.waist, "high",
    "a range is not a body and must never be reported as high confidence");
});

test("the wardrobe anchor round-trips back to the size it came from", () => {
  for (const row of marea.chart.rows) {
    const twin = twinFromWardrobe(marea, row.label, 174)!;
    // The anchor says "this size fits me"; the calculator must agree.
    assert.equal(sizeCalculator.recommend(twin, marea).size, row.label);
  }
});


// ── each confidence belongs to the answer it was computed from ──────────────
test("a poorly-read seat does not lower the confidence of the size", () => {
  // The size is chosen by the waist alone; the seat only colours how it sits.
  const twin = referenceTwin();
  twin.measurement_confidence.hip = "low";
  const fit = sizeCalculator.recommend(twin, marea);
  assert.equal(fit.size, "W31 L32");
  assert.equal(fit.confidence, "high", "the waist was high and it picks the size");
});

test("a seat we could not read is not given a verdict", () => {
  const twin = referenceTwin();
  twin.measurement_confidence.hip = "low";
  const fit = sizeCalculator.recommend(twin, marea);
  assert.ok(!fit.areas.some((a) => a.area === "hip"),
            "stating 'hip roomy' from a low-confidence hip asserts what we did not measure");
  assert.ok(!fit.areas.some((a) => a.area === "thigh"),
            "the thigh hint is derived from the seat, so it goes too");
});

test("a shaky inseam withholds the hem but keeps the size", () => {
  const twin = referenceTwin({ inseam: 70 });
  twin.measurement_confidence.inseam = "low";
  const fit = sizeCalculator.recommend(twin, marea);
  assert.equal(fit.size, "W31 L32");
  assert.equal(fit.length_confidence, "low");
  assert.ok(!fit.areas.some((a) => a.area === "hem"),
            "'+12 cm' reads as a fact and a low-confidence inseam cannot support one");
});

test("a shaky waist still refuses outright", () => {
  const fit = sizeCalculator.recommend(referenceTwin({}, "low"), marea);
  assert.equal(fit.size, null);
});

test("the confidence reported is the waist's, unchanged", () => {
  for (const level of ["high", "medium"] as const) {
    const twin = referenceTwin();
    twin.measurement_confidence.waist = level;
    twin.measurement_confidence.hip = "low";
    twin.measurement_confidence.inseam = "low";
    assert.equal(sizeCalculator.recommend(twin, marea).confidence, level);
  }
});
