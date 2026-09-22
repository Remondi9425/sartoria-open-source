/** Where each number came from. The callouts point at the body, not at a table,
 *  because "82 cm" means nothing until you can see where it was taken. */
import type { DigitalTwin } from "@/lib/engine/types";

// cx matters: below the crotch the ellipse has to sit on a leg, not on the gap
// between them, or it reads as measuring thin air.
const CALLOUTS = [
  { site: "waist" as const, y: 52, cx: 170, rx: 42, ry: 9, label: "WAIST" },
  { site: "hip" as const, y: 92, cx: 170, rx: 48, ry: 10, label: "HIP" },
  { site: "thigh" as const, y: 152, cx: 139, rx: 31, ry: 8, label: "THIGH", left: true },
];

export function LegDiagram({ twin }: { twin: DigitalTwin }) {
  const m = twin.measurements_cm;
  return (
    <svg viewBox="0 0 340 420" className="w-full" role="img"
         aria-label="Where each measurement was taken on the body">
      {/* the lower body, pale, as a ground for the callouts */}
      <path
        d="M 108 34 L 232 34 L 236 92
           C 240 150, 232 240, 226 392 L 190 392
           C 186 300, 180 206, 172 138
           C 164 206, 158 300, 154 392 L 118 392
           C 112 240, 100 150, 104 92 Z"
        fill="#e4e0d8" />

      {/* inseam, measured from the crotch down */}
      <path d="M 170 138 L 170 392" stroke="#c4562f" strokeWidth="1.6"
            strokeDasharray="5 4" fill="none" />

      {CALLOUTS.map(({ site, y, cx, rx, ry, label, left }) => (
        <g key={site}>
          <ellipse cx={cx} cy={y + 40} rx={rx} ry={ry}
                   fill="none" stroke="#223a5e" strokeWidth="1.6" />
          <line x1={left ? cx - rx : cx + rx} y1={y + 40}
                x2={left ? 96 : 268} y2={y + 40}
                stroke="#b9b4a9" strokeWidth="1" />
          <text x={left ? 92 : 272} y={y + 36} textAnchor={left ? "end" : "start"}
                className="figure" fontSize="19" fontWeight="600" fill="#1a1c2e">
            {m[site]}
            <tspan fontSize="10" fill="#6e7489" dx="3">cm</tspan>
          </text>
          <text x={left ? 92 : 272} y={y + 50} textAnchor={left ? "end" : "start"}
                className="eyebrow" fontSize="9" fill="#9aa0b2"
                letterSpacing="1.6">{label}</text>
        </g>
      ))}

      {/* inseam sits at the bottom, where the dashed line ends */}
      <line x1="170" y1="392" x2="268" y2="392" stroke="#b9b4a9" strokeWidth="1" />
      <text x="272" y="388" className="figure" fontSize="19" fontWeight="600" fill="#1a1c2e">
        {m.inseam}<tspan fontSize="10" fill="#6e7489" dx="3">cm</tspan>
      </text>
      <text x="272" y="402" className="eyebrow" fontSize="9" fill="#9aa0b2"
            letterSpacing="1.6">INSEAM</text>
    </svg>
  );
}
