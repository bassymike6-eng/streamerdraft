"use client";

// src/components/plain/UnsubscribePage.tsx
//
// WHAT THIS IS
// The page an email's "Unsubscribe" link opens: /unsubscribe?u=...
//
//   ready     Stop emails from StreamerDraft?   [ Unsubscribe ]
//   done      You're unsubscribed (and what that does and doesn't mean)
//   problem   the link's broken, or we couldn't reach the server
//
// Opening the page changes nothing: only pressing the button does (work email
// systems open every link to check it, see src/app/api/unsubscribe/route.ts).
// The look, header and footer come from PlainPage, like the confirm page.

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Icon, Tick } from "@/components/page/EntryParts";
import c from "@/components/confirm/Confirm.module.css";
import e from "@/components/page/Entry.module.css";
import { CONTACT_EMAIL } from "@/lib/site";
import { PlainPage } from "./PlainPage";

type View = "ready" | "done" | "invalid";
type Banner = { title: string; text: string };

const codeFromUrl = () => new URLSearchParams(window.location.search).get("u") ?? "";

export function UnsubscribePage() {
  const [view, setView] = useState<View>("ready");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const go = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setBanner(null);
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: codeFromUrl() }),
      });
      if (response.ok) setView("done");
      else if (response.status === 400) setView("invalid");
      else if (response.status === 429) setBanner({ title: "Too many tries", text: "Give it a few minutes, then try again." });
      else setBanner({ title: "Something went wrong on our side", text: "Your link's fine. Try again in a moment." });
    } catch {
      setBanner({ title: "Couldn't reach StreamerDraft", text: "Check your connection, then try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PlainPage>
      {view === "ready" && (
        <form className={`${e.view} ${c.panel}`} onSubmit={go} noValidate>
          <h1 className={c.title}>Stop emails from StreamerDraft?</h1>
          <p className={c.lead}>
            We won&apos;t email you about the launch, or with news and offers. You&apos;re still in the draft, and
            still in the competition.
          </p>

          {banner && (
            <div className={e.banner} role="alert">
              <Icon name="alert" />
              <div>
                <p className={e.bannerTitle}>{banner.title}</p>
                <p className={e.bannerText}>{banner.text}</p>
              </div>
            </div>
          )}

          <button type="submit" className={`${e.primary} ${e.submit}`} disabled={busy} aria-busy={busy}>
            <span>
              {busy && <i className={e.spinner} aria-hidden="true" />}
              {busy ? "Unsubscribing" : "Unsubscribe"}
            </span>
          </button>
        </form>
      )}

      {view === "done" && (
        <div className={`${e.view} ${c.panel}`} role="status">
          <Tick className={c.bigTick} />
          <h1 className={c.title}>You&apos;re unsubscribed</h1>
          <p className={c.lead}>
            No more launch or news emails. If you win the competition, we&apos;ll still email you about your prize.
          </p>
          <Link href="/" className={`${e.secondary} ${c.home}`}><span>Go to StreamerDraft</span></Link>
        </div>
      )}

      {view === "invalid" && (
        <div className={`${e.view} ${c.panel}`}>
          <span className={c.problemIcon}><Icon name="alert" /></span>
          <h1 className={c.title}>This link doesn&apos;t work</h1>
          <p className={c.lead}>
            Part of it may have been cut off. Open the Unsubscribe link from the email again, or email{" "}
            {CONTACT_EMAIL ? <b>{CONTACT_EMAIL}</b> : "us"} and we&apos;ll take you off the list.
          </p>
          <Link href="/" className={`${e.secondary} ${c.home}`}><span>Go to StreamerDraft</span></Link>
        </div>
      )}
    </PlainPage>
  );
}
