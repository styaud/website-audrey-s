# Audrey Stypulkowski — Website

Static single-page website for Audrey Stypulkowski (`audreyhauteurdenfant.com`).

## Architecture

**Zero frameworks, zero runtime dependencies.** The site is vanilla HTML/CSS/JS with a build step that generates static files from content data.

```
content/settings.json   ← All editable content (text, image paths, config)
template.html           ← Page layout with {{placeholders}}
build.js                ← Reads content + templates → generates static output
styles.css              ← Utility-first CSS framework (Tailwind-style, hand-written)
script.js               ← Interactivity (menu, accordion, popup, form, scroll effects)
admin/                  ← Custom admin panel with GitHub OAuth
functions/              ← Cloudflare Pages Functions (OAuth, admin API, contact form)
lib/admin-auth.mjs      ← Shared admin auth/session/GitHub API helpers
```

### Why this stack?

- **No framework** — faster load, no build toolchain, easy to maintain
- **Content in JSON** — clean separation from layout, editable via admin or directly
- **Build step** — content is baked into static HTML at build time for perfect SEO
- **Utility-first CSS** — reusable classes, consistent spacing/typography via CSS custom properties
- **Cloudflare Pages** — free hosting, unlimited bandwidth, global CDN, serverless functions

## Content Management

The admin panel at `/admin/` provides a visual editor for all site content. Authentication uses GitHub OAuth. Admin access is granted only when GitHub reports that the signed-in account has write/admin permission on this repo.

See [docs/admin-auth.md](docs/admin-auth.md) for the complete admin security model. See [docs/deployment.md](docs/deployment.md) for the Cloudflare environment and email Worker setup.

### How it works

1. Admin logs in via GitHub OAuth at `/admin/`
2. Edits text, images, toggles (popup, services, FAQ, etc.)
3. Clicks "Publish" — Cloudflare verifies the admin session, re-checks GitHub repo permission, and commits changes to GitHub with the signed-in user's token
4. Cloudflare Pages detects the push, runs `node build.js`, deploys the new static site (~30s)

The GitHub token is stored only inside a sealed `HttpOnly` session cookie. Browser JavaScript talks to same-origin `/api/admin/*` endpoints and never stores or sends a raw GitHub token.

### Content structure

All content lives in `content/settings.json` with these sections:

| Section | What's editable |
|---------|----------------|
| `seo` | Page title, meta description, OG image, favicon |
| `popup` | Enable/disable + title + message + image |
| `header` | Logo, site name, CTA button |
| `hero` | Headline, subtitle, background image, CTAs |
| `services` | Section heading + list of service cards |
| `about` | Title, bio (markdown), photo, core values |
| `education` | Section heading + educational content items |
| `faq` | Section heading + Q&A pairs |
| `contact` | Heading, subtitle, phone, address, form subject options |
| `footer` | Business name, credentials, privacy link |

## Local Development

### Prerequisites

- Node.js (any recent version)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

### Setup

```bash
# Install dependencies
npm install

# Create local environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your GitHub OAuth credentials, admin session secret,
# Turnstile keys, and contact email settings
# Generate ADMIN_SESSION_SECRET with:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Build and start local dev server
npm run dev
```

The site will be available at `http://localhost:8788` with full Cloudflare Pages Functions support.

`wrangler.toml` pins the local Cloudflare Workers compatibility date so `npm run dev` does not depend on the current calendar date.

### Build only

```bash
node build.js
# Generates: index.html, politique-de-confidentialite.html,
# mentions-legales.html, sitemap.xml, robots.txt
```

## Deployment (Cloudflare Pages)

### 1. Authenticate Wrangler

```bash
wrangler login
```

This opens a browser window. Authorize Wrangler to access your Cloudflare account.

### 2. Create the Pages project

```bash
wrangler pages project create website-audrey-s --production-branch main
```

### 3. Set secrets and environment variables

```bash
wrangler pages secret put GITHUB_CLIENT_ID --project-name website-audrey-s
wrangler pages secret put GITHUB_CLIENT_SECRET --project-name website-audrey-s
wrangler pages secret put ADMIN_SESSION_SECRET --project-name website-audrey-s
wrangler pages secret put TURNSTILE_SECRET --project-name website-audrey-s
wrangler pages secret put CONTACT_EMAIL --project-name website-audrey-s
wrangler pages secret put CONTACT_DESTINATION --project-name website-audrey-s
```

