// ============================================================================
//  ADMIN.JS — Custom CMS for Audrey Stypulkowski
//  Vanilla JS. Uses server-side GitHub OAuth for auth and content management.
// ============================================================================

// ---- CONFIG ----------------------------------------------------------------
const IMAGES_PATH = 'assets/images';
const API = {
  session: '/api/admin/session',
  logout: '/api/auth/logout',
  content: '/api/admin/content',
  images: '/api/admin/images',
  image: '/api/admin/image',
  preview: '/api/preview',
};

const COLOR_CSS_MAP = {
  primary: '--color-primary',
  primary_dark: '--color-primary-dark',
  primary_light: '--color-primary-light',
  accent: '--color-accent',
  accent_dark: '--color-accent-dark',
  text: '--color-text',
  text_light: '--color-text-light',
  bg: '--color-bg',
  bg_light: '--color-bg-light',
  bg_dark: '--color-bg-dark',
  border: '--color-border',
};

function applyColorTheme() {
  if (!content.colors) return;
  for (const [key, cssVar] of Object.entries(COLOR_CSS_MAP)) {
    const val = content.colors[key];
    if (val && /^#[0-9a-fA-F]{3,8}$/.test(val)) {
      document.documentElement.style.setProperty(cssVar, val);
    }
  }
}

function bindLiveColorTheming(card) {
  card.querySelectorAll('.admin-color-picker, .admin-color-text').forEach(input => {
    input.addEventListener('input', () => {
      const textInput = input.type === 'color'
        ? input.closest('.admin-field')?.querySelector('.admin-color-text')
        : input;
      if (!textInput) return;
      const path = textInput.dataset.path;
      if (!path) return;
      const colorKey = path.split('.').pop();
      const cssVar = COLOR_CSS_MAP[colorKey];
      const val = input.value;
      if (cssVar && /^#[0-9a-fA-F]{3,8}$/.test(val)) {
        document.documentElement.style.setProperty(cssVar, val);
      }
    });
  });
}

let content = {};          // Current content state (mirrors settings.json)
let contentSha = '';       // SHA of current settings.json (needed for updates)
let pendingImages = [];    // Images await publication. Each item includes a local preview.
let csrfToken = '';        // CSRF token returned by the authenticated session endpoint
let adminLogin = '';       // Authenticated GitHub login
let publishedImagePaths = new Set();
let hasUnpublishedChanges = false;
let preparingImages = 0;
let previewRequest = 0;
const markdownEditors = new WeakMap();

// ---- DOM REFS --------------------------------------------------------------
const $loginScreen  = document.getElementById('login-screen');
const $editorScreen = document.getElementById('editor-screen');
const $loginBtn     = document.getElementById('login-btn');
const $loginError   = document.getElementById('login-error');
const $sections     = document.getElementById('sections-container');
const $btnPreview   = document.getElementById('btn-preview');
const $btnPublish   = document.getElementById('btn-publish');
const $btnLogout    = document.getElementById('btn-logout');
const $statusDot    = document.getElementById('status-dot');
const $statusText   = document.getElementById('status-text');
const $statusTime   = document.getElementById('status-time');
const $toast        = document.getElementById('toast');
const $previewModal = document.getElementById('preview-modal');
const $previewFrame = document.getElementById('preview-frame');
const $previewStatus = document.getElementById('preview-status');

