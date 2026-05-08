const REPO_OWNER = "styaud";
const REPO_NAME = "website-audrey-s";
const REPO_FULL_NAME = `${REPO_OWNER}/${REPO_NAME}`;
const REPO_BRANCH = "main";
const GITHUB_API = "https://api.github.com";

const OAUTH_STATE_COOKIE = "admin_oauth_state";
const OAUTH_VERIFIER_COOKIE = "admin_oauth_verifier";
const SESSION_COOKIE = "admin_session";

const CALLBACK_COOKIE_MAX_AGE = 600;
const SESSION_MAX_AGE = 3600;
const PERMISSION_CACHE_MS = 5 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const CONTENT_PATH = "content/settings.json";
export const IMAGES_PATH = "assets/images";

function isLocalRequest(request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function cookie(name, value, request, options = {}) {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path || "/"}`,
    `Max-Age=${options.maxAge ?? SESSION_MAX_AGE}`,
    "HttpOnly",
    `SameSite=${options.sameSite || "Strict"}`,
  ];
  if (!isLocalRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name, request, options = {}) {
  return cookie(name, "", request, {
    path: options.path || "/",
    maxAge: 0,
    sameSite: options.sameSite || "Strict",
  });
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = new Map();
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    cookies.set(trimmed.slice(0, index), trimmed.slice(index + 1));
  }
  return cookies;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

export function textToBase64(value) {
  return bytesToBase64(encoder.encode(value));
}

export function base64ToText(value) {
  return decoder.decode(base64ToBytes(value));
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function sessionKey(env) {
  if (!env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.ADMIN_SESSION_SECRET),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("website-audrey-s-admin-session-v1"),
      info: encoder.encode("admin-session-cookie"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createOauthChallenge(request) {
  const state = randomBase64Url();
  const verifier = randomBase64Url();
  const challenge = await sha256Base64Url(verifier);
  return {
    state,
    verifier,
    challenge,
    cookies: [
      cookie(OAUTH_STATE_COOKIE, state, request, { maxAge: CALLBACK_COOKIE_MAX_AGE, sameSite: "Lax" }),
      cookie(OAUTH_VERIFIER_COOKIE, verifier, request, { maxAge: CALLBACK_COOKIE_MAX_AGE, sameSite: "Lax" }),
    ],
  };
}

export function readOauthChallenge(request) {
  const cookies = parseCookies(request);
  return {
    state: cookies.get(OAUTH_STATE_COOKIE) || "",
    verifier: cookies.get(OAUTH_VERIFIER_COOKIE) || "",
  };
}

export function clearOauthCookies(request) {
  return [
    clearCookie(OAUTH_STATE_COOKIE, request, { sameSite: "Lax" }),
    clearCookie(OAUTH_VERIFIER_COOKIE, request, { sameSite: "Lax" }),
  ];
}

export async function createSessionCookie(env, request, session) {
  const now = Date.now();
  const payload = {
    ...session,
    iat: session.iat || now,
    exp: now + SESSION_MAX_AGE * 1000,
  };
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await sessionKey(env);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  const sealed = `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
  return cookie(SESSION_COOKIE, sealed, request, { maxAge: SESSION_MAX_AGE, sameSite: "Strict" });
}

export function clearSessionCookie(request) {
  return clearCookie(SESSION_COOKIE, request, { sameSite: "Strict" });
}

async function readSession(env, request) {
  const sealed = parseCookies(request).get(SESSION_COOKIE);
  if (!sealed) return { ok: false, status: 401, error: "Not authenticated" };
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return { ok: false, status: 401, error: "Invalid session", clear: true };
  }
  try {
    const key = await sessionKey(env);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(parts[1]) },
      key,
      base64UrlToBytes(parts[2]),
    );
    const session = JSON.parse(decoder.decode(plaintext));
    if (!session.githubToken || !session.login || !session.csrf || !session.exp) {
      return { ok: false, status: 401, error: "Invalid session", clear: true };
    }
    if (Date.now() > session.exp) {
      return { ok: false, status: 401, error: "Session expired", clear: true };
    }
    return { ok: true, session };
  } catch {
    return { ok: false, status: 401, error: "Invalid session", clear: true };
  }
}

