"use client";

// src/components/admin/AdminApp.tsx
//
// WHAT THIS IS
// The admin dashboard: /admin (src/app/admin/page.tsx). Only you can use it:
// everything it shows comes from the /api/admin routes, which all check the
// login first (src/lib/admin-auth.ts). The page itself holds no data.
//
//   checking    "am I logged in?" (GET /api/admin/me)
//   login       the password box
//   dashboard   five tabs:
//                 Overview      the numbers and graphs, Road to 300, downloads
//                 People        everyone, searchable; tap someone for their details
//                 Scouts        new scouts to check: Looks good, or Turn down
//                 Leaderboard   who's winning, with the checks before you announce
//                 Flags         every red flag, grouped
//
// THE ADDRESS BAR KEEPS YOUR PLACE
//   /admin#people        the People tab
//   /admin#people/42     ...with person 42 open
// so Back works (on a phone, Back closes someone's details), and a refresh
// keeps you where you were.
//
// On a computer the tabs run along the top; on a phone they're a bar along
// the bottom, like an app, and someone's details fill the screen.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { BRAND_FONT, fontStack } from "@/lib/brand-font";
import { AdminContext, useAdmin, type AdminTools, type Overview as OverviewData } from "./data";
import { Flags } from "./Flags";
import { Leaderboard } from "./Leaderboard";
import { Overview } from "./Overview";
import { DEFAULT_FILTERS, People, type Filters } from "./People";
import { PersonPanel } from "./PersonPanel";
import { Icon, type IconName } from "./parts";
import { Scouts } from "./Scouts";
import a from "./Admin.module.css";

type Tab = "overview" | "people" | "scouts" | "leaderboard" | "flags";
const TABS: { id: Tab; name: string; short: string; icon: IconName }[] = [
  { id: "overview", name: "Overview", short: "Overview", icon: "overview" },
  { id: "people", name: "People", short: "People", icon: "people" },
  { id: "scouts", name: "Scouts", short: "Scouts", icon: "scouts" },
  { id: "leaderboard", name: "Leaderboard", short: "Board", icon: "trophy" },
  { id: "flags", name: "Flags", short: "Flags", icon: "flag" },
];

// ── The address bar (#tab or #tab/id) ───────────────────────────────
const onHash = (changed: () => void) => {
  window.addEventListener("hashchange", changed);
  return () => window.removeEventListener("hashchange", changed);
};
const useHash = () => useSyncExternalStore(onHash, () => window.location.hash, () => "");

function readHash(hash: string): { tab: Tab; person: number | null } {
  const [tab, id] = hash.replace(/^#/, "").split("/");
  const person = Number(id);
  return {
    tab: TABS.some((t) => t.id === tab) ? (tab as Tab) : "overview",
    person: Number.isInteger(person) && person > 0 ? person : null,
  };
}

// Change the address without adding a Back step (and tell useHash)
function replaceHash(hash: string) {
  history.replaceState(null, "", `#${hash}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

// ── The whole page ──────────────────────────────────────────────────
export function AdminApp() {
  const [auth, setAuth] = useState<"checking" | "out" | "in">("checking");

  useEffect(() => {
    let live = true;
    fetch("/api/admin/me", { cache: "no-store" })
      .then((response) => live && setAuth(response.ok ? "in" : "out"))
      .catch(() => live && setAuth("out"));
    return () => {
      live = false;
    };
  }, []);

  const loggedOut = useCallback(() => setAuth("out"), []);

  return (
    <div className={a.root} style={{ "--font-display": fontStack(BRAND_FONT) } as CSSProperties}>
      {auth === "checking" && <div className={a.center}><span className={a.spinner} aria-label="Loading" /></div>}
      {auth === "out" && <Login onIn={() => setAuth("in")} />}
      {auth === "in" && <Dashboard loggedOut={loggedOut} />}
    </div>
  );
}

// ── Logging in ──────────────────────────────────────────────────────
function Login({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) return onIn();
      const data = await response.json().catch(() => null);
      if (response.status === 429) {
        const minutes = Math.max(1, Math.ceil((data?.retryAfterSeconds ?? 900) / 60));
        setProblem(`Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      } else if (response.status === 503) {
        setProblem("Logging in isn't set up on this server: add ADMIN_PASSWORD and ADMIN_SESSION_SECRET to its environment, then restart it.");
      } else {
        setProblem("That's not the password.");
      }
    } catch {
      setProblem("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={a.loginPage}>
      <form className={a.login} onSubmit={submit}>
        <p className={a.logo}>StreamerDraft</p>
        <h1 className={a.loginTitle}>Admin</h1>
        <label className={a.field}>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            autoFocus
            required
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? "login-problem" : undefined}
          />
        </label>
        {problem && <p id="login-problem" className={a.loginProblem} role="alert"><Icon name="alert" />{problem}</p>}
        <button type="submit" className={a.primary} disabled={busy || !password}>
          {busy ? "Logging in" : "Log in"}
        </button>
        <Link href="/" className={a.quietLink}>Back to the site</Link>
      </form>
    </main>
  );
}

