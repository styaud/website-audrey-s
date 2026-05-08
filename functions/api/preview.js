import { requireAdmin, htmlResponse } from "../../lib/admin-auth.mjs";
import { render, processMarkdown } from "../../lib/render.mjs";

// Renders a full preview page server-side for authenticated admins.
// Static assets (template, CSS, JS) are read via ASSETS binding (no self-fetch deadlock).
// A <base href="/"> is injected so paths resolve to the site root.
export async function onRequestPost(context) {
  const auth = await requireAdmin(context, { csrf: true });
  if (!auth.ok) {
    return htmlResponse("<html><body><h1>Accès refusé</h1></body></html>", { status: auth.response.status });
  }

  try {
    const contentType = context.request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return htmlResponse("<html><body><h1>Requête invalide</h1></body></html>", { status: 415 });
    }
    const content = await context.request.json();

    const [templateRes, cssRes, jsRes] = await Promise.all([
      context.env.ASSETS.fetch(new URL("/template.html", context.request.url)),
      context.env.ASSETS.fetch(new URL("/styles.css", context.request.url)),
      context.env.ASSETS.fetch(new URL("/script.js", context.request.url)),
    ]);

    const template = await templateRes.text();
    const css = await cssRes.text();
    const js = await jsRes.text();

    const data = processMarkdown(JSON.parse(JSON.stringify(content)));
    let html = render(template, data);

    html = html.replace("<head>", '<head><base href="/">');
    html = html.replace(/<link rel="stylesheet" href="styles\.css">/, `<style>${css}</style>`);
    html = html.replace(/<script src="script\.js"><\/script>/, `<script>${js}</script>`);

    return htmlResponse(html, { headers: auth.headers });
  } catch (e) {
    const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return htmlResponse(
      `<html><body><h1>Erreur de prévisualisation</h1><pre>${escHtml(e.message)}\n${escHtml(e.stack)}</pre></body></html>`,
      { status: 500 },
    );
  }
}