// ---- SECTION DEFINITIONS ---------------------------------------------------
// Describes the admin UI structure. Each section maps to a top-level key in
// settings.json. Fields describe the form controls to render.
const ALT_HINT = 'Décrivez l’image pour les lecteurs d’écran et Google';
// Section anchor: the part of the address after #, for example /#a-propos.
const anchorField = (example, extra = '') => ({
  key: 'anchor', label: 'Ancre dans l’adresse', type: 'text', plain: true, group: 'Adresse de la section',
  hint: `Exemple : ${example}. Le site garde les lettres minuscules sans accents, les chiffres et les traits d’union. Une ancre vide ou déjà utilisée reprend la valeur par défaut.${extra}`,
});
const SECTIONS = [
  { divider: true, label: 'Page principale' },
  {
    key: 'hero', label: 'Bannière principale',
    fields: [
      { key: 'eyebrow', label: 'Étiquette au-dessus du titre', type: 'text', plain: true, group: 'Contenu', hint: 'Courte phrase qui dit à qui s’adresse le site. Laissez vide pour la masquer.' },
      { key: 'title', label: 'Titre', type: 'text', markdown: true, group: 'Contenu' },
      { key: 'subtitle', label: 'Sous-titre', type: 'text', markdown: true, group: 'Contenu' },
      { key: 'image', label: 'Image de fond', type: 'image', group: 'Images', hint: 'Image large en arrière-plan de la bannière.' },
      { key: 'image_alt', label: 'Description de l’image de fond', type: 'text', plain: true, group: 'Images', hint: ALT_HINT },
      { key: 'portrait', label: 'Portrait', type: 'image', group: 'Images', hint: 'Portrait en arche (format vertical 3:4). Le nom et les titres du pied de page s’affichent sur le portrait.' },
      { key: 'portrait_alt', label: 'Description du portrait', type: 'text', plain: true, group: 'Images', hint: ALT_HINT },
      { key: 'cta_text', label: 'Bouton principal — texte', type: 'text', group: 'Boutons', hint: 'Le bouton ouvre le lien de réservation défini dans Contact. Le bouton à côté affiche le téléphone défini dans Contact.' },
      { key: 'scroll_label', label: 'Flèche de défilement', type: 'text', plain: true, group: 'Lecteurs d’écran', hint: 'Texte lu par les lecteurs d’écran. Sur ordinateur, la flèche en bas de la bannière mène à la section suivante.' },
      anchorField('accueil'),
    ],
    lists: [
      { key: 'badges', label: 'Repères sous les boutons', fields: [{ key: 'title', label: 'Texte', type: 'text', plain: true }] },
    ],
  },
  {
    key: 'highlights', label: 'Points forts', toggleable: true,
    fields: [
      { key: 'label', label: 'Nom de la bande', type: 'text', plain: true, group: 'Lecteurs d’écran', hint: 'Texte lu par les lecteurs d’écran. La bande n’a pas de titre visible.' },
      anchorField('points-forts'),
    ],
    list: {
      key: 'items', label: 'Points forts',
      fields: [
        { key: 'title', label: 'Titre', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ],
    },
  },
  {
    key: 'services', label: 'Services', toggleable: true,
    fields: [
      { key: 'heading', label: 'Titre de la section', type: 'text' },
      anchorField('services'),
    ],
    list: {
      key: 'items', label: 'Services',
      fields: [
        { key: 'title', label: 'Titre', type: 'text' },
        { key: 'description', label: 'Description courte', type: 'textarea', hint: 'Une ou deux phrases, affichées sous le titre.' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'image_alt', label: 'Description de l’image', type: 'text', plain: true, hint: ALT_HINT },
      ],
    },
  },
  {
    key: 'about', label: 'À propos', toggleable: true,
    fields: [
      { key: 'title', label: 'Titre', type: 'text' },
      { key: 'body', label: 'Présentation', type: 'textarea', hint: 'Le texte accepte le format Markdown.' },
      { key: 'photo', label: 'Photo', type: 'image', hint: 'Cette photo est distincte du portrait de la bannière.' },
      { key: 'photo_alt', label: 'Description de la photo', type: 'text', plain: true, hint: ALT_HINT },
      anchorField('a-propos'),
    ],
  },
  {
    key: 'faq', label: 'Questions fréquentes', toggleable: true,
    fields: [{ key: 'heading', label: 'Titre de la section', type: 'text' }, anchorField('faq')],
    list: {
      key: 'items', label: 'Questions et réponses',
      fields: [
        { key: 'question', label: 'Question', type: 'text' },
        { key: 'answer', label: 'Réponse', type: 'textarea' },
      ],
    },
  },
  {
    key: 'contact', label: 'Contact', toggleable: true,
    fields: [
      { key: 'heading', label: 'Titre', type: 'text', group: 'Coordonnées' },
      { key: 'subtitle', label: 'Sous-titre', type: 'textarea', group: 'Coordonnées' },
      { key: 'phone', label: 'Téléphone', type: 'text', plain: true, group: 'Coordonnées' },
      { key: 'address', label: 'Adresse', type: 'text', plain: true, group: 'Coordonnées', hint: 'L’adresse n’est pas affichée sur la page. Google la lit dans les données structurées du site.' },
      { key: 'call_title', label: 'Titre', type: 'text', group: 'Option 1 — Téléphone' },
      { key: 'call_text', label: 'Texte', type: 'text', plain: true, group: 'Option 1 — Téléphone', hint: 'Le bouton affiche le numéro de téléphone.' },
      { key: 'booking_title', label: 'Titre', type: 'text', group: 'Option 2 — Rendez-vous en ligne' },
      { key: 'booking_text', label: 'Texte', type: 'text', plain: true, group: 'Option 2 — Rendez-vous en ligne' },
      { key: 'booking_label', label: 'Texte du bouton', type: 'text', group: 'Option 2 — Rendez-vous en ligne' },
      { key: 'booking_url', label: 'Lien de réservation', type: 'text', plain: true, group: 'Option 2 — Rendez-vous en ligne', hint: 'Ce lien ouvre un nouvel onglet. Il sert aussi aux boutons de l’en-tête et de la bannière.' },
      { key: 'form_title', label: 'Titre', type: 'text', group: 'Option 3 — Formulaire' },
      { key: 'form_text', label: 'Texte', type: 'text', plain: true, group: 'Option 3 — Formulaire', hint: 'Cette option est masquée quand la section Formulaire est masquée.' },
      { key: 'form_link_label', label: 'Texte du bouton', type: 'text', group: 'Option 3 — Formulaire' },
      anchorField('contact'),
    ],
  },
  {
    key: 'form', label: 'Formulaire', toggleable: true,
    fields: [
      { key: 'heading', label: 'Titre', type: 'text', group: 'Présentation' },
      { key: 'subtitle', label: 'Sous-titre', type: 'textarea', group: 'Présentation' },
      { key: 'privacy_note', label: 'Note de confidentialité', type: 'textarea', group: 'Présentation', hint: 'Affichée sous les étapes. Le texte accepte le format Markdown.' },
      { key: 'form_name_label', label: 'Nom — libellé', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_name_placeholder', label: 'Nom — texte indicatif', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_email_label', label: 'Courriel — libellé', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_email_placeholder', label: 'Courriel — texte indicatif', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_phone_label', label: 'Téléphone — libellé', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_phone_placeholder', label: 'Téléphone — texte indicatif', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_subject_label', label: 'Sujets — libellé', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_subject_placeholder', label: 'Sujets — texte indicatif', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_message_label', label: 'Message — libellé', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_message_placeholder', label: 'Message — texte indicatif', type: 'text', plain: true, group: 'Libellés' },
      { key: 'form_optional', label: 'Mention des champs facultatifs', type: 'text', plain: true, group: 'Libellés', hint: 'Affichée après le libellé du téléphone et de la provenance.' },
      { key: 'form_submit', label: 'Bouton d’envoi', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_sending', label: 'Envoi en cours', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_success', label: 'Message de succès', type: 'textarea', plain: true, group: 'Messages' },
      { key: 'form_error', label: 'Message d’erreur', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_network_error', label: 'Erreur de connexion', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_subject_required', label: 'Sujet obligatoire', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_subject_limit', label: 'Limite de sujets', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_required_error', label: 'Champ obligatoire vide', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_email_error', label: 'Courriel invalide', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_captcha_error', label: 'Vérification anti-robot échouée', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_close', label: 'Bouton de fermeture', type: 'text', plain: true, group: 'Messages' },
      { key: 'form_referral_label', label: 'Provenance — libellé', type: 'text', plain: true, group: 'Provenance' },
      { key: 'form_referral_placeholder', label: 'Provenance — texte indicatif', type: 'text', plain: true, group: 'Provenance' },
      { key: 'form_subject_count_one', label: 'Un sujet choisi', type: 'text', plain: true, group: 'Choix des sujets', hint: 'Affiché dans la liste des sujets. {n} devient le nombre de sujets.' },
      { key: 'form_subject_count_other', label: 'Plusieurs sujets choisis', type: 'text', plain: true, group: 'Choix des sujets', hint: '{n} devient le nombre de sujets.' },
      { key: 'form_subject_none', label: 'Aucun sujet choisi', type: 'text', plain: true, group: 'Choix des sujets', hint: 'Texte lu par les lecteurs d’écran.' },
      { key: 'form_subject_remove', label: 'Bouton pour retirer un sujet', type: 'text', plain: true, group: 'Choix des sujets', hint: 'Texte lu par les lecteurs d’écran. {sujet} devient le nom du sujet.' },
      anchorField('ecrivez-moi', ' Si vous la changez, mettez aussi à jour les liens « /#ecrivez-moi » des pages légales.'),
    ],
    lists: [
      { key: 'steps', label: 'Étapes (comment ça se passe)', fields: [{ key: 'title', label: 'Titre', type: 'text', plain: true }, { key: 'text', label: 'Texte', type: 'text', plain: true }] },
      { key: 'form_subjects', label: 'Sujets du formulaire', fields: [{ key: 'title', label: 'Sujet', type: 'text', plain: true }] },
      { key: 'referral_sources', label: 'Sources de provenance', fields: [{ key: 'title', label: 'Source', type: 'text', plain: true }] },
    ],
  },
  {
    key: 'resources', label: 'Ressources', toggleable: true,
    fields: [
      { key: 'heading', label: 'Titre de la section', type: 'text' },
      { key: 'intro', label: 'Introduction', type: 'textarea' },
      anchorField('ressources'),
    ],
    list: {
      key: 'items', label: 'Ressources',
      fields: [
        { key: 'title', label: 'Titre', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'url', label: 'Lien', type: 'text', plain: true, hint: 'Le lien ouvre un nouvel onglet.' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'image_alt', label: 'Description de l’image', type: 'text', plain: true, hint: ALT_HINT },
      ],
    },
  },
  {
    key: 'footer', label: 'Pied de page',
    fields: [
      { key: 'business_name', label: 'Nom commercial', type: 'text' },
      { key: 'credentials', label: 'Accréditations', type: 'text' },
      { key: 'privacy_link', label: 'Lien de confidentialité', type: 'text', plain: true },
      { key: 'privacy_label', label: 'Libellé de confidentialité', type: 'text', plain: true },
      { key: 'legal_link', label: 'Lien des mentions légales', type: 'text', plain: true },
      { key: 'legal_label', label: 'Libellé des mentions légales', type: 'text', plain: true },
      { key: 'copyright', label: 'Mention du droit d’auteur', type: 'text', plain: true },
      { key: 'admin_link_label', label: 'Libellé du lien d’administration', type: 'text', plain: true },
      { key: 'nav_label', label: 'Nom des liens du pied de page', type: 'text', plain: true, hint: 'Texte lu par les lecteurs d’écran.' },
    ],
  },
  { divider: true, label: 'Pages secondaires' },
  {
    key: 'privacy_page', label: 'Politique de confidentialité',
    fields: [
      { key: 'title', label: 'Titre de la page', type: 'text' },
      { key: 'updated', label: 'Date de mise à jour', type: 'text', plain: true },
      { key: 'body', label: 'Contenu', type: 'textarea', hint: 'Le texte accepte le format Markdown.' },
    ],
  },
  {
    key: 'legal_page', label: 'Mentions légales',
    fields: [
      { key: 'title', label: 'Titre de la page', type: 'text' },
      { key: 'updated', label: 'Date de mise à jour', type: 'text', plain: true },
      { key: 'body', label: 'Contenu', type: 'textarea', hint: 'Le texte accepte le format Markdown.' },
    ],
  },
  { divider: true, label: 'Configuration' },
  {
    key: 'header', label: 'En-tête',
    fields: [
      { key: 'logo', label: 'Logo', type: 'image' },
      { key: 'logo_alt', label: 'Description du logo', type: 'text', plain: true, hint: ALT_HINT },
      { key: 'site_name', label: 'Nom du site', type: 'text', markdown: true },
      { key: 'cta_text', label: 'Texte du bouton', type: 'text', hint: 'Le bouton mène à la section Contact, où le visiteur choisit comment vous joindre. Si la section Contact est masquée, il mène au formulaire.' },
      { key: 'menu_label', label: 'Bouton du menu (mobile)', type: 'text', plain: true, hint: 'Texte lu par les lecteurs d’écran.' },
      { key: 'nav_label', label: 'Nom de la navigation', type: 'text', plain: true, hint: 'Texte lu par les lecteurs d’écran.' },
    ],
  },
  {
    key: 'nav', label: 'Navigation',
    fields: [
      { key: 'services', label: 'Services', type: 'text', plain: true, hint: 'Les liens apparaissent dans l’en-tête et le pied de page. Un libellé vide masque le lien.' },
      { key: 'about', label: 'À propos', type: 'text', plain: true },
      { key: 'faq', label: 'Questions fréquentes', type: 'text', plain: true },
      { key: 'contact', label: 'Contact', type: 'text', plain: true },
      { key: 'form', label: 'Formulaire', type: 'text', plain: true },
      { key: 'resources', label: 'Ressources', type: 'text', plain: true },
      { key: 'back_label', label: 'Retour au site', type: 'text', plain: true, hint: 'Lien en haut de la politique de confidentialité et des mentions légales.' },
    ],
  },
  {
    key: 'popup', label: 'Fenêtre contextuelle', toggleable: true,
    fields: [
      { key: 'title', label: 'Titre', type: 'text' },
      { key: 'message', label: 'Message', type: 'textarea' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'image_alt', label: 'Description de l’image', type: 'text', plain: true, hint: ALT_HINT },
      { key: 'dismiss_label', label: 'Texte du bouton de fermeture', type: 'text' },
    ],
  },
  {
    key: 'email', label: 'Courriel de notification',
    fields: [
      { key: 'from_name', label: 'Nom de l’expéditeur', type: 'text', plain: true, hint: 'Vous recevez un courriel à chaque message du formulaire. Les noms des champs viennent de la section Formulaire.' },
      { key: 'subject', label: 'Objet', type: 'text', plain: true, hint: '{nom} devient le nom du visiteur. {sujets} devient la liste des sujets.' },
      { key: 'heading', label: 'Première ligne', type: 'text', plain: true },
      { key: 'received', label: 'Ligne de réception', type: 'text', plain: true, hint: '{date} devient la date et l’heure de réception.' },
    ],
  },
  {
    key: 'colors', label: 'Couleurs',
    fields: [
      { key: 'primary', label: 'Couleur principale', type: 'color' },
      { key: 'primary_dark', label: 'Couleur principale foncée', type: 'color' },
      { key: 'primary_light', label: 'Couleur principale claire', type: 'color' },
      { key: 'accent', label: 'Couleur des boutons', type: 'color' },
      { key: 'accent_dark', label: 'Couleur des boutons (survol)', type: 'color' },
      { key: 'text', label: 'Texte principal', type: 'color' },
      { key: 'text_light', label: 'Texte secondaire', type: 'color' },
      { key: 'bg', label: 'Arrière-plan des cartes', type: 'color' },
      { key: 'bg_light', label: 'Arrière-plan des sections claires', type: 'color' },
      { key: 'bg_dark', label: 'Arrière-plan du pied de page', type: 'color' },
      { key: 'border', label: 'Bordures', type: 'color' },
    ],
  },
  {
    key: 'seo', label: 'Référencement',
    fields: [
      { key: 'title', label: 'Titre de l’onglet et des résultats Google', type: 'text', plain: true, hint: 'Visez 50 à 60 caractères.' },
      { key: 'description', label: 'Méta description', type: 'textarea', plain: true, hint: 'Visez 150 à 160 caractères. Cette métadonnée utilise du texte sans mise en forme.' },
      { key: 'og_image', label: 'Image de partage', type: 'image', hint: 'Format recommandé : 1200 × 630 pixels.' },
      { key: 'og_image_alt', label: 'Description de l’image de partage', type: 'text', plain: true, hint: ALT_HINT },
      { key: 'favicon', label: 'Icône du navigateur', type: 'image', accept: '.ico,.png', hint: 'Fichier ICO ou PNG. Le format original est conservé.' },
      { key: 'apple_touch_icon', label: 'Icône Apple', type: 'image', accept: '.png', hint: 'Fichier PNG de 180 × 180 pixels. Le format original est conservé.' },
    ],
  },
];

// ============================================================================
//  AUTH
// ============================================================================

// Check for an existing session on page load
(function init() {
  const error = new URLSearchParams(window.location.search).get('error');
  if (error) showLoginError(loginErrorMessage(error));

  loadSession().then(async authenticated => {
    if (!authenticated) return;
    const ok = await loadContent();
    if (ok) showEditor();
  });

  $loginBtn.addEventListener('click', handleLogin);
  $btnPreview.addEventListener('click', handlePreview);
  $btnPublish.addEventListener('click', handlePublish);
  if ($btnLogout) $btnLogout.addEventListener('click', handleLogout);
  document.getElementById('preview-close').addEventListener('click', () => $previewModal.close());
  $previewModal.addEventListener('close', () => {
    previewRequest += 1;
    $previewFrame.srcdoc = '';
    $previewFrame.hidden = true;
  });
  window.addEventListener('beforeunload', event => {
    if (hasUnpublishedChanges || pendingImages.length || preparingImages) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
})();

// Actions popover (mobile)
(function initPopover() {
  const toggle = document.getElementById('btn-actions-toggle');
  const popover = document.getElementById('actions-popover');
  const previewMobile = document.getElementById('btn-preview-mobile');
  const publishMobile = document.getElementById('btn-publish-mobile');
  const logoutMobile = document.getElementById('btn-logout-mobile');
  if (!toggle || !popover) return;

  toggle.addEventListener('click', () => popover.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !popover.contains(e.target)) {
      popover.classList.add('hidden');
    }
  });
  if (previewMobile) previewMobile.addEventListener('click', () => { popover.classList.add('hidden'); handlePreview(); });
  if (publishMobile) publishMobile.addEventListener('click', () => { popover.classList.add('hidden'); handlePublish(); });
  if (logoutMobile) logoutMobile.addEventListener('click', () => { popover.classList.add('hidden'); handleLogout(); });
})();

function loginErrorMessage(error) {
  const messages = {
    repo_permission: 'Accès refusé : votre compte GitHub doit avoir accès en écriture au dépôt.',
    oauth_state: 'Connexion GitHub expirée. Veuillez réessayer.',
    oauth_config: 'Configuration GitHub OAuth manquante.',
    oauth_token: 'GitHub n’a pas pu terminer la connexion. Veuillez réessayer.',
    github_user: 'Connexion GitHub réussie, mais le profil GitHub n’a pas pu être lu.',
    repo_check: 'Connexion GitHub réussie, mais la permission du dépôt n’a pas pu être vérifiée.',
    session_config: 'Configuration de session admin manquante. Vérifiez ADMIN_SESSION_SECRET dans Cloudflare.',
    oauth_failed: 'Connexion GitHub réussie, mais la session admin n’a pas pu être créée.',
    session_create: 'Connexion GitHub réussie, mais la session admin n’a pas pu être chiffrée.',
  };
  return messages[error] || 'Connexion admin impossible. Veuillez réessayer.';
}

async function handleLogin() {
  // Redirect to GitHub OAuth via our Cloudflare Function
  $loginBtn.disabled = true;
  $loginBtn.innerHTML = '<span class="spinner"></span> Redirection...';
  window.location.href = '/api/auth/github';
}

async function handleLogout() {
  try {
    await apiJson(API.logout, { method: 'POST', csrf: true });
  } catch (_) {
    // Continue with local logout even if the session already expired.
  }
  csrfToken = '';
  adminLogin = '';
  window.location.href = '/admin/';
}

function showLoginError(msg) {
  $loginError.textContent = msg;
  $loginError.classList.remove('hidden');
}

function showEditor() {
  $loginScreen.remove();
  $editorScreen.style.display = '';
  $editorScreen.classList.remove('hidden');
  applyColorTheme();
  renderSections();
}

// ============================================================================
//  ADMIN API HELPERS
// ============================================================================

function apiHeaders(includeCsrf = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (includeCsrf) headers['X-CSRF-Token'] = csrfToken;
  return headers;
}

async function apiJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: apiHeaders(options.csrf),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error('Connexion impossible. Vérifiez votre connexion Internet et réessayez.');
  }
  if (!response.ok) throw new Error(apiErrorMessage(response.status));
  return response.json();
}

function apiErrorMessage(status) {
  if (status === 401) return 'Votre session a expiré. Reconnectez-vous pour continuer.';
  if (status === 403) return 'Accès refusé. Reconnectez-vous et vérifiez vos permissions GitHub.';
  if (status === 409 || status === 422) return 'Le contenu a changé sur GitHub. Copiez vos modifications avant de recharger la page.';
  if (status === 400 || status === 413) return 'Le fichier ou le contenu est invalide. Vérifiez le format et la limite de 5 Mo par image.';
  return `Le serveur ne peut pas terminer cette opération (${status}). Réessayez plus tard.`;
}

async function loadSession() {
  try {
    const session = await apiJson(API.session);
    if (!session.authenticated) return false;
    csrfToken = session.csrfToken;
    adminLogin = session.login || '';
    return true;
  } catch (e) {
    console.error('Erreur de session :', e);
    return false;
  }
}

async function updateContent() {
  return apiJson(API.content, {
    method: 'PUT',
    csrf: true,
    body: { content, sha: contentSha },
  });
}

async function uploadImage(img) {
  return apiJson(API.image, {
    method: 'PUT',
    csrf: true,
    body: { name: img.name, contentBase64: img.base64 },
  });
}

async function deleteImage(file) {
  return apiJson(API.image, {
    method: 'DELETE',
    csrf: true,
    body: { name: file.name, sha: file.sha },
  });
}

async function listImages() {
  const data = await apiJson(API.images);
  return data.files || [];
}

function normalizeLocalImagePath(value) {
  const path = String(value || '').trim().replace(/^https?:\/\/[^/]+\//i, '').split(/[?#]/)[0].replace(/^\/+/, '');
  return path.startsWith(`${IMAGES_PATH}/`) ? path : '';
}

function collectImagePaths(source) {
  const paths = new Set();
  JSON.stringify(source, (_, value) => {
    if (typeof value === 'string') {
      for (const match of value.match(/\/?assets\/images\/[^\s"'<>),]+/gi) || []) {
        paths.add(normalizeLocalImagePath(match));
      }
    }
    return value;
  });
  return paths;
}

function imageAltForPath(path, source = content) {
  if (!source || typeof source !== 'object') return '';
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && normalizeLocalImagePath(value) === normalizeLocalImagePath(path)) {
      const alt = source[`${key}_alt`];
      if (typeof alt === 'string' && alt.trim()) return alt;
    }
    if (value && typeof value === 'object') {
      const alt = imageAltForPath(path, value);
      if (alt) return alt;
    }
  }
  return '';
}

// ============================================================================
//  CONTENT LOADING
// ============================================================================

async function loadContent() {
  try {
    setStatus('saving', 'Chargement...');
    const data = await apiJson(API.content);
    contentSha = data.sha;
    content = data.content;
    for (const section of getSections()) {
      if (section.toggleable) {
        content[section.key] ||= {};
        content[section.key].enabled ??= true;
      }
    }
    publishedImagePaths = collectImagePaths(content);
    hasUnpublishedChanges = false;
    setStatus('connected', adminLogin ? `Connecté : ${adminLogin}` : 'Connecté');
    return true;
  } catch (e) {
    console.error('Erreur de chargement :', e);
    setStatus('error', 'Erreur de chargement');
    return false;
  }
}

// ============================================================================
//  RENDER SECTIONS
// ============================================================================

let activeSection = null;

function getSections() {
  return SECTIONS.filter(s => !s.divider);
}

function getSectionLabel(sectionDef) {
  const data = content[sectionDef.key];
  return (data && data.admin_label) || sectionDef.label;
}

function updateSectionNavigation() {
  document.querySelectorAll('.admin-sidebar-item, .admin-mobile-tab').forEach(button => {
    const section = getSections().find(item => item.key === button.dataset.section);
    const label = section ? getSectionLabel(section) : 'Images';
    button.textContent = label;
    button.classList.toggle('active', button.dataset.section === activeSection);
    if (button.dataset.section === activeSection) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    if (section?.toggleable && content[section.key]?.enabled === false) {
      const badge = document.createElement('span');
      badge.className = 'admin-hidden-badge';
      badge.textContent = 'masquée';
      button.append(' ', badge);
    }
  });
}

function getDividerForSection(sectionKey) {
  let lastDivider = null;
  for (const s of SECTIONS) {
    if (s.divider) lastDivider = s.label;
    else if (s.key === sectionKey) return lastDivider;
  }
  return null;
}

function renderSections() {
  const sidebar = document.getElementById('admin-sidebar');
  const mobileTabs = document.getElementById('mobile-tabs');
  const sections = getSections();

  // Build sidebar
  sidebar.innerHTML = '';
  let currentDivider = null;
  sections.forEach(section => {
    const divider = getDividerForSection(section.key);
    if (divider !== currentDivider) {
      currentDivider = divider;
      const groupEl = document.createElement('div');
      groupEl.className = 'admin-sidebar-group';
      groupEl.textContent = divider;
      sidebar.appendChild(groupEl);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-sidebar-item';
    btn.textContent = getSectionLabel(section);
    btn.dataset.section = section.key;
    btn.addEventListener('click', () => showSection(section.key));
    sidebar.appendChild(btn);
  });

  // Build mobile tabs
  mobileTabs.innerHTML = '';
  sections.forEach(section => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'admin-mobile-tab';
    tab.textContent = getSectionLabel(section);
    tab.dataset.section = section.key;
    tab.addEventListener('click', () => showSection(section.key));
    mobileTabs.appendChild(tab);
  });

  for (const [target, className] of [[sidebar, 'admin-sidebar-item'], [mobileTabs, 'admin-mobile-tab']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.section = 'images';
    button.textContent = 'Images';
    button.addEventListener('click', () => showSection('images'));
    target.appendChild(button);
  }

  // Show first section
  showSection(sections[0].key);
}

function showSection(sectionKey) {
  if (preparingImages) {
    showToast('Attendez la préparation des images avant de changer de section.', 'error');
    return;
  }
  // Save current section's edits before switching
  collectContent();

  activeSection = sectionKey;
  updateSectionNavigation();
  disposeMarkdownEditors($sections);
  $sections.replaceChildren();
  if (sectionKey === 'images') {
    renderImagesView();
    return;
  }
  const sectionDef = getSections().find(section => section.key === sectionKey);
  if (!sectionDef) return;

  // Scroll active mobile tab into view
  const activeTab = document.querySelector('.admin-mobile-tab.active');
  if (activeTab) activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

  const container = $sections;

  const card = document.createElement('div');
  card.className = 'admin-content-card';

  // Editable section label
  const titleRow = document.createElement('div');
  titleRow.className = 'admin-content-title';
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = 'var(--space-3)';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'admin-section-label-input';
  titleInput.value = getSectionLabel(sectionDef);
  titleInput.dataset.path = `${sectionDef.key}.admin_label`;
  titleInput.setAttribute('aria-label', 'Nom de la section dans l’administration');
  titleInput.addEventListener('input', () => {
    setNestedValue(content, `${sectionDef.key}.admin_label`, titleInput.value.trim());
    updateSectionNavigation();
    markDirty();
  });

  const editIcon = document.createElement('span');
  editIcon.style.cssText = 'color: var(--color-text-light); font-size: var(--text-xs); flex-shrink: 0;';
  editIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

  titleRow.appendChild(titleInput);
  titleRow.appendChild(editIcon);
  card.appendChild(titleRow);

  if (sectionDef.toggleable) {
    card.appendChild(createField(sectionDef.key, {
      key: 'enabled', label: 'Section affichée', type: 'toggle',
      hint: 'Une section masquée disparaît aussi de la navigation du site.',
    }, content[sectionDef.key]?.enabled !== false));
  }

  // Build field grid with sub-groups
  const grid = document.createElement('div');
  grid.className = 'admin-field-grid';

  const sectionData = content[sectionDef.key] || {};
  let currentGroup = null;

  sectionDef.fields.forEach(field => {
    if (field.group && field.group !== currentGroup) {
      currentGroup = field.group;
      const header = document.createElement('div');
      header.className = 'admin-subgroup-header';
      header.textContent = field.group;
      grid.appendChild(header);
    }

    const fieldEl = createField(sectionDef.key, field, sectionData[field.key]);
    const isFullWidth = field.type === 'textarea' || field.type === 'image' || field.key.endsWith('_alt') || field.key === 'heading' || field.key === 'title';
    if (isFullWidth) fieldEl.classList.add('admin-field-full');
    grid.appendChild(fieldEl);
  });

  card.appendChild(grid);

  // Support both single `list` and multiple `lists`
  const allLists = sectionDef.lists || (sectionDef.list ? [sectionDef.list] : []);
  for (const listDef of allLists) {
    card.appendChild(createListEditor(sectionDef.key, listDef, sectionData[listDef.key] || []));
  }

  container.appendChild(card);

  // Scroll content to top
  document.querySelector('.admin-content')?.scrollTo(0, 0);

  if (sectionKey === 'colors') {
    bindLiveColorTheming(card);
  }
}

// ============================================================================
//  FIELD RENDERERS
// ============================================================================

function hintHtml(fieldDef) {
  return fieldDef.hint ? `<p class="admin-hint">${esc(fieldDef.hint)}</p>` : '';
}

function createField(sectionKey, fieldDef, value) {
  const group = document.createElement('div');
  group.className = 'admin-field';
  const dataPath = `${sectionKey}.${fieldDef.key}`;
  const id = `field-${dataPath.replace(/\./g, '-')}`;
  const label = `<label class="admin-label" for="${id}">${esc(fieldDef.label)}</label>${hintHtml(fieldDef)}`;

  if (fieldDef.type === 'toggle') {
    group.innerHTML = `${label}
      <div class="flex items-center gap-4 mt-2">
        <label class="admin-toggle">
          <input id="${id}" type="checkbox" role="switch" data-path="${dataPath}" ${value !== false ? 'checked' : ''}>
          <span class="admin-toggle-slider"></span>
        </label>
        <span class="admin-hint">${value !== false ? 'Affichée' : 'Masquée'}</span>
      </div>`;
    const input = group.querySelector('input');
    input.addEventListener('change', () => {
      setNestedValue(content, dataPath, input.checked);
      group.querySelector('span.admin-hint').textContent = input.checked ? 'Affichée' : 'Masquée';
      updateSectionNavigation();
      markDirty();
    });
  } else if (fieldDef.type === 'image') {
    const alt = getNestedValue(content, `${dataPath}_alt`) || String(value || '').split('/').pop();
    group.innerHTML = `${label}
      <div class="admin-image-field">
        <img class="admin-thumbnail" ${value ? `src="${esc(resolveImageSrc(value))}"` : 'hidden'} alt="${esc(alt)}">
        <div class="admin-image-controls">
          <input id="${id}" type="text" class="input" data-path="${dataPath}" value="${esc(value || '')}" placeholder="/assets/images/image.webp">
          <label class="admin-upload-btn">
            Choisir une image
            <input type="file" accept="${fieldDef.accept || '.webp,.jpg,.jpeg,.png,.svg,.ico'}" class="admin-file-input" data-image-path="${dataPath}" aria-label="${esc(`Téléverser : ${fieldDef.label}`)}">
          </label>
          <p class="admin-hint">L’image sera téléversée avec Publier. Utilisez un chemin de la bibliothèque pour réutiliser une image.</p>
        </div>
      </div>`;
    const pathInput = group.querySelector('input[type="text"]');
    pathInput.addEventListener('input', () => updateImageThumbnail(group, pathInput.value));
    group.querySelector('input[type="file"]').addEventListener('change', handleImageSelect);
  } else if (fieldDef.type === 'color') {
    group.innerHTML = `${label}
      <div class="flex items-center gap-3 mt-2">
        <input type="color" class="admin-color-picker" value="${esc(value || '#000000')}" aria-label="${esc(`Choisir : ${fieldDef.label}`)}">
        <input id="${id}" type="text" class="input admin-color-text" data-path="${dataPath}" value="${esc(value || '')}" placeholder="#000000" style="max-width: 8rem; font-family: monospace;">
      </div>`;
    const picker = group.querySelector('input[type="color"]');
    const text = group.querySelector('input[type="text"]');
    picker.addEventListener('input', () => { text.value = picker.value; });
    text.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value)) picker.value = text.value;
    });
    text.addEventListener('blur', () => {
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text.value)) text.value = picker.value;
    });
  } else if (fieldDef.type !== 'textarea' && !fieldDef.markdown) {
    group.innerHTML = `${label}<input id="${id}" type="text" class="input" data-path="${dataPath}" value="${esc(value || '')}">`;
  } else {
    const compact = fieldDef.type !== 'textarea';
    group.innerHTML = `${label}<textarea id="${id}" class="textarea" data-path="${dataPath}" rows="${compact ? 1 : 4}">${esc(value || '')}</textarea>`;
    requestAnimationFrame(() => {
      if (group.isConnected) initMarkdownEditor(group, compact, fieldDef.plain);
    });
  }

  group.addEventListener('input', markDirty);
  if (fieldDef.key.endsWith('_alt')) {
    group.querySelector('input').addEventListener('input', event => {
      const imagePath = dataPath.slice(0, -4);
      const scope = group.closest('.admin-edit-form, .admin-content-card');
      scope?.querySelectorAll('.admin-image-field').forEach(imageField => {
        if (imageField.querySelector('[data-path]')?.dataset.path === imagePath) {
          const image = imageField.querySelector('img');
          image.alt = event.target.value || imageField.querySelector('[data-path]').value.split('/').pop();
        }
      });
    });
  }
  return group;
}

