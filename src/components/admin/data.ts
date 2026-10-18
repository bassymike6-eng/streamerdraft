"use client";

// src/components/admin/data.ts
//
// WHAT THIS IS
// How the admin dashboard talks to the server, and the shapes of what comes
// back (they match src/lib/admin-stats.ts and src/lib/admin-signups.ts):
//
//   useAdmin(url)    fetches one of the /api/admin/... routes and keeps it
//                    fresh: whenever something changes (you turn a scout down,
//                    disqualify someone...), every open view fetches again
//   send(url, ...)   a change (PATCH / DELETE)
//
// If the login's run out (the server says 401), the dashboard goes back to
// the login box by itself.

import { createContext, useContext, useEffect, useState } from "react";

// ── What the server sends ───────────────────────────────────────────
export type Role = "prospect" | "scout";

export type Overview = {
  signups: { all: number; prospects: number; scouts: number };
  confirmed: { all: number; prospects: number; scouts: number; percent: number };
  uk: { ticked: number; notTicked: number; verified: number; percentTicked: number; countryKnown: number };
  referrals: { viaRecruitLink: number; direct: number; percentViaRecruitLink: number };
  marketingOptIn: { count: number; percent: number };
  growth: { last24h: number; last7d: number; last30d: number };
  roadTo300: {
    count: number; goal: number; percent: number; last7d: number; perDay: number;
    projectedDaysToGoal: number | null; closesAt: string; daysLeft: number;
    neededPerDay: number | null; projectedAtClose: number;
  };
  competition: { eligibleEntrants: number; flagged: number; disqualified: number };
  scouts: { toCheck: number; checked: number; turnedDown: number };
  emailLists: { launch: number; news: number; unsubscribed: number };
};

export type ChartItem = { label: string; count: number; percent: number };
export type Day = { date: string; prospects: number; scouts: number; viaRecruitLink: number; confirmations: number; roadTo300: number };

export type Charts = {
  days: number;
  daily: Day[];
  byPlatform: ChartItem[];
  byAudienceSize: ChartItem[];
  byContentType: ChartItem[];
  byCountry: ChartItem[];
  byUkTick: ChartItem[];
  byStreamCategory: ChartItem[];
  byHour: { hour: number; count: number }[];
  byWeekday: { day: string; count: number }[];
  byScoutOffer: ChartItem[];
  byScoutHours: ChartItem[];
  byScoutWeeks: ChartItem[];
  prospectFunnel: { step: string; count: number; percent: number }[];
};

export type Person = {
  id: number; role: Role; email: string; displayName: string;
  platform: string | null; channelUrl: string | null; streamCategory: string | null;
  platformUrls: string[] | null; audienceSize: string | null; contentTypes: string[] | null;
  marketingOptIn: boolean; basedInUk: boolean; ukEligible: boolean;
  ipCountry: string | null; confirmIpCountry: string | null;
  ipFingerprint: string | null; ipGroupSize: number;
  referralCode: string; number: number | null; feedback: string | null;
  createdAt: string; confirmedAt: string | null; rulesAcceptedAt: string | null;
  confirmed: boolean; eligible: boolean;
  disqualified: boolean; disqualifiedAt: string | null; disqualifiedReason: string | null;
  adminNote: string | null;
  recruiterId: number | null; recruiterName: string | null; recruiterCode: string | null;
  recruitsCounted: number; recruitsPending: number; recruitsOutsideUk: number; recruitsTotal: number;
  scoutOffers: string[] | null; scoutOfferOther: string | null;
  scoutWeeks: number | null; scoutHours: string | null; scoutPitch: string | null;
  commitmentAcceptedAt: string | null;
  scoutChecked: boolean; scoutCheckedAt: string | null;
  scoutTurnedDown: boolean; scoutTurnedDownAt: string | null; scoutTurnedDownReason: string | null;
  flagged: boolean;
  flagSharedIp: boolean; flagSameIpAsRecruiter: boolean; flagUkMismatch: boolean; flagTor: boolean; flagRecruitBurst: boolean;
  unsubscribedAt?: string | null; // only on one person's full details
};

