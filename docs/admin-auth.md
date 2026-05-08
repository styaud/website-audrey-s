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
- A fresh GitHub write/admin permission check for mutating requests.
- Same-origin `Origin`.
- Safe `Sec-Fetch-Site`.
- `Content-Type: application/json`.
- `X-CSRF-Token` matching the sealed session.

Permission checks are cached briefly in the sealed session for non-mutating requests. Mutating requests check GitHub permissions live and fail closed on denial, timeout, rate limit, or malformed GitHub response.

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
- `oauth_state` usually means the callback cookies expired or the OAuth flow was restarted midway.
- `oauth_token` or `oauth_failed` means GitHub token exchange or session creation failed.

You can confirm GitHub's permission view locally with:

```bash
gh api repos/styaud/website-audrey-s --jq '{permissions:.permissions, private:.private, visibility:.visibility}'
gh api repos/styaud/website-audrey-s/collaborators/po-trottier/permission --jq '{permission, role_name}'
```
