# Admin Authentication And Authorization

The `/admin/` editor is protected by GitHub OAuth and Cloudflare Pages Functions. Access is driven only by GitHub repository permissions for `styaud/website-audrey-s`.

## Access Policy

- A signed-in GitHub account must have write/admin permission on `styaud/website-audrey-s`.
- Do not use the GitHub contributors endpoint for admin access. Contributors are commit authors, not an access-control list.
- Do not add a username allow-list in repo files. To keep access limited to `styaud` and `po-trottier`, keep GitHub write/admin repo access limited to those accounts.
- Any other GitHub account granted write/admin permission to the repository can use the admin panel by design.

## OAuth And Session Flow

1. `/api/auth/github` creates OAuth `state` plus a PKCE verifier/challenge.
2. The OAuth state and PKCE verifier are stored in short-lived `HttpOnly` cookies.
3. GitHub redirects to `/api/auth/callback`.
4. The callback validates `state`, exchanges the code with GitHub, reads `GET /user`, then reads `GET /repos/styaud/website-audrey-s`.
5. The callback requires GitHub `permissions.push === true` or `permissions.admin === true`.
6. The GitHub token is sealed into an `HttpOnly` admin session cookie. Browser JavaScript must never receive or store the GitHub token.

Admin session cookies are AES-GCM encrypted with a key derived from `ADMIN_SESSION_SECRET` using HKDF-SHA256. Sessions contain the GitHub login, GitHub token, CSRF token, permission check timestamp, issue time, and expiry.

## Admin APIs

The browser talks only to same-origin admin APIs:

- `GET /api/admin/session` - returns authenticated status, login, permission, and CSRF token.
- `POST /api/auth/logout` - clears the admin session.
- `GET /api/admin/content` - reads `content/settings.json`.
- `PUT /api/admin/content` - writes `content/settings.json`.
- `GET /api/admin/images` - lists `assets/images`.
- `PUT /api/admin/image` - uploads one validated image.
- `DELETE /api/admin/image` - deletes one validated image.
- `POST /api/preview` - renders authenticated previews.

All mutating admin endpoints and preview require:

- A valid sealed admin session.
- Same-origin `Origin`.
- Safe `Sec-Fetch-Site`.
- `Content-Type: application/json`.
- `X-CSRF-Token` matching the sealed session.

Content and image writes force a live GitHub permission check. Reads and previews can reuse a permission check for five minutes. Each required GitHub check fails closed on denial, timeout, rate limit, or malformed responses.

The admin editor loads EasyMDE 2.21.0 and Font Awesome 6.5.2 from pinned CDN URLs with Subresource Integrity. Do not use floating versions such as `@2` or add unpinned scripts to `/admin/`. Third-party admin JavaScript can act as the signed-in admin.

### Preview And Content Security Policy

The editor posts draft content to `/api/preview` with same-origin credentials and `X-CSRF-Token`. The route uses `requireAdmin(context, { csrf: true })` and the request checks above. It renders HTML through `prepareContent()` and `render()` in `lib/render.mjs`, which the build also uses. The shared renderer escapes Markdown input and sanitizes the HTML output.

The editor assigns the returned HTML to an iframe through `srcdoc`. The iframe uses `sandbox="allow-scripts"` without `allow-same-origin`. It does not load `/api/preview` as an iframe URL. Preview omits the Turnstile widget and script. Before it assigns `srcdoc`, the editor replaces pending image and icon paths with local data URLs.

The `/admin/*` rule in `_headers` removes the public Content Security Policy (CSP) before it sets the admin policy:

- `frame-src` allows `'self'` and `https://challenges.cloudflare.com`.
- `script-src` allows `'self'`, jsDelivr, and Turnstile.
- `img-src` allows `'self'`, `data:`, `https:`, and `blob:` for images and local previews.
- The policy keeps `object-src 'none'`, `form-action 'self'`, and `frame-ancestors 'none'`.

## Upload Policy

Admin uploads are restricted to `assets/images/<safe-name>`.

Allowed extensions:

- `.webp`
- `.jpg`
- `.jpeg`
- `.png`
- `.svg`
- `.ico`

The server rejects traversal, slashes, backslashes, empty names, oversized payloads, invalid file signatures, and unsafe SVG markup. SVG uploads are allowed, but scripts, event handlers, external references, `foreignObject`, and similar active content are rejected.

The admin UI converts raster uploads to WebP with a maximum dimension of 1920 pixels and quality `0.82`. It preserves SVG and ICO files. SEO icon fields are exceptions:

- `seo.favicon` accepts PNG or ICO and preserves the original format.
- `seo.apple_touch_icon` accepts only a 180 × 180 PNG and preserves the original format.
- Upload PNG icons through the SEO view. A PNG upload through the gallery becomes WebP.

These field-specific restrictions run in the browser. The image API validates the file name and payload, not the target content field.

### Gallery And Publication

The image gallery lists repository images and pending uploads. It shows image paths, a copy action, usage labels, and an `À publier` label for pending uploads.

New images stay in browser memory until the user confirms `Publier`. Preview uses their local data URLs before upload. Publication uploads every pending image first, then writes `content/settings.json`. Each image upload and the content write use separate GitHub requests. If a later request fails, earlier uploads remain in the repository.

Publication does not delete unused images. The gallery marks an image `Inutilisée` only when all these conditions apply:

- The current draft does not reference its path.
- The published content snapshot does not reference its path.
- Its path is not `assets/images/favicon.ico`, which the admin page uses as its fixed icon.

The editor refreshes the published content snapshot when it loads content and after successful publication. The gallery disables removal for all other images. Remove image references and publish the content before deletion.

The gallery requires confirmation for removal. Removal of a pending image only removes it from the upload queue. Deletion of a repository image calls `DELETE /api/admin/image` immediately, without another publication.

These reference and fixed-icon protections apply in the gallery UI only. The delete API checks authorization, CSRF, the image name, and the supplied SHA. It does not check content references or protect the fixed admin icon.

## Environment Variables

Cloudflare Pages and local `.dev.vars` must define the same variable names as `.dev.vars.example`:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `ADMIN_SESSION_SECRET`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET`
- `CONTACT_EMAIL`
- `CONTACT_DESTINATION`

Generate `ADMIN_SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Never commit `.dev.vars`; it is gitignored and contains local secrets.

## Troubleshooting

If `po-trottier` or `styaud` can push to the repository but OAuth still fails:

- Confirm the browser returned to `/admin/?error=...`; the error code matters.
- `session_config` means Cloudflare is missing a valid `ADMIN_SESSION_SECRET` or it is too short.
- `repo_permission` means GitHub did not report write/admin permission for the OAuth token.
- `repo_check` means GitHub user lookup succeeded, but the repository permission check failed or timed out.
- `github_user` means GitHub issued an OAuth token, but `GET /user` failed.
- `session_create` means permission passed, but the encrypted admin session cookie could not be created.
- `oauth_state` usually means the callback cookies expired or the OAuth flow was restarted midway.
- `oauth_token` or `oauth_failed` means GitHub token exchange or session creation failed.

You can confirm GitHub's permission view locally with:

```bash
gh api repos/styaud/website-audrey-s --jq '{permissions:.permissions, private:.private, visibility:.visibility}'
gh api repos/styaud/website-audrey-s/collaborators/po-trottier/permission --jq '{permission, role_name}'
```
