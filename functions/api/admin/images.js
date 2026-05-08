import { IMAGES_PATH, githubContentsQuery, githubFetch, jsonResponse, requireAdmin } from "../../../lib/admin-auth.mjs";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const res = await githubFetch(auth.session.githubToken, githubContentsQuery(IMAGES_PATH));
  if (!res.ok) {
    return jsonResponse({ success: false, error: "Unable to list images." }, { status: res.status, headers: auth.headers });
  }

  const data = await res.json();
  const files = Array.isArray(data)
    ? data
        .filter((file) => file.type === "file")
        .map((file) => ({
          name: file.name,
          path: file.path,
          sha: file.sha,
          size: file.size,
          type: file.type,
        }))
    : [];

  return jsonResponse({ files }, { headers: auth.headers });
}
