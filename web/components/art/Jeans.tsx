/** A flat-lay pair of jeans, drawn rather than photographed — a stock photo of
 *  a real brand's product would be exactly the misrepresentation we avoid. */
import type { Product } from "@/lib/engine/types";

const HEM: Record<Product["fit"], number> = {
  slim: 9, tapered: 8, straight: 13, relaxed: 16,
};

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(c + amount))));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function Jeans({
  denim, fit = "straight", className = "",
}: { denim: string; fit?: Product["fit"]; className?: string }) {
  const h = HEM[fit];
  const band = shade(denim, -22);
  const stitch = shade(denim, 78);
  const seam = shade(denim, -34);

  // Hem corners move with the cut; everything above the knee stays put.
  const rOut = 98 + (h - 13) * 0.9, rIn = 74 - (h - 13) * 0.9;
  const lIn = 46 + (h - 13) * 0.9, lOut = 22 - (h - 13) * 0.9;

  return (
    <svg viewBox="0 0 120 180" className={className} role="img"
         aria-label={`${fit} jeans, ${denim}`}>
      <path
        d={`M 11 20 L 109 20 L 110 42
            C 112 74, 104 124, ${rOut} 172 L ${rIn} 172
            C ${rIn - 4} 132, 64 102, 60 76
            C 56 102, ${lIn + 4} 132, ${lIn} 172 L ${lOut} 172
            C 16 124, 8 74, 10 42 Z`}
        fill={denim} />

      {/* waistband and loops */}
      <path d="M 11 20 L 109 20 L 109.4 33 L 10.6 33 Z" fill={band} />
      {[24, 58, 92].map((x) => (
        <rect key={x} x={x} y={19} width={3.4} height={15} rx={1} fill={seam} opacity={0.55} />
      ))}

      {/* fly, seams, pockets — the details that read as denim at a glance */}
      <g fill="none" stroke={stitch} strokeWidth={1.1} strokeDasharray="3 2.6"
         strokeLinecap="round" opacity={0.85}>
        <path d="M 60 34 C 60 46, 56 56, 55 68" />
        <path d="M 60 34 L 60 76" strokeDasharray="0" opacity={0.35} />
        <path d="M 16 36 C 26 44, 34 46, 41 44" />
        <path d="M 104 36 C 94 44, 86 46, 79 44" />
        <path d={`M ${rOut - 1} 170 L ${rIn + 1} 170`} />
        <path d={`M ${lIn - 1} 170 L ${lOut + 1} 170`} />
      </g>

      {/* back pockets hinted through, as on a flat lay */}
      <g fill="none" stroke={seam} strokeWidth={1} opacity={0.28}>
        <path d="M 22 46 h 20 v 14 l -10 6 l -10 -6 Z" />
        <path d="M 78 46 h 20 v 14 l -10 6 l -10 -6 Z" />
      </g>
    </svg>
  );
}
