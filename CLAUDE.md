# Claude Code Project Guide

See [README.md](README.md) for architecture, file structure, and deployment instructions. See [docs/admin-auth.md](docs/admin-auth.md) for admin security rules and [docs/deployment.md](docs/deployment.md) for Cloudflare setup.

## Commands

- `npm run build` - generate `index.html`, `politique-de-confidentialite.html`, `mentions-legales.html`, `sitemap.xml`, and `robots.txt`
- `npm run dev` - build, then start `wrangler pages dev` on port `8788`
- `node --check <file>` - quick JavaScript syntax check for changed `.js` or `.mjs` files

There is no automated test suite in this repo. Use `npm run build`, syntax checks for changed scripts, and targeted local Wrangler/browser checks when behavior changes.

## Conventions

- **No frameworks** - vanilla HTML/CSS/JS only. `marked` renders markdown server-side. The admin editor uses `EasyMDE` from a CDN.
- **CSS order** - reset -> variables -> components -> utilities -> responsive -> page-level. Utilities must come after components so they win. No `!important`. No ID selectors for styling.
- **French accents** - user-facing French text must keep proper diacritics such as é, è, ê, à, ç, ô, î, and û. Content is French; code and comments are English.
- **Privacy** - the contact email must never appear in tracked files or git history. It lives only in `.dev.vars` and Cloudflare secrets.
- **Generated files** - `index.html`, `politique-de-confidentialite.html`, `mentions-legales.html`, `sitemap.xml`, and `robots.txt` are gitignored build output. Never edit them directly.
- **Markdown** - rendering logic lives in `lib/render.mjs` only and is shared by `build.js` and `functions/api/preview.js`. Do not duplicate markdown rendering.
- **Images** - raster uploads are compressed to WebP by the admin UI. SVG and ICO uploads are allowed, but server validation in `lib/admin-auth.mjs` must continue to reject unsafe names, traversal, invalid signatures, and active SVG content.

## Admin Access Rules

- `/admin/` access is controlled by GitHub OAuth plus GitHub repository permissions on `styaud/website-audrey-s`.
- Do not use the GitHub contributors endpoint for access control.
- Do not add a repo-stored username allow-list. To limit access to `styaud` and `po-trottier`, keep GitHub write/admin repo permissions limited to those accounts.
- Do not expose GitHub access tokens to browser JavaScript. Tokens must stay inside the sealed `HttpOnly` admin session cookie.
- Browser admin code must use same-origin `/api/admin/*`, `/api/auth/logout`, and `/api/preview` endpoints.
- Mutating admin requests, logout, and preview must keep same-origin, JSON content-type, and CSRF checks.
- Update [docs/admin-auth.md](docs/admin-auth.md) whenever admin auth, upload validation, session handling, or CSRF behavior changes.

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