function resolveImageSrc(path) {
  if (!path) return '';
  const pending = pendingImages.find(image => image.path === normalizeLocalImagePath(path));
  if (pending) return pending.previewUrl;
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  return '/' + path;
}

function updateImageThumbnail(group, path) {
  const image = group.querySelector('img');
  image.hidden = !path;
  if (path) image.src = resolveImageSrc(path);
  else image.removeAttribute('src');
  const dataPath = group.querySelector('[data-path]').dataset.path;
  const scope = group.closest('.admin-edit-form, .admin-content-card');
  const alt = Array.from(scope?.querySelectorAll('[data-path]') || []).find(input => input.dataset.path === `${dataPath}_alt`);
  image.alt = alt?.value || String(path || '').split('/').pop();
}

// ============================================================================
//  LIST EDITOR
// ============================================================================

function createListEditor(sectionKey, listDef, items) {
  const container = document.createElement('div');
  container.className = 'mt-6';
  container.dataset.listKey = `${sectionKey}.${listDef.key}`;

  const heading = document.createElement('div');
  heading.className = 'admin-subgroup-header flex items-center justify-between mb-4';
  heading.innerHTML = `
    <span class="admin-label" style="margin-bottom:0;font-size:var(--text-base);">
      ${esc(listDef.label || 'Éléments')}
    </span>
    <span class="text-xs text-light">${items.length} élément${items.length !== 1 ? 's' : ''}</span>
  `;
  container.appendChild(heading);

  // Items list
  const listEl = document.createElement('div');
  listEl.className = 'admin-list-items';
  items.forEach((item, index) => {
    listEl.appendChild(createListItem(sectionKey, listDef, item, index, items.length));
  });
  container.appendChild(listEl);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'admin-add-btn mt-3';
  addBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Ajouter
  `;
  addBtn.addEventListener('click', () => {
    collectContent();
    refreshList(container, sectionKey, listDef);
    const arr = getNestedValue(content, `${sectionKey}.${listDef.key}`) || [];
    const newItem = Object.fromEntries(listDef.fields.map(field => [field.key, '']));
    const form = createEditForm(sectionKey, listDef, newItem, arr.length);
    form.querySelector('[data-action="cancel"]').onclick = () => {
      disposeMarkdownEditors(form);
      form.remove();
    };
    form.querySelector('[data-action="save"]').onclick = () => {
      collectContent();
      markDirty();
      refreshList(container, sectionKey, listDef);
    };
    addBtn.before(form);
  });
  container.appendChild(addBtn);

  return container;
}

function createListItem(sectionKey, listDef, item, index, totalCount) {
  const el = document.createElement('div');
  el.className = 'admin-list-item';
  el.dataset.index = index;

  // Thumbnail (if list has image field)
  const imageField = listDef.fields.find(f => f.type === 'image');
  const titleField = listDef.fields.find(f => f.key === 'title' || f.key === 'question');
  const descField = listDef.fields.find(f => f.key === 'description' || f.key === 'answer');

  let thumbHtml = '';
  if (imageField && item[imageField.key]) {
    const alt = item[`${imageField.key}_alt`] || item[imageField.key].split('/').pop();
    thumbHtml = `<img src="${esc(resolveImageSrc(item[imageField.key]))}" alt="${esc(alt)}" class="admin-thumbnail">`;
  } else if (imageField) {
    thumbHtml = `<div class="admin-thumbnail-placeholder">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
    </div>`;
  }

  const title = item[titleField?.key] || `Élément ${index + 1}`;
  const desc = item[descField?.key] || '';

  // Compact mode for simple lists (single text field, no images)
  const isCompact = listDef.fields.length === 1 && !imageField;
  if (isCompact) el.classList.add('admin-list-item--compact');

  el.draggable = true;
  el.innerHTML = `
    <div class="admin-drag-handle" title="Glisser pour réordonner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>
    </div>
    ${thumbHtml}
    <div class="admin-list-item-body">
      <div class="admin-list-item-title">${esc(title)}</div>
      ${!isCompact && desc ? `<div class="admin-list-item-desc">${esc(desc)}</div>` : ''}
    </div>
    <div class="admin-actions">
      <button type="button" class="admin-btn-icon" title="Modifier" data-action="edit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button type="button" class="admin-btn-icon danger" title="Supprimer" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `;

  // Bind actions
  el.querySelector('[data-action="edit"]').addEventListener('click', () => {
    openListItemEditor(el, sectionKey, listDef, index);
  });

  // Drag and drop reorder (mouse + touch)
  const handle = el.querySelector('.admin-drag-handle');
  initDragReorder(handle, el, sectionKey, listDef, index);

  el.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (!confirm('Supprimer cet élément ?')) return;
    collectContent();
    markDirty();
    const arr = getNestedValue(content, `${sectionKey}.${listDef.key}`) || [];
    arr.splice(index, 1);
    setNestedValue(content, `${sectionKey}.${listDef.key}`, arr);
    const container = el.closest('[data-list-key]');
    refreshList(container, sectionKey, listDef);
  });

  return el;
}

