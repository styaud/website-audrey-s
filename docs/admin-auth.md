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

### Content Organization

The sidebar groups content under "Page principale", "Pages secondaires", "Annonce", and "Configuration".
"Annonce" contains "Fenêtre contextuelle". "Configuration" contains the header, notification email, colors, and SEO settings.
Each section from `highlights` through `resources` stores its own `nav_label` beside `anchor` under "Adresse de la section".
An empty or missing label hides the header and footer link. A disabled section also has no link.
The header form stores the legal pages' return link text in `header.back_label`.
The Resources form controls visibility, introduction, filter labels, themes, and resource cards.
Each theme has a name, an icon, and a color: the primary color or the button color. The icon picker searches the full Lucide pack by name and English tags, and shows 60 results at a time.
Each card has a title, a theme from a drop-down list of the themes, a description, a URL, and an optional image that replaces the icon. The site derives the domain from the URL.
After a theme rename, choose the theme again on its cards. The drop-down list marks an unknown theme as "(introuvable)", and the site shows that card with no theme.
Resource links open in a new tab. Use free French resources from official organizations and check each URL before publication.

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

The admin converts raster uploads to WebP variants at quality `0.82`. It uses these width sets:

- `hero.image`: 960, 1440, 1920, 2560, 3840 pixels.
- `seo.og_image`: 480, 960, 1200 pixels.
- Other fields and library uploads: 480, 960, 1440, 1920 pixels.

Each set stops at the source width and contains no duplicate width. The admin never enlarges an image.
A 3000-pixel standard image creates four variants. A 700-pixel image creates 480- and 700-pixel variants.
File names use `<base>-<width>w.webp`, with a safe base and a random suffix. The content field stores the largest variant path.
`lib/images.mjs` shares width rules between the admin and renderer. Builds and previews add escaped `srcset` values and per-image `sizes`.
Plain image paths keep one `src`. The hero background alone uses `fetchpriority="high"`. Images below the first screen use lazy loading and asynchronous decoding.

The admin preserves SVG and ICO files. SEO icon fields are exceptions:

- `seo.favicon` accepts PNG or ICO and preserves the original format.
- `seo.apple_touch_icon` accepts only a 180 × 180 PNG and preserves the original format.
- Upload PNG icons through the SEO view. A PNG upload through the gallery becomes WebP.

These field-specific restrictions run in the browser. The image API validates the file name and payload, not the target content field.

### Gallery And Publication

Open `Médias` → `Bibliothèque d’images` to view repository images and pending uploads.
The library groups variants into one card. Each card shows a variant count, a path, and a copy action.
Usage badges show `Utilisée` or `Inutilisée`. Pending files show `À publier`.
The `Toutes`, `Utilisées`, and `Inutilisées` filters control the visible cards.

New images stay in browser memory until the user confirms `Publier`. Preview replaces their paths with local data URLs and removes their remote `srcset`.
Publication uploads every variant sequentially before it writes `content/settings.json`. Each file and the content use separate GitHub requests.
If a later request fails, earlier uploads remain in the repository. The editor retains their SHAs and does not upload them again.

Publication does not delete unused images. The gallery marks an image `Inutilisée` only when all these conditions apply:

- The current draft does not reference the image or any of its variants.
- The published content snapshot does not reference the image or any of its variants.
- Its path is not `assets/images/favicon.ico`, which the admin page uses as its fixed icon.

The reference scan reads strings throughout the content object, including Markdown. A reference to one variant protects the complete group.
The editor refreshes the published content snapshot when it loads content and after successful publication.
Remove image references and publish the content before deletion.

`Supprimer les images inutilisées (N)` counts unused files, including variants and pending files.
The review dialog lists every path before confirmation. Group removal uses the same dialog and includes every variant.
Deletion calls the existing `DELETE /api/admin/image` endpoint sequentially with the file name, SHA, and CSRF token.
The dialog reports each failure and refreshes the library after deletion. Pending files leave only the local upload queue.
Published files are deleted immediately, without another publication. Run `node admin/image-gallery.test.mjs` for grouping and reference checks.

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
