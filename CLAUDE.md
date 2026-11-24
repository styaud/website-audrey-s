# Claude Code Project Guide

See [README.md](README.md) for architecture, file structure, and deployment instructions. See [docs/admin-auth.md](docs/admin-auth.md) for admin security rules and [docs/deployment.md](docs/deployment.md) for Cloudflare setup.

## Commands

- `npm run build` - runs `node build.js` and generates the gitignored static output files.
- `npm run dev` - build, then start `wrangler pages dev` on port `8788`
- `node --check <file>` - quick JavaScript syntax check for changed `.js` or `.mjs` files
- `node lib/render.test.mjs` - run the renderer checks for sanitization, navigation, and content preparation.

For behavior changes, run the renderer checks, `npm run build`, JavaScript syntax checks, and local Wrangler/browser checks.

## Conventions

- **No frameworks** - vanilla HTML/CSS/JS only. `marked` renders markdown server-side. The admin editor uses `EasyMDE` from a CDN.
- **CSS order** - reset -> variables -> components -> utilities -> responsive -> page-level. Utilities must come after components so they win. No `!important`. No ID selectors for styling.
- **French accents** - user-facing French text must keep proper diacritics such as é, è, ê, à, ç, ô, î, and û. Content is French; code and comments are English.
- **Privacy** - the contact email must never appear in tracked files or git history. It lives only in `.dev.vars` and Cloudflare secrets.
- **Generated files** - `index.html`, `politique-de-confidentialite.html`, `mentions-legales.html`, `sitemap.xml`, `robots.txt`, and `_redirects` are gitignored build output. Never edit them directly.
- **Markdown** - rendering logic lives in `lib/render.mjs` only and is shared by `build.js` and `functions/api/preview.js`. Do not duplicate markdown rendering.

## Admin Access Rules

- `/admin/` access is controlled by GitHub OAuth plus GitHub repository permissions on `styaud/website-audrey-s`.
- Do not use the GitHub contributors endpoint for access control.
- Do not add a repo-stored username allow-list. To limit access to `styaud` and `po-trottier`, keep GitHub write/admin repo permissions limited to those accounts.
- Do not expose GitHub access tokens to browser JavaScript. Tokens must stay inside the sealed `HttpOnly` admin session cookie.
- Browser admin code must use same-origin `/api/admin/*`, `/api/auth/logout`, and `/api/preview` endpoints.
- Mutating admin requests, logout, and preview must keep same-origin, JSON content-type, and CSRF checks.
- Do not add floating or unpinned third-party scripts to `/admin/`. Any third-party admin script can act as the signed-in admin, so external admin scripts must be version-pinned and protected with Subresource Integrity.
- Update [docs/admin-auth.md](docs/admin-auth.md) whenever admin auth, upload validation, session handling, or CSRF behavior changes.

## Upload Rules

- Uploads are limited to `assets/images/<safe-name>`.
- Allowed file types are `.webp`, `.jpg`, `.jpeg`, `.png`, `.svg`, and `.ico`.
- SVG and ICO are intentionally allowed. Keep the server-side validation that rejects traversal, slashes, unsafe SVG markup, invalid signatures, and oversized payloads.
- Raster uploads create `<base>-<width>w.webp` variants at quality `0.82`, without enlargement. Store the largest path in content.
- Use `lib/images.mjs` for width rules. Standard widths are 480/960/1440/1920, hero backgrounds use 960/1440/1920/2560/3840, and sharing images use 480/960/1200.
- Builds and previews derive `srcset` and per-image `sizes`. Plain paths keep one `src`. Pending previews use local data URLs.
- Preserve SVG and ICO uploads when validation passes.
- SEO favicon uploads preserve PNG or ICO. Apple touch icon uploads preserve PNG and require dimensions of 180 × 180 pixels.
- Keep `Médias` → `Bibliothèque d’images` grouped by variant family, with usage badges, filters, and a file count before removal.
- Draft, published, and Markdown references protect every variant. Keep the fixed admin favicon protected.
- Require a review dialog before removal. Delete unused files sequentially through the existing CSRF-protected API and report each failure.
- Keep `node admin/image-gallery.test.mjs` and `node lib/render.test.mjs` current when image behavior changes.

## Environment Rules

- Keep `.dev.vars.example` and local `.dev.vars` synchronized by variable name when environment variables change.
- Never commit `.dev.vars`.
- `ADMIN_SESSION_SECRET` must be generated per environment and must not be reused from examples.
- `TURNSTILE_SITE_KEY` is public and read by `build.js`; `TURNSTILE_SECRET`, GitHub OAuth secrets, and contact settings are runtime secrets.
- Update [docs/deployment.md](docs/deployment.md) when Cloudflare Pages, Wrangler, Turnstile, email Worker, or environment setup changes.

## Common Tasks

### Adding a new editable field

1. Add it to `content/settings.json`.
2. Add the matching `{{key.path}}` placeholder in `template.html` or `template-legal.html`.
3. Add a field definition in the `SECTIONS` array in `admin/admin.js`.
4. If it is a block-level markdown field, add it to `processMarkdown()` in `lib/render.mjs`.

### Modifying CSS

- Utilities go in section 4, after components.
- Responsive variants go in section 6.
- Page-specific styles go in section 7.
- Always use CSS custom properties from `:root`.