// Create an edit form for a list item (reused by edit and add)
function createEditForm(sectionKey, listDef, item, index) {
  const form = document.createElement('div');
  form.className = 'admin-edit-form';

  listDef.fields.forEach(field => {
    form.appendChild(createField(`${sectionKey}.${listDef.key}.${index}`, field, item[field.key]));
  });

  const actions = document.createElement('div');
  actions.className = 'admin-edit-form-actions';
  actions.innerHTML = `
    <button type="button" class="btn btn-sm btn-ghost" data-action="cancel">Annuler</button>
    <button type="button" class="btn btn-sm btn-success" data-action="save">Enregistrer</button>
  `;
  form.appendChild(actions);
  return form;
}

function openListItemEditor(listItemEl, sectionKey, listDef, index) {
  const container = listItemEl.closest('[data-list-key]');
  collectContent();
  const existing = container.querySelector('.admin-edit-form');
  if (existing) {
    disposeMarkdownEditors(existing);
    existing.remove();
    container.querySelectorAll('.admin-list-item').forEach(item => { item.style.display = ''; });
  }

  const arr = getNestedValue(content, `${sectionKey}.${listDef.key}`) || [];
  const item = arr[index];
  if (!item) return;

  const form = createEditForm(sectionKey, listDef, item, index);

  // Insert form after the list item
  listItemEl.after(form);
  listItemEl.style.display = 'none';

  // Bind form actions
  form.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    disposeMarkdownEditors(form);
    form.remove();
    listItemEl.style.display = '';
  });

  form.querySelector('[data-action="save"]').addEventListener('click', () => {
    collectContent();
    markDirty();
    refreshList(container, sectionKey, listDef);
  });
}

