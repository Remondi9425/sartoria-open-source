/**
 * The seam.
 *
 * Everything the app knows about a body passes through these types. Today the
 * measurement engine behind them is a stub, because the question of whether a
 * phone video yields usable measurements is still open — that is what the
 * Python spike in ../../spike is for. When it answers, only `stub.ts` is
 * replaced. No screen changes.
 *
 * Field names are snake_case on purpose: this is the wire contract, and it has
 * to match `spike/twin.py` character for character. A translation layer between
 * the two would be one more place for them to drift apart.
 */

export type MeasurementSite =
  | "waist" | "hip" | "thigh" | "knee" | "calf" | "ankle"
  | "inseam" | "outseam" | "rise";

export type Confidence = "high" | "medium" | "low";

/** A: trust it. B: usable, say so. C: show it but ask for confirmation. */
export type QualityTier = "A" | "B" | "C";

export interface CaptureQuality {
  head_visible: boolean | null;      // null when no person was detected at all
  feet_visible: boolean | null;
  body_in_frame: boolean | null;
  usable_frames: number;
  rotation_coverage: number;         // 0..1
  frontal_yaw_deg: number | null;
  profile_yaw_deg: number | null;
}

export interface DigitalTwin {
  session_id: string;
  height_cm: number;
  measurements_cm: Record<MeasurementSite, number>;
  measurement_confidence: Record<MeasurementSite, Confidence>;
  measurement_notes: Partial<Record<MeasurementSite, string>>;
  capture_quality: CaptureQuality;
  processing_method: string;
  data_quality_tier: QualityTier;
  created_at: string;
  /** The customer's legs as surface points in centimetres — standing on zero,
   *  centred on the hips. Absent from the stub and from older workers. Legs
   *  only: the model returns a whole body, and a head is not part of picking
   *  trousers. */
  leg_cloud_cm?: [number, number, number][] | null;
}

/** What comes back when a gate blocks. A cause, never a generic failure. */
export interface CaptureRejected {
  status: "capture_rejected";
  reason: string;
  all_reasons: string[];
  coaching: string[];
  capture_quality: CaptureQuality;
}

export interface CaptureAccepted {
  status: "ok";
  twin: DigitalTwin;
  coaching: string[];                // advice that did not block
}

export type CaptureResult = CaptureAccepted | CaptureRejected;

export interface CaptureProgress {
  /** 0..1 */
  fraction: number;
  /** what the Capture Coach is saying right now */
  hint: string;
}

export interface AnalyseInput {
  heightCm: number;
  /** Absent while the engine is stubbed; required once it is real. */
  video?: Blob;
  onProgress?: (p: CaptureProgress) => void;
  signal?: AbortSignal;
}

/**
 * The only thing the app asks of the vision pipeline. One method, one result.
 */
export interface MeasurementEngine {
  readonly name: string;
  /** True when the numbers are invented. The UI says so out loud. */
  readonly isStub: boolean;
  analyse(input: AnalyseInput): Promise<CaptureResult>;
}

// ── the catalogue side ──────────────────────────────────────────────────────

/**
 * Whether a chart lists body measurements or the garment measured flat. Getting
 * this wrong is worth several centimetres, so it is never inferred.
 */
export type ChartKind = "body" | "flat";

export interface SizeRow {
  label: string;                     // "W31 L32"
  waist_cm: [number, number];        // the range the size is meant to fit
  hip_cm: [number, number];
  inseam_cm: number;
}

export interface SizeChart {
  kind: ChartKind;
  /** Added to garment-flat numbers to reach the body they are cut for. */
  ease_cm: { waist: number; hip: number };
  rows: SizeRow[];
}

export interface Product {
  id: string;
  brand: string;
  name: string;
  fit: "slim" | "straight" | "relaxed" | "tapered";
  price_eur: number;
  composition: string;
  colours: { id: string; name: string; hex: string; denim: string }[];
  chart: SizeChart;
}

// ── what the advisor returns ────────────────────────────────────────────────

export type AreaVerdict = "good" | "snug" | "roomy";

export interface AreaNote {
  area: "waist" | "hip" | "thigh" | "hem";
  verdict: AreaVerdict;
  /** e.g. "+1 cm" for a hem that needs turning up. Empty when it just fits. */
  detail: string;
}

export interface FitRecommendation {
  size: string | null;               // null = we will not guess
  headline: string;                  // "True to size for you"
  areas: AreaNote[];
  alternative: string | null;        // the next size, when it is close
  /** How sure we are of the *size*: waist and seat. */
  confidence: Confidence;
  /** How sure we are of the *length*: the inseam. A size can be solid while
   *  the leg length is not, and one number for both let a hem note carry the
   *  same authority as the size. */
  length_confidence: Confidence;
  /** Which measurements the decision actually used. Auditable by design. */
  used: MeasurementSite[];
}

/**
 * Deliberately NOT an AI interface. Identical inputs must give identical
 * outputs, so this stays ordinary arithmetic — see `advisor.ts`, which is the
 * real implementation, not a stub.
 */
export interface SizeCalculator {
  recommend(twin: DigitalTwin, product: Product): FitRecommendation;
}
