"use client";

/**
 * Taste, asked for once and used immediately.
 *
 * The size is settled by the time anyone gets here. This screen only decides
 * the order jeans are shown in, which is why every answer is optional and why
 * skipping is a button rather than a dead end.
 *
 * Two purposes on one screen, kept visibly apart because they are not the same
 * thing and must not be bundled. Above the rule: what you like, which stays in
 * this browser and never reaches a server. Below it: an address, which is the
 * only part that would be kept, is optional, is unticked, and is not a
 * condition of anything.
 */
import { useState } from "react";

import { Body, Button, Footer, Note, Screen, Title } from "@/components/ui";
import type { Fit, Taste } from "@/lib/preferences";

const FITS: { id: Fit; label: string; hint: string }[] = [
  { id: "slim", label: "Slim", hint: "close all the way down" },
  { id: "tapered", label: "Tapered", hint: "room at the thigh, narrow at the ankle" },
  { id: "straight", label: "Straight", hint: "the same width from knee to hem" },
  { id: "relaxed", label: "Relaxed", hint: "easy through the leg" },
];

const WASHES: { id: string; label: string; hex: string }[] = [
  { id: "light", label: "Light", hex: "#A8C4E4" },
  { id: "mid", label: "Mid indigo", hex: "#5B86C4" },
  { id: "dark", label: "Dark rinse", hex: "#25365C" },
  { id: "black", label: "Black", hex: "#23262E" },
];

function Choice({ selected, onClick, children }: {
  selected: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              selected
                ? "border-navy bg-navy text-white"
                : "border-line bg-white text-ink hover:border-navy"}`}>
      {children}
    </button>
  );
}

export function Preferences({ onDone, onSkip }: {
  onDone: (taste: Taste) => void;
  onSkip: () => void;
}) {
  const [fit, setFit] = useState<Fit | undefined>();
  const [wash, setWash] = useState<string | undefined>();
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);   // never defaulted true
  const [sending, setSending] = useState(false);
  const [signup, setSignup] = useState<string | null>(null);

  // A toggle, so a second tap clears the answer. Otherwise the first tap is
  // permanent and "I would rather not say" becomes unreachable.
  const pick = <T,>(cur: T | undefined, v: T) => (cur === v ? undefined : v);

  async function subscribe() {
    setSending(true);
    setSignup(null);
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, marketing }),
      });
      const body = await r.json().catch(() => ({}));
      setSignup(r.ok ? "Thank you — we will write rarely." :
                (body.error ?? "That did not work. Nothing was saved."));
    } catch {
      setSignup("We could not reach the sign-up. Nothing was saved.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <Body>
        <div className="pt-8">
          <Title>Anything you already know you like?</Title>
          <p className="pt-3 text-[14.5px] leading-[1.5] text-mute">
            Your size is decided. This only changes the order we show things
            in, so skip it if you would rather just look.
          </p>
        </div>

        <p className="eyebrow pt-8 pb-3">Cut</p>
        <div className="grid grid-cols-2 gap-2.5">
          {FITS.map((f) => (
            <Choice key={f.id} selected={fit === f.id}
                    onClick={() => setFit(pick(fit, f.id))}>
              <span className="block text-[14px] font-semibold">{f.label}</span>
              <span className={`block pt-0.5 text-[11.5px] leading-[1.35] ${
                fit === f.id ? "text-white/70" : "text-faint"}`}>
                {f.hint}
              </span>
            </Choice>
          ))}
        </div>

        <p className="eyebrow pt-7 pb-3">Wash</p>
        <div className="grid grid-cols-4 gap-2.5">
          {WASHES.map((w) => (
            <Choice key={w.id} selected={wash === w.id}
                    onClick={() => setWash(pick(wash, w.id))}>
              <span className="mx-auto block h-7 w-7 rounded-full"
                    style={{ background: w.hex }} aria-hidden="true" />
              <span className="block pt-1.5 text-center text-[11px] leading-tight">
                {w.label}
              </span>
            </Choice>
          ))}
        </div>

        <div className="pt-3">
          <Note>
            What you pick here stays in this browser. It reorders the rail and
            is never sent anywhere.
          </Note>
        </div>

        {/* Below this rule is a different purpose, and it is separated because
            bundling the two would make the consent meaningless. */}
        <hr className="mt-8 border-line" />

        <p className="eyebrow pt-6 pb-2">Keep in touch, if you want to</p>
        <p className="pb-3 text-[13px] leading-[1.5] text-mute">
          Entirely optional. Your measurements work exactly the same either way.
        </p>

        <input
          type="email" inputMode="email" autoComplete="email"
          placeholder="you@example.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-line bg-white px-4 py-3.5
                     text-[14.5px] text-ink placeholder:text-faint
                     focus:border-navy focus:outline-none"
        />

        <label className="flex cursor-pointer items-start gap-3 pt-3.5">
          <input type="checkbox" checked={marketing}
                 onChange={(e) => setMarketing(e.target.checked)}
                 className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-navy" />
          <span className="text-[12.5px] leading-[1.5] text-mute">
            Yes, write to me occasionally about new arrivals. I can stop this at
            any time, and my address is used for nothing else.
          </span>
        </label>

        <div className="pt-3.5">
          <Button variant="ghost" disabled={!email || !marketing || sending}
                  onClick={subscribe}>
            {sending ? "Sending…" : "Sign me up"}
          </Button>
        </div>
        {signup && (
          <p className="pt-2 text-center text-[12px] text-navy">{signup}</p>
        )}
      </Body>

      <Footer>
        <Button onClick={() => onDone({ fit, wash })}>Show me the jeans</Button>
        <div className="pt-2.5 text-center">
          <button type="button" onClick={onSkip}
                  className="text-[12.5px] text-navy underline underline-offset-4
                             hover:text-rust">
            Skip — just show me everything
          </button>
        </div>
      </Footer>
    </Screen>
  );
}