function refreshList(container, sectionKey, listDef) {
  container.querySelectorAll('.admin-edit-form').forEach(form => {
    disposeMarkdownEditors(form);
    form.remove();
  });
  const arr = getNestedValue(content, `${sectionKey}.${listDef.key}`) || [];
  const listEl = container.querySelector('.admin-list-items');
  listEl.innerHTML = '';
  arr.forEach((item, index) => {
    listEl.appendChild(createListItem(sectionKey, listDef, item, index, arr.length));
  });
  // Update count
  const countEl = container.querySelector('.text-xs.text-light');
  if (countEl) {
    countEl.textContent = `${arr.length} élément${arr.length !== 1 ? 's' : ''}`;
  }
}

// ============================================================================
//  IMAGE HANDLING
// ============================================================================

async function handleImageSelect(event) {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  const group = input.closest('.admin-field');
  input.disabled = true;
  preparingImages += 1;
  try {
    const upload = await prepareImageUpload(file, input.dataset.imagePath);
    if (!group.isConnected) return;
    pendingImages.push(upload);
    const pathInput = group.querySelector('[data-path]');
    pathInput.value = `/${upload.path}`;
    updateImageThumbnail(group, pathInput.value);
    markDirty();
    showToast('Image préparée. Cliquez sur Publier pour la téléverser.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    preparingImages -= 1;
    input.disabled = false;
    input.value = '';
  }
}

async function prepareImageUpload(file, fieldPath = '') {
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['webp', 'jpg', 'jpeg', 'png', 'svg', 'ico'].includes(extension)) {
    throw new Error('Choisissez une image WebP, JPG, PNG, SVG ou ICO.');
  }
  if (!file.size) throw new Error('Le fichier est vide.');
  const isFavicon = fieldPath === 'seo.favicon';
  const isAppleIcon = fieldPath === 'seo.apple_touch_icon';
  if (isFavicon && !['ico', 'png'].includes(extension)) throw new Error('L’icône du navigateur doit être un fichier ICO ou PNG.');
  if (isAppleIcon && extension !== 'png') throw new Error('L’icône Apple doit être un fichier PNG de 180 × 180 pixels.');
  const preserve = extension === 'svg' || extension === 'ico' || isFavicon || isAppleIcon;
  if (preserve && file.size > 5 * 1024 * 1024) throw new Error('L’image dépasse la limite de 5 Mo.');
  if (isAppleIcon) {
    const image = await loadImageFile(file);
    if (image.width !== 180 || image.height !== 180) throw new Error('L’icône Apple doit mesurer 180 × 180 pixels.');
  }
  const result = preserve ? await readFileAsBase64(file) : await compressToWebP(file);
  if (result.base64Data.length * 3 / 4 > 5 * 1024 * 1024) throw new Error('L’image préparée dépasse la limite de 5 Mo.');
  const base = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 75).toLowerCase() || 'image';
  const name = `${base}-${crypto.randomUUID().slice(0, 8)}.${preserve ? extension : 'webp'}`;
  return { name, path: `${IMAGES_PATH}/${name}`, base64: result.base64Data, previewUrl: result.previewUrl };
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossible de lire cette image.')); };
    image.src = url;
  });
}

