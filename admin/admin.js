// ============================================================================
//  ADMIN.JS — Custom CMS for Audrey Stypulkowski
//  Vanilla JS. Uses GitHub OAuth for auth, GitHub API for content management.
// ============================================================================

// ---- CONFIG ----------------------------------------------------------------
const GITHUB_REPO = 'styaud/website-audrey-s';
const GITHUB_BRANCH = 'main';
const CONTENT_PATH = 'content/settings.json';
const IMAGES_PATH = 'assets/images';
const GITHUB_API = 'https://api.github.com';

let content = {};          // Current content state (mirrors settings.json)
let contentSha = '';       // SHA of current settings.json (needed for updates)
let pendingImages = [];    // { path, base64, file } — images to upload on publish
let githubToken = '';      // PAT stored in sessionStorage for the session

// ---- DOM REFS --------------------------------------------------------------
const $loginScreen  = document.getElementById('login-screen');
const $editorScreen = document.getElementById('editor-screen');
const $loginBtn     = document.getElementById('login-btn');
const $loginError   = document.getElementById('login-error');
const $sections     = document.getElementById('sections-container');
const $btnPreview   = document.getElementById('btn-preview');
const $btnPublish   = document.getElementById('btn-publish');
const $statusDot    = document.getElementById('status-dot');
const $statusText   = document.getElementById('status-text');
const $statusTime   = document.getElementById('status-time');
const $toast        = document.getElementById('toast');

