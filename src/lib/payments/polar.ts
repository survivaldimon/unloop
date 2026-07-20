/**
 * Polar.sh overlay checkout. The checkout session is created server-side by the
 * unloop-polar-checkout edge function (it holds the org access token and stamps
 * metadata.session_id), then opened in an embedded overlay via @polar-sh/checkout.
 */
import { supabase } from "../supabase";
import { getFbc, getFbp } from "../attribution";
import type { CheckoutOptions, PaymentProvider } from "./types";

async function openCheckout(opts: CheckoutOptions): Promise<void> {
  if (!supabase) throw new Error("supabase not configured");

  const { data, error } = await supabase.functions.invoke("unloop-polar-checkout", {
    body: {
      session_id: opts.sessionId,
      email: opts.email ?? null,
      lang: opts.lang,
      // Meta ad-click cookies ride along into order metadata so the webhook's
      // server-side Purchase event can be attributed to the ad click.
      fbp: getFbp(),
      fbc: getFbc(),
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
    // Close the overlay after a beat so the buyer lands on the unlocked report
    // instead of Polar's success screen (its "Access my purchases" CTA leads
    // to the customer portal, away from the app).
    setTimeout(() => {
      try {
        checkout.close();
      } catch {
        // overlay may already be closed by the user
      }
    }, 1500);
    opts.onPaid();
  });

  checkout.addEventListener("close", () => {
    // The buyer may have paid even if the success message never reached us
    // (e.g. the overlay navigated to the customer portal before closing).
    if (!succeeded) opts.onClosed?.();
  });
}

export const polarProvider: PaymentProvider = {
  name: "Polar",
  // All Polar config lives server-side; the client only needs Supabase.
  configured: !!supabase,
  openCheckout,
};
