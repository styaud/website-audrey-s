import { clearSessionCookie, jsonResponse, requireAdmin } from "../../../lib/admin-auth.mjs";

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, { csrf: true });
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(context.request));

  if (!auth.ok && auth.response.status !== 401) return auth.response;
  return jsonResponse({ success: true }, { headers });
}