export type PeoplePage = { total: number; page: number; pageSize: number; totalPages: number; signups: Person[] };
export type Detail = { signup: Person; recruits: Person[]; sameIpFingerprint: Person[] };
export type LeaderboardEntry = Person & { rank: number | null; reachedAt: string | null; flaggedRecruits: number; recruitsFromOwnIp: number };

export type ShortPerson = {
  id: number; role: Role; email: string; displayName: string; ipCountry?: string | null;
  recruiterName: string | null; confirmed: boolean; disqualified?: boolean; createdAt: string; recruitsTotal?: number;
};
export type Flags = {
  summary: { flaggedPeople: number; sharedIp: number; sameIpAsRecruiter: number; ukMismatch: number; tor: number; recruitBurst: number };
  ipGroups: { ipFingerprint: string; size: number; members: ShortPerson[] }[];
  sameIpAsRecruiter: ShortPerson[];
  ukMismatch: ShortPerson[];
  tor: ShortPerson[];
  recruitBursts: ShortPerson[];
};

// ── Shared by the whole dashboard ───────────────────────────────────
export type AdminTools = {
  version: number; // goes up after every change, so views fetch again
  changed: () => void; // call after a change
  loggedOut: () => void; // the server said "log in again"
  openPerson: (id: number) => void;
  toast: (text: string) => void;
};

export const AdminContext = createContext<AdminTools | null>(null);

export function useTools(): AdminTools {
  const tools = useContext(AdminContext);
  if (!tools) throw new Error("useTools() needs to be inside <AdminContext>");
  return tools;
}

class LoggedOut extends Error {}

async function readReply<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new LoggedOut();
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error ?? "Something went wrong. Try again.");
  return data as T;
}

// Fetches `url` (null = nothing yet). While it fetches again after a change,
// the last answer stays on screen (no flicker); `loading` is true only when
// there's nothing to show yet.
// every: also fetch it again every this-many milliseconds, or a function that
// decides from the last answer (e.g. "every 3s while an email's sending").
// undefined = only after changes.
type Every<T> = number | ((data: T | null) => number | undefined);

export function useAdmin<T>(url: string | null, { every }: { every?: Every<T> } = {}): { data: T | null; loading: boolean; error: string | null } {
  const { version, loggedOut } = useTools();
  const [tick, setTick] = useState(0);
  const key = url === null ? null : `${url}|${version}|${tick}`;
  const [got, setGot] = useState<{ url: string; key: string; data: T | null; error: string | null } | null>(null);

  const ms = typeof every === "function" ? every(got?.url === url ? got.data : null) : every;
  useEffect(() => {
    if (!ms) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(timer);
  }, [ms]);

  useEffect(() => {
    if (url === null || key === null) return;
    let live = true;
    fetch(url, { cache: "no-store" })
      .then((response) => readReply<T>(response))
      .then(
        (data) => live && setGot({ url, key, data, error: null }),
        (error: unknown) => {
          if (!live) return;
          if (error instanceof LoggedOut) loggedOut();
          else setGot((was) => ({ url, key, data: was?.url === url ? was.data : null, error: error instanceof Error ? error.message : "Something went wrong." }));
        }
      );
    return () => {
      live = false;
    };
  }, [url, key, loggedOut]);

  const same = got !== null && got.url === url;
  return {
    data: same ? got.data : null,
    loading: !same || (got.data === null && got.error === null),
    error: same && got.key === key ? got.error : null,
  };
}

// A change. Returns the server's answer, or throws with a message to show.
export async function send<T>(url: string, method: "PATCH" | "DELETE" | "POST", body: unknown, loggedOut: () => void): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection.");
  }
  try {
    return await readReply<T>(response);
  } catch (error) {
    if (error instanceof LoggedOut) {
      loggedOut();
      throw new Error("Log in again.");
    }
    throw error;
  }
}
