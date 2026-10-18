"use client";

// src/components/admin/Leaderboard.tsx
//
// WHAT THIS IS
// Who's winning the referral competition (GET /api/admin/leaderboard).
// The only leaderboard there is: the public site never shows one (the
// winner's revealed live on stream).
//
//   In the running     ranked: anyone who can win (streamers and scouts:
//                      confirmed, accepted the rules, in the UK) with 1+ counted
//                      recruit. Most counted wins; a tie goes to whoever got
//                      there first (Reached).
//   Checks             anything to look at before you announce: recruits
//                      with red flags, recruits from their own IP
//   Not in the running people with recruits who can't win, and why
//
// If #1 cheated: open them, Disqualify, and #2 moves up by itself.

import { useAdmin, useTools, type LeaderboardEntry } from "./data";
import { dateTime, plural } from "./labels";
import { Empty, Icon, Loading, Pill, Problem } from "./parts";
import a from "./Admin.module.css";

function whyNot(e: LeaderboardEntry): string {
  if (e.disqualified) return "Disqualified";
  if (!e.confirmed) return "Hasn't confirmed their email";
  if (!e.rulesAcceptedAt) return "Hasn't accepted the rules";
  if (!e.ukEligible) return "Not in the UK";
  return "No counted recruits yet";
}

// Their recruits that don't count (yet): "2 waiting to confirm, 1 outside the UK"
function notCounted(e: LeaderboardEntry): string {
  const parts = [
    e.recruitsPending > 0 && `${e.recruitsPending} waiting to confirm`,
    e.recruitsOutsideUk > 0 && `${e.recruitsOutsideUk} outside the UK`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "None";
}

function Checks({ e }: { e: LeaderboardEntry }) {
  const checks = [
    e.recruitsFromOwnIp > 0 && <Pill key="own" tone="flag">{plural(e.recruitsFromOwnIp, "recruit")} from their own IP</Pill>,
    e.flaggedRecruits > 0 && <Pill key="flagged" tone="flag">{plural(e.flaggedRecruits, "recruit")} flagged</Pill>,
    e.flagged && <Pill key="self" tone="flag">They&apos;re flagged</Pill>,
  ].filter(Boolean);
  return <span className={a.pills}>{checks.length > 0 ? checks : <Pill tone="ok">Nothing odd</Pill>}</span>;
}

export function Leaderboard() {
  const { data, error } = useAdmin<{ entries: LeaderboardEntry[] }>("/api/admin/leaderboard");
  const { openPerson } = useTools();

  if (!data) return error ? <Problem text={error} /> : <Loading rows={5} />;

  const ranked = data.entries.filter((e) => e.rank !== null);
  const others = data.entries.filter((e) => e.rank === null);
  const leader = ranked[0];
  const leaderNeedsCheck = leader && (leader.recruitsFromOwnIp > 0 || leader.flaggedRecruits > 0 || leader.flagged);

  return (
    <div className={a.stack}>
      <p className={a.intro}>
        Most counted referrals wins. A tie goes to whoever reached that number first. Before you announce, open #1 and
        check their recruits: if they cheated, disqualify them and #2 moves up.
      </p>

      {leader && leaderNeedsCheck && (
        <button type="button" className={a.todoItem} onClick={() => openPerson(leader.id)}>
          <span>#1, {leader.displayName}, has something to check before you announce</span>
          <b>Check<Icon name="chevron" /></b>
        </button>
      )}

      <h2 className={a.groupTitle}>In the running ({ranked.length})</h2>
      {ranked.length === 0 ? (
        <Empty>Nobody yet: someone needs one confirmed recruit in the UK to get on the board.</Empty>
      ) : (
        <div className={a.table}>
          <div className={`${a.tableHead} ${a.lbCols}`} aria-hidden="true">
            <span>#</span><span>Person</span><span>Counted</span><span>Not counted</span><span>Reached</span><span>Checks</span>
          </div>
          <ol className={a.rows}>
            {ranked.map((e) => (
              <li key={e.id}>
                <button type="button" className={`${a.row} ${a.lbCols}`} onClick={() => openPerson(e.id)} data-first={e.rank === 1 || undefined}>
                  <span className={a.rank}>{e.rank}</span>
                  <span className={a.personWords}><b>{e.displayName}</b><span>{e.email}</span></span>
                  <span className={a.rowCell} data-label="Counted"><b className={a.bigCount}>{e.recruitsCounted}</b></span>
                  <span className={a.rowCell} data-label="Not counted">{notCounted(e)}</span>
                  <span className={`${a.rowCell} ${a.faint}`} data-label="Reached">{dateTime(e.reachedAt)}</span>
                  <span className={a.rowCell}><Checks e={e} /></span>
                  <Icon name="chevron" className={a.chev} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {others.length > 0 && (
        <>
          <h2 className={a.groupTitle}>Not in the running ({others.length})</h2>
          <p className={a.intro}>People with recruits who can&apos;t win, and why.</p>
          <div className={a.table}>
            <ul className={a.rows}>
              {others.map((e) => (
                <li key={e.id}>
                  <button type="button" className={`${a.row} ${a.lbOthers}`} onClick={() => openPerson(e.id)}>
                    <span className={a.personWords}><b>{e.displayName}</b><span>{e.email}</span></span>
                    <span className={a.rowCell} data-label="Recruits">{e.recruitsCounted} counted, {e.recruitsTotal} in all</span>
                    <span className={a.rowCell} data-label="Why"><Pill tone={e.disqualified ? "bad" : "plain"}>{whyNot(e)}</Pill></span>
                    <Icon name="chevron" className={a.chev} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