Each command prompts for the value.

`ADMIN_SESSION_SECRET` seals the admin session cookie. Use a unique generated value for production.

Set the public `TURNSTILE_SITE_KEY` as a Cloudflare Pages environment variable in Settings > Environment variables. It is read by `node build.js`, so production builds must not rely on the local test key fallback.

### 4. Connect to GitHub for auto-deploy

Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > Pages > your project > Settings > Builds & deployments:

- **Production branch**: `main`
- **Build command**: `node build.js`
- **Build output directory**: `.`
- **Root directory**: `/`

Connect the GitHub repo. Every push to `main` triggers a build and deploy.

### 5. Custom domain

In the Cloudflare dashboard, go to Pages > your project > Custom domains > Add:
- Add `audreyhauteurdenfant.com`
- Follow the DNS instructions (if the domain is already on Cloudflare, it auto-configures)

### 6. GitHub OAuth App

Create at [github.com/settings/developers](https://github.com/settings/developers):
- **Application name**: `Audrey Stypulkowski Admin`
- **Homepage URL**: `https://audreyhauteurdenfant.com`
- **Callback URL**: `https://audreyhauteurdenfant.com/api/auth/callback`

Use the Client ID and Client Secret as the `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` secrets (step 3).

Admin authorization is driven by GitHub repository permissions. Keep write/admin access on `styaud/website-audrey-s` limited to the intended admin accounts (`styaud` and `po-trottier`); any other GitHub account with write/admin access will also be able to use `/admin/`.

The OAuth flow validates `state`, uses PKCE, verifies `GET /user`, and authorizes via the repository `permissions.push/admin` values returned by GitHub. Do not replace this with the GitHub contributors endpoint or a repo-stored username list.

### 7. Cloudflare Turnstile

Create a widget at [dash.cloudflare.com/turnstile](https://dash.cloudflare.com/turnstile):
- **Site name**: `audreyhauteurdenfant.com`
- **Domains**: `audreyhauteurdenfant.com`
- Set the **Site Key** as `TURNSTILE_SITE_KEY`
- Set the **Secret Key** as `TURNSTILE_SECRET`

### 8. Email routing

Enable [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) on the domain. The contact form uses `CONTACT_EMAIL` as the verified sender address and `CONTACT_DESTINATION` as the recipient.

Deploy `workers/email-sender` and bind it to the Pages project as `EMAIL_WORKER`. The email Worker owns the `SEND_EMAIL` binding. Local development can omit `EMAIL_WORKER`; `/api/contact` logs the MIME message instead of sending mail.

## Bot Protection

The contact form has three layers:
1. **Honeypot field** — hidden field that bots fill, humans don't see
2. **Cloudflare Turnstile** — privacy-friendly CAPTCHA widget
3. **Server-side Turnstile verification** — token validated before processing

## Project Structure

```
.
├── admin/
│   ├── index.html          # Admin panel (login + editor UI)
│   └── admin.js            # Admin UI logic (same-origin admin API calls)
├── assets/
│   └── images/             # Site images (uploaded via admin or manually)
├── content/
│   └── settings.json       # All editable content
├── functions/
│   └── api/
│       ├── admin/
│       │   ├── content.js  # Authenticated content read/write API
│       │   ├── image.js    # Authenticated image upload/delete API
│       │   ├── images.js   # Authenticated image listing API
│       │   └── session.js  # Authenticated session status API
│       ├── auth/
│       │   ├── github.js   # OAuth: state/PKCE redirect to GitHub
│       │   ├── callback.js # OAuth: verify GitHub permission + seal session
│       │   └── logout.js   # Clear admin session
│       ├── contact.js      # Contact form handler + email
│       └── preview.js      # Authenticated server-side preview rendering
├── lib/
│   ├── admin-auth.mjs      # Shared admin auth/session/GitHub helpers
│   └── render.mjs          # Shared template engine (build + preview)
├── docs/
│   ├── admin-auth.md       # Admin security model and maintenance rules
│   └── deployment.md       # Cloudflare deployment, env, and worker setup
├── _headers                # Cloudflare Pages security headers
├── .gitignore
├── build.js                # Build script: content + template → index.html
├── package.json
├── script.js               # Client-side interactivity
├── styles.css              # Utility-first CSS framework
└── template.html           # HTML template with {{placeholders}}
```

## License

[MIT](LICENSE)
