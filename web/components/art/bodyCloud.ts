import type { Point3 } from "@/components/art/PointCloud";

/**
 * A stand-in body, as points on a surface.
 *
 * Built from arithmetic rather than a body mesh: a real one would mean
 * shipping model files whose licence this project deliberately avoided
 * needing, for a figure nobody measures anything against. It only has to
 * read as a person turning, in the same idiom as the customer's own scan.
 */

/** A horizontal slice: an ellipse of half-widths rx (across) and rz (front to
 *  back), centred at (x, y, z). A body is a stack of these. */
type Ring = { x: number; y: number; z: number; rx: number; rz: number };

const ring = (y: number, rx: number, rz: number, x = 0, z = 0): Ring =>
  ({ x, y, z, rx, rz });

/** Centimetres, the floor at y = 0, facing +z. About 172 cm tall. */
const HEAD = { x: 0, y: 162, z: 0.5, rx: 8.6, ry: 11.2, rz: 10 };

/** The sole and the hip line: where a leg starts and stops, named so that the
 *  legs-only cloud and the whole figure cannot drift apart. */
const SOLE = 1.5;
const HIP = 99;

const NECK: Ring[] = [ring(153, 5, 4.8), ring(145, 5.9, 5.6)];

const TORSO: Ring[] = [
  ring(150, 8.5, 7),      // where the neck leaves it
  ring(146, 18.5, 9.6),   // shoulders, sloped rather than cut flat
  ring(139, 17.6, 10.6),  // chest
  ring(130, 15.6, 10.4),
  ring(120, 13.4, 9.6),   // waist
  ring(110, 15, 10.6),
  ring(101, 16.4, 11.4),  // seat
  ring(97, 15.6, 11),
];

/** One arm, from shoulder to hand; side = 1 is the body's left. */
function arm(side: 1 | -1): Ring[] {
  return [
    ring(145, 6, 6, side * 18),
    ring(132, 5.2, 5.4, side * 21.4),
    ring(119, 4.6, 4.8, side * 23.6),    // elbow
    ring(104, 3.8, 4, side * 25.2),
    ring(96, 3.3, 3.5, side * 25.9),     // wrist
    ring(87, 3.4, 3.8, side * 26.2),     // hand
  ];
}

/** One leg, hip to ankle, and the foot under it — the part a scan is of. */
function leg(side: 1 | -1): Ring[][] {
  return [
    [
      ring(HIP, 9.8, 10.2, side * 8.6),
      ring(80, 8.4, 8.8, side * 8.4),
      ring(62, 6.6, 7, side * 8),
      ring(52, 5.6, 5.9, side * 7.8),    // knee
      ring(44, 6.3, 6.6, side * 7.6),    // calf
      ring(26, 4.6, 5, side * 7.3),
      ring(9, 3.6, 4, side * 7),         // ankle
    ],
    [
      ring(7, 3.7, 4.2, side * 7),
      ring(3, 4, 7, side * 7, 2.5),
      ring(SOLE, 3.6, 8.5, side * 7, 4), // toes
    ],
  ];
}

/** Points per square centimetre of skin. Dense enough that a limb reads as a
 *  limb, sparse enough that the sort stays cheap on a phone. */
const DENSITY = 0.27;

/** Deterministic, so the body is the same figure every time it is drawn. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points spread evenly over a tube, one to a cell of a jittered grid.
 *  Purely random placement leaves clumps and bald patches — which read as a
 *  bad render rather than as a body. */
function scatterTube(rings: Ring[], rand: () => number, out: Point3[],
                     thicken = 1) {
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const girth = (Math.PI * (a.rx + a.rz + b.rx + b.rz)) / 2;
    const n = Math.round(length * girth * DENSITY * thicken);
    if (n < 1) continue;
    const around = Math.max(6, Math.round(Math.sqrt((n * girth) / length)));
    const along = Math.max(1, Math.round(n / around));
    for (let row = 0; row < along; row++) {
      // Each ring starts its dots at a different angle, or the rows line up
      // into seams running down the limb.
      const phase = rand() * 2 * Math.PI;
      for (let col = 0; col < around; col++) {
        const t = (row + rand()) / along;
        const angle = phase + ((col + rand()) / around) * 2 * Math.PI;
        out.push([
          a.x + (b.x - a.x) * t + Math.cos(angle) * (a.rx + (b.rx - a.rx) * t),
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t + Math.sin(angle) * (a.rz + (b.rz - a.rz) * t),
        ]);
      }
    }
  }
}

function scatterHead(rand: () => number, out: Point3[]) {
  const { x, y, z, rx, ry, rz } = HEAD;
  const area = 4 * Math.PI * ((rx * ry + ry * rz + rz * rx) / 3);
  const n = Math.round(area * DENSITY);
  const rows = Math.max(4, Math.round(Math.sqrt(n / 2)));
  const cols = Math.max(6, Math.round(n / rows));
  for (let row = 0; row < rows; row++) {
    // Even in height, not in angle: that is what spreads points evenly over a
    // sphere rather than crowding them at the crown.
    const phase = rand() * 2 * Math.PI;
    for (let col = 0; col < cols; col++) {
      const up = ((row + rand()) / rows) * 2 - 1;
      const angle = phase + ((col + rand()) / cols) * 2 * Math.PI;
      const round = Math.sqrt(1 - up * up);
      out.push([
        x + rx * round * Math.cos(angle),
        y + ry * up,
        z + rz * round * Math.sin(angle),
      ]);
    }
  }
}

const built: { body?: Point3[]; legs?: Point3[] } = {};

/** The whole figure. Shown where a body is the subject — the brief before
 *  filming, where what is being explained is how a person should turn. */
export function mannequinCloud(): Point3[] {
  if (built.body) return built.body;
  const rand = seeded(0x5a12);
  const points: Point3[] = [];
  scatterHead(rand, points);
  scatterTube(NECK, rand, points);
  scatterTube(TORSO, rand, points);
  for (const side of [1, -1] as const) {
    scatterTube(arm(side), rand, points);
    for (const part of leg(side)) scatterTube(part, rand, points);
  }
  built.body = points;
  return points;
}

/** Legs and feet alone, denser, because when this is what is on the screen it
 *  is the whole subject rather than one part of a figure. */
export function legsCloud(): Point3[] {
  if (built.legs) return built.legs;
  const rand = seeded(0x2b77);
  const points: Point3[] = [];
  for (const side of [1, -1] as const) {
    for (const part of leg(side)) scatterTube(part, rand, points, 1.9);
  }
  built.legs = points;
  return points;
}
