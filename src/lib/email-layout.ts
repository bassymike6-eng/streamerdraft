// src/lib/email-layout.ts
//
// WHAT THIS IS
// The look of our emails (the same black and red as the confirm email), for
// any email whose words are written as plain text:
//   - the launch and news emails you write on the dashboard
//   - the "we can't take you on as a scout" email (turn-down-email.ts)
//
// It runs in the browser too (no server-only), so the dashboard's preview is
// EXACTLY what gets sent.
//
// HOW THE WORDS BECOME AN EMAIL
//   a blank line         a new paragraph
//   a single line break  a line break
//   {name}               their name or handle
//   https://...          a link you can tap
// Everything is "escaped" first: a name like <b>hi</b> shows as text, it
// can never become code inside the email.

export type EmailParts = {
  name: string; // fills in {name}
  body: string; // the words, as plain text
  button?: { label: string; url: string } | null; // one red button under the words
  footer: string[]; // small grey lines at the bottom: why they're getting it
  unsubscribeUrl?: string | null; // launch and news emails: their own link
  appUrl: string; // the site, for the Rules and Privacy links
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Only real web links (no javascript: or anything else sneaky)
export function isWebLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

const fill = (text: string, name: string) => text.replaceAll("{name}", name);

// One paragraph of plain text → safe HTML, with its links made tappable.
// The links are found in the raw text, then every piece is escaped on its own.
// (A full stop or bracket straight after a link isn't part of it.)
function paragraphHtml(text: string): string {
  const out: string[] = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']*[^\s<>"'.,!?;:)]/g)) {
    const url = match[0];
    out.push(escapeHtml(text.slice(last, match.index)));
    out.push(isWebLink(url) ? `<a href="${escapeHtml(url)}" style="color:#fff">${escapeHtml(url)}</a>` : escapeHtml(url));
    last = match.index + url.length;
  }
  out.push(escapeHtml(text.slice(last)));
  return out.join("").replaceAll("\n", "<br>");
}

const paragraphs = (body: string) =>
  body
    .replaceAll("\r\n", "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export function renderEmail(parts: EmailParts): { html: string; text: string } {
  const body = paragraphs(fill(parts.body, parts.name));
  const button = parts.button && parts.button.label.trim() && isWebLink(parts.button.url) ? parts.button : null;

  // ── Plain-text version (for email apps that don't show designs) ──
  const text = [
    ...body.flatMap((p) => [p, ""]),
    ...(button ? [`${button.label}: ${button.url}`, ""] : []),
    "StreamerDraft",
    ...parts.footer,
    ...(parts.unsubscribeUrl ? [`Unsubscribe: ${parts.unsubscribeUrl}`] : []),
    `Competition rules: ${parts.appUrl}/rules`,
    `Privacy: ${parts.appUrl}/privacy`,
  ].join("\n");

  // ── The designed version ──
  const grey = "font-size:13px;line-height:1.5;color:#A1A1A6;margin:12px 0 0";
  const html = `
    <div style="background:#000;padding:40px 20px;font-family:Arial,sans-serif;color:#F5F5F7">
      <div style="max-width:480px;margin:0 auto">
        <p style="font-size:22px;font-weight:bold;margin:0 0 24px;color:#E50914">StreamerDraft</p>
        ${body.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${paragraphHtml(p)}</p>`).join("\n        ")}
        ${button ? `<p style="margin:26px 0 8px"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#E50914;color:#fff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:999px">${escapeHtml(button.label)}</a></p>` : ""}
        <div style="border-top:1px solid #2C2C2E;margin:28px 0 0;padding-top:4px">
          ${parts.footer.map((line) => `<p style="${grey}">${escapeHtml(line)}</p>`).join("\n          ")}
          <p style="${grey}">${parts.unsubscribeUrl ? `<a href="${escapeHtml(parts.unsubscribeUrl)}" style="color:#A1A1A6">Unsubscribe</a> &nbsp; ` : ""}<a href="${parts.appUrl}/rules" style="color:#A1A1A6">Competition rules</a> &nbsp; <a href="${parts.appUrl}/privacy" style="color:#A1A1A6">Privacy</a></p>
        </div>
      </div>
    </div>`;

  return { html, text };
}

// For the dashboard's previews: the email on its own page, edge to edge
// (without this the preview box shows a white border round it)
export const previewPage = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000">${html}</body></html>`;
