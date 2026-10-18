"use client";

// src/components/admin/Flags.tsx
//
// WHAT THIS IS
// Every red flag in one place, grouped, most likely to matter first
// (GET /api/admin/flags; the rules for each flag: migration 005).
//
//   Same IP as their recruiter   often someone signing themselves up
//   Recruit bursts               5+ recruits within 10 minutes
//   One IP, lots of sign-ups     3+ from one place (a college? one person?)
//   Ticked UK, IP elsewhere      said UK, but no UK IP
//   Tor                          hiding where they are
//
// A flag means have a look, not definitely cheating. Tap anyone to open them.

import type { ReactNode } from "react";
import { useAdmin, type Flags as FlagsData, type ShortPerson } from "./data";
import { FLAGS, countryName, plural } from "./labels";
import { Card, Empty, Loading, PersonButton, Problem } from "./parts";
import a from "./Admin.module.css";

const meaning = (key: (typeof FLAGS)[number]["key"]) => FLAGS.find((f) => f.key === key)?.meaning;

function Group({ title, sub, people, extra }: { title: string; sub?: string; people: ShortPerson[]; extra?: (p: ShortPerson) => ReactNode }) {
  if (people.length === 0) return null;
  return (
    <Card wide title={`${title} (${people.length})`} sub={sub}>
      <div className={a.plainList}>
        {people.map((p) => <PersonButton key={p.id} person={p} extra={extra?.(p)} />)}
      </div>
    </Card>
  );
}

export function Flags() {
  const { data, error } = useAdmin<FlagsData>("/api/admin/flags");
  if (!data) return error ? <Problem text={error} /> : <Loading rows={5} />;

  const s = data.summary;
  const counts = [
    { name: "Same IP as recruiter", count: s.sameIpAsRecruiter },
    { name: "Recruit bursts", count: s.recruitBurst },
    { name: "Shared IP", count: s.sharedIp },
    { name: "Ticked UK, IP elsewhere", count: s.ukMismatch },
    { name: "Tor", count: s.tor },
  ];

  if (s.flaggedPeople === 0) {
    return <Empty>No red flags. Nothing to look at.</Empty>;
  }

  return (
    <div className={a.grid}>
      <p className={a.intro} data-wide>
        {plural(s.flaggedPeople, "person has", "people have")} at least one red flag. A flag means have a look, not
        definitely cheating: a college or a family can share an IP.
      </p>
      <section className={a.stats} data-wide aria-label="Flags by type">
        {counts.map((c) => (
          <div key={c.name} className={a.stat}>
            <p className={a.statName}>{c.name}</p>
            <p className={a.statValue}>{c.count.toLocaleString("en-GB")}</p>
          </div>
        ))}
      </section>

      <Group
        title="Same IP as their recruiter"
        sub={meaning("flagSameIpAsRecruiter")}
        people={data.sameIpAsRecruiter}
        extra={(p) => <span>Recruited by {p.recruiterName ?? "someone deleted"}</span>}
      />
      <Group
        title="Recruit bursts"
        sub={meaning("flagRecruitBurst")}
        people={data.recruitBursts}
        extra={(p) => <span>{plural(p.recruitsTotal ?? 0, "recruit")} in all</span>}
      />
      {data.ipGroups.map((group) => (
        <Card
          key={group.ipFingerprint}
          wide
          title={`${group.size} sign-ups from one IP`}
          sub={`Fingerprint ${group.ipFingerprint}. ${meaning("flagSharedIp")}`}
        >
          <div className={a.plainList}>
            {group.members.map((p) => (
              <PersonButton key={p.id} person={p} extra={p.recruiterName ? <span>Recruited by {p.recruiterName}</span> : undefined} />
            ))}
          </div>
        </Card>
      ))}
      <Group
        title="Ticked UK, IP elsewhere"
        sub={meaning("flagUkMismatch")}
        people={data.ukMismatch}
        extra={(p) => <span>IP in {countryName(p.ipCountry)}</span>}
      />
      <Group title="Tor" sub={meaning("flagTor")} people={data.tor} />
    </div>
  );
}
