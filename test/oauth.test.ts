import { describe, expect, it } from "vitest";
import { EntryBit } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const TOKENS = {
  access_token: "at",
  token_type: "Bearer",
  expires_in: 900,
  scope: "openid passes:read",
};

describe("oauth namespace", () => {
  it("exchanges an authorization code with a form-encoded body and no credential header", async () => {
    const { fn, requests } = mockFetch({ body: TOKENS });
    // Even a fully unauthenticated client can run the code exchange.
    const eb = new EntryBit({ apiKey: null, fetch: fn });
    const tokens = await eb.oauth.exchangeCode({
      code: "auth-code",
      redirectUri: "https://app.example.com/cb",
      codeVerifier: "v".repeat(43),
      clientId: "client-1",
    });
    expect(tokens.access_token).toBe("at");
    const req = requests[0]!;
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/api/oauth/token");
    expect(req.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(req.headers["authorization"]).toBeUndefined();
    const form = new URLSearchParams(req.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("redirect_uri")).toBe("https://app.example.com/cb");
    expect(form.get("client_id")).toBe("client-1");
    expect(form.has("client_secret")).toBe(false); // omitted, not sent empty
  });

  it("does not attach the client credential to token requests even on an authenticated client", async () => {
    const { fn, requests } = mockFetch({ body: TOKENS });
    const eb = new EntryBit({ accessToken: "existing-token", fetch: fn });
    await eb.oauth.refresh({ refreshToken: "rt-1", clientId: "client-1" });
    const req = requests[0]!;
    expect(req.headers["authorization"]).toBeUndefined();
    const form = new URLSearchParams(req.body);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("rt-1");
  });

  it("revokes a token and resolves void", async () => {
    const { fn, requests } = mockFetch({ body: {} });
    const eb = new EntryBit({ apiKey: null, fetch: fn });
    await expect(
      eb.oauth.revoke({ token: "rt-1", tokenTypeHint: "refresh_token", clientId: "client-1" }),
    ).resolves.toBeUndefined();
    const form = new URLSearchParams(requests[0]!.body);
    expect(form.get("token")).toBe("rt-1");
    expect(form.get("token_type_hint")).toBe("refresh_token");
  });

  it("introspects a token with client credentials in the body", async () => {
    const { fn, requests } = mockFetch({ body: { active: true, scope: "passes:read" } });
    const eb = new EntryBit({ apiKey: null, fetch: fn });
    const result = await eb.oauth.introspect({
      token: "at-1",
      clientId: "client-1",
      clientSecret: "secret",
    });
    expect(result.active).toBe(true);
    const form = new URLSearchParams(requests[0]!.body);
    expect(form.get("token")).toBe("at-1");
    expect(form.get("client_secret")).toBe("secret");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/oauth/introspect");
  });

  it("sends the client's access token on userinfo", async () => {
    const { fn, requests } = mockFetch({ body: { sub: "user-1", email: "d@example.com" } });
    const eb = new EntryBit({ accessToken: "at-1", fetch: fn });
    const info = await eb.oauth.userinfo();
    expect(info.sub).toBe("user-1");
    expect(requests[0]!.headers["authorization"]).toBe("Bearer at-1");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/oauth/userinfo");
  });
});
