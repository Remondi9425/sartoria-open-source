/**
 * The way in that needs no camera.
 *
 * Someone who cannot film — or will not — still knows which pair in their
 * wardrobe fits. Reading that backwards through the brand's own chart gives a
 * body estimate, and it carries something the video never will: how they like
 * jeans to sit. Two identical pairs of legs want different jeans.
 *
 * Real logic, not a stub. The midpoint of the range a size is cut for is the
 * best single estimate of the body inside it.
 */
import type {
  Confidence, DigitalTwin, MeasurementSite, Product, SizeChart, SizeRow,
} from "./types";

function toBody(row: SizeRow, chart: SizeChart): SizeRow {
  if (chart.kind === "body") return row;
  return {
    ...row,
    waist_cm: [row.waist_cm[0] + chart.ease_cm.waist, row.waist_cm[1] + chart.ease_cm.waist],
    hip_cm: [row.hip_cm[0] + chart.ease_cm.hip, row.hip_cm[1] + chart.ease_cm.hip],
  };
}

const mid = ([a, b]: [number, number]) => Math.round(((a + b) / 2) * 10) / 10;

export function twinFromWardrobe(
  product: Product, sizeLabel: string, heightCm: number,
): DigitalTwin | null {
  const raw = product.chart.rows.find((r) => r.label === sizeLabel);
  if (!raw) return null;
  const row = toBody(raw, product.chart);

  const waist = mid(row.waist_cm);
  const hip = mid(row.hip_cm);
  // The rest is inferred from stature, which is weak — and labelled as weak.
  const k = heightCm / 174;
  const r = (n: number) => Math.round(n * 10) / 10;

  const measurements: Record<MeasurementSite, number> = {
    waist, hip,
    thigh: r(hip * 0.575), knee: r(hip * 0.395),
    calf: r(hip * 0.385), ankle: r(hip * 0.232),
    inseam: row.inseam_cm, outseam: r(107 * k), rise: r(26 * k),
  };

  const strong: Confidence = "medium";     // never "high": it is a range, not a body
  const weak: Confidence = "low";
  return {
    session_id: `wardrobe-${Date.now().toString(36)}`,
    height_cm: heightCm,
    measurements_cm: measurements,
    measurement_confidence: {
      waist: strong, hip: strong, inseam: strong,
      thigh: weak, knee: weak, calf: weak, ankle: weak,
      outseam: weak, rise: weak,
    },
    measurement_notes: {
      waist: `read back from ${product.brand} ${sizeLabel}, which you said fits`,
      thigh: "inferred from your seat, not measured",
    },
    capture_quality: {
      head_visible: null, feet_visible: null, body_in_frame: null,
      usable_frames: 0, rotation_coverage: 0,
      frontal_yaw_deg: null, profile_yaw_deg: null,
    },
    processing_method: "wardrobe_anchor_v1",
    data_quality_tier: "C",
    created_at: new Date().toISOString(),
  };
}
