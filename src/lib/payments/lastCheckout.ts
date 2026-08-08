/**
 * The id of the checkout this browser most recently opened.
 *
 * It is the buyer's proof of purchase when they have no session yet: the funnel
 * no longer signs anyone in on an unverified email (docs/credits-economy.md §7),
 * so after paying, credits-auth trades this id for a session. Server-generated
 * and known only to the browser that opened the checkout, which is exactly what
 * makes it usable as proof.
 *
 * Module-level rather than threaded through onPaid because only one checkout
 * overlay can be open at a time, and every caller that needs it is downstream
 * of the one that set it. In memory only — a reload loses it, and the buyer
 * falls back to the magic link, same as before.
 */
let lastId: string | null = null;

export function setLastCheckoutId(id: string | null): void {
  lastId = id;
}

export function getLastCheckoutId(): string | null {
  return lastId;
}
