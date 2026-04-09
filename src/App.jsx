import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ════════════════════════════════════════════
   CORE GAME ENGINE
   ════════════════════════════════════════════ */

const PAYOFFS = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };
const ROUNDS = 200;

const STRATEGIES = {
  titForTat: {
    name: "Tit-for-Tat", abbr: "TFT",
    desc: "Cooperate first, then mirror opponent's last move.",
    philosophy: "Start kind. Retaliate once. Forgive immediately.",
    color: "#4F8EF7", accent: "#2563eb",
    fn: (my, opp) => (opp.length === 0 ? "C" : opp[opp.length - 1]),
  },
  alwaysCooperate: {
    name: "Always Cooperate", abbr: "COOP",
    desc: "Unconditional cooperation regardless of outcome.",
    philosophy: "Turn the other cheek. Every. Single. Time.",
    color: "#34D399", accent: "#059669",
    fn: () => "C",
  },
  alwaysDefect: {
    name: "Always Defect", abbr: "DEF",
    desc: "Unconditional betrayal regardless of outcome.",
    philosophy: "Trust no one. Take everything.",
    color: "#F87171", accent: "#dc2626",
    fn: () => "D",
  },
  grudger: {
    name: "Grudger", abbr: "GRDG",
    desc: "Cooperate until betrayed once — then defect forever.",
    philosophy: "I'll give you one chance. Exactly one.",
    color: "#FBBF24", accent: "#d97706",
    fn: (my, opp) => (opp.includes("D") ? "D" : "C"),
  },
  random: {
    name: "Random", abbr: "RND",
    desc: "50/50 coin flip each round.",
    philosophy: "Chaos. Pure, beautiful chaos.",
    color: "#A78BFA", accent: "#7c3aed",
    fn: () => (Math.random() < 0.5 ? "C" : "D"),
  },
  pavlov: {
    name: "Pavlov", abbr: "PAV",
    desc: "Win-stay, lose-shift. Repeat what worked.",
    philosophy: "If it ain't broke, don't fix it.",
    color: "#F472B6", accent: "#db2777",
    fn: (my, opp) => {
      if (my.length === 0) return "C";
      return my[my.length - 1] === opp[opp.length - 1] ? "C" : "D";
    },
  },
  suspiciousTFT: {
    name: "Suspicious TFT", abbr: "STFT",
    desc: "Tit-for-Tat but opens with defection.",
    philosophy: "Guilty until proven innocent.",
    color: "#22D3EE", accent: "#0891b2",
    fn: (my, opp) => (opp.length === 0 ? "D" : opp[opp.length - 1]),
  },
  titForTwoTats: {
    name: "Tit-for-Two-Tats", abbr: "TF2T",
    desc: "Retaliates only after two consecutive betrayals.",
    philosophy: "Everyone deserves a second chance.",
    color: "#86EFAC", accent: "#16a34a",
    fn: (my, opp) => {
      if (opp.length < 2) return "C";
      return opp[opp.length - 1] === "D" && opp[opp.length - 2] === "D" ? "D" : "C";
    },
  },
  detective: {
    name: "Detective", abbr: "DET",
    desc: "Tests with C,D,C,C then exploits or mirrors.",
    philosophy: "Probe for weakness. Adapt accordingly.",
    color: "#FB923C", accent: "#ea580c",
    fn: (my, opp) => {
      const opening = ["C", "D", "C", "C"];
      if (my.length < 4) return opening[my.length];
      return opp.slice(0, 4).includes("D") ? opp[opp.length - 1] : "D";
    },
  },
  softMajority: {
    name: "Soft Majority", abbr: "SMAJ",
    desc: "Cooperate if opponent cooperated ≥50% of the time.",
    philosophy: "Democracy of past actions.",
    color: "#C4B5FD", accent: "#8b5cf6",
    fn: (my, opp) => {
      if (opp.length === 0) return "C";
      return opp.filter(m => m === "C").length >= opp.length / 2 ? "C" : "D";
    },
  },
};

function runMatch(s1, s2) {
  let h1 = [], h2 = [], sc1 = 0, sc2 = 0;
  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    const m1 = s1.fn([...h1], [...h2]);
    const m2 = s2.fn([...h2], [...h1]);
    const [p1, p2] = PAYOFFS[m1 + m2];
    sc1 += p1; sc2 += p2;
    h1.push(m1); h2.push(m2);
    rounds.push({ m1, m2, sc1, sc2, p1, p2 });
  }
  return { rounds, sc1, sc2 };
}

