/**
 * A stubbed measurement engine.
 *
 * It invents its numbers. It exists so the seven screens can be built, shown
 * and argued about before the vision pipeline has a verdict — see ../../spike.
 * Everything here is shaped exactly like the real thing will be, including the
 * refusal path, because the refusal is the part most likely to be forgotten if
 * it is not there from the start.
 */
import type {
  AnalyseInput, CaptureQuality, CaptureResult, DigitalTwin, MeasurementEngine,
} from "./types";

export type Scenario = "ok" | "no-head" | "no-turn" | "unsure";

/**
 * What the screen says while the clock runs.
 *
 * These describe what the real pipeline will do, which is the point of showing
 * the flow at all. One earlier line — "Found you — head to feet" — is gone: it
 * asserted a detection, and the stub never looks at a single frame. Someone
 * filmed their face and got leg measurements back, which is exactly how a stub
 * teaches people to trust a number it invented.
 *
 * The honesty lives in the strip across the bottom of the filming screen
 * instead, where it does not have to compete with the product copy.
 */
const HINTS: [number, string][] = [
  [0.00, "Checking we can see all of you"],
  [0.32, "Following the turn"],
  [0.62, "Reading the silhouette"],
  [0.86, "Turning pixels into centimetres"],
];

const GOOD_QUALITY: CaptureQuality = {
  head_visible: true, feet_visible: true, body_in_frame: true,
  usable_frames: 78, rotation_coverage: 0.83,
  frontal_yaw_deg: 2.1, profile_yaw_deg: 84.6,
};

function twinFor(heightCm: number, unsure: boolean): DigitalTwin {
  // Scaled off a 174 cm reference so changing the height moves the numbers,
  // which makes the stub behave plausibly when someone plays with the stepper.
  const k = heightCm / 174;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    session_id: `demo-${Date.now().toString(36)}`,
    height_cm: heightCm,
    measurements_cm: {
      waist: r(82 * (1 + (k - 1) * 0.45)),
      hip: r(99 * (1 + (k - 1) * 0.5)),
      thigh: r(57 * (1 + (k - 1) * 0.5)),
      knee: r(39 * k), calf: r(38 * k), ankle: r(23 * k),
      inseam: r(81 * k), outseam: r(107 * k), rise: r(26 * k),
    },
    measurement_confidence: {
      waist: unsure ? "low" : "high", hip: "high", thigh: "medium",
      knee: "medium", calf: "medium", ankle: "low",
      inseam: "high", outseam: "high", rise: "medium",
    },
    measurement_notes: unsure
      ? { waist: "the silhouette width changes sharply at this level" }
      : { ankle: "measured just above the joint, where it is narrowest" },
    capture_quality: GOOD_QUALITY,
    processing_method: "stub_v0 — invented numbers, not measured",
    data_quality_tier: unsure ? "C" : "B",
    created_at: new Date().toISOString(),
  };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    // Checked before listening. An "abort" event that has already fired will
    // not fire again, so a cancellation that happened while we were somewhere
    // else — inside a fetch, between two steps — went unnoticed and the loop
    // carried on to its own timeout.
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export function createStubEngine(scenario: Scenario = "ok"): MeasurementEngine {
  return {
    name: `stub:${scenario}`,
    isStub: true,

    async analyse({ heightCm, onProgress, signal }: AnalyseInput): Promise<CaptureResult> {
      const steps = 40;
      const total = scenario === "no-head" ? 1600 : 4200;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const hint = [...HINTS].reverse().find(([at]) => f >= at)?.[1] ?? HINTS[0][1];
        onProgress?.({ fraction: f, hint });
        await sleep(total / steps, signal);
        // The head gate fires early, because it can: it needs one frame.
        if (scenario === "no-head" && f >= 0.3) break;
      }

      if (scenario === "no-head") {
        return {
          status: "capture_rejected",
          reason:
            "We can't see the top of your head. We need your whole body, head " +
            "to feet, to turn the video into centimetres — move the phone " +
            "further away and record again.",
          all_reasons: [
            "We can't see the top of your head. We need your whole body, head " +
            "to feet, to turn the video into centimetres — move the phone " +
            "further away and record again.",
          ],
          coaching: [],
          capture_quality: { ...GOOD_QUALITY, head_visible: false, usable_frames: 31 },
        };
      }

      if (scenario === "no-turn") {
        return {
          status: "capture_rejected",
          reason:
            "We only ever saw you from the front. Turn all the way round " +
            "slowly — the side view is what tells us how deep you are, and " +
            "without it there is no measurement, only a width.",
          all_reasons: [
            "We only ever saw you from the front. Turn all the way round " +
            "slowly — the side view is what tells us how deep you are, and " +
            "without it there is no measurement, only a width.",
          ],
          coaching: [],
          capture_quality: {
            ...GOOD_QUALITY, rotation_coverage: 0.18, profile_yaw_deg: null,
          },
        };
      }

      return {
        status: "ok",
        twin: twinFor(heightCm, scenario === "unsure"),
        coaching: scenario === "unsure"
          ? ["The room was a little dark — a brighter one would help next time."]
          : [],
      };
    },
  };
}
