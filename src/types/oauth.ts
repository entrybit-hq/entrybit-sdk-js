import type { components } from "../generated/schema.js";

// Schema-derived types (generated from spec/openapi.json — do not hand-edit).
export type TokenResponse = components["schemas"]["TokenResponse"];
export type IntrospectionResponse = components["schemas"]["IntrospectionResponse"];
export type UserInfo = components["schemas"]["UserInfo"];

export interface ExchangeCodeParams {
  /** The one-time authorization code from the redirect (60 s TTL, single use). */
  code: string;
  /** Must equal the authorize request's `redirect_uri` byte-for-byte. */
  redirectUri: string;
  /** The PKCE verifier whose S256 hash was sent to `/authorize`. */
  codeVerifier: string;
  clientId: string;
  /** Confidential clients only. */
  clientSecret?: string | undefined;
}

export interface RefreshTokenParams {
  /** The CURRENT refresh token (they rotate on every use — always persist the newest). */
  refreshToken: string;
  clientId: string;
  /** Confidential clients only. */
  clientSecret?: string | undefined;
  /** Optional narrowing of the granted scope (never widening). */
  scope?: string | undefined;
}

export interface RevokeTokenParams {
  /** The access or refresh token to revoke. */
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token" | undefined;
  clientId: string;
  clientSecret?: string | undefined;
}

export interface IntrospectTokenParams {
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token" | undefined;
  clientId: string;
  clientSecret: string;
}
