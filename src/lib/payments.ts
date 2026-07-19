/**
 * Paddle Billing overlay checkout (Paddle.js v2), behind VITE_PAYMENTS_ENABLED.
 * When the flag is off (or config is incomplete) the app falls back to the
 * free test-mode unlock button.
 */

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

const enabled = import.meta.env.VITE_PAYMENTS_ENABLED === "true";
const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const priceId = import.meta.env.VITE_PADDLE_PRICE_ID as string | undefined;
const paddleEnv =
  (import.meta.env.VITE_PADDLE_ENV as string | undefined) === "production"
    ? "production"
    : "sandbox";

export const paymentsEnabled: boolean = enabled && !!token && !!priceId;

if (enabled && !paymentsEnabled) {
  console.warn(
    "VITE_PAYMENTS_ENABLED is true but VITE_PADDLE_CLIENT_TOKEN / VITE_PADDLE_PRICE_ID are missing — falling back to test unlock",
  );
}

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

/**
 * Opens the Paddle overlay checkout. `onPaid` fires on the checkout.completed
 * event — payment is only *trusted* once the webhook sets paid_at in Supabase,
 * so callers should poll the paid status after this fires.
 */
export async function openCheckout(opts: {
  sessionId: string;
  email?: string;
  lang: "en" | "ru";
  onPaid: () => void;
  onError?: () => void;
}): Promise<void> {
  if (!paymentsEnabled || !token || !priceId) throw new Error("payments disabled");
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
