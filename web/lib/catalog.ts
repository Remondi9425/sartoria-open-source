/**
 * The catalogue.
 *
 * Every brand here is invented — Marea, Fosco, Vela, Nebbia do not exist. Using
 * a real denim label's name, charts and prices in a demo would misrepresent a
 * real company, so the whole catalogue is fictional and says so.
 *
 * The size charts are realistic in shape, not copied from anyone. When the
 * Catalog Ingestor is real it will replace this file wholesale.
 */
import type { Product, SizeChart } from "./engine/types";

/** A body chart: the sizes list the body they are meant to fit. */
function bodyChart(start: number, inseam: number): SizeChart {
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const w = start + i * 4;              // waist band, cm
    rows.push({
      label: `W${28 + i} L32`,
      waist_cm: [w, w + 4] as [number, number],
      hip_cm: [w + 16, w + 20] as [number, number],
      inseam_cm: inseam,
    });
  }
  return { kind: "body", ease_cm: { waist: 0, hip: 0 }, rows };
}

/** A flat chart: the sizes list the garment measured flat, so ease matters. */
function flatChart(start: number, inseam: number): SizeChart {
  const c = bodyChart(start + 2, inseam);
  return {
    kind: "flat",
    ease_cm: { waist: -2, hip: -3 },
    rows: c.rows,
  };
}

const INDIGO = { id: "mid", name: "Mid indigo", hex: "#5B86C4", denim: "#5B86C4" };
const LIGHT = { id: "light", name: "Light wash", hex: "#A8C4E4", denim: "#A8C4E4" };
const DARK = { id: "dark", name: "Dark rinse", hex: "#25365C", denim: "#25365C" };
const BLACK = { id: "black", name: "Washed black", hex: "#23262E", denim: "#23262E" };

export const PRODUCTS: Product[] = [
  {
    id: "marea-slim-tapered",
    brand: "Marea Denim", name: "Slim Tapered", fit: "tapered",
    price_eur: 129, composition: "98% cotton · 2% elastane",
    colours: [INDIGO, LIGHT, DARK, BLACK],
    chart: bodyChart(68, 82),
  },
  {
    id: "fosco-regular-straight",
    brand: "Fosco", name: "Regular Straight", fit: "straight",
    price_eur: 119, composition: "100% cotton",
    colours: [LIGHT, INDIGO, DARK],
    chart: flatChart(70, 81),
  },
  {
    id: "marea-relaxed-carpenter",
    brand: "Marea Denim", name: "Relaxed Carpenter", fit: "relaxed",
    price_eur: 139, composition: "100% cotton",
    colours: [DARK, INDIGO],
    chart: bodyChart(68, 80),
  },
  {
    id: "vela-tapered-crop",
    brand: "Vela", name: "Tapered Crop", fit: "tapered",
    price_eur: 109, composition: "97% cotton · 3% elastane",
    colours: [BLACK, INDIGO, LIGHT],
    chart: bodyChart(71, 76),
  },
  {
    id: "nebbia-slim-stretch",
    brand: "Nebbia", name: "Slim Stretch", fit: "slim",
    price_eur: 99, composition: "94% cotton · 5% polyester · 1% elastane",
    colours: [INDIGO, DARK],
    chart: flatChart(71, 83),
  },
  {
    id: "fosco-loose-taper",
    brand: "Fosco", name: "Loose Taper", fit: "relaxed",
    price_eur: 129, composition: "100% cotton",
    colours: [LIGHT, BLACK],
    chart: bodyChart(69, 79),
  },
  {
    id: "vela-straight-rigid",
    brand: "Vela", name: "Straight Rigid", fit: "straight",
    price_eur: 149, composition: "100% cotton, unwashed",
    colours: [DARK, INDIGO],
    chart: bodyChart(72, 84),
  },
  {
    id: "nebbia-easy-straight",
    brand: "Nebbia", name: "Easy Straight", fit: "straight",
    price_eur: 89, composition: "99% cotton · 1% elastane",
    colours: [INDIGO, LIGHT, BLACK],
    chart: flatChart(69, 80),
  },
];

export const BRANDS = [...new Set(PRODUCTS.map((p) => p.brand))];

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
