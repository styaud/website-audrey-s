import { EmailMessage } from "cloudflare:email";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let from, to, raw;
    try {
      ({ from, to, raw } = await request.json());
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Accept immediately, send email in the background
    ctx.waitUntil(
      (async () => {
        try {
          const message = new EmailMessage(from, to, raw);
          await env.SEND_EMAIL.send(message);
        } catch (err) {
          console.error("Email delivery failed:", err);
        }
      })()
    );

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
