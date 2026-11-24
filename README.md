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
lib/render.mjs          ← Shared content preparation and template engine
```

### Why this stack?

- **No framework** — faster load, no build toolchain, easy to maintain
- **Content in JSON** — clean separation from layout, editable via admin or directly
- **Build step** — content is baked into static HTML at build time for perfect SEO
- **Utility-first CSS** — reusable classes, consistent spacing/typography via CSS custom properties
- **Fonts** — three Google Fonts files only: Fraunces roman for headings and names, Fraunces italic for all italic text (`em`), and Nunito Sans for everything else. `template.html`, `template-legal.html`, and `admin/index.html` load the same URL. Do not add a font, a weight outside the loaded ranges, or `font-style: italic` on Nunito Sans.
- **Motion** — add `reveal-on-scroll` (and `reveal-from-left`/`reveal-from-right`) to fade a block in; a `reveal-stagger` parent delays its first six children. Hover effects go only on elements that respond to a click: links, buttons, FAQ questions, and the contact and resource cards. A stretched link (`::after`, `inset: 0`) makes the whole card clickable, so the card lift is honest. Static images and blocks never react to the pointer. They can move with the scroll: each timeline dot lights up as its row reaches the middle of the screen. Hover effects use the `translate`/`scale` properties, so they do not conflict with the reveal `transform`. Movement runs only under `prefers-reduced-motion: no-preference`. The hero drift, the reading progress bar, and the timeline dots use CSS scroll-driven animations and are static in browsers without support. `script.js` marks the nav link of the current section with `.is-current`.
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
| `seo` | Page title, meta description, OG image and alt text, favicon, Apple touch icon |
| `popup` | Visibility, title, message, image, alt text, dismiss label |
| `header` | Logo, alt text, site name, nav button text, screen reader names of the menu button and the navigation. The nav button links to the contact section, or to the form when contact is hidden. It does not show when both are hidden. `back_label` sets the link text at the top of the legal pages |
| `hero` | Label above the title, headline, subtitle, background image, arch portrait, alt text, booking button text, badges, screen reader text of the scroll cue. The phone button beside the booking button uses `contact.phone`. The portrait card shows `footer.business_name` and `footer.credentials`. On desktop, a scroll cue at the bottom of the hero links to the first visible section |
| `highlights` | Visibility, screen reader name of the band, item titles and descriptions |
| `services` | Visibility, heading, service titles, short descriptions, images, alt text |
| `about` | Visibility, title, biography, photo, alt text |
| `faq` | Visibility, heading, questions and answers |
| `contact` | Visibility, heading, subtitle, phone, address, and the three contact options (phone, online booking URL and label, form link) with titles and texts |
| `form` | Visibility, heading, subtitle, privacy note (Markdown), three steps, field labels, placeholders, optional-field mark, validation and server error messages, subject picker texts (`{n}` is the count, `{sujet}` the subject name), subject options, referral sources |
| `resources` | Visibility, heading, introduction, filter labels, item titles, themes, descriptions, URLs, images, alt text |
| `footer` | Business name, credentials, copyright, legal links and labels, admin link label, screen reader name of the footer navigation |
| `privacy_page`, `legal_page` | Page title, update date, Markdown body |
| `colors` | Palette taken from the logo: primary teal, button orange, text, background, and border colors. `bg_dark` (deep teal) is the footer color |
| `email` | Notification email to Audrey: sender name, subject (`{nom}`, `{sujets}`), first line, receipt line (`{date}`). The field names come from the `form` labels |

All visitor-facing text comes from `content/settings.json` and has a field in the admin, including screen reader labels. Code holds only symbols (`←`, `×`, `*`) and the hidden honeypot label.

Each toggleable section uses `enabled`. The header, hero, and footer always appear.
The main sections follow the table order from `hero` through `footer`.
The enabled sections alternate between a light tone (cream) and a teal tone, so two light sections never touch.
`styles.css` sets the tones by position with `:nth-child(… of .section)`, so hiding a section in the admin moves the tones automatically.
Each tone also has a quiet texture under the content: leaves from the logo tree near the edges of light sections, rings from one corner of teal sections, and a fine paper grain on every band. The shapes are CSS masks in `assets/patterns/`, so they take the palette colors. When the visitor did not ask for reduced motion and the browser supports scroll-driven animations, the leaves drift and the rings grow while the section crosses the screen.
Header and footer navigation includes only enabled sections with a non-empty `nav_label`.
Each section from `highlights` through `resources` stores this label beside its `anchor` under "Adresse de la section".
An empty or missing label hides the link. The hero has no menu label.
The admin groups content under "Page principale", "Pages secondaires", "Annonce", and "Configuration".
"Annonce" contains the popup. "Configuration" contains the header, notification email, colors, and SEO settings.
Each section has an `anchor` field that the admin can edit under "Adresse de la section". The defaults are French: `#accueil`, `#points-forts`, `#services`, `#a-propos`, `#faq`, `#contact`, `#ecrivez-moi`, `#ressources`.
`prepareContent` in `lib/render.mjs` changes each value into a slug (lowercase, no accents, hyphens). It uses the default from `DEFAULT_ANCHORS` when the value is empty, already used by another section, or equal to an id in `RESERVED_IDS` (the other ids in `template.html`).
The anchors do not update links typed in content, such as the `/#ecrivez-moi` links in the legal pages. `node lib/render.test.mjs` checks the reserved list against the template and checks that the page ids stay unique.

