import { readFileSync, writeFileSync, existsSync, cpSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { render, prepareContent } from "./lib/render.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE_URL = "https://audreyhauteurdenfant.com";
const read = (f) => readFileSync(join(ROOT, f), "utf-8");

function loadLocalEnv() {
  const envPath = join(ROOT, ".dev.vars");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (/^[A-Z_][A-Z0-9_]*$/.test(key) && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

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

const settings = prepareContent(JSON.parse(read("content/settings.json")));
settings.turnstile_sitekey = process.env.TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
const template = read("template.html");
const legalTemplate = read("template-legal.html");

const write = (f, c) => { writeFileSync(join(ROOT, f), c, "utf-8"); console.log("Generated:", f); };
write("index.html", render(template, settings));

// Legal pages
if (settings.privacy_page) {
  const privacyData = { ...settings, page_title: settings.privacy_page.title, page_updated: settings.privacy_page.updated, page_body: settings.privacy_page.body };
  write("politique-de-confidentialite.html", render(legalTemplate, privacyData));
}
if (settings.legal_page) {
  const legalData = { ...settings, page_title: settings.legal_page.title, page_updated: settings.legal_page.updated, page_body: settings.legal_page.body };
  write("mentions-legales.html", render(legalTemplate, legalData));
}

write("sitemap.xml", generateSitemap());
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
write("_redirects", settings.seo.favicon && settings.seo.favicon !== "/favicon.ico" ? `/favicon.ico ${settings.seo.favicon.replace(/\s/g, encodeURIComponent)} 302\n` : "");

// Theme icons: the full Lucide pack from the lucide-static package, plus a search index for the admin.
// index.json is [[name, "tag tag …"], …] for every icon file, with an empty string for icons without tags.
const lucide = join(ROOT, "node_modules", "lucide-static");
rmSync(join(ROOT, "assets", "icons"), { recursive: true, force: true });
cpSync(join(lucide, "icons"), join(ROOT, "assets", "icons"), { recursive: true });
cpSync(join(lucide, "LICENSE"), join(ROOT, "assets", "icons", "LICENSE"));
const tags = JSON.parse(readFileSync(join(lucide, "tags.json"), "utf-8"));
const iconNames = Object.keys(JSON.parse(readFileSync(join(lucide, "icon-nodes.json"), "utf-8"))).sort();
write("assets/icons/index.json", JSON.stringify(iconNames.map((name) => [name, (tags[name] || []).join(" ")])));

// Lucide can rename or remove an icon between versions. A theme icon without a file shows no icon, so stop the build.
const missingIcons = (settings.resources?.categories || []).map((category) => category.icon).filter((name) => name && !existsSync(join(ROOT, "assets", "icons", `${name}.svg`)));
if (missingIcons.length) {
  console.error(`Error: theme icons not in lucide-static: ${missingIcons.join(", ")}. Choose another icon in the admin.`);
  process.exit(1);
}
console.log("Build complete.");
