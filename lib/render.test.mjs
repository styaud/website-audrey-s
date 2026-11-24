import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { prepareContent, render, RESERVED_IDS } from "./render.mjs";
import { BACKGROUND_IMAGE_WIDTHS, responsiveImageSet, responsiveTargetWidths, responsiveWidthsForPath } from "./images.mjs";

const content = JSON.parse(readFileSync(new URL("../content/settings.json", import.meta.url), "utf8"));
assert.equal(content.resources.enabled, true);
assert.ok(content.resources.items.length >= 5 && content.resources.items.length <= 8);
// The admin can hide sections. Show all of them so the nav check does not depend on live content.
for (const key of ["highlights", "services", "about", "faq", "contact", "form", "resources"]) content[key].enabled = true;
const template = readFileSync(new URL("../template.html", import.meta.url), "utf8");
const warnings = [];
const warn = console.warn;
let prepared;
try {
  console.warn = (message) => warnings.push(message);
  prepared = prepareContent(content);
} finally {
  console.warn = warn;
}
assert.deepEqual(warnings, []);
assert.deepEqual(prepared.nav_items.map((item) => item.href), ["#services", "#a-propos", "#faq", "#contact", "#ecrivez-moi", "#ressources"]);
// Each nav link must target a section id in the template.
const fullHtml = render(template, prepared);
for (const { href } of prepared.nav_items) assert.ok(fullHtml.includes(`id="${href.slice(1)}"`), `missing section ${href}`);
assert.equal(typeof content.hero.title, "string");
assert.equal(typeof content.about.body, "string");

// Section labels supply both menus. Empty, missing, and invalid labels hide links.
const labels = structuredClone(content);
labels.highlights.nav_label = " Repères ";
labels.services.nav_label = " Accompagnement & soutien ";
labels.about.nav_label = " ";
delete labels.faq.nav_label;
labels.contact.nav_label = null;
labels.form.nav_label = 42;
labels.resources.nav_label = " Liens utiles ";
labels.header.back_label = "Accueil & informations";
const labelData = prepareContent(labels);
assert.deepEqual(labelData.nav_items, [
  { href: "#points-forts", label: "Repères" },
  { href: "#services", label: "Accompagnement & soutien" },
  { href: "#ressources", label: "Liens utiles" },
]);
const legalTemplate = readFileSync(new URL("../template-legal.html", import.meta.url), "utf8");
for (const [source, prefix] of [[template, ""], [legalTemplate, "/"]]) {
  const labelHtml = render(source, labelData);
  for (const className of ["nav-link", "footer-link"]) {
    assert.ok(labelHtml.includes(`href="${prefix}#services" class="${className}">Accompagnement &amp; soutien</a>`));
    assert.ok(labelHtml.includes(`href="${prefix}#points-forts" class="${className}">Repères</a>`));
    assert.ok(labelHtml.includes(`href="${prefix}#ressources" class="${className}">Liens utiles</a>`));
    assert.ok(!labelHtml.includes(`href="${prefix}#a-propos" class="${className}"`));
  }
}
assert.ok(render(legalTemplate, labelData).includes('class="legal-back"><span aria-hidden="true">←</span> Accueil &amp; informations</a>'));
labelData.header.back_label = "";
assert.ok(!render(legalTemplate, labelData).includes('class="legal-back"'));

// Resource cards need no image and retain safe external links.
assert.ok(!fullHtml.includes('class="resource-card-media"'));
for (const item of content.resources.items) {
  assert.equal(new URL(item.url).protocol, "https:");
  assert.ok(item.title && item.description);
  assert.ok(fullHtml.includes(`href="${item.url}" target="_blank" rel="noopener noreferrer"`));
  assert.ok(fullHtml.includes(item.title));
}

const hidden = structuredClone(content);
hidden.faq.enabled = false;
hidden.resources.enabled = false;
const html = render(template, prepareContent(hidden));
for (const section of ["faq", "ressources"]) {
  assert.ok(!html.includes(`id="${section}"`));
  assert.ok(!html.includes(`href="#${section}"`));
}
assert.ok(!html.includes("{{"));