`highlights.items` replaces `about.values`. `resources` replaces `education`, and resource links open in a new tab.
The Resources section includes seven free French resources from official health organizations, public services, and family support organizations.
They cover early childhood, adoption, adolescence, grief, and psychosocial support in Québec.
Each card shows its theme, the domain of its URL, and an icon that the theme selects (Adoption, Parentalité, Écoute, Deuil, else a generic icon). An optional image replaces the icon.
When the cards use two or more themes, filter chips show above the list. Without JavaScript, the chips stay hidden and all cards show.
Form fields, subject options, and referral sources now belong to `form`, not `contact`.
The header button, primary hero button, and contact booking button use `contact.booking_url`.
These links open in a new tab with `rel="noopener noreferrer"`. The site no longer embeds the booking widget.

Content images have matching `*_alt` fields. The build warns when an image path has no alt text.
`prepareContent()` in `lib/render.mjs` prepares both builds and previews.
It sanitizes Markdown, derives navigation, and serializes `LocalBusiness` JSON-LD with the logo and portrait.
The template engine escapes other values as HTML.

### Images

The admin creates WebP variants at quality `0.82`, without enlargement. The content field stores the largest variant path.
Names use `<base>-<width>w.webp`. Width sets depend on the field:

- `hero.image`: 960, 1440, 1920, 2560, 3840 pixels.
- `seo.og_image`: 480, 960, 1200 pixels.
- Other raster images: 480, 960, 1440, 1920 pixels.

The source width caps each set. A 700-pixel standard image produces 480- and 700-pixel variants.
SVG, ICO, and SEO icons keep their formats. Apple touch icons must remain 180 × 180 PNG files.
`lib/images.mjs` supplies the shared width rules and `srcset` values. The templates use per-image `sizes` and keep plain paths unchanged.

Open `Médias` → `Bibliothèque d’images` to see grouped variants, usage badges, filters, and pending uploads.
The removal dialog lists every unused file before deletion. It deletes published files sequentially and reports each failure.
Draft references, published references, Markdown references, and the fixed admin icon prevent removal of the complete image group.
Pending files remain local until publication. Run `node admin/image-gallery.test.mjs` and `node lib/render.test.mjs` for the image checks.

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
# mentions-legales.html, sitemap.xml, robots.txt, _redirects
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

The form is separate from the contact details. On wide screens a panel with the steps and the privacy note shows beside the form.
The subject dropdown shows the number of selected subjects. The selected subjects show below it as removable chips.
The referral source is an optional native select. Required fields show French validation messages when the visitor leaves them.
`POST /api/contact` accepts `subjects: string[]` with 1 to 10 non-empty items, each at most 200 characters. `message` has a limit of 3000 characters, the same as the textarea.
It no longer accepts the single `subject` field. The email includes the subjects in both its text and HTML parts.
An error response holds a message key (`error`, `emailInvalid`, `subjectRequired`, `captcha`), not a sentence. `script.js` shows the matching `form` message from the content.
The function imports `content/settings.json` for the email text (`email` section and `form` labels). A content change takes effect at the next deployment.
The email subject comes from `email.subject` and has a 200-character limit. The receipt time uses the `America/Toronto` time zone.
The `Reply-To` header uses the validated visitor email address, so replies go to the visitor.

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
│   ├── patterns/           # Section texture masks (leaves, rings, grain); not in the image library
│   └── images/             # Site images and icons
│       ├── favicon.ico
│       ├── favicon-192.png
│       └── apple-touch-icon.png
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
│   ├── render.mjs          # Shared content preparation and template engine
│   └── render.test.mjs     # Renderer checks: node lib/render.test.mjs
├── docs/
│   ├── admin-auth.md       # Admin security model and maintenance rules
│   └── deployment.md       # Cloudflare deployment, env, and worker setup
├── _headers                # Cloudflare Pages security headers
├── _redirects              # Generated redirect from /favicon.ico to seo.favicon
├── .gitignore
├── build.js                # Generates static pages, metadata, and _redirects
├── package.json
├── script.js               # Client-side interactivity
├── styles.css              # Utility-first CSS framework
├── template.html           # Home page template with {{placeholders}}
└── template-legal.html     # Shared legal page template
```

## License

[MIT](LICENSE)
