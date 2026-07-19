/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "true" enables the Paddle checkout; anything else keeps the free test unlock */
  readonly VITE_PAYMENTS_ENABLED?: string;
  /** "sandbox" (default) or "production" */
  readonly VITE_PADDLE_ENV?: string;
  /** Paddle client-side token: test_… for sandbox, live_… for production */
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
  /** Paddle price id (pri_…) of the Unloop Full Report one-time price */
  readonly VITE_PADDLE_PRICE_ID?: string;
  /** PostHog project API key (phc_…); absent = analytics is a no-op */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog API host; defaults to the EU cloud */
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