// Raster images use the existing 1920-pixel limit and WebP quality.
async function compressToWebP(file, maxDim = 1920, quality = 0.82) {
  const image = await loadImageFile(file);
  const ratio = Math.min(1, maxDim / image.width, maxDim / image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Le navigateur ne peut pas préparer cette image.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') throw new Error('Le navigateur ne peut pas convertir cette image en WebP.');
  return readFileAsBase64(blob);
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64Data: reader.result.split(',')[1], previewUrl: reader.result });
    reader.onerror = () => reject(new Error('Impossible de lire ce fichier.'));
    reader.readAsDataURL(file);
  });
}

function renderImagesView() {
  const card = document.createElement('section');
  card.className = 'admin-content-card';
  card.innerHTML = `
    <div class="admin-gallery-header">
      <h1 class="admin-content-title">Bibliothèque d’images</h1>
      <label class="admin-upload-btn">Ajouter des images
        <input class="admin-file-input" type="file" multiple accept=".webp,.jpg,.jpeg,.png,.svg,.ico" aria-label="Ajouter des images à la bibliothèque">
      </label>
    </div>
    <p class="admin-hint">Les images seront téléversées avec Publier. Les images matricielles deviennent des WebP de 1920 pixels au maximum. Les SVG et ICO sont conservés.</p>
    <p class="admin-hint">Les icônes PNG se téléversent dans Référencement. Copiez le chemin d’une image pour la réutiliser dans une section.</p>
    <p class="admin-hint">La suppression d’un fichier publié est immédiate. Retirez d’abord ses références, puis publiez le contenu.</p>
    <div class="admin-gallery-body" aria-live="polite">Chargement des images…</div>`;
  const target = card.querySelector('.admin-gallery-body');
  const input = card.querySelector('input');
  input.addEventListener('change', async () => {
    input.disabled = true;
    preparingImages += 1;
    try {
      for (const file of input.files) {
        pendingImages.push(await prepareImageUpload(file));
        markDirty();
      }
      showToast('Images préparées. Cliquez sur Publier pour les téléverser.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      preparingImages -= 1;
      input.disabled = false;
      input.value = '';
      if (target.isConnected) renderImageGallery(target);
    }
  });
  $sections.appendChild(card);
  $sections.scrollTo(0, 0);
  renderImageGallery(target);
}

async function renderImageGallery(target) {
  try {
    const remoteImages = await listImages();
    const pendingPaths = new Set(pendingImages.map(image => image.path));
    if (!target.isConnected) return;
    const images = remoteImages.filter(image => /\.(webp|jpe?g|png|svg|ico)$/i.test(image.name) && !pendingPaths.has(normalizeLocalImagePath(image.path)));
    images.push(...pendingImages.map(image => ({ ...image, pending: true })));
    const usedPaths = collectImagePaths(content);
    const grid = document.createElement('div');
    grid.className = 'admin-gallery-grid';
    for (const image of images) {
      const path = normalizeLocalImagePath(image.path);
      const used = usedPaths.has(path);
      const published = publishedImagePaths.has(path);
      const adminIcon = path === 'assets/images/favicon.ico';
      const unused = !used && !published && !adminIcon;
      const card = document.createElement('article');
      card.className = `admin-gallery-card${unused ? ' admin-gallery-card-unused' : ''}`;
      const thumbnail = document.createElement('img');
      thumbnail.src = resolveImageSrc(`/${path}`);
      thumbnail.alt = imageAltForPath(path) || image.name;
      thumbnail.loading = 'lazy';
      const title = document.createElement('strong');
      title.className = 'admin-gallery-title';
      title.textContent = image.name;
      const label = document.createElement('span');
      label.className = unused ? 'admin-unused-badge' : 'admin-hint';
      label.textContent = unused ? 'Inutilisée' : adminIcon ? 'Icône de l’administration' : published && !used ? 'Encore publiée' : 'Utilisée';
      const imagePath = document.createElement('code');
      imagePath.textContent = `/${path}`;
      const actions = document.createElement('div');
      actions.className = 'admin-gallery-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-sm btn-outline-muted';
      copy.textContent = 'Copier le chemin';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(`/${path}`);
          showToast('Chemin copié.', 'success');
        } catch {
          showToast('Copiez le chemin affiché sous l’image.', 'error');
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-sm btn-danger';
      remove.textContent = image.pending ? 'Retirer' : 'Supprimer';
      remove.disabled = !unused;
      if (!unused) remove.title = 'Retirez les références à cette image, puis publiez le contenu avant de la supprimer.';
      remove.addEventListener('click', async () => {
        if (!confirm(`${image.pending ? 'Retirer' : 'Supprimer définitivement'} ${image.name} ?`)) return;
        remove.disabled = true;
        try {
          if (image.pending) pendingImages = pendingImages.filter(item => item.path !== path);
          else await deleteImage(image);
          showToast(image.pending ? 'Image retirée de la liste de téléversement.' : 'Image supprimée.', 'success');
          await renderImageGallery(target);
        } catch (error) {
          remove.disabled = false;
          showToast(error.message, 'error');
        }
      });
      actions.append(copy, remove);
      card.append(thumbnail, title, label, imagePath);
      if (image.pending) {
        const badge = document.createElement('span');
        badge.className = 'admin-pending-badge';
        badge.textContent = 'À publier';
        card.appendChild(badge);
      }
      card.appendChild(actions);
      grid.appendChild(card);
    }
    if (images.length) target.replaceChildren(grid);
    else target.textContent = 'Aucune image dans la bibliothèque.';
  } catch (error) {
    target.textContent = error.message;
  }
}

// ============================================================================
//  COLLECT CONTENT
// ============================================================================

function collectContent() {
  // Walk all form fields on the page and update the content object
  document.querySelectorAll('[data-path]').forEach(input => {
    if (input.type === 'file') return; // Skip file inputs
    const path = input.dataset.path;
    let val;
    if (input.type === 'checkbox') {
      val = input.checked;
    } else {
      val = input.value;
    }
    setNestedValue(content, path, val);
  });
  return content;
}

// ============================================================================
//  PREVIEW
// ============================================================================

async function handlePreview() {
  if (preparingImages) {
    showToast('Attendez la préparation des images avant d’ouvrir l’aperçu.', 'error');
    return;
  }
  collectContent();
  if ($previewModal.open) return;
  const requestId = ++previewRequest;
  $previewFrame.hidden = true;
  $previewStatus.hidden = false;
  $previewStatus.textContent = 'Chargement de l’aperçu…';
  $previewModal.showModal();

  try {
    const response = await fetch(API.preview, {
      method: 'POST',
      credentials: 'same-origin',
      headers: apiHeaders(true),
      body: JSON.stringify(content),
    });
    if (!response.ok) throw new Error(apiErrorMessage(response.status));
    const html = await response.text();
    if (!$previewModal.open || requestId !== previewRequest) return;
    const documentPreview = new DOMParser().parseFromString(html, 'text/html');
    documentPreview.querySelectorAll('img[src], link[rel="icon"], link[rel="apple-touch-icon"]').forEach(element => {
      const attribute = element.tagName === 'IMG' ? 'src' : 'href';
      const path = normalizeLocalImagePath(element.getAttribute(attribute));
      const pending = pendingImages.find(image => image.path === path);
      if (pending) element.setAttribute(attribute, pending.previewUrl);
    });
    $previewFrame.srcdoc = '<!doctype html>' + documentPreview.documentElement.outerHTML;
    $previewFrame.hidden = false;
    $previewStatus.hidden = true;
  } catch (error) {
    if (!$previewModal.open || requestId !== previewRequest) return;
    const message = error instanceof TypeError ? 'Connexion impossible. Vérifiez votre connexion Internet et réessayez.' : error.message;
    $previewStatus.textContent = message;
    showToast(message, 'error');
  }
}

// ============================================================================
//  PUBLISH
// ============================================================================

function showPublishConfirmation() {
  return new Promise((resolve) => {
    const modal = document.getElementById('publish-modal');
    const cancelBtn = document.getElementById('publish-cancel');
    const confirmBtn = document.getElementById('publish-confirm');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    function cleanup(result) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      modal.removeEventListener('click', onBackdrop);
      resolve(result);
    }
    function onCancel() { cleanup(false); }
    function onConfirm() { cleanup(true); }
    function onBackdrop(e) { if (e.target === modal) cleanup(false); }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    modal.addEventListener('click', onBackdrop);
  });
}

