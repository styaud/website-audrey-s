import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareContent, render, RESERVED_IDS } from "./render.mjs";

const content = JSON.parse(readFileSync(new URL("../content/settings.json", import.meta.url), "utf8"));
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
console.log("Renderer checks passed.");
