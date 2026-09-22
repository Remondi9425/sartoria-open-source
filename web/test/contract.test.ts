/** The wire contract, which used to be a TypeScript cast over untrusted JSON. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ContractError, SITES, parseTwin } from "../lib/engine/contract";

/** Mutated freely by the tests below, which is the point: they feed it
 *  the malformed shapes a worker could actually send. */
type Body = Record<string, Record<string, unknown> | string | number>;

function goodBody(): Body {
  return {
    status: "ok", session_id: "x", height_cm: 168,
    measurements_cm: {
      waist: 89, hip: 104, thigh: 59, knee: 38, calf: 37,
      ankle: 21, inseam: 77, outseam: 106, rise: 29,
    } as Record<string, number>,
    measurement_confidence: Object.fromEntries(
      SITES.map((s) => [s, "medium"])) as Record<string, string>,
    measurement_notes: {},
    capture_quality: {
      head_visible: true, feet_visible: true, body_in_frame: true,
      usable_frames: 23, rotation_coverage: 0.8,
      frontal_yaw_deg: 2.1, profile_yaw_deg: 84.6,
    } as Record<string, unknown>,
    processing_method: "nlf_smpl_hull_v1", data_quality_tier: "B",
    created_at: "2026-09-15T00:00:00Z",
  };
}

test("a well-formed response parses", () => {
  const twin = parseTwin(goodBody());
  assert.equal(twin.measurements_cm.waist, 89);
  assert.equal(twin.data_quality_tier, "B");
});

test("a missing measurement is refused, not defaulted", () => {
  const b = goodBody();
  delete (b.measurements_cm as Record<string, unknown>).inseam;
  assert.throws(() => parseTwin(b), ContractError);
});

test("a measurement that is not a number is refused", () => {
  const b = goodBody();
  (b.measurements_cm as Record<string, unknown>).waist = "89";
  assert.throws(() => parseTwin(b), ContractError);
});

test("NaN and Infinity are refused", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const b = goodBody();
    (b.measurements_cm as Record<string, unknown>).waist = bad;
    assert.throws(() => parseTwin(b), ContractError, `accepted ${bad}`);
  }
});

test("an implausible measurement is refused even though it is a number", () => {
  const b = goodBody();
  (b.measurements_cm as Record<string, unknown>).waist = 420;
  assert.throws(() => parseTwin(b), ContractError);
});

test("an unknown confidence value is refused", () => {
  const b = goodBody();
  (b.measurement_confidence as Record<string, unknown>).waist = "probably";
  assert.throws(() => parseTwin(b), ContractError);
});

test("an unknown quality tier is refused", () => {
  const b = goodBody();
  b.data_quality_tier = "Z";
  assert.throws(() => parseTwin(b), ContractError);
});

test("a complete body that is not a success is still refused", () => {
  // The earlier version of this test passed for the wrong reason: the body it
  // fed in had no measurements, so it would have been rejected whatever its
  // status said.
  const b = goodBody();
  b.status = "error";
  assert.throws(() => parseTwin(b), ContractError);
  delete b.status;
  const missing = goodBody();
  delete missing.status;
  assert.throws(() => parseTwin(missing), ContractError);
});

test("an error body does not become a twin", () => {
  assert.throws(() => parseTwin({ status: "error", detail: "boom" }), ContractError);
  assert.throws(() => parseTwin(null), ContractError);
  assert.throws(() => parseTwin("ok"), ContractError);
  assert.throws(() => parseTwin([]), ContractError);
});

test("capture_quality keeps its three-state visibility", () => {
  const b = goodBody();
  (b.capture_quality as Record<string, unknown>).head_visible = null;
  assert.equal(parseTwin(b).capture_quality.head_visible, null);

  const bad = goodBody();
  (bad.capture_quality as Record<string, unknown>).head_visible = "yes";
  assert.throws(() => parseTwin(bad), ContractError);
});

test("every site the app reads is required", () => {
  for (const site of SITES) {
    const b = goodBody();
    delete (b.measurements_cm as Record<string, unknown>)[site];
    assert.throws(() => parseTwin(b), ContractError, `${site} was optional`);
  }
});
