// src/components/launch/SkeletonPage.tsx
//
// WHAT THIS IS
// The page while it waits for content: loading placeholders (like Indeed's and
// PayPal's apps). Every box gets two effects:
//   .sk     a light running round its border (its own little loading ring)
//   .shim   a shimmer sweeping across it
//
// In F2 the real content replaces these slots one by one.
// The logo in the top left isn't here: it's the title, docked (see Wordmark.tsx).
//
// --i staggers the boxes' fade-in and offsets their border lights so they don't
// all spin in step.

import type { CSSProperties } from "react";
import styles from "./LaunchIntro.module.css";

const i = (n: number) => ({ "--i": n }) as CSSProperties;
const s = styles;

function ListRow() {
  return (
    <div className={s.lrow}>
      <span className={`${s.skc} ${s.shim}`} />
      <span className={s.lcol}>
        <span className={`${s.skl} ${s.shim} ${s.w45}`} />
        <span className={`${s.skl} ${s.shim} ${s.w80}`} />
      </span>
    </div>
  );
}

function HeroColumn() {
  return (
    <span className={s.hcol}>
      <span className={`${s.skc} ${s.shim}`} />
      <span className={`${s.skl} ${s.shim} ${s.w56px}`} />
    </span>
  );
}

function MiniCard({ n }: { n: number }) {
  return (
    <div className={`${s.sk} ${s.skIn} ${s.card} ${s.mini}`} style={i(n)}>
      <span className={`${s.sq} ${s.shim}`} />
      <span className={`${s.skl} ${s.shim} ${s.w60}`} />
      <span className={`${s.skl} ${s.shim} ${s.w30}`} />
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className={`${s.layer} ${s.site}`} aria-busy="true" aria-label="Loading">
      <header className={s.skHead}>
        <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.c40}`} style={i(1)} />
        <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.c40}`} style={i(2)} />
      </header>

      <div className={s.skWrap}>
        <div className={s.skTabs}>
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill} ${s.pillOn}`} style={i(3)} />
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill}`} style={i(4)} />
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill}`} style={i(5)} />
          <span className={`${s.sk} ${s.skIn} ${s.shim} ${s.pill}`} style={i(6)} />
        </div>

        <div className={s.skGrid}>
          <div className={`${s.sk} ${s.skIn} ${s.card} ${s.hero}`} style={i(7)}>
            <div className={s.heroTop}>
              <span className={`${s.skl} ${s.shim} ${s.big}`} />
              <span className={`${s.skl} ${s.shim} ${s.w60}`} />
              <span className={`${s.skl} ${s.shim} ${s.w30}`} />
            </div>
            <div className={s.heroRow}>
              <HeroColumn />
              <HeroColumn />
              <HeroColumn />
            </div>
          </div>

          <div className={`${s.sk} ${s.skIn} ${s.card} ${s.list}`} style={i(8)}>
            <ListRow />
            <ListRow />
            <ListRow />
          </div>
        </div>

        {/* Only shown on wider screens */}
        <div className={s.skRow3}>
          <MiniCard n={9} />
          <MiniCard n={10} />
          <MiniCard n={11} />
        </div>
      </div>
    </div>
  );
}
