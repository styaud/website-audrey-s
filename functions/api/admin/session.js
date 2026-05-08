import { jsonResponse, requireAdmin } from "../../../lib/admin-auth.mjs";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) {
    return jsonResponse({ authenticated: false }, { status: 200, headers: auth.response.headers });
  }

  return jsonResponse(
    {
      authenticated: true,
      login: auth.session.login,
      permission: auth.session.permission,
      csrfToken: auth.session.csrf,
    },
    { headers: auth.headers },
  );
}