function runTournament(keys) {
  const results = {}, totals = {};
  keys.forEach(k => (totals[k] = 0));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i; j < keys.length; j++) {
      const k1 = keys[i], k2 = keys[j];
      const match = runMatch(STRATEGIES[k1], STRATEGIES[k2]);
      results[`${k1}:${k2}`] = match;
      if (k1 === k2) { totals[k1] += match.sc1; }
      else {
        results[`${k2}:${k1}`] = {
          rounds: match.rounds.map(r => ({ m1: r.m2, m2: r.m1, sc1: r.sc2, sc2: r.sc1, p1: r.p2, p2: r.p1 })),
          sc1: match.sc2, sc2: match.sc1
        };
        totals[k1] += match.sc1;
        totals[k2] += match.sc2;
      }
    }
  }
  return { results, totals };
}

function runEvolution(keys, gens = 60) {
  let pop = {};
  keys.forEach(k => (pop[k] = 100));
  const history = [{ ...pop }];
  for (let g = 0; g < gens; g++) {
    const total = Object.values(pop).reduce((a, b) => a + b, 0);
    if (total === 0) break;
    const fit = {};
    keys.forEach(k => (fit[k] = 0));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i; j < keys.length; j++) {
        const k1 = keys[i], k2 = keys[j];
        if (!pop[k1] && !pop[k2]) continue;
        const m = runMatch(STRATEGIES[k1], STRATEGIES[k2]);
        if (k1 === k2) fit[k1] += m.sc1 * pop[k1];
        else { fit[k1] += m.sc1 * pop[k2]; fit[k2] += m.sc2 * pop[k1]; }
      }
    }
    const np = {};
    let tf = 0;
    keys.forEach(k => { if (pop[k] > 0) { fit[k] /= total; tf += fit[k] * pop[k]; } });
    keys.forEach(k => { np[k] = (!pop[k] || !tf) ? 0 : Math.round((fit[k] * pop[k] / tf) * total); });
    const nt = Object.values(np).reduce((a, b) => a + b, 0);
    if (nt > 0) { const s = total / nt; keys.forEach(k => (np[k] = Math.max(0, Math.round(np[k] * s)))); }
    pop = np;
    history.push({ ...pop });
  }
  return history;
}

