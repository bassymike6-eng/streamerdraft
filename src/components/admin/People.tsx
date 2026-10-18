"use client";

// src/components/admin/People.tsx
//
// WHAT THIS IS
// Everyone who's signed up, 50 at a time (GET /api/admin/signups).
//
//   [ Search name, email or recruit code ]
//   Everyone | Streamers | Scouts    Status ▾   Where ▾   Red flags only   Sort ▾
//   65 people
//   Name / email            Status                    In the UK   Recruits   Joined
//   ...                                                                         ›
//   ← Previous   Page 1 of 2   Next →
//
// Tap anyone to open their details (PersonPanel.tsx). The filters are kept
// while you look at other tabs (AdminApp.tsx holds them).

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useAdmin, useTools, type PeoplePage, type Person } from "./data";
import { dateTime, plural, ukStatus } from "./labels";
import { Empty, Icon, Loading, PersonPills, Problem } from "./parts";
import a from "./Admin.module.css";

export type Filters = {
  search: string;
  role: "" | "prospect" | "scout";
  status: "" | "confirmed" | "unconfirmed" | "eligible" | "disqualified" | "scout_new" | "scout_checked" | "scout_turned_down";
  uk: "" | "yes" | "no";
  flagged: boolean;
  sort: "newest" | "oldest" | "recruits" | "name";
  page: number;
};
export const DEFAULT_FILTERS: Filters = { search: "", role: "", status: "", uk: "", flagged: false, sort: "newest", page: 1 };

const PAGE_SIZE = 50;

function urlFor(f: Filters): string {
  const q = new URLSearchParams({ sort: f.sort, page: String(f.page), pageSize: String(PAGE_SIZE) });
  if (f.search) q.set("search", f.search);
  if (f.role) q.set("role", f.role);
  if (f.status) q.set("status", f.status);
  if (f.uk) q.set("uk", f.uk);
  if (f.flagged) q.set("flagged", "yes");
  return `/api/admin/signups?${q}`;
}

export function People({ filters, setFilters }: { filters: Filters; setFilters: Dispatch<SetStateAction<Filters>> }) {
  const [typed, setTyped] = useState(filters.search);
  const { data, loading, error } = useAdmin<PeoplePage>(urlFor(filters));

  // Change some filters (back to page 1, unless it's the page that's changing)
  const set = (change: Partial<Filters>) => setFilters((f) => ({ ...f, ...change, page: change.page ?? 1 }));

  // The search waits until you stop typing for a moment
  useEffect(() => {
    if (typed.trim() === filters.search) return;
    const timer = setTimeout(() => setFilters((f) => ({ ...f, search: typed.trim(), page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [typed, filters.search, setFilters]);

  const filtered = filters.search || filters.role || filters.status || filters.uk || filters.flagged;
  const clear = () => {
    setTyped("");
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className={a.stack}>
      <div className={a.filters}>
        <label className={a.search}>
          <Icon name="search" />
          <input
            type="search"
            value={typed}
            onChange={(ev) => setTyped(ev.target.value)}
            placeholder="Search name, email or recruit code"
            aria-label="Search"
            enterKeyHint="search"
          />
        </label>
        <div className={a.filterRow}>
          <div className={a.segmented} role="group" aria-label="Who">
            {([["", "Everyone"], ["prospect", "Streamers"], ["scout", "Scouts"]] as const).map(([value, name]) => (
              <button key={value} type="button" aria-pressed={filters.role === value} onClick={() => set({ role: value })}>{name}</button>
            ))}
          </div>
          <select className={a.select} value={filters.status} onChange={(ev) => set({ status: ev.target.value as Filters["status"] })} aria-label="Status">
            <option value="">Any status</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Not confirmed yet</option>
            <option value="eligible">Can win</option>
            <option value="disqualified">Disqualified</option>
            <option value="scout_new">New scouts to check</option>
            <option value="scout_checked">Checked scouts</option>
            <option value="scout_turned_down">Turned-down scouts</option>
          </select>
          <select className={a.select} value={filters.uk} onChange={(ev) => set({ uk: ev.target.value as Filters["uk"] })} aria-label="Where">
            <option value="">Anywhere</option>
            <option value="yes">In the UK</option>
            <option value="no">Not in the UK</option>
          </select>
          <button type="button" className={a.toggle} aria-pressed={filters.flagged} onClick={() => set({ flagged: !filters.flagged })}>
            <Icon name="flag" />Red flags only
          </button>
          <select className={a.select} value={filters.sort} onChange={(ev) => set({ sort: ev.target.value as Filters["sort"] })} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="recruits">Most recruits</option>
            <option value="name">Name, A to Z</option>
          </select>
        </div>
      </div>

      <div className={a.listHead}>
        <p className={a.count} aria-live="polite">
          {data ? plural(data.total, "person", "people") : " "}
          {loading && data && <span className={a.spinner} aria-hidden="true" />}
        </p>
        {filtered && <button type="button" className={a.textButton} onClick={clear}>Clear filters</button>}
      </div>

      {error && <Problem text={error} />}
      {!data && !error && <Loading rows={6} />}
      {data && data.signups.length === 0 && (
        <Empty>Nobody matches{filtered ? ". Try fewer filters." : " yet."}</Empty>
      )}
      {data && data.signups.length > 0 && (
        <>
          <div className={a.table}>
            <div className={a.tableHead} aria-hidden="true">
              <span>Person</span><span>Status</span><span>In the UK</span><span>Recruits</span><span>Joined</span>
            </div>
            <ul className={a.rows}>
              {data.signups.map((person) => <Row key={person.id} person={person} />)}
            </ul>
          </div>
          {data.totalPages > 1 && (
            <nav className={a.pager} aria-label="Pages">
              <button type="button" className={a.secondary} disabled={data.page <= 1} onClick={() => set({ page: data.page - 1 })}>
                <Icon name="back" /><span>Previous</span>
              </button>
              <span>Page {data.page} of {data.totalPages}</span>
              <button type="button" className={a.secondary} disabled={data.page >= data.totalPages} onClick={() => set({ page: data.page + 1 })}>
                <span>Next</span><Icon name="chevron" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Row({ person }: { person: Person }) {
  const { openPerson } = useTools();
  return (
    <li>
      <button type="button" className={a.row} onClick={() => openPerson(person.id)}>
        <span className={a.personWords}>
          <b>{person.displayName}</b>
          <span>{person.email}</span>
        </span>
        <span className={a.rowPills}><PersonPills person={person} /></span>
        <span className={a.rowCell}>{ukStatus(person)}</span>
        <span className={a.rowCell} data-label="Recruits">
          {person.recruitsTotal === 0 ? (
            <span className={a.faint}>None</span>
          ) : (
            <>
              <b>{person.recruitsCounted}</b> counted
              {person.recruitsPending > 0 && <span className={a.faint}>, {person.recruitsPending} waiting</span>}
            </>
          )}
        </span>
        <span className={`${a.rowCell} ${a.faint}`} data-label="Joined">{dateTime(person.createdAt)}</span>
        <Icon name="chevron" className={a.chev} />
      </button>
    </li>
  );
}
