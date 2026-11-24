import {
  addSetCookies,
  createOauthChallenge,
  createSession,
  createSessionCookie,
  getGithubUser,
  jsonResponse,
  verifyRepoWriteAccess,
} from "../../../lib/admin-auth.mjs";

// TEMPORARY LOCAL ADMIN LOGIN — revert the commit "TEMP: local admin login" to remove.
// On localhost only, when .dev.vars sets ADMIN_DEV_GITHUB_TOKEN, skip the GitHub OAuth
// redirect and create the admin session from that token. The repository write
// permission check, the sealed HttpOnly session, and the CSRF checks stay the same.
async function devLogin(context, token) {
  const fail = (code) => new Response(null, { status: 302, headers: { Location: `/admin/?error=${code}` } });
  try {
    const user = await getGithubUser(token);
    const permission = await verifyRepoWriteAccess(token, user.login);
    if (!permission.ok) return fail("repo_permission");
    const sessionCookie = await createSessionCookie(
      context.env,
      context.request,
      createSession(user.login, token, permission.permission),
    );
    return new Response(null, { status: 302, headers: { Location: "/admin/", "Set-Cookie": sessionCookie } });
  } catch (e) {
    console.error("Local admin login failed:", e);
    return fail("dev_login");
  }
}

// Redirects the user to the GitHub OAuth authorization page.
export async function onRequestGet(context) {
  const { GITHUB_CLIENT_ID, ADMIN_DEV_GITHUB_TOKEN } = context.env;
  const { hostname } = new URL(context.request.url);
  if (ADMIN_DEV_GITHUB_TOKEN && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return devLogin(context, ADMIN_DEV_GITHUB_TOKEN);
  }

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
