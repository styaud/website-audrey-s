# Claude Code Project Guide

See [README.md](README.md) for architecture, file structure, and deployment instructions.

## Commands

- `node build.js` — generate index.html, sitemap.xml, robots.txt
- `npm run dev` — build + start wrangler local dev server (port 8788)

## Conventions

- **No frameworks** — vanilla HTML/CSS/JS only. `marked` (npm) for server-side markdown rendering. Admin editor uses `EasyMDE` (CDN) which bundles `marked` internally.
- **CSS order** — reset → variables → components → utilities → responsive → page-level. Utilities must come AFTER components so they always win. No `!important`. No ID selectors for styling.
- **French accents** — all user-facing text must have proper diacritics (é, è, ê, à, ç, ô, î, û). Content is French, code/comments are English.
- **Privacy** — the contact email must NEVER appear in any tracked file or git history. It lives only in `.dev.vars` (gitignored) and Cloudflare env vars.
- **Generated files** — `index.html`, `sitemap.xml`, `robots.txt` are gitignored. Never edit them directly.
- **Markdown** — `marked` library for full CommonMark. Rendering logic lives in `lib/render.mjs` only (shared by `build.js` and `functions/api/preview.js`). Don't duplicate it.
- **Images** — uploaded via admin are auto-compressed to WebP. SVGs pass through without conversion.

## Common tasks

### Adding a new editable field
1. Add to `content/settings.json`
2. Add `{{key.path}}` in `template.html`
3. Add field definition in `admin/admin.js` SECTIONS array (with label, type, hint, and `plain: true` for URLs/metadata)
4. If it's a block-level markdown field, add to `processMarkdown()` in `lib/render.mjs`

### Modifying CSS
- Utilities go in section 4 (after components)
- Responsive variants go in section 6
- Page-specific styles go in section 7
- Always use CSS custom properties from `:root`