function getMatchStats(match) {
  let cc = 0, cd = 0, dc = 0, dd = 0, streak = 0, maxStreak = 0, fd1 = -1, fd2 = -1;
  match.rounds.forEach((r, i) => {
    if (r.m1 === "C" && r.m2 === "C") { cc++; streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0;
    if (r.m1 === "C" && r.m2 === "D") cd++;
    if (r.m1 === "D" && r.m2 === "C") dc++;
    if (r.m1 === "D" && r.m2 === "D") dd++;
    if (r.m1 === "D" && fd1 === -1) fd1 = i + 1;
    if (r.m2 === "D" && fd2 === -1) fd2 = i + 1;
  });
  return { cc, cd, dc, dd, maxStreak, fd1, fd2 };
}

/* ════════════════════════════════════════════
   STYLES
   ════════════════════════════════════════════ */

const fonts = {
  display: "'Playfair Display', 'Georgia', serif",
  body: "'DM Sans', 'Helvetica Neue', sans-serif",
  mono: "'IBM Plex Mono', 'Menlo', monospace",
};

const palette = {
  bg: "#0B0C10", bgCard: "#12131A", bgHover: "#1A1B26",
  border: "#1E2030", borderLight: "#2A2D42",
  text: "#E8E9F0", textMuted: "#8B8FA3", textDim: "#5C5F73",
  accent: "#6C63FF", accentGlow: "#6C63FF33",
  coop: "#34D399", defect: "#F87171",
  gold: "#FBBF24", silver: "#94A3B8", bronze: "#D97706",
};

/* ════════════════════════════════════════════
   CANVAS CHARTS
   ════════════════════════════════════════════ */

function ScoreChart({ match, s1Key, s2Key }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c || !match) return;
    const dpr = 2, w = c.offsetWidth, h = c.offsetHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { t: 16, r: 12, b: 24, l: 44 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const maxSc = Math.max(match.rounds[ROUNDS - 1].sc1, match.rounds[ROUNDS - 1].sc2, 1);
    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.strokeStyle = palette.border; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = palette.textDim; ctx.font = `10px ${fonts.mono}`; ctx.textAlign = "right";
      ctx.fillText(Math.round(maxSc * (1 - i / 4)), pad.l - 8, y + 4);
    }
    // Lines
    [{ key: s1Key, f: "sc1" }, { key: s2Key, f: "sc2" }].forEach(({ key, f }) => {
      const col = STRATEGIES[key].color;
      // Glow
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.globalAlpha = 0.15;
      match.rounds.forEach((r, i) => {
        const x = pad.l + (i / (ROUNDS - 1)) * cw, y = pad.t + ch - (r[f] / maxSc) * ch;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.globalAlpha = 1;
      // Line
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      match.rounds.forEach((r, i) => {
        const x = pad.l + (i / (ROUNDS - 1)) * cw, y = pad.t + ch - (r[f] / maxSc) * ch;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }, [match, s1Key, s2Key]);
  return <canvas ref={ref} style={{ width: "100%", height: 180, display: "block" }} />;
}

function EvolutionChart({ history, keys }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c || !history.length) return;
    const dpr = 2, w = c.offsetWidth, h = c.offsetHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { t: 12, r: 12, b: 24, l: 44 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const totalPop = keys.length * 100, gens = history.length;
    for (let si = keys.length - 1; si >= 0; si--) {
      ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ch);
      for (let g = 0; g < gens; g++) {
        const x = pad.l + (g / Math.max(gens - 1, 1)) * cw;
        let cum = 0; for (let k = 0; k <= si; k++) cum += (history[g][keys[k]] || 0);
        ctx.lineTo(x, pad.t + ch - (cum / totalPop) * ch);
      }
      for (let g = gens - 1; g >= 0; g--) {
        const x = pad.l + (g / Math.max(gens - 1, 1)) * cw;
        let cum = 0; for (let k = 0; k < si; k++) cum += (history[g][keys[k]] || 0);
        ctx.lineTo(x, pad.t + ch - (cum / totalPop) * ch);
      }
      ctx.closePath(); ctx.fillStyle = STRATEGIES[keys[si]].color + "77"; ctx.fill();
    }
    // Y axis
    ctx.fillStyle = palette.textDim; ctx.font = `10px ${fonts.mono}`; ctx.textAlign = "right";
    ctx.fillText("100%", pad.l - 8, pad.t + 10);
    ctx.fillText("0%", pad.l - 8, pad.t + ch + 4);
    ctx.textAlign = "center";
    ctx.fillText("Generation →", w / 2, h - 2);
  }, [history, keys]);
  return <canvas ref={ref} style={{ width: "100%", height: 260, display: "block" }} />;
}

/* ════════════════════════════════════════════
   COMPONENTS
   ════════════════════════════════════════════ */

function HeatMap({ data, keys, onSelect }) {
  const scores = keys.flatMap(k1 => keys.map(k2 => data[`${k1}:${k2}`]?.sc1 || 0));
  const max = Math.max(...scores), min = Math.min(...scores);
  const getColor = v => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return `rgba(${Math.round(248 * (1 - t) + 52 * t)}, ${Math.round(113 * (1 - t) + 211 * t)}, ${Math.round(113 * (1 - t) + 153 * t)}, 0.85)`;
  };
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ display: "grid", gridTemplateColumns: `88px repeat(${keys.length}, minmax(48px, 1fr))`, gap: 2, minWidth: keys.length * 52 + 88 }}>
        <div />
        {keys.map(k => <div key={k} style={{ ...labelStyle, color: STRATEGIES[k].color, textAlign: "center", fontSize: 9 }}>{STRATEGIES[k].abbr}</div>)}
        {keys.map(k1 => (
          <>
            <div key={`r-${k1}`} style={{ ...labelStyle, color: STRATEGIES[k1].color, fontSize: 9, display: "flex", alignItems: "center" }}>{STRATEGIES[k1].abbr}</div>
            {keys.map(k2 => {
              const v = data[`${k1}:${k2}`]?.sc1 || 0;
              return (
                <div key={`${k1}-${k2}`} onClick={() => onSelect?.(k1, k2)}
                  style={{
                    background: getColor(v), borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600, fontFamily: fonts.mono, color: "#fff", minHeight: 36,
                    cursor: "pointer", transition: "all 0.15s", textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.zIndex = "2"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.zIndex = "0"; }}>
                  {v}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

function Replay({ match, s1Key, s2Key }) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const timer = useRef(null);
  useEffect(() => { setPos(0); setPlaying(false); }, [s1Key, s2Key]);
  useEffect(() => {
    if (playing) timer.current = setInterval(() => setPos(p => { if (p >= ROUNDS - 1) { setPlaying(false); return ROUNDS - 1; } return p + 1; }), 1000 / speed);
    return () => clearInterval(timer.current);
  }, [playing, speed]);
  if (!match) return null;
  const r = match.rounds[pos];
  const stats = useMemo(() => getMatchStats(match), [match]);
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 18, color: STRATEGIES[s1Key].color }}>{STRATEGIES[s1Key].name}</span>
          <span style={{ color: palette.textDim, fontSize: 13, fontStyle: "italic" }}>vs</span>
          <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 18, color: STRATEGIES[s2Key].color }}>{STRATEGIES[s2Key].name}</span>
        </div>
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.textDim }}>{pos + 1} / {ROUNDS}</span>
      </div>
      {/* Timeline */}
      <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", gap: 0, marginBottom: 6 }}>
        {match.rounds.slice(0, pos + 1).map((rd, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 0, transition: "opacity 0.1s",
            background: rd.m1 === "C" && rd.m2 === "C" ? palette.coop : rd.m1 === "D" && rd.m2 === "D" ? palette.defect : rd.m1 === "D" ? "#FBBF24" : "#4F8EF7",
            opacity: i === pos ? 1 : 0.5,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: fonts.mono, color: palette.textDim, marginBottom: 16 }}>
        <span>● mutual cooperation</span><span>● mutual defection</span>
      </div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <Btn onClick={() => setPlaying(!playing)} style={{ background: playing ? palette.defect : palette.coop, color: "#fff", minWidth: 80 }}>
          {playing ? "Pause" : "Play"}
        </Btn>
        <Btn onClick={() => { setPlaying(false); setPos(0); }}>Reset</Btn>
        <input type="range" min={0} max={ROUNDS - 1} value={pos} onChange={e => { setPlaying(false); setPos(+e.target.value); }}
          style={{ flex: 1, minWidth: 80, accentColor: palette.accent }} />
        <select value={speed} onChange={e => setSpeed(+e.target.value)}
          style={{ background: palette.bgCard, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 6, padding: "6px 10px", fontFamily: fonts.mono, fontSize: 11 }}>
          {[["5", "0.25×"], ["20", "1×"], ["60", "3×"], ["200", "10×"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {/* Score Chart */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <Label>Score Progression</Label>
        <ScoreChart match={match} s1Key={s1Key} s2Key={s2Key} />
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
          {[s1Key, s2Key].map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: fonts.mono }}>
              <div style={{ width: 12, height: 3, borderRadius: 2, background: STRATEGIES[k].color }} />
              <span style={{ color: palette.textMuted }}>{STRATEGIES[k].abbr}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, marginBottom: 16 }}>
        {[{ key: s1Key, sc: r.sc1, move: r.m1, pts: r.p1 }, null, { key: s2Key, sc: r.sc2, move: r.m2, pts: r.p2 }].map((d, i) =>
          d === null ? <div key="vs" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.display, fontSize: 14, color: palette.textDim, fontStyle: "italic" }}>vs</div> :
          <div key={d.key} style={{ ...cardStyle, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 11, fontFamily: fonts.mono, color: palette.textMuted, marginBottom: 6 }}>{STRATEGIES[d.key].name}</div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: fonts.display, color: STRATEGIES[d.key].color, lineHeight: 1 }}>{d.sc}</div>
            <div style={{ marginTop: 10, display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 10, fontFamily: fonts.mono, fontWeight: 600,
              background: d.move === "C" ? palette.coop + "18" : palette.defect + "18",
              color: d.move === "C" ? palette.coop : palette.defect
            }}>{d.move === "C" ? "COOPERATE" : "DEFECT"} +{d.pts}</div>
          </div>
        )}
      </div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { label: "Mutual Cooperation", val: `${((stats.cc / ROUNDS) * 100).toFixed(0)}%`, color: palette.coop },
          { label: "Mutual Defection", val: `${((stats.dd / ROUNDS) * 100).toFixed(0)}%`, color: palette.defect },
          { label: "Longest Peace", val: `${stats.maxStreak}`, color: "#4F8EF7" },
          { label: "First Betrayal", val: stats.fd1 === -1 && stats.fd2 === -1 ? "—" : `R${Math.min(stats.fd1 === -1 ? 999 : stats.fd1, stats.fd2 === -1 ? 999 : stats.fd2)}`, color: palette.gold },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 8, fontFamily: fonts.mono, color: palette.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: fonts.display, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Summary({ tournament, keys }) {
  const lb = keys.map(k => ({ key: k, score: tournament.totals[k] })).sort((a, b) => b.score - a.score);
  const winner = lb[0], loser = lb[lb.length - 1];
  const coopRates = {};
  keys.forEach(k => {
    let t = 0, c = 0;
    keys.forEach(k2 => { const m = tournament.results[`${k}:${k2}`]; if (m) m.rounds.forEach(r => { t++; if (r.m1 === "C") c++; }); });
    coopRates[k] = t > 0 ? c / t : 0;
  });
  const mostCoop = keys.reduce((a, b) => coopRates[a] > coopRates[b] ? a : b);
  let exploit = { diff: 0 };
  keys.forEach(k1 => keys.forEach(k2 => {
    if (k1 === k2) return;
    const m = tournament.results[`${k1}:${k2}`];
    if (m && m.sc1 - m.sc2 > exploit.diff) exploit = { k1, k2, diff: m.sc1 - m.sc2, sc1: m.sc1, sc2: m.sc2 };
  }));
  return (
    <div style={{ ...cardStyle, padding: "28px 24px", marginBottom: 28, borderLeft: `3px solid ${palette.accent}`, background: `linear-gradient(135deg, ${palette.bgCard}, #141526)` }}>
      <div style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, color: palette.text, marginBottom: 16 }}>Tournament Analysis</div>
      <div style={{ display: "grid", gap: 12 }}>
        <InsightRow emoji="👑" text={<><C k={winner.key} /> wins with <b style={{ color: palette.gold }}>{winner.score}</b> points — {((winner.score / loser.score - 1) * 100).toFixed(0)}% above last place.</>} />
        <InsightRow emoji="🕊" text={<><C k={mostCoop} /> was the most cooperative player at a {(coopRates[mostCoop] * 100).toFixed(0)}% cooperation rate.</>} />
        {exploit.k1 && <InsightRow emoji="⚔" text={<>Biggest blowout: <C k={exploit.k1} /> dominated <C k={exploit.k2} /> by {exploit.diff} points.</>} />}
        {coopRates[winner.key] > 0.6 && (
          <InsightRow emoji="📐" text={<>Axelrod's thesis holds — the tournament winner cooperated {(coopRates[winner.key] * 100).toFixed(0)}% of the time. <em style={{ color: palette.accent }}>Nice strategies win.</em></>} />
        )}
      </div>
    </div>
  );
}

