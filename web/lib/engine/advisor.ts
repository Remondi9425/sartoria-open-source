/**
 * The size calculator.
 *
 * This is NOT a stub and NOT an AI call. It is the deterministic core the whole
 * architecture is built around: the same body and the same chart must always
 * produce the same size, and the reason must be inspectable. An LLM may later
 * phrase the explanation; it never picks the number.
 */
import type {
  AreaNote, DigitalTwin, FitRecommendation,
  MeasurementSite, Product, SizeChart, SizeRow,
} from "./types";

/** Hem difference worth mentioning at all, in cm. */
const HEM_TOLERANCE_CM = 0.9;
/** A narrow cut is flagged at the thigh before the seat itself reads snug. */
const THIGH_HINT_BAND = 0.6;
/** Sitting this far into the top of a range reads as snug rather than fine. */
const SNUG_BAND = 0.8;
const ROOMY_BAND = 0.28;

/** Body measurements a garment-flat chart is cut for. */
function toBodyRange(row: SizeRow, chart: SizeChart): SizeRow {
  if (chart.kind === "body") return row;
  return {
    ...row,
    waist_cm: [row.waist_cm[0] + chart.ease_cm.waist,
               row.waist_cm[1] + chart.ease_cm.waist],
    hip_cm: [row.hip_cm[0] + chart.ease_cm.hip,
             row.hip_cm[1] + chart.ease_cm.hip],
  };
}

/** Where in a range a value sits: 0 at the bottom edge, 1 at the top. */
function position(value: number, [lo, hi]: [number, number]): number {
  if (hi <= lo) return 0.5;
  return (value - lo) / (hi - lo);
}

function verdictFor(p: number): AreaNote["verdict"] {
  if (p >= SNUG_BAND) return "snug";
  if (p <= ROOMY_BAND) return "roomy";
  return "good";
}

export const sizeCalculator = {
  recommend(twin: DigitalTwin, product: Product): FitRecommendation {
    const used: MeasurementSite[] = ["waist", "hip", "inseam"];
    const m = twin.measurements_cm;
    // Each confidence describes the measurement its own answer was computed
    // from, and nothing else. The size is chosen by the waist alone — the seat
    // only colours how it will sit — so mixing the seat's confidence in meant
    // a poorly-read hip could mark a size low that had never depended on it.
    const conf = twin.measurement_confidence.waist;
    const seatConf = twin.measurement_confidence.hip;
    const lengthConf = twin.measurement_confidence.inseam;

    const rows = product.chart.rows.map((r) => toBodyRange(r, product.chart));

    // The waist is what binds on a pair of jeans; the hip only breaks ties.
    // Ranges are half-open so a body on a boundary belongs to exactly one size —
    // closed ranges put 82 cm in both W30 [78,82] and W31 [82,86] at once, and
    // the tie was then broken by array order, which is not a reason.
    const fits = rows.filter((r, i) =>
      m.waist >= r.waist_cm[0] &&
      (i === rows.length - 1 ? m.waist <= r.waist_cm[1] : m.waist < r.waist_cm[1]));

    // Refusing is a real answer. A system that always has an opinion is lying
    // about its confidence.
    if (fits.length === 0 || twin.measurement_confidence.waist === "low") {
      const nearest = rows.reduce((best, r) => {
        const d = Math.min(Math.abs(m.waist - r.waist_cm[0]),
                           Math.abs(m.waist - r.waist_cm[1]));
        return d < best.d ? { d, r } : best;
      }, { d: Infinity, r: rows[0] });
      return {
        size: null,
        headline: fits.length === 0
          ? "Your waist falls outside this brand's chart"
          : "We are not sure enough to call this one",
        areas: [],
        alternative: nearest.r?.label ?? null,
        confidence: "low",
        length_confidence: lengthConf,
        used,
      };
    }

    // Among the rows that fit, prefer the one the body sits most centrally in.
    const chosen = fits.reduce((best, r) =>
      Math.abs(position(m.waist, r.waist_cm) - 0.5) <
      Math.abs(position(m.waist, best.waist_cm) - 0.5) ? r : best);

    const pWaist = position(m.waist, chosen.waist_cm);
    const pHip = position(m.hip, chosen.hip_cm);

    const areas: AreaNote[] = [
      { area: "waist", verdict: verdictFor(pWaist), detail: "" },
    ];
    // A seat we could not read well is not a seat verdict. Saying "hip roomy"
    // from a low-confidence hip states as fact something we did not measure.
    if (seatConf !== "low") {
      areas.push({ area: "hip", verdict: verdictFor(pHip), detail: "" });
    }

    // No chart publishes a thigh range, so it is only mentioned when the cut is
    // narrow and the seat is already near the top of its range.
    const narrow = product.fit === "slim" || product.fit === "tapered";
    if (narrow && seatConf !== "low" && pHip >= THIGH_HINT_BAND) {
      areas.push({ area: "thigh", verdict: "snug", detail: "" });
    }

    // Positive spare means length to turn up; negative means they run short.
    // Withheld when the inseam itself is shaky: "+3 cm" reads as a fact, and a
    // low-confidence inseam cannot support one.
    const spare = chosen.inseam_cm - m.inseam;
    if (lengthConf !== "low" && Math.abs(spare) >= HEM_TOLERANCE_CM) {
      areas.push({
        area: "hem",
        verdict: spare > 0 ? "roomy" : "snug",
        detail: `${spare > 0 ? "+" : "−"}${Math.abs(Math.round(spare))} cm`,
      });
    }

    // A neighbouring size is worth naming when the body is near an edge.
    const idx = rows.indexOf(chosen);
    const neighbour = pWaist >= SNUG_BAND ? rows[idx + 1]
                    : pWaist <= ROOMY_BAND ? rows[idx - 1]
                    : undefined;

    // The headline is about how it sits, so only the waist and the seat feed
    // it. A hem is a length to be turned up, not a fit problem, and letting it
    // drive the sentence made every pair read "with a little room".
    const vWaist = verdictFor(pWaist);
    const vHip = seatConf === "low" ? "good" : verdictFor(pHip);
    const headline =
      vWaist === "snug" ? "Right size, on the snug side"
      : vWaist === "roomy" ? "Right size, with a little room"
      : vHip === "snug" ? "True to size, snug in the seat"
      : vHip === "roomy" ? "True to size, easy in the seat"
      : "True to size for you";

    return {
      size: chosen.label,
      headline,
      length_confidence: lengthConf,
      areas,
      alternative: neighbour?.label ?? null,
      confidence: conf,
      used,
    };
  },
};
