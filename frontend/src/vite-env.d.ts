/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GOOGLE_AUTH_ENABLED?: string;
  /** Origin of the separate Admin Backend (defaults to http://localhost:4100 in dev). */
  readonly VITE_ADMIN_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.css";
