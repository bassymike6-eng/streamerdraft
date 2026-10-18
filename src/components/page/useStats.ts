// src/components/page/useStats.ts
//
// WHAT THIS IS
// The page's live number, from /api/stats (src/lib/stats.ts on the server):
//   road   Road to 300: how many people (streamers and scouts) have confirmed so far
// (No leaderboard: the winner's revealed live on stream.)
//
// WHEN IT ASKS
// - Once the page's content loads in (`active`), held back by `showAfter`
//   seconds, so the Road to 300 track fills just after its box has filled in
// - Then every 30 seconds while the page is on screen, and when they come back to it
// - Straight away when `refreshKey` changes (e.g. they've just confirmed, so
//   they're one of the 300 now, and should see themselves counted)
//
// If it can't be fetched, it shows "failed" (a dash, not a wrong number).
// Once there's a number, a failed refresh keeps the last good one.

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/launch/detect";

// null: still on its way. "failed": couldn't get it.
export type Road = { count: number; goal: number } | null | "failed";

const EVERY = 30000; // ms

export function useStats(active: boolean, showAfter = 0, refreshKey = ""): { road: Road } {
  const [stats, setStats] = useState<{ road: Road }>({ road: null });
  const first = useRef(true); // the first answer waits for `showAfter`

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let hold = 0;

    const ask = () => {
      if (document.visibilityState !== "visible") return;
      const askedAt = performance.now();
      const wait = first.current && !prefersReducedMotion() ? showAfter * 1000 : 0;
      const settle = (road: Road) => {
        if (cancelled) return;
        hold = window.setTimeout(() => {
          first.current = false;
          setStats((was) => ({
            // a failed refresh keeps the last good number
            road: road === "failed" && was.road && was.road !== "failed" ? was.road : road,
          }));
        }, Math.max(0, wait - (performance.now() - askedAt)));
      };
      fetch("/api/stats", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => settle(data?.ok ? data.roadTo300 : "failed"))
        .catch(() => settle("failed"));
    };

    ask();
    const timer = window.setInterval(ask, EVERY);
    window.addEventListener("focus", ask);
    return () => {
      cancelled = true;
      window.clearTimeout(hold);
      window.clearInterval(timer);
      window.removeEventListener("focus", ask);
    };
  }, [active, showAfter, refreshKey]);

  return stats;
}