export function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function htmlResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { ...init, headers });
}

export function addSetCookies(headers, cookies) {
  for (const value of cookies.filter(Boolean)) headers.append("Set-Cookie", value);
  return headers;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "website-audrey-s-admin",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function githubFetch(token, path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        ...githubHeaders(token),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getGithubUser(token) {
  const res = await githubFetch(token, "/user");
  if (!res.ok) throw new Error("Unable to read GitHub user.");
  const data = await res.json();
  if (!data.login) throw new Error("GitHub user response is missing login.");
  return data;
}

function permissionNameFromRepository(repository) {
  const permissions = repository?.permissions || {};
  if (permissions.admin === true || permissions.push === true) {
    return permissions.admin === true ? "admin" : "write";
  }
  return "";
}

function permissionNameFromCollaborator(data) {
  if (["admin", "maintain", "write"].includes(data?.permission)) return data.permission;
  const permissions = data?.user?.permissions || {};
  if (permissions.admin === true || permissions.push === true) {
    return permissions.admin === true ? "admin" : "write";
  }
  return "";
}

export async function verifyRepoWriteAccess(token, login = "") {
  let repoStatus = 503;
  try {
    const repoRes = await githubFetch(token, `/repos/${REPO_FULL_NAME}`);
    repoStatus = repoRes.status;
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      const repoPermission = permissionNameFromRepository(repoData);
      if (repoPermission) {
        return {
          ok: true,
          permission: repoPermission,
        };
      }
    }
  } catch (e) {
    console.error("GitHub repository permission lookup failed:", e);
  }

  if (login) {
    try {
      const collaboratorRes = await githubFetch(
        token,
        `/repos/${REPO_FULL_NAME}/collaborators/${encodeURIComponent(login)}/permission`,
      );
      if (collaboratorRes.ok) {
        const collaboratorData = await collaboratorRes.json();
        const collaboratorPermission = permissionNameFromCollaborator(collaboratorData);
        if (collaboratorPermission) {
          return {
            ok: true,
            permission: collaboratorPermission === "admin" ? "admin" : "write",
          };
        }
        return {
          ok: false,
          status: 403,
          error: "GitHub account does not have write access to this repository.",
        };
      }
      repoStatus = collaboratorRes.status;
    } catch (e) {
      console.error("GitHub collaborator permission lookup failed:", e);
      return { ok: false, status: 503, error: "Unable to verify repository permission." };
    }
  }

  if (repoStatus === 403 || repoStatus === 404) {
    return {
      ok: false,
      status: 403,
      error: "GitHub account does not have write access to this repository.",
    };
  }
  return { ok: false, status: 503, error: "Unable to verify repository permission." };
}

function csrfError(context, session) {
  const request = context.request;
  const origin = request.headers.get("Origin");
  const expectedOrigin = new URL(request.url).origin;
  if (origin !== expectedOrigin) return "Request origin is not allowed.";

  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin") return "Cross-site admin request blocked.";

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return "Admin request must use application/json.";
  }

  const token = request.headers.get("X-CSRF-Token") || "";
  if (!token || token !== session.csrf) return "Invalid CSRF token.";
  return "";
}

