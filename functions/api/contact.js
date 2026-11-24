/**
 * Cloudflare Pages Function — Contact Form Handler
 *
 * Route: /api/contact (POST)
 *
 * Environment bindings expected:
 *   TURNSTILE_SECRET  – Cloudflare Turnstile secret key
 *   CONTACT_EMAIL     – Verified sender email address
 *   CONTACT_DESTINATION – Recipient email address
 *   EMAIL_WORKER      – Service binding to workers/email-sender in production
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip anything that looks like an HTML tag. */
function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").trim();
}

/** Very basic email-format check. */
function isValidEmail(email) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

/** Build a raw MIME message string (no external libraries needed). */
function createMimeMessage({ from, to, replyTo, subject, body }) {
  const boundary = "----=_Part_" + Date.now().toString(36);
  // Keep each RFC 2047 word below 75 characters, including four-byte UTF-8.
  const encodedSubject = subject.match(/[\s\S]{1,10}/gu)
    .map((part) => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(part)))}?=`)
    .join("\r\n ");

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Reply-To: <${replyTo.replace(/[\r\n]/g, "")}>`,
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const plainPart = [
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join("\r\n");

  const htmlBody = body
    .split("\n")
    .map((line) => {
      if (line.startsWith("---")) return "<hr>";
      const escapedLine = line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      if (line.startsWith("  ")) return `<p style="margin:0 0 4px 16px">${escapedLine.trim()}</p>`;
      return `<p style="margin:0 0 4px 0"><strong>${escapedLine}</strong></p>`;
    })
    .join("\n");

  const htmlPart = [
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333">${htmlBody}</body></html>`,
  ].join("\r\n");

  return [headers, "", plainPart, htmlPart, `--${boundary}--`].join("\r\n");
}

/** Standard CORS headers returned on every response. */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** Convenience: JSON error response. */
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// ---------------------------------------------------------------------------
// Preflight (OPTIONS)
// ---------------------------------------------------------------------------

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function onRequestPost(context) {
  try {
    // 1. Parse the JSON body ------------------------------------------------
    let data;
    try {
      data = await context.request.json();
    } catch {
      return errorResponse("Le corps de la requete est invalide.");
    }

    // 2. Honeypot check -----------------------------------------------------
    if (data.bot_field) {
      // Silently accept to avoid tipping off bots, but do nothing.
      return new Response(
        JSON.stringify({ success: true, message: "Message envoye avec succes." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    // 3. Sanitize inputs ----------------------------------------------------
    const name = sanitize(data.name);
    const email = sanitize(data.email);
    const phone = sanitize(data.phone || "");
    const subjects = Array.isArray(data.subjects) ? data.subjects.map(sanitize) : [];
    const referral = sanitize(data.referral || "");
    const message = sanitize(data.message);
    const turnstileToken = sanitize(data["cf-turnstile-response"] || data.turnstileToken || "");

    // 4. Validate required fields -------------------------------------------
    if (!name) return errorResponse("Le champ nom est requis.");
    if (!email) return errorResponse("Le champ email est requis.");
    if (!isValidEmail(email)) return errorResponse("L'adresse email est invalide.");
    if (subjects.length < 1 || subjects.length > 10 || subjects.some((subject) => !subject || subject.length > 200)) {
      return errorResponse("Veuillez choisir au moins un sujet.");
    }
    if (!message) return errorResponse("Le champ message est requis.");
    // Same limit as the textarea maxlength in template.html.
    if (message.length > 3000) return errorResponse("Le message ne doit pas dépasser 3000 caractères.");

    // 5. Verify Turnstile token ---------------------------------------------
    if (!turnstileToken) {
      return errorResponse("La verification Turnstile est requise.", 403);
    }

    const turnstileRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: context.env.TURNSTILE_SECRET,
          response: turnstileToken,
          remoteip: context.request.headers.get("CF-Connecting-IP"),
        }),
      }
    );

    const turnstileData = await turnstileRes.json();

    if (!turnstileData.success) {
      return errorResponse("La verification Turnstile a echoue. Veuillez reessayer.", 403);
    }

    // 6. Build email body ---------------------------------------------------
    const timestamp = new Date().toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      dateStyle: "full",
      timeStyle: "short",
    });

    const formattedBody = [
      `Nouveau message via le formulaire de contact`,
      `----------------------------------------------`,
      ``,
      `  Nom : ${name}`,
      `  Email : ${email}`,
      phone ? `  Telephone : ${phone}` : null,
      `  Sujets :`,
      ...subjects.map((subject) => `  - ${subject}`),
      referral ? `  Source : ${referral}` : null,
      ``,
      `----------------------------------------------`,
      `Message :`,
      ``,
      `  ${message}`,
      ``,
      `----------------------------------------------`,
      `Recu le ${timestamp}`,
    ]
      .filter(Boolean)
      .join("\n");

    // 7. Send email ---------------------------------------------------------
    const fromEmail = context.env.CONTACT_EMAIL;
    const toEmail = context.env.CONTACT_DESTINATION;
    if (!fromEmail || !toEmail) {
      return errorResponse("La configuration email du serveur est manquante.", 500);
    }

    const subjectCharacters = Array.from(`Nouveau message de ${name} - ${subjects.join(", ")}`.replace(/[\r\n]/g, " "));
    const subject = subjectCharacters.length > 200
      ? subjectCharacters.slice(0, 199).join("") + "…"
      : subjectCharacters.join("");
    const mimeMessage = createMimeMessage({
      from: `Formulaire de contact <${fromEmail}>`,
      to: toEmail,
      replyTo: email,
      subject,
      body: formattedBody,
    });

    if (context.env.EMAIL_WORKER) {
      // Await handoff to email Worker (confirms it received the request).
      // The Worker itself sends the email in the background via waitUntil.
      const res = await context.env.EMAIL_WORKER.fetch("https://email-worker/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: toEmail, raw: mimeMessage }),
      });
      if (!res.ok) {
        throw new Error("Email worker did not accept the request");
      }
    } else {
      // Local development fallback: log to console
      console.log("=== EMAIL (dev mode — EMAIL_WORKER binding not available) ===");
      console.log(mimeMessage);
      console.log("=== END EMAIL ===");
    }

    // 8. Success response (returned immediately, email sends in background)
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  } catch (err) {
    console.error("Contact form error:", err);
    return errorResponse("Une erreur interne est survenue. Veuillez reessayer plus tard.", 500);
  }
}
