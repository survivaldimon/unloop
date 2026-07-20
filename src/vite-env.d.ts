/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "true" enables the paid checkout; anything else keeps the free test unlock */
  readonly VITE_PAYMENTS_ENABLED?: string;
  /** "polar" | "paddle" (default) */
  readonly VITE_PAYMENTS_PROVIDER?: string;
  /** "sandbox" (default) or "production" */
  readonly VITE_PADDLE_ENV?: string;
  /** Paddle client-side token: test_… for sandbox, live_… for production */
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
  /** Paddle price id (pri_…) of the Looplore Full Report one-time price */
  readonly VITE_PADDLE_PRICE_ID?: string;
  /** PostHog project API key (phc_…); absent = analytics is a no-op */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog API host; defaults to the EU cloud */
  readonly VITE_POSTHOG_HOST?: string;
  /** Meta (Facebook) Pixel id; absent = pixel is a no-op */
  readonly VITE_META_PIXEL_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
