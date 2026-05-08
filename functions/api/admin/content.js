import {
  CONTENT_PATH,
  base64ToText,
  githubBranch,
  githubContentsQuery,
  githubContentsUrl,
  githubFetch,
  jsonResponse,
  requireAdmin,
  textToBase64,
} from "../../../lib/admin-auth.mjs";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const res = await githubFetch(auth.session.githubToken, githubContentsQuery(CONTENT_PATH));
  if (!res.ok) {
    return jsonResponse({ success: false, error: "Unable to load content." }, { status: res.status, headers: auth.headers });
  }

  const file = await res.json();
  return jsonResponse(
    {
      content: JSON.parse(base64ToText(file.content)),
      sha: file.sha,
    },
    { headers: auth.headers },
  );
}

export async function onRequestPut(context) {
  const auth = await requireAdmin(context, { csrf: true, freshPermission: true });
  if (!auth.ok) return auth.response;

  let data;
  try {
    data = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, { status: 400, headers: auth.headers });
  }

  if (!data || typeof data !== "object" || !data.content || typeof data.content !== "object") {
    return jsonResponse({ success: false, error: "Content object is required." }, { status: 400, headers: auth.headers });
  }
  if (typeof data.sha !== "string" || !data.sha) {
    return jsonResponse({ success: false, error: "Current content SHA is required." }, { status: 400, headers: auth.headers });
  }

  const content = `${JSON.stringify(data.content, null, 2)}\n`;
  const res = await githubFetch(auth.session.githubToken, githubContentsUrl(CONTENT_PATH), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "admin: update content",
      content: textToBase64(content),
      sha: data.sha,
      branch: githubBranch(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse(
      { success: false, error: err.message || "Unable to update content." },
      { status: res.status, headers: auth.headers },
    );
  }

  const result = await res.json();
  return jsonResponse({ success: true, sha: result.content?.sha || "" }, { headers: auth.headers });
}
