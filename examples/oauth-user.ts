/**
 * User-delegated example: exchange an OAuth authorization code, keep the
 * client authenticated via getAccessToken, and read the user's own data.
 *
 * See the OAuth guide at https://docs.entrybit.net for the authorize step
 * (authorization-code flow with PKCE) that produces the code and verifier.
 *
 * Run with:
 *   ENTRYBIT_CLIENT_ID=... ENTRYBIT_AUTH_CODE=... ENTRYBIT_PKCE_VERIFIER=... \
 *     npx tsx examples/oauth-user.ts
 */
import { EntryBit, type TokenResponse } from "@entrybit/sdk";

const code = process.env.ENTRYBIT_AUTH_CODE;
const verifier = process.env.ENTRYBIT_PKCE_VERIFIER;
if (!code || !verifier || !process.env.ENTRYBIT_CLIENT_ID) {
  console.error(
    "Usage: set ENTRYBIT_CLIENT_ID, ENTRYBIT_AUTH_CODE (from the redirect back to your app) and ENTRYBIT_PKCE_VERIFIER (the code_verifier you generated).",
  );
  process.exit(1);
}

// Token exchange needs no credential on the client itself.
const anonymous = new EntryBit({ apiKey: null });
let tokens: TokenResponse = await anonymous.oauth.exchangeCode({
  code,
  redirectUri: "https://app.example.com/callback",
  codeVerifier: verifier,
  clientId: process.env.ENTRYBIT_CLIENT_ID,
});

// Authenticated client that always uses the freshest access token; refresh
// when the old one is about to expire (refresh tokens rotate on every use).
let expiresAt = Date.now() + tokens.expires_in * 1000;
const entrybit = new EntryBit({
  getAccessToken: async () => {
    if (Date.now() > expiresAt - 30_000 && tokens.refresh_token) {
      tokens = await anonymous.oauth.refresh({
        refreshToken: tokens.refresh_token,
        clientId: process.env.ENTRYBIT_CLIENT_ID!,
      });
      expiresAt = Date.now() + tokens.expires_in * 1000;
    }
    return tokens.access_token;
  },
});

const me = await entrybit.me.get();
console.log("Signed in as", me);

for await (const pass of entrybit.passes.iterate()) {
  console.log(pass.public_id, pass.status);
}
