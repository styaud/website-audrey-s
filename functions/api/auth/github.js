import { addSetCookies, createOauthChallenge, jsonResponse } from "../../../lib/admin-auth.mjs";

// Redirects the user to the GitHub OAuth authorization page.
export async function onRequestGet(context) {
  const { GITHUB_CLIENT_ID } = context.env;

  if (!GITHUB_CLIENT_ID) {
    return jsonResponse({ error: "GitHub OAuth not configured" }, { status: 500 });
  }

  const redirectUri = new URL("/api/auth/callback", context.request.url).toString();
  const scope = "public_repo";
  const challenge = await createOauthChallenge(context.request);

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", challenge.state);
  authUrl.searchParams.set("code_challenge", challenge.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const headers = addSetCookies(new Headers({ Location: authUrl.toString() }), challenge.cookies);
  return new Response(null, { status: 302, headers });
}
