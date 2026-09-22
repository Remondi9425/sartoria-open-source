import type { DigitalTwin, MeasurementSite } from "../lib/engine/types";

/** The body the design was drawn around: 174 cm, waist 82, hip 99, inseam 81. */
export function referenceTwin(over: Partial<Record<MeasurementSite, number>> = {},
                              waistConfidence: "high" | "low" = "high"): DigitalTwin {
  return {
    session_id: "test", height_cm: 174,
    measurements_cm: {
      waist: 82, hip: 99, thigh: 57, knee: 39, calf: 38,
      ankle: 23, inseam: 81, outseam: 107, rise: 26, ...over,
    },
    measurement_confidence: {
      waist: waistConfidence, hip: "high", thigh: "medium", knee: "medium",
      calf: "medium", ankle: "low", inseam: "high", outseam: "high", rise: "medium",
    },
    measurement_notes: {},
    capture_quality: {
      head_visible: true, feet_visible: true, body_in_frame: true,
      usable_frames: 78, rotation_coverage: 0.83,
      frontal_yaw_deg: 2, profile_yaw_deg: 85,
    },
    processing_method: "test", data_quality_tier: "B",
    created_at: "2026-09-14T00:00:00Z",
  };
}
