import assert from 'node:assert/strict';
import { collectImagePaths, groupImageGalleryItems, normalizeLocalImagePath } from './image-gallery.js';

const image = (name, extra = {}) => ({ name, path: `assets/images/${name}`, ...extra });
const files = [
  image('portrait-1920w.webp'),
  image('portrait-480w.webp'),
  image('unused-700w.webp'),
  image('portrait-960w.webp'),
  image('unused-480w.webp', { pending: true }),
  image('published-3000w.webp'),
  image('published-960w.webp'),
  image('favicon.ico'),
  image('logo.svg'),
  image('standalone.webp'),
];
const draft = { nested: [{ text: '![Portrait](/assets/images/portrait-480w.webp?v=2) [Logo][assets/images/logo.svg]' }] };
draft.self = draft;
const draftPaths = collectImagePaths(draft);
assert.deepEqual([...draftPaths].sort(), ['assets/images/logo.svg', 'assets/images/portrait-480w.webp']);
assert.deepEqual([...collectImagePaths('https://example.com/assets/images/portrait-480w.webp#image')], ['assets/images/portrait-480w.webp']);
assert.equal(normalizeLocalImagePath('https://example.com/assets/images/logo.svg?v=1#top'), 'assets/images/logo.svg');
assert.equal(normalizeLocalImagePath('/outside/photo.webp'), '');
const publishedPaths = collectImagePaths({ image: '/assets/images/published-1920w.webp' });
const groups = groupImageGalleryItems(files, draftPaths, publishedPaths);
assert.equal(groups.length, 6);
const portrait = groups.find(group => group.displayName === 'portrait');
assert.equal(portrait.path, 'assets/images/portrait-1920w.webp');
assert.equal(portrait.variantCount, 3);
assert.deepEqual(portrait.variants.map(variant => variant.width), [480, 960, 1920]);
assert.equal(portrait.used, true);
assert.equal(portrait.usedInDraft, true);
const published = groups.find(group => group.displayName === 'published');
assert.equal(published.used, true);
assert.equal(published.published, true);
assert.equal(published.usedInDraft, false);
assert.equal(groups.find(group => group.name === 'favicon.ico').used, true);
const unused = groups.filter(group => !group.used).flatMap(group => group.variants);
assert.deepEqual(unused.map(file => file.name).sort(), ['standalone.webp', 'unused-480w.webp', 'unused-700w.webp']);
assert.equal(unused.find(file => file.name === 'unused-480w.webp').pending, true);
assert.equal(files[0].width, undefined);
assert.deepEqual(groupImageGalleryItems([]), []);
console.log('Image library checks passed.');
