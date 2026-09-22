/**
 * The target the customer walks back into.
 *
 * Drawn over the *picture*, not over the screen: the SVG fits its viewBox the
 * way `object-contain` fits the video, so both land on the same rectangle and
 * a guide that says "your feet here" means it. Give it the aspect ratio the
 * camera actually returned and the two stay locked together.
 *
 * The body stands 80 units tall in a frame of 100 — a tenth of the picture
 * left above the head and below the feet, which is the palm of margin the
 * protocol asks for and the scale depends on.
 */
export function FramingGuide({ ratio, className = "" }: {
  ratio: number;
  className?: string;
}) {
  const w = 100 * ratio;
  return (
    <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="xMidYMid meet"
         className={className} aria-hidden="true">
      <g transform={`translate(${w / 2 - 16} 10) scale(0.2)`}
         fill="none" stroke="currentColor" strokeWidth="3"
         strokeDasharray="13 11" strokeLinejoin="round" strokeLinecap="round">
        <circle cx="80" cy="44" r="27" />
        <path d="M 80 78
                 C 104 78, 116 92, 118 116
                 L 122 196 C 123 206, 116 210, 112 200
                 L 104 150 L 104 214
                 C 104 224, 101 236, 99 252
                 L 94 372 C 93 382, 79 382, 78 372
                 L 74 262 L 70 372 C 69 382, 55 382, 54 372
                 L 49 252 C 47 236, 44 224, 44 214
                 L 44 150 L 36 200 C 32 210, 25 206, 26 196
                 L 30 116 C 32 92, 56 78, 80 78 Z" />
      </g>
    </svg>
  );
}
