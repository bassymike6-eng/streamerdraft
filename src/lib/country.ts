// src/lib/country.ts
//
// WHAT THIS IS
// Works out which country a visitor is in, from the request headers.
//
// HOW IT WORKS
// When the site is live, every visitor reaches us THROUGH Cloudflare.
// Cloudflare looks up their IP address and adds a header to the request:
//   CF-IPCountry: GB
// We just read that header. No lookup service, no cost.
//
// THINGS TO KNOW
// - In local dev there's no Cloudflare in front of localhost, so this
//   returns null (unknown), unless a test sends the header itself.
//   Our .http tests do that on purpose, to pretend to be Cloudflare.
// - Cloudflare sets this header itself, so a visitor can't fake it, but
//   ONLY if every visitor has to come through Cloudflare. Locking the
//   server so it only accepts Cloudflare traffic is on the L1 (deploy) list.
// - It's evidence, not proof (VPNs exist). The UK tick decides eligibility;
//   the admin dashboard uses this to flag ticks that don't match.

// Two capital letters or digits: "GB", "US", plus Cloudflare's "XX"
// (unknown) and "T1" (Tor). Same rule as the CHECK in migration 003.
const COUNTRY_CODE = /^[A-Z0-9]{2}$/;

export function getIpCountry(request: Request): string | null {
  // Header names aren't case-sensitive; .get() handles that for us.
  const raw = request.headers.get("cf-ipcountry");
  if (!raw) return null; // no header = we don't know

  const code = raw.trim().toUpperCase();

  // Anything weird: treat as unknown instead of failing the sign-up.
  // (The database would reject it anyway, and that would be a 500.)
  return COUNTRY_CODE.test(code) ? code : null;
}