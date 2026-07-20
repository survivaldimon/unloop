/**
 * Launch-offer pricing on the paywall. The real charge is REPORT_PRICE_USD (the
 * Polar product price); COMPARE_PRICE_USD is only the struck-through anchor.
 * The countdown is an evergreen per-visitor window in localStorage: it sticks at
 * 00:00 while the page is open and restarts on a later visit — the price itself
 * never changes.
 */
import { useEffect, useState } from "react";

export const COMPARE_PRICE_USD = 24.99;
export const OFFER_WINDOW_MS = 15 * 60 * 1000;

const DEADLINE_KEY = "unloop_offer_deadline_v1";

function readDeadline(): number {
  try {
    const raw = Number(localStorage.getItem(DEADLINE_KEY));
    if (Number.isFinite(raw) && raw > Date.now()) return raw;
  } catch {
    /* storage unavailable — hand out a fresh in-memory window */
  }
  const next = Date.now() + OFFER_WINDOW_MS;
  try {
    localStorage.setItem(DEADLINE_KEY, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** mm:ss until the visitor's offer window closes; sticks at 00:00 once it does. */
export function useOfferCountdown(): string {
  const [deadline] = useState(readDeadline);
  const [left, setLeft] = useState(() => deadline - Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(deadline - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadline]);
  const total = Math.max(0, Math.ceil(left / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