// ---- SECTION DEFINITIONS ---------------------------------------------------
// Describes the admin UI structure. Each section maps to a top-level key in
// settings.json. Fields describe the form controls to render.
const SECTIONS = [
  { divider: true, label: 'Contenu de la page' },
  {
    key: 'hero',
    label: 'Bannière principale',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', hint: 'Titre principal affiché en grand sur la bannière d\'accueil.' },
      { key: 'subtitle', label: 'Sous-titre', type: 'textarea', hint: 'Texte d\'accroche sous le titre principal.' },
      { key: 'image', label: 'Image de fond', type: 'image', hint: 'Image en arrière-plan de la bannière. Format large recommandé (1920x1080px).' },
      { key: 'cta_text', label: 'Bouton principal — texte', type: 'text', hint: 'Texte du bouton d\'action principal (ex: « Prendre rendez-vous »).' },
      { key: 'cta_link', label: 'Bouton principal — lien', type: 'text', plain: true, hint: 'URL ou ancre (ex: #contact).' },
      { key: 'cta2_text', label: 'Bouton secondaire — texte', type: 'text', hint: 'Texte du deuxième bouton (optionnel). Laissez vide pour masquer.' },
      { key: 'cta2_link', label: 'Bouton secondaire — lien', type: 'text', plain: true, hint: 'URL ou ancre du bouton secondaire.' },
    ],
  },
  {
    key: 'services',
    label: 'Services',
    fields: [
      { key: 'heading', label: 'Titre de la section', type: 'text', hint: 'Titre affiché au-dessus des cartes de services.' },
      { key: 'link_text', label: 'Texte du lien', type: 'text', hint: 'Texte affiché sous chaque carte de service (ex: « En savoir plus »).' },
    ],
    list: {
      key: 'items',
      fields: [
        { key: 'title', label: 'Titre', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'link', label: 'Lien', type: 'text', plain: true },
      ],
    },
  },
  {
    key: 'about',
    label: 'À propos',
    fields: [
      { key: 'title', label: 'Titre', type: 'text', hint: 'Titre de la section À propos.' },
      { key: 'body', label: 'Contenu', type: 'textarea', hint: 'Texte de présentation. Supporte le Markdown complet.' },
      { key: 'photo', label: 'Photo', type: 'image', hint: 'Photo de profil ou image professionnelle. Format carré recommandé.' },
    ],
    list: {
      key: 'values',
      fields: [
        { key: 'title', label: 'Titre', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
      ],
    },
  },
  {
    key: 'education',
    label: 'Contenu éducatif',
    fields: [
      { key: 'heading', label: 'Titre de la section', type: 'text' },
    ],
    list: {
      key: 'items',
      fields: [
        { key: 'title', label: 'Titre', type: 'text' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'image', label: 'Image', type: 'image' },
        { key: 'cta_text', label: 'Texte du bouton', type: 'text' },
        { key: 'cta_link', label: 'Lien du bouton', type: 'text', plain: true },
      ],
    },
  },
  {
    key: 'faq',
    label: 'Questions fréquentes',
    fields: [
      { key: 'heading', label: 'Titre de la section', type: 'text' },
    ],
    list: {
      key: 'items',
      fields: [
        { key: 'question', label: 'Question', type: 'text' },
        { key: 'answer', label: 'Réponse', type: 'textarea' },
      ],
    },
  },
  {
    key: 'contact',
    label: 'Contact',
    fields: [
      { key: 'heading', label: 'Titre', type: 'text', hint: 'Titre de la section contact.' },
      { key: 'subtitle', label: 'Sous-titre', type: 'textarea', hint: 'Court texte d\'invitation à prendre contact.' },
      { key: 'phone', label: 'Téléphone', type: 'text', plain: true, hint: 'Numéro affiché sur le site (ex: +1 514 555-0123).' },
      { key: 'address', label: 'Adresse', type: 'text', plain: true, hint: 'Ville ou région desservie.' },
      { key: 'info_heading', label: 'Titre info de contact', type: 'text', hint: 'Titre au-dessus du téléphone et de l\'adresse (ex: « Nous joindre »).' },
      { key: 'phone_label', label: 'Libellé téléphone', type: 'text', hint: 'Libellé affiché devant le numéro (ex: « Téléphone »).' },
      { key: 'address_label', label: 'Libellé adresse', type: 'text', hint: 'Libellé affiché devant l\'adresse (ex: « Adresse »).' },
      { key: 'consultation_heading', label: 'Encart consultation — titre', type: 'text', hint: 'Titre de l\'encart de première consultation.' },
      { key: 'consultation_text', label: 'Encart consultation — texte', type: 'textarea', hint: 'Texte d\'invitation à la première consultation.' },
      { key: 'form_name_label', label: 'Formulaire — libellé nom', type: 'text', plain: true },
      { key: 'form_name_placeholder', label: 'Formulaire — placeholder nom', type: 'text', plain: true },
      { key: 'form_email_label', label: 'Formulaire — libellé courriel', type: 'text', plain: true },
      { key: 'form_email_placeholder', label: 'Formulaire — placeholder courriel', type: 'text', plain: true },
      { key: 'form_phone_label', label: 'Formulaire — libellé téléphone', type: 'text', plain: true },
      { key: 'form_phone_placeholder', label: 'Formulaire — placeholder téléphone', type: 'text', plain: true },
      { key: 'form_subject_label', label: 'Formulaire — libellé sujet', type: 'text', plain: true },
      { key: 'form_subject_placeholder', label: 'Formulaire — placeholder sujet', type: 'text', plain: true },
      { key: 'form_message_label', label: 'Formulaire — libellé message', type: 'text', plain: true },
      { key: 'form_message_placeholder', label: 'Formulaire — placeholder message', type: 'text', plain: true },
      { key: 'form_submit', label: 'Formulaire — bouton envoyer', type: 'text', plain: true },
      { key: 'form_sending', label: 'Formulaire — texte envoi en cours', type: 'text', plain: true },
      { key: 'form_success', label: 'Formulaire — message de succès', type: 'textarea', plain: true, hint: 'Message affiché dans le dialogue après envoi réussi.' },
      { key: 'form_error', label: 'Formulaire — message d\'erreur', type: 'text', plain: true },
      { key: 'form_network_error', label: 'Formulaire — erreur de connexion', type: 'text', plain: true },
      { key: 'form_close', label: 'Formulaire — bouton fermer', type: 'text', plain: true },
    ],
    list: {
      key: 'form_subjects',
      fields: [
        { key: 'title', label: 'Sujet', type: 'text' },
      ],
    },
  },
  {
    key: 'footer',
    label: 'Pied de page',
    fields: [
      { key: 'business_name', label: 'Nom commercial', type: 'text', hint: 'Nom affiché dans le bas de page.' },
      { key: 'credentials', label: 'Accréditations', type: 'text', hint: 'Numéro de membre, ordre professionnel, etc.' },
      { key: 'privacy_link', label: 'Lien politique de confidentialité', type: 'text', plain: true, hint: 'URL vers votre politique de confidentialité (optionnel).' },
      { key: 'copyright', label: 'Mention légale', type: 'text', plain: true, hint: 'Texte après le nom commercial (ex: « Tous droits réservés. »).' },
      { key: 'admin_label', label: 'Libellé lien admin', type: 'text', plain: true, hint: 'Texte du lien vers le panneau d\'administration dans le pied de page.' },
    ],
  },
  // --- Divider ---
  { divider: true, label: 'Paramètres globaux' },
  {
    key: 'header',
    label: 'En-tête',
    fields: [
      { key: 'logo', label: 'Logo', type: 'image', hint: 'Logo affiché dans la barre de navigation. Laissez vide pour afficher le nom du site.' },
      { key: 'site_name', label: 'Nom du site', type: 'text', hint: 'Texte affiché dans la barre de navigation si aucun logo n\'est défini.' },
      { key: 'cta_text', label: 'Bouton d\'action — texte', type: 'text', hint: 'Texte du bouton principal dans la barre de navigation (ex: « Prendre rendez-vous »).' },
      { key: 'cta_link', label: 'Bouton d\'action — lien', type: 'text', plain: true, hint: 'URL ou ancre du bouton (ex: #contact ou un lien externe).' },
    ],
  },
  {
    key: 'nav',
    label: 'Navigation (libellés)',
    fields: [
      { key: 'services', label: 'Services', type: 'text', hint: 'Libellé du lien vers la section services. Partagé entre la barre de navigation et le pied de page.' },
      { key: 'about', label: 'À propos', type: 'text', hint: 'Libellé du lien vers la section à propos.' },
      { key: 'education', label: 'Mesures légales', type: 'text', hint: 'Libellé du lien vers la section mesures légales.' },
      { key: 'faq', label: 'FAQ', type: 'text', hint: 'Libellé du lien vers la section FAQ.' },
      { key: 'contact', label: 'Contact', type: 'text', hint: 'Libellé du lien vers la section contact (affiché dans le pied de page uniquement).' },
    ],
  },
  {
    key: 'popup',
    label: 'Fenêtre contextuelle (popup)',
    fields: [
      { key: 'enabled', label: 'Activée', type: 'toggle', hint: 'Affiche un message temporaire aux visiteurs à l\'ouverture du site. Utile pour les annonces importantes.' },
      { key: 'title', label: 'Titre', type: 'text', hint: 'Titre de l\'annonce (ex: « Avis important »).' },
      { key: 'message', label: 'Message', type: 'textarea', hint: 'Contenu de l\'annonce. Supporte le Markdown.' },
      { key: 'image', label: 'Image ou icône', type: 'image', hint: 'Image optionnelle affichée au-dessus du titre (64x64px recommandé).' },
      { key: 'dismiss_label', label: 'Texte du bouton fermer', type: 'text', hint: 'Texte du bouton pour fermer la fenêtre (ex: « Fermer », « J\'ai compris »).' },
    ],
  },
  {
    key: 'seo',
    label: 'Référencement et métadonnées',
    fields: [
      { key: 'title', label: 'Titre de l\'onglet', type: 'text', plain: true, hint: 'Titre affiché dans l\'onglet du navigateur et dans les résultats Google. Idéalement 50-60 caractères.' },
      { key: 'description', label: 'Méta description', type: 'textarea', plain: true, hint: 'Description affichée sous le titre dans les résultats Google. Idéalement 150-160 caractères.' },
      { key: 'og_image', label: 'Image de partage', type: 'image', hint: 'Image affichée lorsque le site est partagé sur les réseaux sociaux (Facebook, LinkedIn, etc.). Format recommandé : 1200x630px.' },
      { key: 'favicon', label: 'Favicon', type: 'image', hint: 'Petite icône affichée dans l\'onglet du navigateur. Format SVG ou PNG carré recommandé (32x32px ou SVG).' },
    ],
  },
  {
    key: 'colors',
    label: 'Couleurs du site',
    fields: [
      { key: 'primary', label: 'Couleur principale', type: 'color', hint: 'Couleur dominante du site : liens, boutons secondaires, accents visuels (ex: vert forêt).' },
      { key: 'primary_dark', label: 'Couleur principale foncée', type: 'color', hint: 'Variante plus foncée de la couleur principale, utilisée pour les survols et les contrastes.' },
      { key: 'primary_light', label: 'Couleur principale claire', type: 'color', hint: 'Variante très claire de la couleur principale, utilisée pour les arrière-plans subtils.' },
      { key: 'accent', label: 'Couleur d\'accent', type: 'color', hint: 'Couleur vive pour les boutons d\'action principaux et les éléments à mettre en valeur (ex: orange, corail).' },
      { key: 'accent_dark', label: 'Couleur d\'accent foncée', type: 'color', hint: 'Variante plus foncée de la couleur d\'accent, utilisée au survol des boutons principaux.' },
      { key: 'text', label: 'Texte principal', type: 'color', hint: 'Couleur du texte courant et des titres. Un ton foncé pour une bonne lisibilité.' },
      { key: 'text_light', label: 'Texte secondaire', type: 'color', hint: 'Couleur du texte moins important : descriptions, indices, mentions légales.' },
      { key: 'bg', label: 'Arrière-plan', type: 'color', hint: 'Couleur de fond principale du site (généralement blanc ou très clair).' },
      { key: 'bg_light', label: 'Arrière-plan alternatif', type: 'color', hint: 'Couleur de fond légèrement différente pour alterner les sections et créer du contraste.' },
      { key: 'bg_dark', label: 'Arrière-plan foncé', type: 'color', hint: 'Couleur de fond sombre utilisée pour le pied de page et les zones foncées.' },
      { key: 'border', label: 'Bordures', type: 'color', hint: 'Couleur des bordures et séparateurs entre les éléments.' },
    ],
  },
];

