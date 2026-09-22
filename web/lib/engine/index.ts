/**
 * The one place the engine is chosen.
 *
 * Set NEXT_PUBLIC_ENGINE_URL to point at the Python worker and the app measures
 * for real; leave it unset and it runs on invented numbers. Nothing else in the
 * app knows the difference — components import only types from here.
 */
import { createHttpEngine } from "./http";
import { createStubEngine, type Scenario } from "./stub";
import { sizeCalculator } from "./advisor";
import type { MeasurementEngine, SizeCalculator } from "./types";

const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL?.replace(/\/$/, "");

export function getEngine(scenario: Scenario = "ok"): MeasurementEngine {
  // A demo scenario always wins: the refusal paths must stay demonstrable even
  // when a real worker is attached.
  if (ENGINE_URL && scenario === "ok") return createHttpEngine(ENGINE_URL);
  return createStubEngine(scenario);
}

/** True when the app would measure for real, whatever this run is doing. */
export const engineConfigured = Boolean(ENGINE_URL);

/** Real arithmetic, not a stub — and deliberately never an LLM. */
export const calculator: SizeCalculator = sizeCalculator;

export type { Scenario };
export * from "./types";
