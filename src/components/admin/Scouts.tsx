"use client";

// src/components/admin/Scouts.tsx
//
// WHAT THIS IS
// Everyone who's signed up as a scout. Signing up MAKES them a scout (there's
// no application to approve): this is where you look them over.
//
//   New (to check)   oldest first, each with their answers:
//                    [ Looks good ]  a tick for you, so you know who you've seen
//                    [ Turn down ]   something's off: they're emailed, they won't
//                                    be a scout at launch, they stay in the
//                                    competition (ScoutActions.tsx)
//   Turned down      who, when and why (open them to undo it)
//   Checked          the ones you've ticked

import { useAdmin, type PeoplePage, type Person } from "./data";
import { AUDIENCE, CONTENT, OFFERS, dateTime, label, plural, weeks } from "./labels";
import { Card, Empty, Loading, OutLink, PersonButton, Pill, Problem } from "./parts";
import { ScoutActions } from "./ScoutActions";
import a from "./Admin.module.css";

const LIST = "/api/admin/signups?role=scout&pageSize=200";

export function Scouts() {
  const fresh = useAdmin<PeoplePage>(`${LIST}&status=scout_new&sort=oldest`);
  const down = useAdmin<PeoplePage>(`${LIST}&status=scout_turned_down&sort=newest`);
  const checked = useAdmin<PeoplePage>(`${LIST}&status=scout_checked&sort=newest`);

  return (
    <div className={a.stack}>
      <p className={a.intro}>
        Everyone who signs up as a scout is a scout. Look over each new one: Looks good ticks them off, Turn down is
        for when something&apos;s not right (they get an email, and stay in the competition).
      </p>

      <h2 className={a.groupTitle}>New to check{fresh.data ? ` (${fresh.data.total})` : ""}</h2>
      {fresh.error && <Problem text={fresh.error} />}
      {!fresh.data && !fresh.error && <Loading rows={3} />}
      {fresh.data && fresh.data.signups.length === 0 && <Empty>All caught up: no new scouts to check.</Empty>}
      {fresh.data && fresh.data.signups.length > 0 && (
        <div className={a.cards}>
          {fresh.data.signups.map((scout) => <ScoutCard key={scout.id} scout={scout} />)}
        </div>
      )}

      {down.data && down.data.total > 0 && (
        <>
          <h2 className={a.groupTitle}>Turned down ({down.data.total})</h2>
          <Card>
            <div className={a.plainList}>
              {down.data.signups.map((scout) => (
                <PersonButton key={scout.id} person={scout} extra={<span>{scout.scoutTurnedDownReason || "No reason noted"}</span>} />
              ))}
            </div>
          </Card>
        </>
      )}

      <h2 className={a.groupTitle}>Checked{checked.data ? ` (${checked.data.total})` : ""}</h2>
      {checked.error && <Problem text={checked.error} />}
      {!checked.data && !checked.error && <Loading rows={2} />}
      {checked.data && checked.data.signups.length === 0 && <Empty>Nobody yet.</Empty>}
      {checked.data && checked.data.signups.length > 0 && (
        <Card>
          <div className={a.plainList}>
            {checked.data.signups.map((scout) => (
              <PersonButton key={scout.id} person={scout} extra={<span>{label(AUDIENCE, scout.audienceSize)}, {scout.scoutWeeks ? weeks(scout.scoutWeeks) : "no weeks given"}</span>} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function ScoutCard({ scout }: { scout: Person }) {
  const offers = (scout.scoutOffers ?? []).filter((o) => o !== "other").map((o) => label(OFFERS, o));
  if (scout.scoutOfferOther) offers.push(`“${scout.scoutOfferOther}”`);

  return (
    <article className={a.scoutCard}>
      <header>
        <h3>{scout.displayName}</h3>
        <p className={a.faint}>Signed up {dateTime(scout.createdAt)}</p>
      </header>
      <div className={a.pills}>
        <Pill tone="scout">{label(AUDIENCE, scout.audienceSize)} audience</Pill>
        {scout.scoutWeeks && <Pill>{plural(scout.scoutWeeks, "week")} per streamer</Pill>}
        {scout.confirmed ? <Pill tone="ok">Confirmed</Pill> : <Pill tone="wait">Not confirmed yet</Pill>}
        {scout.flagged && <Pill tone="flag">Flagged</Pill>}
      </div>
      <dl className={a.facts}>
        <div><dt>Makes</dt><dd>{(scout.contentTypes ?? []).map((c) => label(CONTENT, c)).join(", ")}</dd></div>
        {offers.length > 0 && <div><dt>Can help with</dt><dd>{offers.join(", ")}</dd></div>}
        {scout.platformUrls && scout.platformUrls.length > 0 && (
          <div><dt>Links</dt><dd className={a.linkList}>{scout.platformUrls.map((url) => <OutLink key={url} href={url} />)}</dd></div>
        )}
      </dl>
      {scout.scoutPitch && <blockquote className={a.quote}>{scout.scoutPitch}</blockquote>}
      <div className={a.cardActions}>
        <ScoutActions person={scout} inCard />
      </div>
    </article>
  );
}
