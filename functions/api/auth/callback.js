import {
  addSetCookies,
  clearOauthCookies,
  createSession,
  createSessionCookie,
  getGithubUser,
  htmlResponse,
  readOauthChallenge,
  verifyRepoWriteAccess,
} from "../../../lib/admin-auth.mjs";

function isMissingSessionSecret(error) {
  return error instanceof Error && error.message.includes("ADMIN_SESSION_SECRET");
}

function logCallbackError(step, error) {
  console.error(`GitHub OAuth callback failed during ${step}:`, error);
}

function adminError(request, code) {
  const headers = addSetCookies(new Headers({ Location: `/admin/?error=${encodeURIComponent(code)}` }), [
    ...clearOauthCookies(request),
  ]);
  return new Response(null, { status: 302, headers });
}

function adminSuccess(request, sessionCookie) {
  const headers = addSetCookies(new Headers(), [...clearOauthCookies(request), sessionCookie]);
  return htmlResponse(
    `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=/admin/">
  <title>Connexion...</title>
</head>
<body>
  <p>Connexion réussie. <a href="/admin/">Continuer vers l'administration</a>.</p>
</body>
</html>`,
    { status: 200, headers },
  );
}

// Handles the GitHub OAuth callback and creates a server-only admin session.
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state") || "";
  const saved = readOauthChallenge(context.request);

  if (!code || !returnedState || !saved.state || returnedState !== saved.state || !saved.verifier) {
    return adminError(context.request, "oauth_state");
  }

  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = context.env;
  const redirectUri = new URL("/api/auth/callback", context.request.url).toString();

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return adminError(context.request, "oauth_config");
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: saved.verifier,
    }),
  });

  let tokenData;
  try {
    tokenData = await tokenResponse.json();
  } catch {
    return adminError(context.request, "oauth_token");
  }

  if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
    return adminError(context.request, "oauth_token");
  }

  const accessToken = tokenData.access_token;

  let user;
  try {
    user = await getGithubUser(accessToken);
  } catch (e) {
    logCallbackError("user lookup", e);
    return adminError(context.request, "github_user");
  }

  let permission;
  try {
    permission = await verifyRepoWriteAccess(accessToken, user.login);
  } catch (e) {
    logCallbackError("permission lookup", e);
    return adminError(context.request, "repo_check");
  }
  if (!permission.ok) {
    console.error("GitHub repository permission denied:", {
      login: user.login,
      status: permission.status,
      error: permission.error,
    });
    return adminError(context.request, permission.status === 403 ? "repo_permission" : "repo_check");
  }

  try {
    const sessionCookie = await createSessionCookie(
      context.env,
      context.request,
      createSession(user.login, accessToken, permission.permission),
    );
    return adminSuccess(context.request, sessionCookie);
  } catch (e) {
    logCallbackError("session creation", e);
    if (isMissingSessionSecret(e)) return adminError(context.request, "session_config");
    return adminError(context.request, "session_create");
  }
}