// ============================================================================
//  AUTH
// ============================================================================

// Check for an existing session on page load
(function init() {
  const saved = sessionStorage.getItem('github_token');
  if (saved) {
    githubToken = saved;
    loadContent().then(ok => {
      if (ok) showEditor();
      else sessionStorage.removeItem('github_token');
    });
  }

  $loginBtn.addEventListener('click', handleLogin);
  $btnPreview.addEventListener('click', handlePreview);
  $btnPublish.addEventListener('click', handlePublish);
})();

async function handleLogin() {
  // Redirect to GitHub OAuth via our Cloudflare Function
  $loginBtn.disabled = true;
  $loginBtn.innerHTML = '<span class="spinner"></span> Redirection...';
  window.location.href = '/api/auth/github';
  return;

  // --- Legacy PAT login (kept for local dev fallback) ---
  const token = prompt('Dev mode: entrez un GitHub PAT');
  if (!token) return;

  githubToken = token;
  const ok = await loadContent();

  if (ok) {
    sessionStorage.setItem('github_token', token);
    showEditor();
  } else {
    githubToken = '';
    showLoginError('Token invalide ou dépôt inaccessible.');
  }

  $loginBtn.disabled = false;
  $loginBtn.textContent = 'Connexion';
}

function showLoginError(msg) {
  $loginError.textContent = msg;
  $loginError.classList.remove('hidden');
}

