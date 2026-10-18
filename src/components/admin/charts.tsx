"use client";

// src/components/admin/charts.tsx
//
// WHAT THIS IS
// The admin dashboard's graphs, drawn by hand in SVG (no chart library, so
// nothing to install and nothing extra for the browser to download):
//
//   DailyBars   sign-ups per day, streamers and scouts stacked
//   RoadLine    the Road to 300 running total, day by day
//   Columns     upright bars (hour of the day, day of the week)
//   BarList     sideways bars with their numbers (platforms, countries...)
//
// HOW THEY'RE STYLED (the same rules everywhere, so they read as one set)
//   colour = who:   streamers blue, scouts orange, everyone grey, and the
//                   brand red only for the Road to 300. Words are never in
//                   those colours, always white/grey, so they stay readable.
//   thin marks:     bars at most 24px wide with rounded tops, 2px lines,
//                   faint grid lines, a 2px gap between stacked pieces
//   point to read:  hover (or tap, on a phone) any bar or day for its numbers
//   screen readers: each graph also has a hidden table of its numbers
//
// They measure their own width and draw to fit, so text never gets
// squashed or stretched.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChartItem, Day } from "./data";
import { day, longDay } from "./labels";
import s from "./Charts.module.css";

export const COLOURS = {
  streamers: "#3987e5",
  scouts: "#d95926",
  everyone: "#8f8f99",
  road: "#ff2d37",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────
// The chart's width in pixels (0 until it's measured)
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// Round numbers for the side of a graph: 0, 5, 10, 15 rather than 0, 4.7, 9.3
function ticksFor(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * power).find((candidate) => candidate >= rough) ?? power * 10);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return ticks;
}

// A bar with only its top corners rounded (the end that shows the number);
// its bottom sits flat on the line
function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return `M${x},${y + height}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}V${y + height}Z`;
}

// Which days get a date under them: about one every 60px, always today
function labelledDays(count: number, width: number): Set<number> {
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(width / 60))));
  const picked = new Set<number>();
  for (let i = count - 1; i >= 0; i -= every) picked.add(i);
  return picked;
}

const fmt = (n: number) => n.toLocaleString("en-GB");

// The little box that shows a bar's numbers
function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width * 0.6; // near the right edge: open to the left
  return (
    <div className={s.tip} style={{ left: x, top: y }} data-flip={flip || undefined} role="status">
      {children}
    </div>
  );
}

function TipRow({ colour, name, value }: { colour?: string; name: string; value: ReactNode }) {
  return (
    <span className={s.tipRow}>
      {colour && <i className={s.swatch} style={{ background: colour }} aria-hidden="true" />}
      <span>{name}</span>
      <b>{value}</b>
    </span>
  );
}

export function Legend({ items }: { items: { name: string; colour: string }[] }) {
  return (
    <ul className={s.legend}>
      {items.map((item) => (
        <li key={item.name}><i className={s.swatch} style={{ background: item.colour }} aria-hidden="true" />{item.name}</li>
      ))}
    </ul>
  );
}

// The grid lines and the numbers up the side
function YAxis({ ticks, y, left, right }: { ticks: number[]; y: (v: number) => number; left: number; right: number }) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? s.baseline : s.grid} />
          <text x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className={s.axis}>{fmt(tick)}</text>
        </g>
      ))}
    </g>
  );
}

// Dates along the bottom
function XAxis({ days, x, bottom, width }: { days: Day[]; x: (i: number) => number; bottom: number; width: number }) {
  const picked = labelledDays(days.length, width);
  return (
    <g aria-hidden="true">
      {days.map((d, i) =>
        picked.has(i) ? (
          <text key={d.date} x={x(i)} y={bottom + 16} textAnchor={x(i) < 24 ? "start" : x(i) > width - 24 ? "end" : "middle"} className={s.axis}>
            {day(d.date)}
          </text>
        ) : null
      )}
    </g>
  );
}

