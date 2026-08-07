export interface CheckoutOptions {
  sessionId: string;
  email?: string;
  lang: "en" | "ru";
  /**
   * Checkout-session edge function to call. Defaults to the quiz's
   * unloop-polar-checkout; the photo funnel passes photoread-polar-checkout
   * (different Polar product, metadata.kind="photoread" webhook routing);
   * the credit economy passes credits-polar-checkout with packId + funnel.
   */
  endpoint?: string;
  /** Credit pack to buy (credits-polar-checkout only). */
  packId?: string;
  /** Looplore+ plan to subscribe to (subscription-polar-checkout only). */
  plan?: "monthly" | "yearly";
  /** Funnel the purchase belongs to (credits/subscription checkouts). */
  funnel?: "quiz" | "photoread" | "tests";
  /**
   * Fires when the provider reports a successful payment client-side.
   * Payment is only *trusted* once the webhook sets paid_at in Supabase —
   * callers poll the paid status after this fires.
   */
  onPaid: () => void;
  /**
   * Fires when the checkout UI closes without a success signal. The buyer may
   * still have paid (lost postMessage, portal navigation) — callers should
   * silently re-check the paid status.
   */
  onClosed?: () => void;
  onError?: () => void;
}

export interface PaymentProvider {
  /** Human name shown under the unlock button ("Paddle", "Polar"). */
  name: string;
  /** True when the provider has all config it needs to open a checkout. */
  configured: boolean;
  openCheckout(opts: CheckoutOptions): Promise<void>;
  /**
   * Optional warm-up: fetch the provider's client code ahead of the first
   * click so opening the overlay doesn't pay the lazy-chunk cost on top of
   * the checkout-session round-trip. Fire-and-forget, must never throw.
   */
  preload?(): void;
}