function showEditor() {
  $loginScreen.remove();
  $editorScreen.style.display = '';
  $editorScreen.classList.remove('hidden');
  renderSections();
}

// ============================================================================
//  GITHUB API HELPERS
// ============================================================================

function apiHeaders() {
  return {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

function repoUrl(path) {
  return `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
}

async function getFile(path) {
  const res = await fetch(repoUrl(path), { headers: apiHeaders() });
  if (!res.ok) return null;
  return res.json();
}

async function updateFile(path, contentBase64, message, sha) {
  const body = {
    message,
    content: contentBase64,
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(repoUrl(path), {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

async function deleteFile(path, sha, message) {
  const res = await fetch(repoUrl(path), {
    method: 'DELETE',
    headers: apiHeaders(),
    body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

async function listDir(path) {
  const res = await fetch(repoUrl(path), { headers: apiHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Collect all image paths referenced anywhere in the content object
function collectImagePaths(obj) {
  const paths = new Set();
  JSON.stringify(obj, (_, value) => {
    if (typeof value === 'string' && value.startsWith('/' + IMAGES_PATH + '/')) {
      paths.add(value.slice(1)); // remove leading /
    }
    return value;
  });
  return paths;
}

// ============================================================================
//  CONTENT LOADING
// ============================================================================

async function loadContent() {
  try {
    setStatus('saving', 'Chargement...');
    const file = await getFile(CONTENT_PATH);
    if (!file) {
      setStatus('error', 'Fichier introuvable');
      return false;
    }
    contentSha = file.sha;
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, '')), c => c.charCodeAt(0));
    const raw = new TextDecoder().decode(bytes);
    content = JSON.parse(raw);
    setStatus('connected', 'Connecté');
    return true;
  } catch (e) {
    console.error('loadContent error:', e);
    setStatus('error', 'Erreur de chargement');
    return false;
  }
}

// ============================================================================
//  RENDER SECTIONS
// ============================================================================

function renderSections() {
  $sections.innerHTML = '';
  SECTIONS.forEach(section => {
    if (section.divider) {
      const divider = document.createElement('div');
      divider.className = 'admin-divider';
      divider.innerHTML = `<span>${esc(section.label)}</span>`;
      $sections.appendChild(divider);
      return;
    }
    $sections.appendChild(createSection(section));
  });
}

function createSection(sectionDef) {
  const wrapper = document.createElement('div');
  wrapper.className = 'admin-section';
  wrapper.dataset.section = sectionDef.key;

  // Header
  const header = document.createElement('button');
  header.className = 'admin-section-header';
  header.type = 'button';
  header.innerHTML = `
    <span>${esc(sectionDef.label)}</span>
    <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  header.addEventListener('click', () => {
    wrapper.classList.toggle('open');
  });

  // Content area
  const contentArea = document.createElement('div');
  contentArea.className = 'admin-section-content';

  const inner = document.createElement('div');
  inner.className = 'admin-section-inner';

  // Render simple fields
  const sectionData = content[sectionDef.key] || {};
  sectionDef.fields.forEach(field => {
    inner.appendChild(createField(sectionDef.key, field, sectionData[field.key]));
  });

  // Render list if present
  if (sectionDef.list) {
    inner.appendChild(createListEditor(sectionDef.key, sectionDef.list, sectionData[sectionDef.list.key] || []));
  }

  contentArea.appendChild(inner);
  wrapper.appendChild(header);
  wrapper.appendChild(contentArea);
  return wrapper;
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

  if (fieldDef.type === 'toggle') {
    group.innerHTML = `
      <label class="admin-label">${esc(fieldDef.label)}</label>
      ${hintHtml(fieldDef)}
      <div class="flex items-center gap-4" style="margin-top: var(--space-2);">
        <label class="admin-toggle">
          <input type="checkbox" data-path="${dataPath}" ${value ? 'checked' : ''}>
          <span class="admin-toggle-slider"></span>
        </label>
      </div>
    `;
  } else if (fieldDef.type === 'textarea') {
    const taId = `ta-${dataPath.replace(/\./g, '-')}`;
    group.innerHTML = `
      <label class="admin-label">${esc(fieldDef.label)}</label>
      ${hintHtml(fieldDef)}
      <textarea class="textarea" id="${taId}" data-path="${dataPath}" rows="4">${esc(value || '')}</textarea>
    `;
    if (!fieldDef.plain) {
      // Defer so textarea is in DOM before EasyMDE attaches
      initMarkdownEditor(group);
    }
  } else if (fieldDef.type === 'image') {
    const id = `img-${dataPath.replace(/\./g, '-')}`;
    group.innerHTML = `
      <label class="admin-label">${esc(fieldDef.label)}</label>
      ${hintHtml(fieldDef)}
      <div class="admin-image-field">
        ${value
          ? `<img src="${esc(resolveImageSrc(value))}" alt="" class="admin-thumbnail" id="${id}-thumb">`
          : `<div class="admin-thumbnail-placeholder" id="${id}-thumb">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            </div>`
        }
        <div>
          <label class="admin-upload-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Choisir
            <input type="file" accept="image/*" class="admin-file-input" data-path="${dataPath}" data-thumb="${id}-thumb">
          </label>
          <p class="admin-hint">${esc(value || 'Aucune image')}</p>
        </div>
      </div>
    `;
    // Bind file input after insertion
    setTimeout(() => {
      const fileInput = group.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.addEventListener('change', handleImageSelect);
      }
    }, 0);
  } else if (fieldDef.type === 'color') {
    const colorId = `color-${dataPath.replace(/\./g, '-')}`;
    group.innerHTML = `
      <label class="admin-label">${esc(fieldDef.label)}</label>
      ${hintHtml(fieldDef)}
      <div class="flex items-center gap-3" style="margin-top: var(--space-2);">
        <input type="color" class="admin-color-picker" id="${colorId}-picker" value="${esc(value || '#000000')}">
        <input type="text" class="input admin-color-text" data-path="${dataPath}" id="${colorId}-text" value="${esc(value || '')}" style="max-width: 8rem; font-family: monospace;" placeholder="#000000">
      </div>
    `;
    setTimeout(() => {
      const picker = group.querySelector(`#${colorId}-picker`);
      const text = group.querySelector(`#${colorId}-text`);
      if (picker && text) {
        picker.addEventListener('input', () => { text.value = picker.value; });
        text.addEventListener('input', () => {
          if (/^#[0-9a-fA-F]{6}$/.test(text.value)) picker.value = text.value;
        });
        text.addEventListener('blur', () => {
          if (text.value && !/^#[0-9a-fA-F]{3,8}$/.test(text.value)) text.value = picker.value;
        });
      }
    }, 0);
  } else if (fieldDef.plain) {
    // Plain text input (links, metadata) — no markdown
    group.innerHTML = `
      <label class="admin-label">${esc(fieldDef.label)}</label>
      ${hintHtml(fieldDef)}
      <input type="text" class="input" data-path="${dataPath}" value="${esc(value || '')}">
    `;
  } else {
    // Short markdown field — EasyMDE with compact height
    group.innerHTML = `
      <label class="admin-label">${esc(fieldDef.label)}</label>
      ${hintHtml(fieldDef)}
      <textarea class="textarea" data-path="${dataPath}" rows="1">${esc(value || '')}</textarea>
    `;
    initMarkdownEditor(group, true);
  }

  return group;
}

function resolveImageSrc(path) {
  if (!path) return '';
  // If path starts with / it's relative to site root, go up one level from admin/
  if (path.startsWith('/')) return '..' + path;
  if (path.startsWith('http')) return path;
  return '../' + path;
}

// ============================================================================
//  LIST EDITOR
// ============================================================================

function createListEditor(sectionKey, listDef, items) {
  const container = document.createElement('div');
  container.className = 'mt-6';
  container.dataset.listKey = `${sectionKey}.${listDef.key}`;

  const heading = document.createElement('div');
  heading.className = 'flex items-center justify-between mb-3';
  heading.innerHTML = `
    <span class="admin-label" style="margin-bottom:0;font-size:var(--text-base);">
      ${esc(listDef.key === 'items' ? 'Éléments' : listDef.key === 'values' ? 'Valeurs' : listDef.key === 'form_subjects' ? 'Sujets du formulaire' : 'Éléments')}
    </span>
    <span class="text-xs text-light">${items.length} élément${items.length !== 1 ? 's' : ''}</span>
  `;
  container.appendChild(heading);

  // Items list
  const listEl = document.createElement('div');
  listEl.className = 'admin-list-items';
  items.forEach((item, index) => {
    listEl.appendChild(createListItem(sectionKey, listDef, item, index));
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
    // Show an edit form for a new item WITHOUT adding to content yet
    const newItem = {};
    listDef.fields.forEach(f => { newItem[f.key] = ''; });
    const arr = getNestedValue(content, `${sectionKey}.${listDef.key}`) || [];
    const newIdx = arr.length;

    const form = createEditForm(sectionKey, listDef, newItem, newIdx);

    // Override cancel: just remove the form (item was never added)
    form.querySelector('[data-action="cancel"]').onclick = () => form.remove();

    // Override save: add the item to content, then refresh
    form.querySelector('[data-action="save"]').onclick = () => {
      const saved = {};
      form.querySelectorAll('[data-path]').forEach(input => {
        const key = input.dataset.path.split('.').pop();
        saved[key] = input.type === 'checkbox' ? input.checked : input.value;
      });
      arr.push(saved);
      setNestedValue(content, `${sectionKey}.${listDef.key}`, arr);
      refreshList(container, sectionKey, listDef);
    };

    // Insert form before the add button
    addBtn.before(form);
  });
  container.appendChild(addBtn);

  return container;
}

function createListItem(sectionKey, listDef, item, index) {
  const el = document.createElement('div');
  el.className = 'admin-list-item';
  el.dataset.index = index;

  // Thumbnail (if list has image field)
  const imageField = listDef.fields.find(f => f.type === 'image');
  const titleField = listDef.fields.find(f => f.key === 'title' || f.key === 'question');
  const descField = listDef.fields.find(f => f.key === 'description' || f.key === 'answer');

  let thumbHtml = '';
  if (imageField && item[imageField.key]) {
    thumbHtml = `<img src="${esc(resolveImageSrc(item[imageField.key]))}" alt="" class="admin-thumbnail">`;
  } else if (imageField) {
    thumbHtml = `<div class="admin-thumbnail-placeholder">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
    </div>`;
  }

  const title = item[titleField?.key] || `Élément ${index + 1}`;
  const desc = item[descField?.key] || '';

  el.innerHTML = `
    ${thumbHtml}
    <div class="admin-list-item-body">
      <div class="admin-list-item-title">${esc(title)}</div>
      ${desc ? `<div class="admin-list-item-desc">${esc(desc)}</div>` : ''}
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

  el.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (!confirm('Supprimer cet élément ?')) return;
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
    const fPath = `${sectionKey}.${listDef.key}.${index}.${field.key}`;
    const group = document.createElement('div');
    group.className = 'admin-field';

    if (field.type === 'textarea') {
      group.innerHTML = `
        <label class="admin-label">${esc(field.label)}</label>
        <textarea class="textarea" data-path="${fPath}" rows="3">${esc(item[field.key] || '')}</textarea>
      `;
      initMarkdownEditor(group);
    } else if (field.type === 'image') {
      const thumbId = `edit-thumb-${sectionKey}-${index}-${field.key}`;
      group.innerHTML = `
        <label class="admin-label">${esc(field.label)}</label>
        <div class="admin-image-field">
          ${item[field.key]
            ? `<img src="${esc(resolveImageSrc(item[field.key]))}" alt="" class="admin-thumbnail" id="${thumbId}">`
            : `<div class="admin-thumbnail-placeholder" id="${thumbId}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              </div>`
          }
          <div>
            <label class="admin-upload-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Choisir
              <input type="file" accept="image/*" class="admin-file-input" data-path="${fPath}" data-thumb="${thumbId}">
            </label>
            <p class="admin-hint">${esc(item[field.key] || 'Aucune image')}</p>
          </div>
        </div>
      `;
      setTimeout(() => {
        const fi = group.querySelector('input[type="file"]');
        if (fi) fi.addEventListener('change', handleImageSelect);
      }, 0);
    } else if (field.plain) {
      group.innerHTML = `
        <label class="admin-label">${esc(field.label)}</label>
        <input type="text" class="input" data-path="${fPath}" value="${esc(item[field.key] || '')}">
      `;
    } else {
      group.innerHTML = `
        <label class="admin-label">${esc(field.label)}</label>
        <textarea class="textarea" data-path="${fPath}" rows="1">${esc(item[field.key] || '')}</textarea>
      `;
      initMarkdownEditor(group, true);
    }
    form.appendChild(group);
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
  const existing = container.querySelector('.admin-edit-form');
  if (existing) existing.remove();

  const arr = getNestedValue(content, `${sectionKey}.${listDef.key}`) || [];
  const item = arr[index];
  if (!item) return;

  const form = createEditForm(sectionKey, listDef, item, index);

  // Insert form after the list item
  listItemEl.after(form);
  listItemEl.style.display = 'none';

  // Bind form actions
  form.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    form.remove();
    listItemEl.style.display = '';
  });

  form.querySelector('[data-action="save"]').addEventListener('click', () => {
    // Collect values from the edit form
    form.querySelectorAll('[data-path]').forEach(input => {
      const path = input.dataset.path;
      let val;
      if (input.type === 'checkbox') {
        val = input.checked;
      } else if (input.type === 'file') {
        return; // Images handled by handleImageSelect
      } else {
        val = input.value;
      }
      setNestedValue(content, path, val);
    });
    form.remove();
    listItemEl.style.display = '';
    refreshList(container, sectionKey, listDef);
  });
}

function refreshList(container, sectionKey, listDef) {
  const arr = getNestedValue(content, `${sectionKey}.${listDef.key}`) || [];
  const listEl = container.querySelector('.admin-list-items');
  listEl.innerHTML = '';
  arr.forEach((item, index) => {
    listEl.appendChild(createListItem(sectionKey, listDef, item, index));
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

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const dataPath = e.target.dataset.path;
  const thumbId = e.target.dataset.thumb;
  const isSvg = file.type === 'image/svg+xml';

  const process = isSvg ? readFileAsBase64(file) : compressToWebP(file);

  process.then(({ base64Data, previewUrl }) => {
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
    const ext = isSvg ? 'svg' : 'webp';
    const safeName = `${baseName}.${ext}`;
    const imgPath = `/${IMAGES_PATH}/${safeName}`;

    setNestedValue(content, dataPath, imgPath);

    pendingImages.push({
      path: `${IMAGES_PATH}/${safeName}`,
      base64: base64Data,
      name: safeName,
    });

    // Update thumbnail preview
    const thumbEl = document.getElementById(thumbId);
    if (thumbEl) {
      if (thumbEl.tagName === 'IMG') {
        thumbEl.src = previewUrl;
      } else {
        const img = document.createElement('img');
        img.src = previewUrl;
        img.alt = '';
        img.className = 'admin-thumbnail';
        img.id = thumbId;
        thumbEl.replaceWith(img);
      }
    }

    const hint = e.target.closest('.admin-image-field')?.querySelector('.admin-hint');
    if (hint) hint.textContent = `${safeName} (WebP)`;
  });
}

// Convert an image file to WebP using Canvas, with optional max dimension resize.
function compressToWebP(file, maxDim = 1920, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;

      // Resize if larger than maxDim
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          const previewUrl = URL.createObjectURL(blob);
          const base64Data = reader.result.split(',')[1];
          resolve({ base64Data, previewUrl });
        };
        reader.readAsDataURL(blob);
      }, 'image/webp', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Impossible de charger l\u2019image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

// Read a file as base64 without conversion (for SVGs and other non-raster formats)
function readFileAsBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        base64Data: reader.result.split(',')[1],
        previewUrl: URL.createObjectURL(file),
      });
    };
    reader.readAsDataURL(file);
  });
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

function handlePreview() {
  collectContent();

  // Form POST opens result directly in a new tab — no popup blocker,
  // no blob URLs, no document.write. The server renders the page and
  // serves it from the same origin so all paths resolve correctly.
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/preview';
  form.target = '_blank';
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'json';
  input.value = JSON.stringify(content);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

// ============================================================================
//  PUBLISH
// ============================================================================

async function handlePublish() {
  if (!confirm('Publier les modifications ? Le site sera reconstruit automatiquement.')) return;

  collectContent();
  $btnPublish.disabled = true;
  $btnPublish.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Publication...';
  setStatus('saving', 'Publication en cours...');

  try {
    // 1. Upload any pending images
    for (const img of pendingImages) {
      setStatus('saving', `Envoi de ${img.name}...`);
      // Check if image already exists (get its SHA)
      let existingSha = null;
      try {
        const existing = await getFile(img.path);
        if (existing) existingSha = existing.sha;
      } catch (_) { /* file doesn't exist yet */ }

      await updateFile(
        img.path,
        img.base64,
        `admin: upload ${img.name}`,
        existingSha
      );
    }
    pendingImages = [];

    // 2. Update settings.json
    setStatus('saving', 'Mise à jour du contenu...');
    // Re-fetch SHA in case it changed (e.g. from image uploads that triggered a rebuild)
    const currentFile = await getFile(CONTENT_PATH);
    if (currentFile) contentSha = currentFile.sha;

    const jsonStr = JSON.stringify(content, null, 2) + '\n';
    const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));

    const result = await updateFile(
      CONTENT_PATH,
      base64Content,
      'admin: update content',
      contentSha
    );

    // Update SHA for next publish
    contentSha = result.content.sha;

    // 3. Clean up orphaned images
    setStatus('saving', 'Nettoyage des images...');
    const referencedPaths = collectImagePaths(content);
    const remoteFiles = await listDir(IMAGES_PATH);
    for (const file of remoteFiles) {
      if (file.type === 'file' && !referencedPaths.has(file.path)) {
        try {
          await deleteFile(file.path, file.sha, `admin: remove unused ${file.name}`);
        } catch (_) { /* non-critical, skip */ }
      }
    }

    setStatus('connected', 'Publié');
    $statusTime.textContent = `Dernière publication : ${new Date().toLocaleTimeString('fr-CA')}`;
    showToast('Publié ! Le site sera mis à jour dans ~30 secondes.', 'success');
  } catch (e) {
    console.error('Publish error:', e);
    setStatus('error', 'Erreur de publication');
    showToast(`Erreur : ${e.message}`, 'error');
  } finally {
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

function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// Initialize EasyMDE on a textarea.
// compact=true for single-line fields (titles, buttons).
function initMarkdownEditor(container, compact) {
  if (typeof EasyMDE === 'undefined') return null;
  const ta = container.querySelector('textarea');
  if (!ta) return null;

  const toolbar = compact
    ? ['bold', 'italic', 'strikethrough', '|', 'link', '|', 'preview', '|', 'guide']
    : ['bold', 'italic', 'strikethrough', 'code', '|', 'heading-1', 'heading-2', 'heading-3', '|', 'unordered-list', 'ordered-list', 'quote', '|', 'link', '|', 'preview', '|', 'guide'];

  const editor = new EasyMDE({
    element: ta,
    spellChecker: false,
    autoDownloadFontAwesome: false,
    forceSync: true,
    status: false,
    minHeight: compact ? '50px' : '120px',
    maxHeight: compact ? '50px' : undefined,
    toolbar,
  });

  if (compact) {
    const wrapper = ta.closest('.EasyMDEContainer') || ta.parentElement.querySelector('.EasyMDEContainer');
    if (wrapper) wrapper.classList.add('compact');
  }

  return editor;
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
