/**
 * Polar.sh overlay checkout. The checkout session is created server-side by the
 * unloop-polar-checkout edge function (it holds the org access token and stamps
 * metadata.session_id), then opened in an embedded overlay via @polar-sh/checkout.
 */
import { supabase } from "../supabase";
import type { CheckoutOptions, PaymentProvider } from "./types";

async function openCheckout(opts: CheckoutOptions): Promise<void> {
  if (!supabase) throw new Error("supabase not configured");

  const { data, error } = await supabase.functions.invoke("unloop-polar-checkout", {
    body: {
      session_id: opts.sessionId,
      email: opts.email ?? null,
      lang: opts.lang,
    },
  });
  if (error || typeof data?.url !== "string") {
    throw new Error("polar checkout session failed");
  }

  // Lazy chunk: the embed code is only fetched when a checkout actually opens.
  const { PolarEmbedCheckout } = await import("@polar-sh/checkout/embed");
  const checkout = await PolarEmbedCheckout.create(data.url, { theme: "dark" });

  let succeeded = false;
  checkout.addEventListener("success", () => {
    succeeded = true;
    opts.onPaid();
  });
  checkout.addEventListener("close", () => {
    // Closing without success is a normal abandon, not an error.
    if (!succeeded) return;
  });
}

export const polarProvider: PaymentProvider = {
  name: "Polar",
  // All Polar config lives server-side; the client only needs Supabase.
  configured: !!supabase,
  openCheckout,
};
