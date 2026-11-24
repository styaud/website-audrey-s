export function normalizeLocalImagePath(value) {
  const path = String(value || '').trim().replace(/^https?:\/\/[^/]+\//i, '').split(/[?#]/)[0].replace(/^\/+/, '');
  return path.startsWith('assets/images/') ? path : '';
}

function imageGroupKey(path) {
  return normalizeLocalImagePath(path).replace(/-([1-9]\d*)w\.webp$/i, '');
}

export function collectImagePaths(source, paths = new Set(), seen = new Set()) {
  if (typeof source === 'string') {
    for (const match of source.match(/\/?assets\/images\/[a-z0-9][a-z0-9._-]*\.(?:webp|jpe?g|png|svg|ico)\b/gi) || []) {
      paths.add(normalizeLocalImagePath(match));
    }
  } else if (source && typeof source === 'object' && !seen.has(source)) {
    seen.add(source);
    for (const value of Object.values(source)) collectImagePaths(value, paths, seen);
  }
  return paths;
}

export function groupImageGalleryItems(images, draftPaths = new Set(), publishedPaths = new Set()) {
  const draftGroups = new Set([...draftPaths].map(imageGroupKey));
  const publishedGroups = new Set([...publishedPaths].map(imageGroupKey));
  const groups = new Map();
  for (const image of images) {
    const path = normalizeLocalImagePath(image.path || `assets/images/${image.name}`);
    const key = imageGroupKey(path);
    const width = Number(path.match(/-([1-9]\d*)w\.webp$/i)?.[1] || 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...image, path, width });
  }
  return [...groups].map(([key, variants]) => {
    variants.sort((a, b) => a.width - b.width || a.name.localeCompare(b.name));
    const representative = variants[variants.length - 1];
    const adminIcon = key === 'assets/images/favicon.ico';
    const usedInDraft = draftGroups.has(key);
    const published = publishedGroups.has(key);
    return {
      ...representative,
      displayName: representative.width ? key.split('/').pop() : representative.name,
      variants,
      variantCount: variants.length,
      used: usedInDraft || published || adminIcon,
      usedInDraft,
      published,
      adminIcon,
    };
  });
}
