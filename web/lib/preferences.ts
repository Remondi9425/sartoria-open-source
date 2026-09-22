/**
 * Taste, and what it is allowed to do.
 *
 * The size calculator answers "will these fit". This answers "would they want
 * these", which is a different question and a smaller one: it only ever
 * reorders jeans that already fit. It cannot promote a pair that does not, and
 * it cannot demote one out of sight — a customer who asked for a size gets the
 * sizes, in an order they are more likely to like.
 *
 * Real arithmetic, not a stub, and deliberately never an LLM: the same answer
 * every time, and every step of it explicable to the person it is about.
 *
 * This is not profiling in the sense the regulation worries about. Nothing is
 * inferred from behaviour, nothing is tracked across sites, and nothing is
 * decided about the customer — they state a preference and the shelf is
 * arranged to match. See PRIVACY.md.
 */
import type { Product } from "./engine/types";

export type Fit = Product["fit"];

/** How close each cut sits, from nearest the leg to furthest.
 *
 *  Ordered rather than merely named, so a customer who asked for slim and is
 *  shown a straight leg is treated as closer than one shown relaxed. The scale
 *  is about proximity to the leg, which is what a taste in cut is about. */
const CLOSENESS: Record<Fit, number> = {
  slim: 0, tapered: 1, straight: 2, relaxed: 3,
};

export interface Taste {
  /** The cut they said they like. */
  fit?: Fit;
  /** The colour id they said they like, matching Product.colours[].id. */
  wash?: string;
  /** Whether the same cut should sit closer or easier than standard. */
  ease?: "close" | "standard" | "easy";
}

export const EMPTY_TASTE: Taste = {};

/** Nothing stated is not the same as no opinion — it means do not reorder. */
export function isEmpty(t: Taste): boolean {
  return !t.fit && !t.wash && (!t.ease || t.ease === "standard");
}

/**
 * How well one pair matches a stated taste, 0 to 1.
 *
 * Exported because a score a customer cannot see is a score nobody can argue
 * with, and the screen shows it as a reason rather than a number.
 */
export function tasteScore(product: Product, taste: Taste): number {
  const parts: number[] = [];

  if (taste.fit) {
    // Full marks for the cut they asked for, falling away with distance on the
    // closeness scale. Three steps apart — slim against relaxed — scores zero
    // rather than going negative, because a taste is a preference and not a
    // veto.
    const apart = Math.abs(CLOSENESS[product.fit] - CLOSENESS[taste.fit]);
    parts.push(Math.max(0, 1 - apart / 3));
  }

  if (taste.wash) {
    // Binary on purpose. A pair either comes in the colour or it does not, and
    // there is no meaningful distance between a light wash and a black one.
    parts.push(product.colours.some((c) => c.id === taste.wash) ? 1 : 0);
  }

  if (taste.ease && taste.ease !== "standard") {
    // Asking for it closer or easier shifts which cut counts as ideal by one
    // step, which is what "the same jeans but roomier" means on a rail.
    const wanted = taste.ease === "close" ? 0 : 3;
    const apart = Math.abs(CLOSENESS[product.fit] - wanted);
    parts.push(Math.max(0, 1 - apart / 3));
  }

  if (parts.length === 0) return 0;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * The same jeans, in the order this customer is more likely to want them.
 *
 * Stable: equal scores keep the order they came in, so the catalogue's own
 * ordering shows through rather than being shuffled by a sort that felt free
 * to reorder ties.
 */
export function rankByTaste<T extends Product>(products: T[], taste: Taste): T[] {
  if (isEmpty(taste)) return [...products];
  return products
    .map((p, i) => ({ p, i, score: tasteScore(p, taste) }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((x) => x.p);
}

/** Why this pair came first, in words the customer can check against. */
export function reasonFor(product: Product, taste: Taste): string | null {
  const said: string[] = [];
  if (taste.fit && product.fit === taste.fit) said.push(`a ${taste.fit} cut`);
  if (taste.wash && product.colours.some((c) => c.id === taste.wash)) {
    const name = product.colours.find((c) => c.id === taste.wash)!.name;
    said.push(name.toLowerCase());
  }
  if (said.length === 0) return null;
  return `You said you like ${said.join(" and ")}.`;
}
