import { marked } from "marked";

const TRUSTED_HTML_KEY = Symbol("trustedHtml");
const SITE_URL = "https://audreyhauteurdenfant.com";
const HTML_ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function resolve(obj, keyPath) {
  return keyPath.split(".").reduce((value, key) => value == null ? undefined : value[key], obj);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function escapeMarkdownInput(value) {
  return String(value).replace(/[&<>]/g, (char) => HTML_ESCAPE_MAP[char]);
}

function decodeHtmlCodePoint(value, radix) {
  const codePoint = Number.parseInt(value, radix);
  return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
}

function decodeHtmlAttribute(value) {
  let decoded = String(value);
  for (let index = 0; index < 4; index += 1) {
    const next = decoded
      .replace(/&amp;/gi, "&")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeHtmlCodePoint(hex, 16))
      .replace(/&#(\d+);/g, (_, decimal) => decodeHtmlCodePoint(decimal, 10))
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function trustedHtml(value) {
  return { [TRUSTED_HTML_KEY]: value };
}

function markdownAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "").trim() : "";
}

function isSafeImageSrc(src) {
  return !!src && !/[\u0000-\u001f\u007f]/.test(src) &&
    (/^https?:\/\//i.test(src) || (src.startsWith("/") && !src.startsWith("//")));
}

function safeHref(value) {
  const href = typeof value === "string" ? value.trim() : "";
  return !/[\u0000-\u001f\u007f]/.test(href) &&
    (/^(?:https?:\/\/|mailto:|tel:|#)/i.test(href) || (href.startsWith("/") && !href.startsWith("//"))) ? href : "";
}

function isExternalLink(value) {
  return /^https?:\/\//i.test(value || "");
}

function sanitizeMarkdownImage(tag) {
  const src = markdownAttribute(tag, "src");
  if (!isSafeImageSrc(src)) return "";
  const attrs = [`src="${escapeHtml(src)}"`, `alt="${escapeHtml(markdownAttribute(tag, "alt"))}"`];
  const title = markdownAttribute(tag, "title");
  if (title) attrs.push(`title="${escapeHtml(title)}"`);
  attrs.push('loading="lazy"', 'decoding="async"');
  return `<img ${attrs.join(" ")}>`;
}

function sanitizeMarkdownLink(tag) {
  const href = safeHref(markdownAttribute(tag, "href"));
  if (!href) return "<a>";
  const attrs = [`href="${escapeHtml(href)}"`];
  const title = markdownAttribute(tag, "title");
  if (title) attrs.push(`title="${escapeHtml(title)}"`);
  if (isExternalLink(href)) attrs.push('target="_blank"', 'rel="noopener noreferrer"');
  return `<a ${attrs.join(" ")}>`;
}

function sanitizeRenderedMarkdown(html) {
  return String(html)
    .replace(/<\/?(?:script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link)[^>]*>/gi, "")
    .replace(/<img\b[^>]*>/gi, sanitizeMarkdownImage)
    .replace(/<a\b[^>]*>/gi, sanitizeMarkdownLink)
    .replace(/\s(on\w+)\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
}

function inlineMarkdown(text) {
  if (typeof text !== "string" || !text) return "";
  return sanitizeRenderedMarkdown(marked.parseInline(escapeMarkdownInput(text))).replace(/\n/g, "<br>");
}

function markdownToHtml(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  return sanitizeRenderedMarkdown(marked.parse(escapeMarkdownInput(text)));
}

function plainText(text) {
  return decodeHtmlAttribute(inlineMarkdown(text).replace(/<br>/g, " ").replace(/<[^>]*>/g, ""));
}

// Clone settings before converting Markdown into trusted HTML.
export function processMarkdown(data) {
  const next = structuredClone(data);
  if (next.colors && typeof next.colors === "object") {
    for (const [key, value] of Object.entries(next.colors)) {
      if (typeof value !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
        delete next.colors[key];
      }
    }
  }

  for (const [section, field] of [
    ["about", "body"], ["popup", "message"], ["privacy_page", "body"], ["legal_page", "body"],
    ["contact", "subtitle"], ["form", "subtitle"], ["form", "privacy_note"], ["resources", "intro"],
  ]) {
    if (next[section]?.[field]) next[section][field] = trustedHtml(markdownToHtml(next[section][field]));
  }
  for (const [section, field] of [
    ["services", "description"], ["highlights", "description"], ["faq", "answer"], ["resources", "description"],
  ]) {
    for (const item of next[section]?.items || []) {
      if (item[field]) item[field] = trustedHtml(markdownToHtml(item[field]));
    }
  }
  for (const [section, field] of [["header", "site_name"], ["hero", "title"], ["hero", "subtitle"]]) {
    if (next[section]?.[field]) next[section][field] = trustedHtml(inlineMarkdown(next[section][field]));
  }
  return next;
}

// Default French URL fragments. The admin can change each one in the section's `anchor` field.
export const DEFAULT_ANCHORS = {
  hero: "accueil",
  highlights: "points-forts",
  services: "services",
  about: "a-propos",
  faq: "faq",
  contact: "contact",
  form: "ecrivez-moi",
  resources: "ressources",
};

// The other element ids in template.html. A section anchor must not reuse them.
// render.test.mjs compares this list with the template.
export const RESERVED_IDS = new Set([
  "popup", "popup-title", "popup-close", "primary-nav", "contact-form", "bot_field",
  "contact-name", "contact-name-error", "contact-email", "contact-email-error", "contact-phone",
  "contact-referral", "subject-label", "subject-select", "subject-toggle", "subject-placeholder",
  "subject-listbox", "subject-chips", "subject-inputs", "subject-error", "subject-status",
  "contact-message", "contact-message-error", "contact-message-count",
  "form-modal", "form-modal-message", "form-modal-close",
]);

const slugify = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Admin values become safe, unique slugs. An empty, duplicate or reserved value uses the default.
function sectionAnchors(content) {
  const anchors = {};
  const used = new Set();
  for (const [key, fallback] of Object.entries(DEFAULT_ANCHORS)) {
    let anchor = slugify(content[key]?.anchor);
    if (!anchor || used.has(anchor) || RESERVED_IDS.has(anchor) || anchor.startsWith("subject-option-")) {
      if (content[key]?.anchor) console.warn(`Ancre « ${content[key].anchor} » refusée pour ${key} : ancre par défaut « ${fallback} ».`);
      anchor = fallback;
    }
    while (used.has(anchor)) anchor = `${anchor}-${key}`;
    used.add(anchor);
    anchors[key] = anchor;
  }
  return anchors;
}

// Build and preview use the same derived values.
export function prepareContent(content) {
  const data = processMarkdown(content);
  const anchors = sectionAnchors(content);
  for (const [key, anchor] of Object.entries(anchors)) {
    if (data[key] && typeof data[key] === "object") data[key].anchor = anchor;
  }
  data.nav_items = ["highlights", "services", "about", "faq", "contact", "form", "resources"]
    .filter((key) => content[key]?.enabled === true && typeof content.nav?.[key] === "string" && content.nav[key].trim())
    .map((key) => ({ href: `#${anchors[key]}`, label: content.nav[key].trim() }));

  const siteName = plainText(content.header?.site_name);
  if (data.header) {
    data.header.site_name_plain = siteName;
    // The nav button scrolls to the contact options, or to the form when contact is hidden.
    const ctaSection = ["contact", "form"].find((key) => content[key]?.enabled === true);
    data.header.cta_anchor = ctaSection ? anchors[ctaSection] : "";
  }
  data.json_ld = trustedHtml(JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: siteName,
    description: content.seo?.description || "",
    telephone: content.contact?.phone || "",
    address: { "@type": "PostalAddress", streetAddress: content.contact?.address || "", addressCountry: "CA" },
    url: SITE_URL,
    logo: content.header?.logo ? new URL(content.header.logo, SITE_URL).href : undefined,
    image: content.hero?.portrait ? new URL(content.hero.portrait, SITE_URL).href : undefined,
  }).replace(/<\//g, "<\\/"));

  if (data.seo) {
    data.seo.favicon = safeHref(data.seo.favicon);
    data.seo.apple_touch_icon = safeHref(data.seo.apple_touch_icon);
    data.seo.favicon_type = /\.png(?:[?#]|$)/i.test(data.seo.favicon) ? "image/png" : "image/x-icon";
  }
  if (data.contact) {
    data.contact.booking_url = safeHref(data.contact.booking_url);
    data.contact.phone_href = `tel:${String(data.contact.phone || "").replace(/[^\d+]/g, "")}`;
  }
  if (data.hero) {
    data.hero.cta2_link = safeHref(data.hero.cta2_link);
    data.hero.cta2_external = isExternalLink(data.hero.cta2_link);
  }
  for (const item of data.resources?.items || []) item.url = safeHref(item.url);
  if (data.footer) {
    for (const kind of ["privacy", "legal"]) {
      data.footer[`${kind}_link`] = safeHref(data.footer[`${kind}_link`]);
      data.footer[`${kind}_external`] = isExternalLink(data.footer[`${kind}_link`]);
    }
  }

  const imageFields = [
    ["seo", "og_image"], ["popup", "image"], ["header", "logo"],
    ["hero", "image"], ["hero", "portrait"], ["about", "photo"],
  ];
  function warnEmptyAlt(item, field, path) {
    if (typeof item?.[field] === "string" && item[field].trim() && !String(item[`${field}_alt`] || "").trim()) {
      console.warn(`Image alt is empty: ${path}`);
    }
  }
  for (const [section, field] of imageFields) warnEmptyAlt(content[section], field, `${section}.${field}`);
  for (const section of ["services", "resources"]) {
    (content[section]?.items || []).forEach((item, index) => warnEmptyAlt(item, "image", `${section}.items[${index}].image`));
  }
  return data;
}

function renderValue(value) {
  if (value && typeof value === "object" && typeof value[TRUSTED_HTML_KEY] === "string") return value[TRUSTED_HTML_KEY];
  return value == null || typeof value === "object" ? "" : escapeHtml(value);
}

// Parse only template source. Content values never become template instructions.
export function render(template, data) {
  const tokens = template.split(/(\{\{(?:#(?:if|each)\s+[\w.]+|\/(?:if|each)|@index|[\w.]+)\}\})/g);
  const pairs = new Map();
  const stack = [];
  tokens.forEach((token, index) => {
    if (/^\{\{#(?:if|each)\s/.test(token)) stack.push(index);
    else if (/^\{\{\/(?:if|each)\}\}$/.test(token)) {
      const start = stack.pop();
      if (start === undefined || !tokens[start].startsWith(`{{#${token.slice(3, -2)} `)) {
        throw new Error("Unmatched template block.");
      }
      pairs.set(start, index);
    }
  });
  if (stack.length) throw new Error("Unclosed template block.");

  function renderRange(start, end, context) {
    let html = "";
    for (let index = start; index < end; index += 1) {
      const token = tokens[index];
      const block = token.match(/^\{\{#(if|each)\s+([\w.]+)\}\}$/);
      if (block) {
        const close = pairs.get(index);
        const value = resolve(context, block[2]);
        if (block[1] === "if" && value && !(Array.isArray(value) && !value.length)) html += renderRange(index + 1, close, context);
        if (block[1] === "each" && Array.isArray(value)) {
          value.forEach((item, itemIndex) => {
            html += renderRange(index + 1, close, { ...context, ...item, "@index": itemIndex });
          });
        }
        index = close;
      } else {
        const key = token.match(/^\{\{(@index|[\w.]+)\}\}$/)?.[1];
        html += key ? renderValue(key === "currentYear" ? new Date().getFullYear() : resolve(context, key)) : token;
      }
    }
    return html;
  }
  return renderRange(0, tokens.length, data);
}
