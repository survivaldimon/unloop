export interface CheckoutOptions {
  sessionId: string;
  email?: string;
  lang: "en" | "ru";
  /**
   * Fires when the provider reports a successful payment client-side.
   * Payment is only *trusted* once the webhook sets paid_at in Supabase —
   * callers poll the paid status after this fires.
   */
  onPaid: () => void;
  onError?: () => void;
}

export interface PaymentProvider {
  /** Human name shown under the unlock button ("Paddle", "Polar"). */
  name: string;
  /** True when the provider has all config it needs to open a checkout. */
  configured: boolean;
  openCheckout(opts: CheckoutOptions): Promise<void>;
}
