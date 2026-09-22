"use client";

import type { ReactNode } from "react";

export function Screen({
  children, dark = false, className = "",
}: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <div className={`flex h-full flex-col ${dark ? "bg-navy-deep text-white" : "bg-card"} ${className}`}>
      {children}
    </div>
  );
}

export function Body({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto px-7 ${className}`}>{children}</div>;
}

export function Footer({ children }: { children: ReactNode }) {
  return <div className="shrink-0 px-7 pb-7 pt-3">{children}</div>;
}

export function Button({
  children, onClick, variant = "primary", disabled,
}: {
  children: ReactNode; onClick?: () => void;
  variant?: "primary" | "ghost"; disabled?: boolean;
}) {
  const base =
    "w-full rounded-full py-4 text-[15px] font-semibold transition " +
    "disabled:cursor-not-allowed disabled:opacity-40";
  const look = variant === "primary"
    ? "bg-navy text-white hover:bg-navy-soft active:scale-[.99]"
    : "text-navy underline underline-offset-4 hover:text-rust";
  return (
    <button type="button" onClick={onClick} disabled={disabled}
            className={`${base} ${look}`}>
      {children}
    </button>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow pt-6 pb-3">{children}</p>;
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[27px] leading-[1.18] font-bold tracking-[-.015em] text-ink">
      {children}
    </h1>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-[1.5] text-faint">{children}</p>;
}

/** Says out loud that the numbers are invented. It should be impossible to
 *  mistake this demo for a working measurement. */
export function StubBadge() {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-amber/15 px-2.5 py-1
                    text-[9.5px] font-semibold tracking-[.12em] text-amber uppercase">
      <span className="h-1.5 w-1.5 rounded-full bg-amber" />
      demo · numbers not measured
    </div>
  );
}

export function euro(n: number) {
  return `€${n}`;
}

/**
 * What happens to the recording, before it is made.
 *
 * A notice and not a tick. The measurement is the thing the customer asked
 * for, so the basis for processing it is the request itself, not consent —
 * and a consent box you cannot proceed without is not freely given anyway.
 * Consent is kept for the one purpose that genuinely needs it, which is
 * writing to somebody afterwards.
 *
 * Short by default because a notice nobody reads protects nobody, and the
 * three facts that actually matter fit in a sentence: not kept, not shown to
 * anyone, measured and discarded.
 */
export function PrivacyNote({ detail }: { detail?: boolean }) {
  return (
    <details className="group pt-3" open={detail}>
      <summary className="cursor-pointer list-none text-[11.5px] leading-[1.5] text-faint
                          hover:text-navy">
        Your video is measured and discarded. We never store it.
        <span className="pl-1 underline underline-offset-2 group-open:hidden">
          What that means
        </span>
      </summary>
      <div className="space-y-2 pt-2.5 text-[11.5px] leading-[1.55] text-faint">
        <p>
          The recording is sent to be measured, turned into nine numbers, and
          deleted as soon as that finishes. It is not saved, not attached to
          your name, and nobody looks at it.
        </p>
        <p>
          The measuring runs on servers in Europe. Because the file is larger
          than the platform keeps in one place, it passes through storage in
          the United States on the way, under that provider&apos;s standard
          data protection clauses.
        </p>
        <p>
          The only thing you type is your height, and it is used to turn the
          picture into centimetres. We ask for nothing else, and we keep
          nothing after you close this.
        </p>
      </div>
    </details>
  );
}
