"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Frame } from "@/components/Frame";
import { Choosing } from "@/components/screens/Choosing";
import { Checkout } from "@/components/screens/Checkout";
import { Feedback } from "@/components/screens/Feedback";
import { Filming } from "@/components/screens/Filming";
import { Measurements } from "@/components/screens/Measurements";
import { Preferences } from "@/components/screens/Preferences";
import { Product as ProductScreen } from "@/components/screens/Product";
import { EMPTY_TASTE, type Taste } from "@/lib/preferences";
import { Rejected } from "@/components/screens/Rejected";
import { Wardrobe } from "@/components/screens/Wardrobe";
import { Welcome } from "@/components/screens/Welcome";
import { calculator, getEngine, type Scenario } from "@/lib/engine";
import { twinFromWardrobe } from "@/lib/engine/wardrobe";
import type {
  CaptureProgress, CaptureRejected, DigitalTwin, Product,
} from "@/lib/engine/types";

type Step =
  | "welcome" | "filming" | "analysing" | "rejected" | "wardrobe"
  | "measurements" | "preferences" | "choosing" | "product" | "checkout"
  | "feedback";

/** ?demo=no-head, ?demo=no-turn, ?demo=unsure — so the refusal paths can be
 *  shown on demand instead of described. */
function scenarioFromUrl(): Scenario {
  if (typeof window === "undefined") return "ok";
  const s = new URLSearchParams(window.location.search).get("demo");
  return s === "no-head" || s === "no-turn" || s === "unsure" ? s : "ok";
}

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [height, setHeight] = useState(174);
  const [twin, setTwin] = useState<DigitalTwin | null>(null);
  const [rejection, setRejection] = useState<CaptureRejected | null>(null);
  const [progress, setProgress] = useState<CaptureProgress>({ fraction: 0, hint: "" });
  const [elapsed, setElapsed] = useState(0);
  const [product, setProduct] = useState<Product | null>(null);
  const [colourId, setColourId] = useState<string>("");
  // Taste never leaves this component. It is not sent anywhere and not stored.
  const [taste, setTaste] = useState<Taste>(EMPTY_TASTE);
  const abort = useRef<AbortController | null>(null);
  const [engineIsStub, setEngineIsStub] = useState(true);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback((heightCm: number) => {
    setHeight(heightCm);
    setStep("filming");
    setProgress({ fraction: 0, hint: "" });
    setEngineIsStub(getEngine(scenarioFromUrl()).isStub);
  }, []);

  // Handed the recorded clip when the ten seconds are up. Only now does any
  // measuring start — before this there was nothing to measure.
  const analyse = useCallback(async (clip: Blob | null, heightCm = height) => {
    setStep("analysing");
    setProgress({ fraction: 0, hint: "Sending your clip" });

    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const began = Date.now();

    try {
      const engine = getEngine(scenarioFromUrl());
      setEngineIsStub(engine.isStub);
      const result = await engine.analyse({
        heightCm,
        video: clip ?? undefined,
        onProgress: setProgress,
        signal: ctrl.signal,
      });
      setElapsed(Math.max(1, Math.round((Date.now() - began) / 1000)));
      if (result.status === "ok") {
        setTwin(result.twin);
        setStep("measurements");
      } else {
        setRejection(result);
        setStep("rejected");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") throw e;
    }
  }, [height]);

  // No camera, no clip. Rather than fail silently, say so and offer the way in
  // that never needed one.
  const cameraDenied = useCallback(() => {
    setRejection({
      status: "capture_rejected",
      reason: "We could not open your camera. Allow camera access and try " +
              "again, or tell us a pair of jeans you already own.",
      all_reasons: ["camera unavailable or permission denied"],
      coaching: [],
      capture_quality: {
        head_visible: null, feet_visible: null, body_in_frame: null,
        usable_frames: 0, rotation_coverage: 0,
        frontal_yaw_deg: null, profile_yaw_deg: null,
      },
    });
    setStep("rejected");
  }, []);

  const anchor = useCallback((p: Product, size: string) => {
    const t = twinFromWardrobe(p, size, height);
    if (!t) return;
    setTwin(t);
    setElapsed(0);
    setStep("measurements");
  }, [height]);

  return (
    <Frame>
      {step === "welcome" && (
        <Welcome onStart={start}
                 onUseFile={(h, clip) => { setHeight(h); analyse(clip, h); }} />
      )}

      {(step === "filming" || step === "analysing") && (
        <Filming phase={step === "filming" ? "recording" : "analysing"}
                 progress={progress} isStub={engineIsStub}
                 onRecorded={analyse} onCameraDenied={cameraDenied} />
      )}

      {step === "rejected" && rejection && (
        <Rejected result={rejection}
                  onRetry={() => setStep("welcome")}
                  onWardrobe={() => setStep("wardrobe")} />
      )}

      {step === "wardrobe" && (
        <Wardrobe onAnchor={anchor} onBack={() => setStep("rejected")} />
      )}

      {step === "measurements" && twin && (
        <Measurements twin={twin} seconds={elapsed || 11}
                      onNext={() => setStep("preferences")} />
      )}

      {step === "preferences" && (
        <Preferences
          onDone={(t) => { setTaste(t); setStep("choosing"); }}
          onSkip={() => { setTaste(EMPTY_TASTE); setStep("choosing"); }} />
      )}

      {step === "choosing" && twin && (
        <Choosing twin={twin} taste={taste}
                  onPick={(p) => { setProduct(p); setStep("product"); }} />
      )}

      {step === "product" && twin && product && (
        <ProductScreen product={product} twin={twin}
                       onBack={() => setStep("choosing")}
                       onBuy={(c) => { setColourId(c); setStep("checkout"); }} />
      )}

      {step === "checkout" && twin && product && (
        <Checkout product={product} colourId={colourId}
                  fit={calculator.recommend(twin, product)}
                  onBack={() => setStep("product")}
                  onPlace={() => setStep("feedback")} />
      )}

      {step === "feedback" && twin && product && (
        <Feedback product={product}
                  size={calculator.recommend(twin, product).size ?? "—"}
                  onAnswer={() => {}} />
      )}
    </Frame>
  );
}