async function handlePublish() {
  if ($btnPublish.disabled) return;
  if (preparingImages) {
    showToast('Attendez la préparation des images avant de publier.', 'error');
    return;
  }
  const confirmed = await showPublishConfirmation();
  if (!confirmed) return;

  collectContent();
  $btnPublish.disabled = true;
  $editorScreen.inert = true;
  $btnPublish.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Publication...';
  setStatus('saving', 'Publication en cours...');

  try {
    // 1. Upload any pending images
    for (const img of pendingImages) {
      setStatus('saving', `Envoi de ${img.name}...`);
      await uploadImage(img);
    }

    // 2. Update settings.json
    setStatus('saving', 'Mise à jour du contenu...');
    const result = await updateContent();

    // Update SHA for next publish
    contentSha = result.sha;

    pendingImages = [];
    publishedImagePaths = collectImagePaths(content);
    hasUnpublishedChanges = false;

    setStatus('connected', 'Publié');
    $statusTime.textContent = `Dernière publication : ${new Date().toLocaleTimeString('fr-CA')}`;
    showToast('Modifications publiées. Le site sera mis à jour après le déploiement.', 'success');
    if (activeSection === 'images') showSection('images');
  } catch (e) {
    console.error('Erreur de publication :', e);
    setStatus('error', 'Erreur de publication');
    showToast(`Erreur : ${e.message}`, 'error');
  } finally {
    $editorScreen.inert = false;
    $btnPublish.disabled = false;
    $btnPublish.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      Publier
    `;
  }
}

// ============================================================================
//  UTILITIES
// ============================================================================

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function initMarkdownEditor(container, compact, plain = false) {
  if (typeof EasyMDE === 'undefined') return null;
  const textarea = container.querySelector('textarea');
  if (!textarea || markdownEditors.has(textarea)) return markdownEditors.get(textarea);
  const buttons = {
    bold: ['toggleBold', 'fa-bold', 'Gras'],
    italic: ['toggleItalic', 'fa-italic', 'Italique'],
    strikethrough: ['toggleStrikethrough', 'fa-strikethrough', 'Texte barré'],
    code: ['toggleCodeBlock', 'fa-code', 'Bloc de code'],
    'heading-1': ['toggleHeading1', 'fa-heading', 'Titre de niveau 1'],
    'heading-2': ['toggleHeading2', 'fa-heading', 'Titre de niveau 2'],
    'heading-3': ['toggleHeading3', 'fa-heading', 'Titre de niveau 3'],
    'unordered-list': ['toggleUnorderedList', 'fa-list-ul', 'Liste à puces'],
    'ordered-list': ['toggleOrderedList', 'fa-list-ol', 'Liste numérotée'],
    quote: ['toggleBlockquote', 'fa-quote-left', 'Citation'],
    link: ['drawLink', 'fa-link', 'Insérer un lien'],
    preview: ['togglePreview', 'fa-eye', 'Afficher l’aperçu'],
  };
  const names = plain ? ['preview'] : compact
    ? ['bold', 'italic', 'strikethrough', '|', 'link', '|', 'preview']
    : ['bold', 'italic', 'strikethrough', 'code', '|', 'heading-1', 'heading-2', 'heading-3', '|', 'unordered-list', 'ordered-list', 'quote', '|', 'link', '|', 'preview'];
  const toolbar = names.map(name => {
    if (name === '|') return name;
    const [action, icon, title] = buttons[name];
    return { name, action: EasyMDE[action], className: `fa ${icon}`, title, noDisable: name === 'preview' };
  });
  const editor = new EasyMDE({
    element: textarea,
    spellChecker: false,
    autoDownloadFontAwesome: false,
    forceSync: true,
    status: false,
    minHeight: compact ? '50px' : '120px',
    maxHeight: compact ? '50px' : undefined,
    toolbar,
    shortcuts: plain ? Object.fromEntries(Object.values(buttons).map(([action]) => [action, null])) : undefined,
    promptTexts: { link: 'Adresse du lien :', image: 'Adresse de l’image :' },
    renderingConfig: { singleLineBreaks: false, sanitizerFunction: sanitizeMarkdownHtml },
    previewRender(source) {
      if (plain) return `<p>${esc(source).replace(/\n/g, '<br>')}</p>`;
      const escaped = String(source).replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
      return this.parent.markdown(escaped);
    },
  });
  markdownEditors.set(textarea, editor);
  editor.codemirror.on('change', markDirty);
  const input = editor.codemirror.getInputField();
  input.setAttribute('aria-label', container.querySelector('.admin-label').textContent);
  if (compact) container.querySelector('.EasyMDEContainer').classList.add('compact');
  return editor;
}

function sanitizeMarkdownHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const allowed = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  for (const element of template.content.querySelectorAll('*')) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent));
      continue;
    }
    const attributes = element.tagName === 'A' ? ['href', 'title'] : element.tagName === 'IMG' ? ['src', 'alt', 'title'] : [];
    for (const attribute of Array.from(element.attributes)) {
      if (!attributes.includes(attribute.name)) element.removeAttribute(attribute.name);
    }
    for (const attribute of ['href', 'src']) {
      if (!element.hasAttribute(attribute)) continue;
      const value = element.getAttribute(attribute).trim();
      const valid = !/[\u0000-\u0020\u007f\\]/.test(value) && (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value)
        || (attribute === 'href' && /^(mailto:|tel:|#)/i.test(value)));
      if (valid) element.setAttribute(attribute, value);
      else element.removeAttribute(attribute);
    }
    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return template.innerHTML;
}

function disposeMarkdownEditors(container) {
  container.querySelectorAll('textarea[data-path]').forEach(textarea => {
    const editor = markdownEditors.get(textarea);
    if (!editor) return;
    editor.toTextArea();
    editor.cleanup();
    markdownEditors.delete(textarea);
  });
}

function markDirty() {
  hasUnpublishedChanges = true;
  setStatus('saving', 'Modifications non publiées');
}


function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    // Handle array index
    if (/^\d+$/.test(key)) return acc[parseInt(key, 10)];
    return acc[key];
  }, obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    if (/^\d+$/.test(nextKey)) {
      if (!Array.isArray(current[key])) current[key] = [];
      current = current[key];
    } else if (/^\d+$/.test(key)) {
      const idx = parseInt(key, 10);
      if (current[idx] == null) current[idx] = {};
      current = current[idx];
    } else {
      if (current[key] == null) current[key] = {};
      current = current[key];
    }
  }
  const lastKey = keys[keys.length - 1];
  if (/^\d+$/.test(lastKey)) {
    current[parseInt(lastKey, 10)] = value;
  } else {
    current[lastKey] = value;
  }
}

function setStatus(type, text) {
  $statusDot.className = 'status-dot ' + type;
  $statusText.textContent = text;
}

let toastTimeout = null;
function showToast(message, type) {
  $toast.textContent = message;
  $toast.className = 'admin-toast ' + type;
  // Trigger reflow for animation
  void $toast.offsetWidth;
  $toast.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $toast.classList.remove('show');
  }, 5000);
}

// ============================================================================
//  DRAG AND DROP REORDER (mouse + touch)
// ============================================================================

function initDragReorder(handle, el, sectionKey, listDef, index) {
  let dragging = false;
  let startY = 0;
  let currentTarget = null;
  const listPath = `${sectionKey}.${listDef.key}`;

  function getItems() {
    return Array.from(el.closest('.admin-list-items')?.querySelectorAll('.admin-list-item') || []);
  }

  function clearIndicators() {
    getItems().forEach(item => {
      item.classList.remove('drag-over', 'drag-over-below');
    });
  }

  function getDropTarget(clientY) {
    const items = getItems();
    for (const item of items) {
      if (item === el) continue;
      const rect = item.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return { el: item, index: parseInt(item.dataset.index, 10), above: clientY < rect.top + rect.height / 2 };
      }
    }
    return null;
  }

  function doReorder(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    collectContent();
    markDirty();
    const arr = getNestedValue(content, listPath) || [];
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    const container = el.closest('[data-list-key]');
    refreshList(container, sectionKey, listDef);
  }

  function onMove(clientY) {
    clearIndicators();
    const target = getDropTarget(clientY);
    if (target) {
      currentTarget = target;
      target.el.classList.add(target.above ? 'drag-over' : 'drag-over-below');
    } else {
      currentTarget = null;
    }
  }

  function onEnd() {
    el.classList.remove('dragging');
    clearIndicators();
    if (currentTarget) {
      let toIdx = currentTarget.index;
      if (!currentTarget.above && toIdx < index) toIdx++;
      if (currentTarget.above && toIdx > index) toIdx--;
      doReorder(index, toIdx);
    }
    currentTarget = null;
    dragging = false;
  }

  // Mouse: use native HTML5 drag API
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    clearIndicators();
  });

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dragEl = el.closest('.admin-list-items')?.querySelector('.dragging');
    if (dragEl && dragEl !== el) {
      clearIndicators();
      const rect = el.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      el.classList.add(above ? 'drag-over' : 'drag-over-below');
    }
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over', 'drag-over-below');
  });

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const above = el.classList.contains('drag-over');
    el.classList.remove('drag-over', 'drag-over-below');
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    let toIndex = index;
    if (!above && toIndex < fromIndex) toIndex++;
    if (above && toIndex > fromIndex) toIndex--;
    doReorder(fromIndex, toIndex);
  });

  // Touch: manual drag via touch events on the handle
  handle.addEventListener('touchstart', (e) => {
    dragging = true;
    startY = e.touches[0].clientY;
    el.classList.add('dragging');
    e.preventDefault();
  }, { passive: false });

  handle.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    onMove(e.touches[0].clientY);
  }, { passive: false });

  handle.addEventListener('touchend', (e) => {
    if (!dragging) return;
    e.preventDefault();
    onEnd();
  });
}
