"use client";

// src/components/admin/Overview.tsx
//
// WHAT THIS IS
// The dashboard's first tab: how it's all going, at a glance.
//
//   Things waiting for you     new scouts to check, red flags (if any)
//   Road to 300                the count, days left, are we on track? and
//                              the running total day by day
//   The headline numbers       signed up, confirmed, can win, recruit links...
//   Sign-ups per day           streamers and scouts, last 7 / 30 / 90 days
//   Who they are               platforms, countries, the streamer funnel,
//                              when people sign up, what scouts offer...
//   Emails                     write and send the launch (or news) email,
//                              and how the ones you've sent are going
//   Downloads                  the email lists as spreadsheets, and a full backup
//
// The numbers come from GET /api/admin/overview and /api/admin/charts
// (src/lib/admin-stats.ts).

import { useState } from "react";
import { BarList, COLOURS, Columns, DailyBars, Legend, RoadLine } from "./charts";
import { useAdmin, type Charts, type Overview as OverviewData } from "./data";
import { AUDIENCE, CONTENT, HOURS, OFFERS, PLATFORMS, countryName, hourName, label, longDate, plural, weeks } from "./labels";
import { EmailComposer, SentEmails, useEmails } from "./EmailComposer";
import { Card, Icon, Loading, Pill, Problem } from "./parts";
import a from "./Admin.module.css";

