# Deployment And Environment

This site is a static Cloudflare Pages project with Pages Functions for admin auth, preview rendering, and contact form handling.

## Generated Files

`npm run build` runs `node build.js` and writes:

- `index.html`
- `politique-de-confidentialite.html`
- `mentions-legales.html`
- `sitemap.xml`
- `robots.txt`

These files are generated output, are gitignored, and must not be edited directly. Edit `content/settings.json`, `template.html`, `template-legal.html`, `styles.css`, or shared rendering code instead.

## Local Development

1. Run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars`.
3. Fill in local values. `.dev.vars` is gitignored and may contain secrets.
4. Run `npm run dev` to build and start `wrangler pages dev` on port `8788`.

`build.js` loads `.dev.vars` before rendering, so local `TURNSTILE_SITE_KEY` values are baked into generated HTML. `wrangler.toml` pins the local Workers compatibility date used by Wrangler.

## Environment Variables

Keep `.dev.vars.example` and local `.dev.vars` synchronized by variable name whenever environment variables change.

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App secret |
| `ADMIN_SESSION_SECRET` | Secret used to seal the admin session cookie |
| `TURNSTILE_SITE_KEY` | Public Turnstile site key injected at build time |
| `TURNSTILE_SECRET` | Turnstile secret used by `/api/contact` |
| `CONTACT_EMAIL` | Verified sender address for Cloudflare Email Routing |
| `CONTACT_DESTINATION` | Recipient for contact form messages |

Generate `ADMIN_SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Cloudflare Pages

Production build settings:

- Build command: `node build.js`
- Build output directory: `.`
- Production branch: `main`

Set `TURNSTILE_SITE_KEY` as a Pages environment variable because `build.js` reads it during the build. Set the other sensitive values as encrypted Pages secrets.

## Email Worker

The Pages Function at `/api/contact` delegates email delivery to `workers/email-sender`.

Production setup:

1. Deploy `workers/email-sender`.
2. Configure its `SEND_EMAIL` binding for Cloudflare Email Routing.
3. Add a Pages service binding named `EMAIL_WORKER` pointing at the deployed email Worker.
4. Redeploy the Pages project after changing bindings.

Local development can omit `EMAIL_WORKER`; `/api/contact` logs the generated MIME message instead of sending mail.

## Admin Access

Admin access is documented in [admin-auth.md](admin-auth.md). The short version: GitHub OAuth is only identity; authorization comes from GitHub repository write/admin permissions on `styaud/website-audrey-s`.
