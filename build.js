import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { render, processMarkdown } from "./lib/render.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE_URL = "https://audreyhauteurdenfant.com";
const read = (f) => readFileSync(join(ROOT, f), "utf-8");

function generateSitemap() {
  const today = new Date().toISOString().split("T")[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

if (!existsSync(join(ROOT, "content", "settings.json"))) {
  console.error("Error: content/settings.json not found."); process.exit(1);
}
if (!existsSync(join(ROOT, "template.html"))) {
  console.error("Error: template.html not found."); process.exit(1);
}

const settings = processMarkdown(JSON.parse(read("content/settings.json")));
settings.turnstile_sitekey = process.env.TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
const template = read("template.html");

const write = (f, c) => { writeFileSync(join(ROOT, f), c, "utf-8"); console.log("Generated:", f); };
write("index.html", render(template, settings));
write("sitemap.xml", generateSitemap());
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log("Build complete.");