const RANGES = [7, 30, 90];
const fmt = (n: number) => n.toLocaleString("en-GB");
// "gta rp" → "GTA RP", "just chatting" → "Just chatting" (categories are
// stored lower case, so the same game typed two ways counts once)
const ACRONYMS = new Set(["gta", "rp", "fc", "irl", "cod", "fps", "nba", "ufc", "wwe", "gg", "ea", "f1", "cs2", "cs", "pubg", "mmo", "rpg", "asmr", "dj", "vr", "nfl", "ttrpg"]);
const sentence = (text: string) =>
  text
    .split(" ")
    .map((word, i) => (ACRONYMS.has(word) ? word.toUpperCase() : i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
// the "In the UK?" groups (admin-stats.ts names them)
const UK_NAMES: Record<string, string> = { UK: "In the UK", "Ticked UK, IP elsewhere": "Ticked UK, IP elsewhere", "Not UK": "Not in the UK" };

export function Overview() {
  const [days, setDays] = useState(30);
  const { data: o, error } = useAdmin<OverviewData>("/api/admin/overview");
  const { data: c } = useAdmin<Charts>(`/api/admin/charts?days=${days}`);

  if (!o) return error ? <Problem text={error} /> : <Loading rows={4} />;

  return (
    <div className={a.grid}>
      <ToDo o={o} />
      <Road o={o} c={c} />

      <section className={a.stats} data-wide aria-label="The headline numbers">
        <Stat name="Signed up" value={o.signups.all} sub={`${fmt(o.signups.prospects)} streamers, ${fmt(o.signups.scouts)} scouts`} />
        <Stat name="Confirmed" value={o.confirmed.all} sub={`${o.confirmed.percent}% confirmed their email`} />
        <Stat name="Can win" value={o.competition.eligibleEntrants} sub="Confirmed and in the UK, streamers and scouts" />
        <Stat name="Via a recruit link" value={o.referrals.viaRecruitLink} sub={`${o.referrals.percentViaRecruitLink}% of sign-ups`} />
        <Stat name="New this week" value={o.growth.last7d} sub={`${fmt(o.growth.last24h)} today, ${fmt(o.growth.last30d)} in 30 days`} />
        <Stat name="Scouts checked" value={o.scouts.checked} sub={`${fmt(o.scouts.toCheck)} new to check, ${fmt(o.scouts.turnedDown)} turned down`} />
      </section>

      <Card
        wide
        title="Sign-ups per day"
        sub={<Legend items={[{ name: "Streamers", colour: COLOURS.streamers }, { name: "Scouts", colour: COLOURS.scouts }]} />}
        action={
          <div className={a.segmented} role="group" aria-label="How many days">
            {RANGES.map((n) => (
              <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n} days</button>
            ))}
          </div>
        }
      >
        {c ? <DailyBars days={c.daily} /> : <Loading rows={1} />}
      </Card>

      {c ? <Breakdowns c={c} /> : <Card wide><Loading rows={3} /></Card>}

      <EmailLists o={o} />
    </div>
  );
}

// ── Things waiting for you ──────────────────────────────────────────
function ToDo({ o }: { o: OverviewData }) {
  const items = [
    o.scouts.toCheck > 0 && {
      href: "#scouts",
      text: `${plural(o.scouts.toCheck, "new scout")} to check`,
      button: "Have a look",
    },
    o.competition.flagged > 0 && {
      href: "#flags",
      text: `${plural(o.competition.flagged, "person", "people")} with a red flag`,
      button: "Have a look",
    },
  ].filter((item) => !!item);
  if (items.length === 0) return null;

  return (
    <section className={a.todo} data-wide aria-label="Waiting for you">
      {items.map((item) => (
        <a key={item.href} href={item.href} className={a.todoItem}>
          <span>{item.text}</span>
          <b>{item.button}<Icon name="chevron" /></b>
        </a>
      ))}
    </section>
  );
}

// ── Road to 300 ─────────────────────────────────────────────────────
function Road({ o, c }: { o: OverviewData; c: Charts | null }) {
  const r = o.roadTo300;
  const left = Math.max(r.goal - r.count, 0);

  let verdict: { tone: "ok" | "wait"; word: string; text: string };
  if (left === 0) verdict = { tone: "ok", word: "Reached", text: "300 reached: the top referrer wins GTA 6." };
  else if (r.daysLeft === 0) verdict = { tone: "wait", word: "Closed", text: `It closed at ${fmt(r.count)}: the top referrer wins the £25 prize.` };
  else if (r.perDay === 0) verdict = { tone: "wait", word: "Stalled", text: `Nobody's confirmed in the last 7 days. ${fmt(left)} to go: that's ${r.neededPerDay} a day from now.` };
  else if (r.projectedAtClose >= r.goal)
    verdict = { tone: "ok", word: "On track", text: `At last week's pace (${r.perDay} a day) you'll pass 300 in about ${plural(r.projectedDaysToGoal ?? 0, "day")}.` };
  else
    verdict = { tone: "wait", word: "Behind", text: `At last week's pace (${r.perDay} a day) you'll be on about ${fmt(r.projectedAtClose)} at the close. 300 needs ${r.neededPerDay} a day from now.` };

  return (
    <Card wide className={a.road}>
      <div className={a.roadHead}>
        <div>
          <h2 className={a.cardTitle}>Road to 300</h2>
          <p className={a.cardSub}>Everyone who&apos;s confirmed, streamers and scouts. 300 by the close: GTA 6. Fewer: £25.</p>
        </div>
        <p className={a.closes}>
          <span>Closes {longDate(r.closesAt)}</span>
          <b>{r.daysLeft > 0 ? plural(r.daysLeft, "day") + " left" : "Closed"}</b>
        </p>
      </div>

      <div className={a.roadBody}>
        <div className={a.roadNumbers}>
          <p className={a.roadCount}><b>{fmt(r.count)}</b><span>of {r.goal}</span></p>
          <div className={a.track} role="progressbar" aria-label="Road to 300" aria-valuemin={0} aria-valuemax={r.goal} aria-valuenow={r.count}>
            <span style={{ width: `${Math.min(100, r.percent)}%` }} />
          </div>
          <p className={a.roadFacts}>
            <span><b>{fmt(r.last7d)}</b> confirmed in the last 7 days</span>
            <span><b>{fmt(left)}</b> to go</span>
          </p>
          <p className={a.verdict}><Pill tone={verdict.tone}>{verdict.word}</Pill>{verdict.text}</p>
        </div>
        <div className={a.roadChart}>
          {c ? <RoadLine days={c.daily} /> : <Loading rows={1} />}
        </div>
      </div>
    </Card>
  );
}

function Stat({ name, value, sub }: { name: string; value: number; sub: string }) {
  return (
    <div className={a.stat}>
      <p className={a.statName}>{name}</p>
      <p className={a.statValue}>{fmt(value)}</p>
      <p className={a.statSub}>{sub}</p>
    </div>
  );
}

// ── Who they are ────────────────────────────────────────────────────
function Breakdowns({ c }: { c: Charts }) {
  const funnel = c.prospectFunnel.map((step) => ({ label: step.step, count: step.count, percent: step.percent }));
  const hours = c.byHour.map((h) => ({ label: hourName(h.hour), tip: `${hourName(h.hour)} to ${hourName((h.hour + 1) % 24)}`, count: h.count }));
  const weekdays = c.byWeekday.map((d) => ({ label: d.day, tip: d.day, count: d.count }));

  return (
    <>
      <h2 className={a.groupTitle} data-wide>Streamers</h2>
      <Card title="How far they get" sub="Out of every streamer who signed up">
        <BarList items={funnel} colour={COLOURS.streamers} />
      </Card>
      <Card title="Where they stream">
        <BarList items={c.byPlatform} colour={COLOURS.streamers} nameFor={(l) => label(PLATFORMS, l)} />
      </Card>
      <Card title="What they stream" sub="As they typed it, top 10">
        <BarList items={c.byStreamCategory} colour={COLOURS.streamers} nameFor={sentence} limit={8} />
      </Card>

      <h2 className={a.groupTitle} data-wide>Everyone</h2>
      <Card title="In the UK?" sub="Only UK residents can win, or count as a referral">
        <BarList items={c.byUkTick} nameFor={(l) => label(UK_NAMES, l)} />
      </Card>
      <Card title="Countries" sub="Where their IP was when they joined">
        <BarList items={c.byCountry} nameFor={countryName} limit={6} />
      </Card>
      <Card title="Day of the week">
        <Columns items={weekdays} name="Sign-ups by day of the week" />
      </Card>
      <Card wide title="When they sign up" sub="Hour of the day, UK time: when to post">
        <Columns items={hours} every={3} height={170} name="Sign-ups by hour of the day" />
      </Card>

      <h2 className={a.groupTitle} data-wide>Scouts</h2>
      <Card title="Audience size">
        <BarList items={c.byAudienceSize} colour={COLOURS.scouts} nameFor={(l) => label(AUDIENCE, l)} />
      </Card>
      <Card title="How long they'll back a streamer">
        <BarList items={c.byScoutWeeks} colour={COLOURS.scouts} nameFor={weeks} />
      </Card>
      <Card title="What they make" sub="They could pick more than one">
        <BarList items={c.byContentType} colour={COLOURS.scouts} nameFor={(l) => label(CONTENT, l)} />
      </Card>
      <Card wide title="What they can help with" sub="They could pick more than one">
        <BarList items={c.byScoutOffer} colour={COLOURS.scouts} nameFor={(l) => label(OFFERS, l)} columns />
      </Card>
      {c.byScoutHours.length > 0 && (
        <Card title="Hours a month" sub="Older scout sign-ups, from before the form asked for weeks">
          <BarList items={c.byScoutHours} colour={COLOURS.scouts} nameFor={(l) => label(HOURS, l)} />
        </Card>
      )}
    </>
  );
}

// ── Email lists and downloads ───────────────────────────────────────
function EmailLists({ o }: { o: OverviewData }) {
  const emails = useEmails();
  const [writing, setWriting] = useState(false);
  const lists = [
    { name: "Launch email list", count: o.emailLists.launch, who: "Everyone who's confirmed their email", href: "/api/admin/mailing-list?list=launch" },
    { name: "News and offers list", count: o.emailLists.news, who: "Confirmed, and ticked \u201cSend me news and offers\u201d", href: "/api/admin/mailing-list?list=news" },
  ];
  return (
    <>
      <Card
        wide
        title="Emails"
        sub={`Write the launch email (or news) here: everyone on the list gets it with their own name and their own Unsubscribe link. ${plural(o.emailLists.unsubscribed, "person has", "people have")} unsubscribed so far, and ${o.emailLists.unsubscribed === 1 ? "is" : "are"} left out.`}
        action={
          <button type="button" className={a.primary} onClick={() => setWriting(true)} disabled={!emails.data}>
            Write an email
          </button>
        }
      >
        {emails.error ? <Problem text={emails.error} /> : <SentEmails data={emails.data} />}
      </Card>
      {writing && emails.data && (
        <EmailComposer onClose={() => setWriting(false)} lists={emails.data.lists} devMode={emails.data.devMode} missingKey={emails.data.missingKey} />
      )}

      <Card
        wide
        title="Downloads"
        sub="Spreadsheets of each list, and everything as a backup. Sending an email some other way? Put each person's unsubscribe_link in its footer."
      >
        <ul className={a.downloads}>
          {lists.map((list) => (
            <li key={list.name}>
              <span className={a.downloadWords}>
                <b>{list.name}</b>
                <span>{list.who}</span>
              </span>
              <span className={a.downloadCount}>{plural(list.count, "person", "people")}</span>
              <a href={list.href} download className={a.secondary}><Icon name="download" /><span>Download</span></a>
            </li>
          ))}
          <li>
            <span className={a.downloadWords}>
              <b>Everyone, every detail</b>
              <span>The whole sign-up list as a spreadsheet: a backup</span>
            </span>
            <span className={a.downloadCount}>{plural(o.signups.all, "person", "people")}</span>
            <a href="/api/admin/export" download className={a.secondary}><Icon name="download" /><span>Download</span></a>
          </li>
        </ul>
      </Card>
    </>
  );
}
