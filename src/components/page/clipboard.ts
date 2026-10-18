// src/components/page/clipboard.ts
//
// WHAT THIS IS
// Copying text (your link) in every browser, including when the page isn't
// on HTTPS.
//
// WHY THIS EXISTS (the "Copy link does nothing on my phone" bug)
// The modern way to copy, navigator.clipboard, only exists on SECURE pages:
// HTTPS, or localhost. On your laptop you open http://localhost:3000, which
// counts as secure, so it worked. On your phone you open your laptop's
// address, http://192.168..., which is plain HTTP and NOT secure, so
// navigator.clipboard simply isn't there and the copy silently failed. (The
// share menu, navigator.share, has the same rule.) On the live site (HTTPS)
// both are always there.
//
// So: try the modern way first, and if it's missing or refused, fall back to
// the old way that works everywhere: put the text in a hidden box, select
// it and ask the browser to copy the selection.
//
// The hidden box has to go INSIDE any open pop-up: while a pop-up (a modal
// <dialog>) is open, the browser makes everything outside it untouchable,
// and an untouchable box can't be selected, so the copy would fail.

export async function copyText(text: string, near?: Element | null): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // refused (no permission): try the old way
    }
  }
  return copyTheOldWay(text, near);
}

// The same copy, but instant (no waiting), for when something else has to
// happen straight from the same tap. The share menu is like that: iPhones only
// open it straight from a tap, and waiting for the modern copy to finish
// first can make Safari refuse ("not allowed"). The old way finishes
// instantly, so the share menu still opens. Works on every page, secure or not.
export function copyTextNow(text: string, near?: Element | null): boolean {
  if (typeof window === "undefined") return false;
  return copyTheOldWay(text, near);
}

function copyTheOldWay(text: string, near?: Element | null): boolean {
  const home = near?.closest("dialog[open]") ?? document.querySelector("dialog[open]") ?? document.body;
  const before = document.activeElement as HTMLElement | null;
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", ""); // (no keyboard popping up on phones)
  box.setAttribute("aria-hidden", "true");
  // out of sight, but still "there" (display: none can't be selected); 16px so iPhones don't zoom in
  Object.assign(box.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", fontSize: "16px", border: "0", padding: "0" });
  home.appendChild(box);
  let copied = false;
  try {
    box.focus({ preventScroll: true });
    box.select();
    box.setSelectionRange(0, text.length); // (iPhones need this as well as select())
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  box.remove();
  before?.focus?.({ preventScroll: true });
  return copied;
}

// Can this browser hand a picture to the phone's own share menu (the one with
// Instagram, TikTok, Snapchat, Messages, Save Image)? Only on secure pages.
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
