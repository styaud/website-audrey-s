import {
  githubBranch,
  githubContentsQuery,
  githubContentsUrl,
  githubFetch,
  jsonResponse,
  requireAdmin,
  validateImageName,
  validateImageUpload,
} from "../../../lib/admin-auth.mjs";

export async function onRequestPut(context) {
  const auth = await requireAdmin(context, { csrf: true, freshPermission: true });
  if (!auth.ok) return auth.response;

  let data;
  try {
    data = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, { status: 400, headers: auth.headers });
  }

  let image;
  try {
    image = validateImageUpload(data?.name, data?.contentBase64);
  } catch (e) {
    return jsonResponse({ success: false, error: e.message }, { status: 400, headers: auth.headers });
  }

  const existingRes = await githubFetch(auth.session.githubToken, githubContentsQuery(image.path));
  if (!existingRes.ok && existingRes.status !== 404) {
    return jsonResponse(
      { success: false, error: "Unable to check existing image." },
      { status: existingRes.status, headers: auth.headers },
    );
  }
  const existing = existingRes.ok ? await existingRes.json() : null;

  const body = {
    message: `admin: upload ${image.name}`,
    content: data.contentBase64,
    branch: githubBranch(),
  };
  if (existing?.sha) body.sha = existing.sha;

  const res = await githubFetch(auth.session.githubToken, githubContentsUrl(image.path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse(
      { success: false, error: err.message || "Unable to upload image." },
      { status: res.status, headers: auth.headers },
    );
  }

  const result = await res.json();
  return jsonResponse({ success: true, path: image.path, sha: result.content?.sha || "" }, { headers: auth.headers });
}

export async function onRequestDelete(context) {
  const auth = await requireAdmin(context, { csrf: true, freshPermission: true });
  if (!auth.ok) return auth.response;

  let data;
  try {
    data = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, { status: 400, headers: auth.headers });
  }

  let image;
  try {
    image = validateImageName(data?.name);
  } catch (e) {
    return jsonResponse({ success: false, error: e.message }, { status: 400, headers: auth.headers });
  }

  if (typeof data.sha !== "string" || !data.sha) {
    return jsonResponse({ success: false, error: "Image SHA is required." }, { status: 400, headers: auth.headers });
  }

  const res = await githubFetch(auth.session.githubToken, githubContentsUrl(image.path), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `admin: remove unused ${image.name}`,
      sha: data.sha,
      branch: githubBranch(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse(
      { success: false, error: err.message || "Unable to delete image." },
      { status: res.status, headers: auth.headers },
    );
  }

  return jsonResponse({ success: true }, { headers: auth.headers });
}