// ── 1. Sign-ups per day ─────────────────────────────────────────────
export function DailyBars({ days, height = 220 }: { days: Day[]; height?: number }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const left = 34, right = width - 4, top = 10, bottom = height - 24;
  const ticks = ticksFor(Math.max(...days.map((d) => d.prospects + d.scouts), 1));
  const max = ticks[ticks.length - 1];
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const slot = (right - left) / Math.max(days.length, 1);
  const barWidth = Math.max(1, Math.min(24, slot * 0.72));
  const x = (i: number) => left + slot * (i + 0.5);
  const total = days.reduce((sum, d) => sum + d.prospects + d.scouts, 0);
  const a = active === null ? null : days[active];

  return (
    <div ref={ref} className={s.chart} style={{ height }} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Sign-ups per day over the last ${days.length} days: ${fmt(total)} in total`}>
          <YAxis ticks={ticks} y={y} left={left} right={right} />
          {active !== null && <rect x={x(active) - slot / 2} y={top} width={slot} height={bottom - top} className={s.hoverColumn} />}
          {days.map((d, i) => {
            const streamTop = y(d.prospects);
            const allTop = y(d.prospects + d.scouts);
            const bx = x(i) - barWidth / 2;
            const scoutHeight = streamTop - allTop - (d.prospects > 0 ? 2 : 0); // the 2px gap between the two
            return (
              <g key={d.date}>
                {d.prospects > 0 && (
                  d.scouts > 0
                    ? <rect x={bx} y={streamTop} width={barWidth} height={bottom - streamTop} fill={COLOURS.streamers} />
                    : <path d={barPath(bx, streamTop, barWidth, bottom - streamTop)} fill={COLOURS.streamers} />
                )}
                {d.scouts > 0 && <path d={barPath(bx, allTop, barWidth, Math.max(1, scoutHeight))} fill={COLOURS.scouts} />}
              </g>
            );
          })}
          <XAxis days={days} x={x} bottom={bottom} width={width} />
          {/* the hover / tap targets: the whole column, not just the bar */}
          {days.map((d, i) => (
            <rect
              key={d.date}
              x={x(i) - slot / 2} y={top} width={slot} height={bottom - top}
              className={s.hit}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            />
          ))}
        </svg>
      )}
      {a && active !== null && (
        <Tip x={x(active)} y={Math.max(top, y(a.prospects + a.scouts)) - 8} width={width}>
          <b className={s.tipTitle}>{longDay(a.date)}</b>
          <TipRow colour={COLOURS.streamers} name="Streamers" value={fmt(a.prospects)} />
          <TipRow colour={COLOURS.scouts} name="Scouts" value={fmt(a.scouts)} />
          <TipRow name="Through a recruit link" value={fmt(a.viaRecruitLink)} />
          <TipRow name="Confirmed their email" value={fmt(a.confirmations)} />
        </Tip>
      )}
      <table className={s.hidden}>
        <caption>Sign-ups per day</caption>
        <thead><tr><th>Day</th><th>Streamers</th><th>Scouts</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.date}><td>{longDay(d.date)}</td><td>{d.prospects}</td><td>{d.scouts}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ── 2. The Road to 300, day by day ──────────────────────────────────
export function RoadLine({ days, height = 160 }: { days: Day[]; height?: number }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const left = 34, right = width - 8, top = 10, bottom = height - 24;
  const ticks = ticksFor(Math.max(...days.map((d) => d.roadTo300), 1));
  const max = ticks[ticks.length - 1];
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const step = (right - left) / Math.max(days.length - 1, 1);
  const x = (i: number) => left + step * i;
  const line = days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.roadTo300).toFixed(1)}`).join("");
  const area = `${line}L${x(days.length - 1)},${bottom}L${x(0)},${bottom}Z`;
  const a = active === null ? null : days[active];

  // the nearest day to the pointer (the crosshair snaps to days)
  const point = (clientX: number, box: DOMRect) =>
    setActive(Math.max(0, Math.min(days.length - 1, Math.round((clientX - box.left - left) / step))));

  return (
    <div ref={ref} className={s.chart} style={{ height }} onPointerLeave={() => setActive(null)}>
      {width > 0 && days.length > 0 && (
        <svg
          width={width} height={height} role="img"
          aria-label={`Road to 300 over the last ${days.length} days: ${fmt(days[days.length - 1].roadTo300)} now`}
          onPointerMove={(ev) => point(ev.clientX, ev.currentTarget.getBoundingClientRect())}
          onPointerDown={(ev) => point(ev.clientX, ev.currentTarget.getBoundingClientRect())}
        >
          <defs>
            <linearGradient id="roadFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={COLOURS.road} stopOpacity=".22" />
              <stop offset="1" stopColor={COLOURS.road} stopOpacity="0" />
            </linearGradient>
          </defs>
          <YAxis ticks={ticks} y={y} left={left} right={right} />
          <path d={area} fill="url(#roadFill)" />
          <path d={line} fill="none" stroke={COLOURS.road} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <XAxis days={days} x={x} bottom={bottom} width={width} />
          {active !== null && a && (
            <g aria-hidden="true">
              <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} className={s.crosshair} />
              <circle cx={x(active)} cy={y(a.roadTo300)} r="5" fill={COLOURS.road} className={s.dot} />
            </g>
          )}
        </svg>
      )}
      {a && active !== null && (
        <Tip x={x(active)} y={y(a.roadTo300) - 12} width={width}>
          <b className={s.tipTitle}>{longDay(a.date)}</b>
          <TipRow colour={COLOURS.road} name="In the Road to 300" value={fmt(a.roadTo300)} />
          <TipRow name="Confirmed that day" value={fmt(a.confirmations)} />
        </Tip>
      )}
      <table className={s.hidden}>
        <caption>Road to 300 by day</caption>
        <thead><tr><th>Day</th><th>Total</th></tr></thead>
        <tbody>{days.map((d) => <tr key={d.date}><td>{longDay(d.date)}</td><td>{d.roadTo300}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ── 3. Upright bars (hours, weekdays) ───────────────────────────────
export function Columns({ items, colour = COLOURS.everyone, height = 150, every = 1, name }: {
  items: { label: string; tip: string; count: number }[];
  colour?: string;
  height?: number;
  every?: number; // label every nth bar (24 hours won't all fit)
  name: string; // what the graph shows, for screen readers
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const left = 30, right = width - 4, top = 10, bottom = height - 24;
  const ticks = ticksFor(Math.max(...items.map((item) => item.count), 1));
  const max = ticks[ticks.length - 1];
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const slot = (right - left) / Math.max(items.length, 1);
  const barWidth = Math.max(2, Math.min(24, slot * 0.7));
  const x = (i: number) => left + slot * (i + 0.5);
  const a = active === null ? null : items[active];

  return (
    <div ref={ref} className={s.chart} style={{ height }} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={name}>
          <YAxis ticks={ticks} y={y} left={left} right={right} />
          {active !== null && <rect x={x(active) - slot / 2} y={top} width={slot} height={bottom - top} className={s.hoverColumn} />}
          {items.map((item, i) =>
            item.count > 0 ? <path key={i} d={barPath(x(i) - barWidth / 2, y(item.count), barWidth, bottom - y(item.count))} fill={colour} /> : null
          )}
          <g aria-hidden="true">
            {items.map((item, i) =>
              i % every === 0 ? <text key={i} x={x(i)} y={bottom + 16} textAnchor="middle" className={s.axis}>{item.label}</text> : null
            )}
          </g>
          {items.map((item, i) => (
            <rect key={i} x={x(i) - slot / 2} y={top} width={slot} height={bottom - top} className={s.hit}
              onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
          ))}
        </svg>
      )}
      {a && active !== null && (
        <Tip x={x(active)} y={y(a.count) - 8} width={width}>
          <b className={s.tipTitle}>{a.tip}</b>
          <TipRow colour={colour} name="Sign-ups" value={fmt(a.count)} />
        </Tip>
      )}
      <table className={s.hidden}>
        <caption>{name}</caption>
        <tbody>{items.map((item, i) => <tr key={i}><td>{item.tip}</td><td>{item.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ── 4. Sideways bars with their numbers ─────────────────────────────
// The longest bar fills the row; the rest are in proportion to it.
export function BarList({ items, colour = COLOURS.everyone, nameFor = (l) => l, limit, columns = false }: {
  items: ChartItem[];
  colour?: string;
  nameFor?: (label: string) => string;
  limit?: number; // show the top few, and add the rest up as "Everything else"
  columns?: boolean; // two columns side by side (for a card that has the whole row)
}) {
  if (items.length === 0) return <p className={s.empty}>Nothing yet.</p>;

  let shown = items.map((item) => ({ ...item, name: nameFor(item.label) }));
  if (limit && shown.length > limit) {
    const rest = shown.slice(limit - 1);
    shown = [
      ...shown.slice(0, limit - 1),
      {
        label: "_rest",
        name: `Everything else (${rest.length})`,
        count: rest.reduce((sum, item) => sum + item.count, 0),
        percent: Math.round(rest.reduce((sum, item) => sum + item.percent, 0) * 10) / 10,
      },
    ];
  }
  const max = Math.max(...shown.map((item) => item.count), 1);

  return (
    <ul className={s.barList} data-columns={columns || undefined}>
      {shown.map((item) => (
        <li key={item.label}>
          <span className={s.barName}>{item.name}</span>
          <span className={s.barValue}><b>{fmt(item.count)}</b> {item.percent}%</span>
          <span className={s.barTrack} aria-hidden="true">
            <span className={s.bar} style={{ width: `${(item.count / max) * 100}%`, background: colour }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