// The reserved list must match the fixed ids in the template.
const fixedIds = new Set([...template.matchAll(/\bid="([^"{]+)"/g)].map((m) => m[1]));
assert.deepEqual([...fixedIds].sort(), [...RESERVED_IDS].sort());

// Admin anchors become slugs. Duplicate and reserved values fall back to the default.
const custom = structuredClone(content);
custom.about.anchor = "  Qui suis-je ? ";
custom.faq.anchor = "services";
custom.form.anchor = "contact-form";
const customWarnings = [];
let customData;
try {
  console.warn = (message) => customWarnings.push(message);
  customData = prepareContent(custom);
} finally {
  console.warn = warn;
}
assert.equal(customWarnings.length, 2);
assert.deepEqual(customData.nav_items.map((item) => item.href), ["#services", "#qui-suis-je", "#faq", "#contact", "#ecrivez-moi", "#ressources"]);
const customHtml = render(template, customData);
const allIds = [...customHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(allIds.length, new Set(allIds).size, "duplicate id in the page");
assert.ok(customHtml.includes('href="#ecrivez-moi" class="btn btn-primary"'));

const hostile = structuredClone(content);
hostile.seo.title = '<img src=x onerror="alert(1)">';
hostile.seo.description = 'Quoted "text"\n</script><script>alert(1)</script>';
hostile.services.items[0].title = "{{#if form.enabled}}literal{{/if}}";
hostile.about.body = '<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n[external](https://example.com/?a=1&b=2)\n\n![unsafe](data:image/svg+xml,attack)';
const safe = prepareContent(hostile);
assert.equal(render("{{seo.title}}", safe), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
const markdown = render("{{about.body}}", safe);
assert.ok(!markdown.includes("<script>"));
assert.ok(!markdown.includes('href="javascript:'));
assert.ok(!markdown.includes("<img"));
assert.ok(markdown.includes('target="_blank" rel="noopener noreferrer"'));
assert.equal(render("{{#each services.items}}{{#if title}}{{#if image}}{{title}}{{/if}}{{/if}}{{/each}}", safe).startsWith(hostile.services.items[0].title), true);
const json = render("{{json_ld}}", safe);
assert.ok(!json.includes("</script>"));
assert.equal(JSON.parse(json).description, hostile.seo.description);
assert.equal(JSON.parse(json).logo, new URL(content.header.logo, "https://audreyhauteurdenfant.com").href);
assert.equal(JSON.parse(json).image, new URL(content.hero.portrait, "https://audreyhauteurdenfant.com").href);
assert.equal(render("{{#each items}}{{#if show}}{{@index}}:{{value}}{{/if}}{{/each}}", { items: [{ show: true, value: "<safe>" }] }), "0:&lt;safe&gt;");
// An empty list counts as false, so a section never outputs an empty wrapper.
assert.equal(render("{{#if items}}<ul></ul>{{/if}}", { items: [] }), "");
assert.equal(render("{{#if items}}<ul></ul>{{/if}}", { items: [{}] }), "<ul></ul>");
// The nav button goes to contact, then to the form, and does not show when both are hidden.
assert.ok(fullHtml.includes(`href="#${prepared.contact.anchor}" class="btn btn-primary nav-cta"`));
const noContact = structuredClone(content);
noContact.contact.enabled = false;
assert.equal(prepareContent(noContact).header.cta_anchor, prepared.form.anchor);
noContact.form.enabled = false;
assert.ok(!render(template, prepareContent(noContact)).includes("nav-cta"));
const missingAlt = structuredClone(content);
missingAlt.hero.portrait_alt = " ";
try {
  console.warn = (message) => warnings.push(message);
  prepareContent(missingAlt);
} finally {
  console.warn = warn;
}
assert.deepEqual(warnings, ["Image alt is empty: hero.portrait"]);
const unsafeUrls = structuredClone(content);
unsafeUrls.contact.booking_url = "//example.com";
const safeUrls = prepareContent(unsafeUrls);
assert.equal(safeUrls.contact.booking_url, "");
const variantPath = "/assets/images/example-1920w.webp";
const expectedSrcset = [480, 960, 1440, 1920].map((width) => `/assets/images/example-${width}w.webp ${width}w`).join(", ");
assert.deepEqual(responsiveImageSet(variantPath, "50vw"), { srcset: expectedSrcset, sizes: "50vw" });
assert.deepEqual(responsiveTargetWidths(3000), [480, 960, 1440, 1920]);
assert.deepEqual(responsiveTargetWidths(700), [480, 700]);
assert.deepEqual(responsiveTargetWidths(320), [320]);
assert.deepEqual(responsiveTargetWidths(3000, responsiveWidthsForPath("hero.image")), [960, 1440, 1920, 2560, 3000]);
assert.deepEqual(responsiveTargetWidths(3000, responsiveWidthsForPath("seo.og_image")), [480, 960, 1200]);
assert.equal(responsiveImageSet("/assets/images/hero-3000w.webp", "100vw", BACKGROUND_IMAGE_WIDTHS).srcset,
  [960, 1440, 1920, 2560, 3000].map((width) => `/assets/images/hero-${width}w.webp ${width}w`).join(", "));
assert.equal(responsiveImageSet("/assets/images/small-700w.webp", "100vw").srcset,
  "/assets/images/small-480w.webp 480w, /assets/images/small-700w.webp 700w");
for (const path of ["/assets/images/plain.webp", "/assets/images/icon.png", "/assets/images/invalid-0w.webp", "https://example.com/image-1920w.webp"]) {
  assert.deepEqual(responsiveImageSet(path, "100vw"), { srcset: "", sizes: "" });
}
const responsiveContent = structuredClone(content);
responsiveContent.popup.enabled = true;
responsiveContent.hero.image = "/assets/images/background-3000w.webp";
responsiveContent.hero.portrait = variantPath;
responsiveContent.popup.image = variantPath;
responsiveContent.popup.image_alt = "Illustration";
responsiveContent.header.logo = variantPath;
responsiveContent.about.photo = variantPath;
responsiveContent.services.items[0].image = variantPath;
responsiveContent.resources.items[0].image = variantPath;
responsiveContent.resources.items[0].image_alt = "Illustration";
const responsiveData = prepareContent(responsiveContent);
const responsiveHtml = render(template, responsiveData);
assert.equal((responsiveHtml.match(/srcset="[^"]*\/assets\/images\/example-/g) || []).length, 6);
assert.ok(responsiveHtml.includes('srcset="/assets/images/background-960w.webp 960w,'));
assert.equal(responsiveData.hero.image_sizes, "100vw");
assert.equal(responsiveData.hero.portrait_srcset, expectedSrcset);
assert.equal(render('<img src="{{src}}"{{#if srcset}} srcset="{{srcset}}" sizes="{{sizes}}"{{/if}}>',
  { src: "/assets/images/plain.webp", ...responsiveImageSet("/assets/images/plain.webp", "100vw") }), '<img src="/assets/images/plain.webp">');
const escapedSet = responsiveImageSet('/assets/images/safe-480w.webp?caption="<text>"&v=1', '"<size>"&');
assert.equal(render('srcset="{{srcset}}" sizes="{{sizes}}"', escapedSet),
  'srcset="/assets/images/safe-480w.webp?caption=&quot;&lt;text&gt;&quot;&amp;v=1 480w" sizes="&quot;&lt;size&gt;&quot;&amp;"');
for (const image of fullHtml.matchAll(/<img\b[^>]*>/g)) {
  const paths = [...image[0].matchAll(/(?:src|srcset)="([^"]*)"/g)]
    .flatMap((attribute) => attribute[1].split(",").map((candidate) => candidate.trim().split(/\s+/)[0]));
  for (const path of paths.filter((path) => path.startsWith("/assets/images/"))) {
    assert.ok(existsSync(new URL(`..${path}`, import.meta.url)), `missing image ${path}`);
  }
}

console.log("Renderer checks passed.");
