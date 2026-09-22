"use client";

/** A bench for the leg renderer. Loads a saved cloud so the look can be
 *  iterated on in seconds rather than by re-measuring a video each time.
 *  Local only — the fixture it needs is gitignored. */
import { useEffect, useState } from "react";
import { LegScan } from "@/components/art/LegScan";

export default function Preview() {
  const [pts, setPts] = useState<[number, number, number][] | null>(null);
  useEffect(() => {
    fetch("/_test_cloud.json").then((r) => r.json()).then(setPts).catch(() => {});
  }, []);
  if (!pts) return <p style={{ padding: 24 }}>no fixture</p>;
  return (
    <main className="min-h-dvh bg-paper p-6">
      <div className="mx-auto max-w-sm rounded-2xl bg-card p-4">
        <LegScan points={pts} className="h-[420px] w-full" />
      </div>
      <p className="pt-3 text-center text-[12px] text-mute">
        {pts.length} points
      </p>
    </main>
  );
}
