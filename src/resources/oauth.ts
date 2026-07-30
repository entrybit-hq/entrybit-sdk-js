import type { HttpClient } from "../core/http.js";
import type {
  ExchangeCodeParams,
  IntrospectTokenParams,
  IntrospectionResponse,
  RefreshTokenParams,
  RevokeTokenParams,
  TokenResponse,
  UserInfo,
} from "../types/oauth.js";
import type { RequestOptions } from "../types/requests.js";

/**
 * The EntryBit OAuth2/OIDC endpoints (`/api/oauth/*`), for apps implementing
 * the authorization-code + PKCE flow themselves. The token, revoke and
 * introspect endpoints authenticate via their own body parameters, so they
 * work on any client — including an explicitly unauthenticated one
 * (`apiKey: null`). `userinfo()` is the exception: it authenticates with the
 * client's OAuth access token (`openid` scope). Token requests are never
 * auto-retried: authorization codes are single-use.
 */
export class OAuth {
  constructor(private readonly http: HttpClient) {}

  /** Exchanges an authorization code (+ PKCE verifier) for tokens. */
  exchangeCode(params: ExchangeCodeParams, options?: RequestOptions): Promise<TokenResponse> {
    return this.http.request<TokenResponse>({
      method: "POST",
      path: "/api/oauth/token",
      form: {
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
        client_id: params.clientId,
        client_secret: params.clientSecret,
      },
      unauthenticated: true,
      ...options,
    });
  }

  /** Redeems a refresh token; the refresh token rotates on every call. */
  refresh(params: RefreshTokenParams, options?: RequestOptions): Promise<TokenResponse> {
    return this.http.request<TokenResponse>({
      method: "POST",
      path: "/api/oauth/token",
      form: {
        grant_type: "refresh_token",
        refresh_token: params.refreshToken,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        scope: params.scope,
      },
      unauthenticated: true,
      ...options,
    });
  }

  /** Revokes an access or refresh token (RFC 7009; succeeds even for unknown tokens). */
  async revoke(params: RevokeTokenParams, options?: RequestOptions): Promise<void> {
    await this.http.request<unknown>({
      method: "POST",
      path: "/api/oauth/revoke",
      form: {
        token: params.token,
        token_type_hint: params.tokenTypeHint,
        client_id: params.clientId,
        client_secret: params.clientSecret,
      },
      unauthenticated: true,
      ...options,
    });
  }

  /** Introspects a token (RFC 7662; confidential clients only). */
  introspect(
    params: IntrospectTokenParams,
    options?: RequestOptions,
  ): Promise<IntrospectionResponse> {
    return this.http.request<IntrospectionResponse>({
      method: "POST",
      path: "/api/oauth/introspect",
      form: {
        token: params.token,
        token_type_hint: params.tokenTypeHint,
        client_id: params.clientId,
        client_secret: params.clientSecret,
      },
      unauthenticated: true,
      ...options,
    });
  }

  /** OIDC UserInfo for the client's access token (requires the `openid` scope). */
  userinfo(options?: RequestOptions): Promise<UserInfo> {
    return this.http.request<UserInfo>({
      method: "GET",
      path: "/api/oauth/userinfo",
      ...options,
    });
  }
}