// ── Logged in ───────────────────────────────────────────────────────
function Dashboard({ loggedOut }: { loggedOut: () => void }) {
  const hash = useHash();
  const { tab, person } = readHash(hash);
  const [version, setVersion] = useState(0);
  const [toastText, setToastText] = useState<{ text: string; n: number } | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS); // kept here so People remembers them
  const pushed = useRef(false); // did WE add the "person open" Back step?

  // nobody open (closed, or they pressed Back): there's no Back step of ours left
  useEffect(() => {
    if (person === null) pushed.current = false;
  }, [person]);

  const openPerson = useCallback(
    (id: number) => {
      if (person === null) {
        pushed.current = true;
        window.location.hash = `${tab}/${id}`; // a Back step: Back closes them
      } else {
        replaceHash(`${tab}/${id}`); // already open: swap who, no extra Back step
      }
    },
    [tab, person]
  );

  const closePerson = useCallback(() => {
    if (pushed.current) history.back();
    else replaceHash(tab);
  }, [tab]);

  const tools: AdminTools = useMemo(
    () => ({
      version,
      changed: () => setVersion((v) => v + 1),
      loggedOut,
      openPerson,
      toast: (text: string) => setToastText((was) => ({ text, n: (was?.n ?? 0) + 1 })),
    }),
    [version, loggedOut, openPerson]
  );

  // the little "Saved" message goes after a few seconds
  useEffect(() => {
    if (!toastText) return;
    const timer = setTimeout(() => setToastText(null), 3200);
    return () => clearTimeout(timer);
  }, [toastText]);

  const logOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    loggedOut();
  };

  return (
    <AdminContext value={tools}>
      <Shell tab={tab} onLogOut={logOut}>
        {tab === "overview" && <Overview />}
        {tab === "people" && <People filters={filters} setFilters={setFilters} />}
        {tab === "scouts" && <Scouts />}
        {tab === "leaderboard" && <Leaderboard />}
        {tab === "flags" && <Flags />}
      </Shell>
      {person !== null && <PersonPanel id={person} onClose={closePerson} />}
      <div className={a.toastSpot} aria-live="polite">
        {toastText && <p key={toastText.n} className={a.toast}><Icon name="check" />{toastText.text}</p>}
      </div>
    </AdminContext>
  );
}

function Shell({ tab, onLogOut, children }: { tab: Tab; onLogOut: () => void; children: ReactNode }) {
  // the counts on the tabs (scouts to review, people flagged)
  const { data } = useAdmin<OverviewData>("/api/admin/overview");
  const badge = (id: Tab) =>
    id === "scouts" ? data?.scouts.toCheck : id === "flags" ? data?.competition.flagged : undefined;

  const tabLinks = (where: "top" | "bottom") =>
    TABS.map((t) => {
      const count = badge(t.id);
      return (
        <a key={t.id} href={`#${t.id}`} className={a.tab} aria-current={tab === t.id ? "page" : undefined}>
          {where === "bottom" && <Icon name={t.icon} />}
          <span>{where === "bottom" ? t.short : t.name}</span>
          {count ? <b className={a.badge} aria-label={`(${count})`}>{count > 99 ? "99+" : count}</b> : null}
        </a>
      );
    });

  return (
    <>
      <header className={a.top}>
        <div className={a.topInner}>
          <Link href="/" className={a.logo} title="Go to the site">StreamerDraft</Link>
          <span className={a.adminWord}>Admin</span>
          <nav className={a.topTabs} aria-label="Dashboard">{tabLinks("top")}</nav>
          <button type="button" className={a.ghost} onClick={onLogOut} aria-label="Log out">
            <Icon name="logout" /><span>Log out</span>
          </button>
        </div>
      </header>
      <main className={a.main}>
        <h1 className={a.pageTitle}>{TABS.find((t) => t.id === tab)?.name}</h1>
        {children}
      </main>
      <nav className={a.bottomTabs} aria-label="Dashboard">{tabLinks("bottom")}</nav>
    </>
  );
}