function C({ k }) { return <span style={{ color: STRATEGIES[k]?.color, fontWeight: 600 }}>{STRATEGIES[k]?.name}</span>; }
function InsightRow({ emoji, text }) {
  return <div style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, fontFamily: fonts.body, color: palette.textMuted, lineHeight: 1.6 }}>
    <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span><span>{text}</span>
  </div>;
}

/* ════════════════════════════════════════════
   SHARED STYLES
   ════════════════════════════════════════════ */

const cardStyle = {
  background: palette.bgCard,
  border: `1px solid ${palette.border}`,
  borderRadius: 10,
};

const labelStyle = {
  fontFamily: fonts.mono,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

function Label({ children }) {
  return <div style={{ ...labelStyle, fontSize: 10, color: palette.textDim, marginBottom: 10 }}>{children}</div>;
}

function Btn({ children, onClick, style = {} }) {
  return <button onClick={onClick} style={{
    background: palette.bgCard, border: `1px solid ${palette.border}`, color: palette.textMuted,
    padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
    fontFamily: fonts.body, transition: "all 0.15s", ...style
  }}>{children}</button>;
}

function SectionLabel({ children }) {
  return <div style={{ ...labelStyle, fontSize: 11, color: palette.textDim, marginBottom: 16 }}>{children}</div>;
}

/* ════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════ */

export default function App() {
  const [selected, setSelected] = useState(Object.keys(STRATEGIES));
  const [tournament, setTournament] = useState(null);
  const [evolution, setEvolution] = useState(null);
  const [phase, setPhase] = useState("landing"); // landing | setup | results
  const [tab, setTab] = useState("standings");
  const [replay, setReplay] = useState(null);
  const [heroAnim, setHeroAnim] = useState([]);

  // Hero animation — random PD rounds flickering
  useEffect(() => {
    if (phase !== "landing") return;
    const id = setInterval(() => {
      setHeroAnim(prev => {
        const next = [...prev, { id: Date.now(), m1: Math.random() > 0.4 ? "C" : "D", m2: Math.random() > 0.4 ? "C" : "D" }];
        return next.slice(-80);
      });
    }, 120);
    return () => clearInterval(id);
  }, [phase]);

  const run = () => {
    if (selected.length < 2) return;
    setTournament(runTournament(selected));
    setEvolution(runEvolution(selected));
    setPhase("results"); setTab("standings"); setReplay(null);
  };

  const lb = tournament ? selected.map(k => ({ key: k, score: tournament.totals[k] })).sort((a, b) => b.score - a.score) : [];
  const maxScore = lb[0]?.score || 1;

  const tabs = [
    { id: "standings", label: "Standings" },
    { id: "heatmap", label: "Matchups" },
    { id: "evolution", label: "Evolution" },
    { id: "replay", label: "Replay" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: palette.bg, color: palette.text, fontFamily: fonts.body }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* ── LANDING ── */}
      {phase === "landing" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "40px 24px", position: "relative", overflow: "hidden" }}>
          {/* Animated background grid */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 3, opacity: 0.12, pointerEvents: "none" }}>
            {heroAnim.map(h => (
              <div key={h.id} style={{
                width: 8, height: 8, borderRadius: 2,
                background: h.m1 === "C" && h.m2 === "C" ? palette.coop : h.m1 === "D" && h.m2 === "D" ? palette.defect : "#FBBF24",
                animation: "fadeIn 0.3s ease",
              }} />
            ))}
          </div>
          <style>{`@keyframes fadeIn { from { opacity:0; transform:scale(0.5); } to { opacity:1; transform:scale(1); } }`}</style>

          <div style={{ position: "relative", textAlign: "center", maxWidth: 600 }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 12, letterSpacing: "0.2em", color: palette.accent, textTransform: "uppercase", marginBottom: 16 }}>
              Iterated Prisoner's Dilemma
            </div>
            <h1 style={{ fontFamily: fonts.display, fontSize: "clamp(36px, 7vw, 64px)", fontWeight: 900, lineHeight: 1.1, margin: "0 0 20px", color: palette.text }}>
              Why do nice guys<br /><em style={{ color: palette.accent }}>finish first?</em>
            </h1>
            <p style={{ fontFamily: fonts.body, fontSize: 17, lineHeight: 1.7, color: palette.textMuted, maxWidth: 480, margin: "0 auto 36px" }}>
              In 1984, Robert Axelrod ran a tournament that changed game theory forever. The winning strategy was simple: be kind, retaliate, and forgive. Run the experiment yourself.
            </p>
            <button onClick={() => setPhase("setup")} style={{
              background: palette.accent, color: "#fff", border: "none", borderRadius: 8,
              padding: "14px 36px", fontSize: 15, fontWeight: 600, fontFamily: fonts.body,
              cursor: "pointer", transition: "all 0.2s", boxShadow: `0 0 24px ${palette.accentGlow}`,
            }}>
              Enter the Arena
            </button>
          </div>

          {/* Payoff matrix */}
          <div style={{ marginTop: 60, display: "grid", gridTemplateColumns: "auto auto auto", gap: 0, opacity: 0.6, position: "relative" }}>
            <div />
            <div style={{ ...pmHeaderStyle }}>They Cooperate</div>
            <div style={{ ...pmHeaderStyle }}>They Defect</div>
            <div style={{ ...pmHeaderStyle, textAlign: "right", paddingRight: 12 }}>You Cooperate</div>
            <div style={{ ...pmCellStyle, background: palette.coop + "15", color: palette.coop }}>3 / 3</div>
            <div style={{ ...pmCellStyle, color: palette.defect }}>0 / 5</div>
            <div style={{ ...pmHeaderStyle, textAlign: "right", paddingRight: 12 }}>You Defect</div>
            <div style={{ ...pmCellStyle, color: palette.gold }}>5 / 0</div>
            <div style={{ ...pmCellStyle, background: palette.defect + "15", color: palette.defect }}>1 / 1</div>
          </div>
        </div>
      )}

      {/* ── SETUP ── */}
      {phase === "setup" && (
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
          <button onClick={() => setPhase("landing")} style={{ background: "none", border: "none", color: palette.textDim, cursor: "pointer", fontFamily: fonts.body, fontSize: 13, marginBottom: 24, padding: 0 }}>
            ← Back
          </button>
          <h2 style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, margin: "0 0 6px" }}>Choose Your Strategies</h2>
          <p style={{ fontFamily: fonts.body, fontSize: 14, color: palette.textMuted, margin: "0 0 28px" }}>
            Select which strategies compete. Each plays every other across {ROUNDS} rounds.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(STRATEGIES).map(([key, s]) => {
              const on = selected.includes(key);
              return (
                <div key={key} onClick={() => setSelected(p => on ? p.filter(k => k !== key) : [...p, key])}
                  style={{
                    ...cardStyle, padding: "16px 18px", cursor: "pointer", transition: "all 0.2s",
                    borderColor: on ? s.color + "55" : palette.border,
                    opacity: on ? 1 : 0.4,
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 15, color: s.color, marginBottom: 3 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: palette.textMuted, lineHeight: 1.4 }}>{s.desc}</div>
                      <div style={{ fontSize: 11, color: palette.textDim, fontStyle: "italic", marginTop: 4 }}>"{s.philosophy}"</div>
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginLeft: 12, marginTop: 2,
                      border: `2px solid ${on ? s.color : palette.border}`,
                      background: on ? s.color : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 11, fontWeight: 800, transition: "all 0.2s",
                    }}>{on && "✓"}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={run} disabled={selected.length < 2}
            style={{
              width: "100%", marginTop: 24, padding: "15px", borderRadius: 8, border: "none",
              background: selected.length < 2 ? palette.bgHover : palette.accent,
              color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: fonts.body,
              cursor: selected.length < 2 ? "not-allowed" : "pointer",
              boxShadow: selected.length >= 2 ? `0 0 24px ${palette.accentGlow}` : "none",
              transition: "all 0.2s",
            }}>
            Run Tournament — {selected.length} strategies
          </button>
        </div>
      )}

      {/* ── RESULTS ── */}
      {phase === "results" && tournament && (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
          {/* Nav */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <button onClick={() => { setPhase("setup"); setTournament(null); setEvolution(null); }}
              style={{ background: "none", border: "none", color: palette.textDim, cursor: "pointer", fontFamily: fonts.body, fontSize: 13, padding: 0 }}>
              ← New Tournament
            </button>
            <div style={{ display: "flex", gap: 4 }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    background: tab === t.id ? palette.accent + "18" : "transparent",
                    border: `1px solid ${tab === t.id ? palette.accent + "44" : "transparent"}`,
                    color: tab === t.id ? palette.accent : palette.textDim,
                    padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                    fontSize: 12, fontWeight: 600, fontFamily: fonts.body, transition: "all 0.15s",
                  }}>{t.label}</button>
              ))}
            </div>
          </div>

          <Summary tournament={tournament} keys={selected} />

          {tab === "standings" && (
            <div>
              <SectionLabel>Final Standings</SectionLabel>
              <div style={{ display: "grid", gap: 6 }}>
                {lb.map((entry, i) => {
                  const s = STRATEGIES[entry.key];
                  return (
                    <div key={entry.key} style={{ ...cardStyle, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14, transition: "all 0.2s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = s.color + "44"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = palette.border}>
                      <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 16, width: 24, textAlign: "center",
                        color: i === 0 ? palette.gold : i === 1 ? palette.silver : i === 2 ? palette.bronze : palette.textDim
                      }}>{i + 1}</div>
                      <div style={{ flex: "0 0 110px" }}>
                        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 13, color: s.color }}>{s.name}</div>
                      </div>
                      <div style={{ flex: 1, height: 6, background: palette.bg, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${(entry.score / maxScore) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${s.color}88, ${s.color}33)`, borderRadius: 3, transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ fontFamily: fonts.mono, fontSize: 13, fontWeight: 600, color: palette.text, width: 50, textAlign: "right" }}>{entry.score}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "heatmap" && (
            <div>
              <SectionLabel>Head-to-Head Results</SectionLabel>
              <div style={{ ...cardStyle, padding: 16 }}>
                <HeatMap data={tournament.results} keys={selected} onSelect={(k1, k2) => { setReplay({ k1, k2 }); setTab("replay"); }} />
              </div>
              <p style={{ fontSize: 11, fontFamily: fonts.mono, color: palette.textDim, marginTop: 8 }}>Row player's score vs column. Click any cell to replay.</p>
            </div>
          )}

          {tab === "evolution" && evolution && (
            <div>
              <SectionLabel>Population Dynamics</SectionLabel>
              <p style={{ fontSize: 14, color: palette.textMuted, marginTop: -8, marginBottom: 16, lineHeight: 1.6 }}>
                100 agents per strategy. Each generation: compete, then reproduce proportional to fitness. Watch natural selection unfold.
              </p>
              <div style={{ ...cardStyle, padding: 16 }}>
                <EvolutionChart history={evolution} keys={selected} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, justifyContent: "center" }}>
                {selected.map(k => {
                  const fin = evolution[evolution.length - 1][k] || 0;
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: fonts.mono, opacity: fin > 0 ? 1 : 0.3 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: STRATEGIES[k].color }} />
                      <span style={{ color: palette.textMuted }}>{STRATEGIES[k].abbr}</span>
                      <span style={{ color: fin > 0 ? palette.coop : palette.defect, fontWeight: 600 }}>{fin}</span>
                    </div>
                  );
                })}
              </div>
              {selected.filter(k => !(evolution[evolution.length - 1][k])).length > 0 && (
                <p style={{ textAlign: "center", fontSize: 12, color: palette.textDim, marginTop: 12, fontStyle: "italic" }}>
                  Extinct: {selected.filter(k => !(evolution[evolution.length - 1][k])).map(k => STRATEGIES[k].name).join(", ")}
                </p>
              )}
            </div>
          )}

          {tab === "replay" && (
            <div>
              <SectionLabel>Match Replay</SectionLabel>
              <select
                value={replay ? `${replay.k1}:${replay.k2}` : ""}
                onChange={e => {
                  if (!e.target.value) { setReplay(null); return; }
                  const [k1, k2] = e.target.value.split(":");
                  setReplay({ k1, k2 });
                }}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 8, marginBottom: 20, background: palette.bgCard, color: palette.text, border: `1px solid ${palette.border}`, fontFamily: fonts.body, fontSize: 13 }}>
                <option value="">Select a matchup...</option>
                {selected.flatMap((k1, i) => selected.slice(i).map(k2 => (
                  <option key={`${k1}:${k2}`} value={`${k1}:${k2}`}>{STRATEGIES[k1].name} vs {STRATEGIES[k2].name}</option>
                )))}
              </select>
              {replay && tournament.results[`${replay.k1}:${replay.k2}`] && (
                <div style={{ ...cardStyle, padding: 24 }}>
                  <Replay match={tournament.results[`${replay.k1}:${replay.k2}`]} s1Key={replay.k1} s2Key={replay.k2} />
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${palette.border}`, textAlign: "center" }}>
            <p style={{ fontSize: 12, color: palette.textDim, fontFamily: fonts.mono, lineHeight: 1.6 }}>
              PD Arena — Inspired by Robert Axelrod's <em>The Evolution of Cooperation</em> (1984)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const pmHeaderStyle = {
  fontFamily: fonts.mono, fontSize: 10, color: palette.textDim, padding: "6px 8px", textAlign: "center",
};

const pmCellStyle = {
  fontFamily: fonts.mono, fontSize: 13, fontWeight: 600, padding: "10px 16px", textAlign: "center",
  background: palette.bgCard, border: `1px solid ${palette.border}`, borderRadius: 4,
};
