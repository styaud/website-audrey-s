export const STANDARD_IMAGE_WIDTHS = Object.freeze([480, 960, 1440, 1920]);
export const BACKGROUND_IMAGE_WIDTHS = Object.freeze([960, 1440, 1920, 2560, 3840]);
export const OG_IMAGE_WIDTHS = Object.freeze([480, 960, 1200]);

// Theme icons come from the Lucide pack that build.js copies to assets/icons/.
// The name goes into a CSS url(), so accept only Lucide-style names: lowercase words joined by hyphens.
export function resourceIconPath(name) {
  return `/assets/icons/${typeof name === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) ? name : "link"}.svg`;
}

export function responsiveWidthsForPath(path) {
  if (path === "hero.image") return BACKGROUND_IMAGE_WIDTHS;
  if (path === "seo.og_image") return OG_IMAGE_WIDTHS;
  return STANDARD_IMAGE_WIDTHS;
}

export function responsiveTargetWidths(sourceWidth, requestedWidths = STANDARD_IMAGE_WIDTHS) {
  const source = Math.max(1, Math.round(sourceWidth));
  return [...new Set(requestedWidths.map((width) => Math.min(width, source)))].sort((a, b) => a - b);
}

export function responsiveImageSet(src, sizes, allowedWidths = STANDARD_IMAGE_WIDTHS) {
  const match = String(src || "").match(/^(\/?assets\/images\/[a-z0-9][a-z0-9._-]*)-([1-9]\d*)w\.webp([?#][^\s,]*)?$/i);
  if (!match) return { srcset: "", sizes: "" };
  const maxWidth = Number(match[2]);
  if (!Number.isSafeInteger(maxWidth)) return { srcset: "", sizes: "" };
  const widths = allowedWidths.filter((width) => width < maxWidth);
  widths.push(maxWidth);
  return {
    srcset: widths.map((width) => `${match[1]}-${width}w.webp${match[3] || ""} ${width}w`).join(", "),
    sizes,
  };
}

export function prepareResponsiveImages(data) {
  function prepare(item, field, sizes, widths) {
    if (!item) return;
    const responsive = responsiveImageSet(item[field], sizes, widths);
    item[`${field}_srcset`] = responsive.srcset;
    item[`${field}_sizes`] = responsive.sizes;
  }

  prepare(data.seo, "og_image", "1200px", OG_IMAGE_WIDTHS);
  prepare(data.popup, "image", "64px");
  prepare(data.header, "logo", "48px");
  prepare(data.hero, "image", "100vw", BACKGROUND_IMAGE_WIDTHS);
  prepare(data.hero, "portrait", "(min-width: 1024px) 30vw, (min-width: 524px) 288px, 55vw");
  prepare(data.about, "photo", "(min-width: 1200px) 448px, (min-width: 900px) 40vw, calc(100vw - 32px)");
  for (const item of data.services?.items || []) {
    prepare(item, "image", "(min-width: 1064px) 468px, (min-width: 768px) calc(50vw - 64px), calc(100vw - 72px)");
  }
  for (const item of data.resources?.items || []) {
    prepare(item, "image", "64px");
  }
  return data;
}
