/** Paddle Billing overlay checkout (Paddle.js v2). */
import type { CheckoutOptions, PaymentProvider } from "./types";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: "sandbox" | "production") => void };
      Initialize: (opts: {
        token: string;
        eventCallback?: (event: { name?: string; data?: unknown }) => void;
      }) => void;
      Checkout: {
        open: (opts: Record<string, unknown>) => void;
        close: () => void;
      };
    };
  }
}

const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const priceId = import.meta.env.VITE_PADDLE_PRICE_ID as string | undefined;
const paddleEnv =
  (import.meta.env.VITE_PADDLE_ENV as string | undefined) === "production"
    ? "production"
    : "sandbox";

let scriptPromise: Promise<void> | null = null;
let initialized = false;
let onCompleted: (() => void) | null = null;
let onFailed: (() => void) | null = null;

function loadScript(): Promise<void> {
  if (window.Paddle) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null;
        reject(new Error("paddle.js failed to load"));
      };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

async function openCheckout(opts: CheckoutOptions): Promise<void> {
  if (!token || !priceId) throw new Error("paddle not configured");
  await loadScript();
  const paddle = window.Paddle;
  if (!paddle) throw new Error("paddle.js unavailable");

  onCompleted = opts.onPaid;
  onFailed = opts.onError ?? null;
  if (!initialized) {
    if (paddleEnv === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({
      token,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") {
          // Give Paddle's success screen a beat, then hand back to the app.
          setTimeout(() => {
            try {
              window.Paddle?.Checkout.close();
            } catch {
              // overlay may already be closed by the user
            }
          }, 1500);
          onCompleted?.();
        } else if (event.name === "checkout.error") {
          onFailed?.();
        }
      },
    });
    initialized = true;
  }

  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { session_id: opts.sessionId },
    ...(opts.email ? { customer: { email: opts.email } } : {}),
    settings: {
      displayMode: "overlay",
      theme: "dark",
      locale: opts.lang,
      showAddDiscounts: false,
    },
  });
}

export const paddleProvider: PaymentProvider = {
  name: "Paddle",
  configured: !!token && !!priceId,
  openCheckout,
};
