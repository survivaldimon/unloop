/**
 * Payment provider dispatcher, behind VITE_PAYMENTS_ENABLED.
 * VITE_PAYMENTS_PROVIDER selects the implementation: "polar" | "paddle" (default).
 * When the flag is off (or the provider is missing config) the app falls back
 * to the free test-mode unlock button.
 */
import { paddleProvider } from "./paddle";
import { polarProvider } from "./polar";
import type { CheckoutOptions } from "./types";

export type { CheckoutOptions } from "./types";

const enabled = import.meta.env.VITE_PAYMENTS_ENABLED === "true";

const provider =
  (import.meta.env.VITE_PAYMENTS_PROVIDER as string | undefined) === "polar"
    ? polarProvider
    : paddleProvider;

export const paymentsEnabled: boolean = enabled && provider.configured;

/** Provider name for UI copy ("secure checkout by …"). */
export const paymentsProviderName: string = provider.name;

if (enabled && !provider.configured) {
  console.warn(
    `VITE_PAYMENTS_ENABLED is true but ${provider.name} env config is incomplete — falling back to test unlock`,
  );
}

export async function openCheckout(opts: CheckoutOptions): Promise<void> {
  if (!paymentsEnabled) throw new Error("payments disabled");
  return provider.openCheckout(opts);
}