export async function requireAdmin(context, options = {}) {
  const sessionResult = await readSession(context.env, context.request);
  if (!sessionResult.ok) {
    const headers = new Headers();
    if (sessionResult.clear) headers.append("Set-Cookie", clearSessionCookie(context.request));
    return {
      ok: false,
      response: jsonResponse({ authenticated: false, error: sessionResult.error }, {
        status: sessionResult.status,
        headers,
      }),
    };
  }

  const session = sessionResult.session;
  if (options.csrf) {
    const error = csrfError(context, session);
    if (error) {
      return {
        ok: false,
        response: jsonResponse({ success: false, error }, { status: 403 }),
      };
    }
  }

  const now = Date.now();
  const needsPermissionCheck =
    options.freshPermission === true ||
    !session.permissionCheckedAt ||
    now - session.permissionCheckedAt > PERMISSION_CACHE_MS;

  const headers = new Headers();
  if (needsPermissionCheck) {
    let permission;
    try {
      permission = await verifyRepoWriteAccess(session.githubToken, session.login);
    } catch {
      permission = { ok: false, status: 503, error: "Unable to verify repository permission." };
    }
    if (!permission.ok) {
      if (permission.status === 403 || permission.status === 404) {
        headers.append("Set-Cookie", clearSessionCookie(context.request));
      }
      const status = permission.status === 403 || permission.status === 404 ? 403 : 503;
      return {
        ok: false,
        response: jsonResponse({ success: false, error: permission.error }, { status, headers }),
      };
    }
    session.permission = permission.permission;
    session.permissionCheckedAt = now;
    headers.append("Set-Cookie", await createSessionCookie(context.env, context.request, session));
  }

  return { ok: true, session, headers };
}

export function createSession(login, githubToken, permission) {
  const now = Date.now();
  return {
    login,
    githubToken,
    permission,
    permissionCheckedAt: now,
    csrf: randomBase64Url(24),
    iat: now,
    exp: now + SESSION_MAX_AGE * 1000,
  };
}

export function githubContentsUrl(path) {
  return `/repos/${REPO_FULL_NAME}/contents/${path}`;
}

export function githubContentsQuery(path) {
  return `${githubContentsUrl(path)}?ref=${REPO_BRANCH}`;
}

export function githubBranch() {
  return REPO_BRANCH;
}

export function validateImageName(name) {
  if (typeof name !== "string") throw new Error("Image name is required.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(name)) {
    throw new Error("Image name contains invalid characters.");
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error("Image name must be a plain file name.");
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) throw new Error("Image extension is required.");
  const extension = name.slice(dot + 1).toLowerCase();
  const allowed = new Set(["webp", "jpg", "jpeg", "png", "svg", "ico"]);
  if (!allowed.has(extension)) throw new Error("Image extension is not allowed.");
  return { name, extension, path: `${IMAGES_PATH}/${name}` };
}

export function validateImageUpload(name, contentBase64) {
  const image = validateImageName(name);
  if (typeof contentBase64 !== "string") throw new Error("Image content is required.");
  const bytes = base64ToBytes(contentBase64);
  if (bytes.byteLength === 0) throw new Error("Image file is empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image file is too large.");

  if (image.extension === "svg") {
    const text = decoder.decode(bytes);
    validateSvg(text);
  } else if (image.extension === "ico") {
    if (bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) {
      throw new Error("ICO file is invalid.");
    }
  } else if (image.extension === "png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!png.every((value, index) => bytes[index] === value)) throw new Error("PNG file is invalid.");
  } else if (image.extension === "jpg" || image.extension === "jpeg") {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error("JPEG file is invalid.");
  } else if (image.extension === "webp") {
    const riff = decoder.decode(bytes.slice(0, 4));
    const webp = decoder.decode(bytes.slice(8, 12));
    if (riff !== "RIFF" || webp !== "WEBP") throw new Error("WebP file is invalid.");
  }

  return image;
}

function validateSvg(text) {
  const trimmed = text.trim();
  if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(trimmed)) {
    throw new Error("SVG file must start with an svg element.");
  }
  const forbiddenPatterns = [
    /<!doctype/i,
    /<!entity/i,
    /<script[\s>]/i,
    /<foreignobject[\s>]/i,
    /<iframe[\s>]/i,
    /<object[\s>]/i,
    /<embed[\s>]/i,
    /<link[\s>]/i,
    /<image[\s>]/i,
    /\son[a-z]+\s*=/i,
    /javascript\s*:/i,
    /data\s*:\s*text\/html/i,
    /\b(?:href|xlink:href)\s*=/i,
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(text))) {
    throw new Error("SVG file contains unsafe markup.");
  }
}
