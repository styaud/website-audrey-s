# AGENTS.md

This repo is a vanilla static site for `audreyhauteurdenfant.com` with Cloudflare Pages Functions for admin auth, previews, and contact form handling.

## Start Here

- Read [README.md](README.md) for the architecture and deployment overview.
- Read [docs/admin-auth.md](docs/admin-auth.md) before touching admin auth, uploads, preview, or GitHub API behavior.
- Read [docs/deployment.md](docs/deployment.md) before changing Cloudflare, Wrangler, Turnstile, email, or environment setup.

## Commands

- `npm run build` - runs `node build.js` and generates the gitignored static output files.
- `npm run dev` - builds and starts `wrangler pages dev` on port `8788`.
- `node --check <file>` - syntax-check changed JavaScript modules.
- `node lib/render.test.mjs` - run the renderer checks for sanitization, navigation, and content preparation.

For behavior changes, run the renderer checks, `npm run build`, JavaScript syntax checks, and local Wrangler/browser checks.

## Generated Files

Do not edit these directly:

- `index.html`
- `politique-de-confidentialite.html`
- `mentions-legales.html`
- `sitemap.xml`
- `robots.txt`
- `_redirects`

Edit source files such as `content/settings.json`, `template.html`, `template-legal.html`, `styles.css`, `build.js`, and files under `lib/`, `admin/`, or `functions/`.

## Admin Security Rules

- Admin access must remain driven only by GitHub repo write/admin permissions on `styaud/website-audrey-s`.
- The intended GitHub accounts are `styaud` and `po-trottier`; enforce that in GitHub repository permissions, not in source code.
- Do not use GitHub's contributors endpoint for authorization.
- Do not add a username allow-list to repo files.
- Do not store GitHub access tokens in `sessionStorage`, `localStorage`, or browser-visible JavaScript state.
- Keep GitHub tokens sealed inside the `HttpOnly` admin session cookie handled by `lib/admin-auth.mjs`.
- Admin browser code must call same-origin typed APIs under `/api/admin/*`; it must not call `api.github.com` directly.
- Mutating admin APIs, logout, and preview must require same-origin requests, JSON content type, and `X-CSRF-Token`.
- Permission checks must fail closed on GitHub denial, timeout, rate limit, or malformed responses.
- Do not add floating or unpinned third-party scripts to `/admin/`. Any third-party admin script can act as the signed-in admin, so external admin scripts must be version-pinned and protected with Subresource Integrity.

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
- Do not put real secrets in templates, docs, generated HTML, or tracked config.
- `ADMIN_SESSION_SECRET` must be unique per environment.
- `TURNSTILE_SITE_KEY` is public and read at build time. Runtime secrets include `GITHUB_CLIENT_SECRET`, `ADMIN_SESSION_SECRET`, `TURNSTILE_SECRET`, and contact/email settings.

## Documentation Rules

- Update README plus the relevant file under `docs/` whenever repo behavior, deployment, environment variables, auth, uploads, preview, or generated outputs change.
- Keep this file and `CLAUDE.md` aligned when adding durable agent guidance.
