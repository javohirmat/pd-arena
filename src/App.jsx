import { useState, useEffect, useRef, useMemo } from "react";

const PAYOFFS = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };
const ROUNDS = 200;

const STRATEGIES = {
  titForTat: {
    name: "Tit-for-Tat",
    desc: "Cooperate first, then mirror opponent's last move",
    color: "#3b82f6",
    fn: (my, opp) => (opp.length === 0 ? "C" : opp[opp.length - 1]),
  },
  alwaysCooperate: {
    name: "Always Cooperate",
    desc: "Unconditional cooperation",
    color: "#22c55e",
    fn: () => "C",
  },
  alwaysDefect: {
    name: "Always Defect",
    desc: "Unconditional betrayal",
    color: "#ef4444",
    fn: () => "D",
  },
  grudger: {
    name: "Grudger",
    desc: "Cooperate until betrayed once — then defect forever",
    color: "#f59e0b",
    fn: (my, opp) => (opp.includes("D") ? "D" : "C"),
  },
  random: {
    name: "Random",
    desc: "50/50 coin flip each round",
    color: "#8b5cf6",
    fn: () => (Math.random() < 0.5 ? "C" : "D"),
  },
  pavlov: {
    name: "Pavlov",
    desc: "Win-stay, lose-shift",
    color: "#ec4899",
    fn: (my, opp) => {
      if (my.length === 0) return "C";
      return my[my.length - 1] === opp[opp.length - 1] ? "C" : "D";
    },
  },
  suspiciousTFT: {
    name: "Suspicious TFT",
    desc: "Tit-for-Tat but opens with defection",
    color: "#06b6d4",
    fn: (my, opp) => (opp.length === 0 ? "D" : opp[opp.length - 1]),
  },
  titForTwoTats: {
    name: "TF2T",
    desc: "Retaliates only after two consecutive betrayals",
    color: "#84cc16",
    fn: (my, opp) => {
      if (opp.length < 2) return "C";
      return opp[opp.length - 1] === "D" && opp[opp.length - 2] === "D" ? "D" : "C";
    },
  },
  detective: {
    name: "Detective",
    desc: "Tests with C,D,C,C — then exploits or mirrors",
    color: "#f97316",
    fn: (my, opp) => {
      const opening = ["C", "D", "C", "C"];
      if (my.length < 4) return opening[my.length];
      const oppRetaliates = opp.slice(0, 4).includes("D");
      if (!oppRetaliates) return "D";
      return opp[opp.length - 1];
    },
  },
  softMajority: {
    name: "Soft Majority",
    desc: "Cooperate if opponent cooperated ≥50% of the time",
    color: "#a78bfa",
    fn: (my, opp) => {
      if (opp.length === 0) return "C";
      const coops = opp.filter(m => m === "C").length;
      return coops >= opp.length / 2 ? "C" : "D";
    },
  },
};

function runMatch(s1, s2) {
  let h1 = [], h2 = [], sc1 = 0, sc2 = 0;
  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    const m1 = s1.fn([...h1], [...h2]);
    const m2 = s2.fn([...h2], [...h1]);
    const key = m1 + m2;
    const [p1, p2] = PAYOFFS[key];
    sc1 += p1; sc2 += p2;
    h1.push(m1); h2.push(m2);
    rounds.push({ m1, m2, sc1, sc2, p1, p2 });
  }
  return { rounds, sc1, sc2 };
}

function runTournament(selectedKeys) {
  const results = {};
  const totals = {};
  selectedKeys.forEach(k => (totals[k] = 0));
  for (let i = 0; i < selectedKeys.length; i++) {
    for (let j = i; j < selectedKeys.length; j++) {
      const k1 = selectedKeys[i], k2 = selectedKeys[j];
      const match = runMatch(STRATEGIES[k1], STRATEGIES[k2]);
      results[`${k1}:${k2}`] = match;
      if (k1 === k2) {
        totals[k1] += match.sc1;
      } else {
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

function runEvolution(selectedKeys, generations = 80) {
  const n = selectedKeys.length;
  let pop = {};
  selectedKeys.forEach(k => (pop[k] = 100));
  const history = [{ ...pop }];
  for (let gen = 0; gen < generations; gen++) {
    const totalPop = Object.values(pop).reduce((a, b) => a + b, 0);
    if (totalPop === 0) break;
    const fitness = {};
    selectedKeys.forEach(k => (fitness[k] = 0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const k1 = selectedKeys[i], k2 = selectedKeys[j];
        if (pop[k1] === 0 && pop[k2] === 0) continue;
        const match = runMatch(STRATEGIES[k1], STRATEGIES[k2]);
        if (k1 === k2) {
          fitness[k1] += match.sc1 * pop[k1];
        } else {
          fitness[k1] += match.sc1 * pop[k2];
          fitness[k2] += match.sc2 * pop[k1];
        }
      }
    }
    const newPop = {};
    let totalFit = 0;
    selectedKeys.forEach(k => {
      if (pop[k] > 0) {
        fitness[k] = fitness[k] / totalPop;
        totalFit += fitness[k] * pop[k];
      }
    });
    selectedKeys.forEach(k => {
      if (pop[k] === 0 || totalFit === 0) { newPop[k] = 0; return; }
      newPop[k] = Math.round((fitness[k] * pop[k] / totalFit) * totalPop);
    });
    const newTotal = Object.values(newPop).reduce((a, b) => a + b, 0);
    if (newTotal > 0) {
      const scale = totalPop / newTotal;
      selectedKeys.forEach(k => (newPop[k] = Math.max(0, Math.round(newPop[k] * scale))));
    }
    pop = newPop;
    history.push({ ...pop });
  }
  return history;
}

function getMatchStats(match) {
  let cc = 0, cd = 0, dc = 0, dd = 0, longestCoop = 0, curCoop = 0, firstDefect1 = -1, firstDefect2 = -1;
  match.rounds.forEach((r, i) => {
    if (r.m1 === "C" && r.m2 === "C") { cc++; curCoop++; longestCoop = Math.max(longestCoop, curCoop); } else { curCoop = 0; }
    if (r.m1 === "C" && r.m2 === "D") cd++;
    if (r.m1 === "D" && r.m2 === "C") dc++;
    if (r.m1 === "D" && r.m2 === "D") dd++;
    if (r.m1 === "D" && firstDefect1 === -1) firstDefect1 = i + 1;
    if (r.m2 === "D" && firstDefect2 === -1) firstDefect2 = i + 1;
  });
  return { cc, cd, dc, dd, longestCoop, firstDefect1, firstDefect2 };
}

/* ─── CHARTS ─── */

function ScoreChart({ match, s1Key, s2Key }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !match) return;
    const dpr = 2;
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#08080d";
    ctx.fillRect(0, 0, w, h);
    const pad = { t: 20, r: 16, b: 28, l: 48 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const maxSc = Math.max(match.rounds[ROUNDS - 1].sc1, match.rounds[ROUNDS - 1].sc2, 1);
    ctx.strokeStyle = "#1a1a24"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = "#444"; ctx.font = "10px monospace"; ctx.textAlign = "right";
      ctx.fillText(Math.round(maxSc * (1 - i / 4)), pad.l - 6, y + 4);
    }
    [{ key: s1Key, sc: "sc1" }, { key: s2Key, sc: "sc2" }].forEach(({ key, sc }) => {
      ctx.beginPath(); ctx.strokeStyle = STRATEGIES[key].color; ctx.lineWidth = 2;
      ctx.shadowColor = STRATEGIES[key].color; ctx.shadowBlur = 8;
      match.rounds.forEach((r, i) => {
        const x = pad.l + (i / (ROUNDS - 1)) * cw;
        const y = pad.t + ch - (r[sc] / maxSc) * ch;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.shadowBlur = 0;
    });
    ctx.fillStyle = "#444"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText("Round", w / 2, h - 4);
  }, [match, s1Key, s2Key]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: 200, borderRadius: 8 }} />;
}

function EvolutionChart({ history, keys }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !history.length) return;
    const dpr = 2;
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#08080d";
    ctx.fillRect(0, 0, w, h);
    const pad = { t: 16, r: 16, b: 28, l: 48 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const totalPop = keys.length * 100;
    const gens = history.length;
    for (let si = keys.length - 1; si >= 0; si--) {
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + ch);
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
      ctx.closePath();
      ctx.fillStyle = STRATEGIES[keys[si]].color + "88";
      ctx.fill();
    }
    // Grid
    ctx.strokeStyle = "#ffffff11"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    }
    ctx.fillStyle = "#444"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText("Generation", w / 2, h - 4);
    ctx.textAlign = "right";
    ctx.fillText("100%", pad.l - 6, pad.t + 10);
    ctx.fillText("0%", pad.l - 6, pad.t + ch + 4);
  }, [history, keys]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: 260, borderRadius: 8 }} />;
}

function CoopRadar({ tournament, keys }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = 2;
    const size = Math.min(canvas.offsetWidth, 320);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2, radius = size / 2 - 44;
    ctx.fillStyle = "#08080d";
    ctx.fillRect(0, 0, size, size);
    const n = keys.length;
    const angleStep = (Math.PI * 2) / n;
    for (let r = 0.25; r <= 1; r += 0.25) {
      ctx.beginPath(); ctx.strokeStyle = "#1a1a2466"; ctx.lineWidth = 0.5;
      for (let i = 0; i <= n; i++) {
        const a = i * angleStep - Math.PI / 2;
        const x = cx + Math.cos(a) * radius * r;
        const y = cy + Math.sin(a) * radius * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    keys.forEach((k, i) => {
      const a = i * angleStep - Math.PI / 2;
      ctx.beginPath(); ctx.strokeStyle = "#1a1a24"; ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.stroke();
      const lx = cx + Math.cos(a) * (radius + 22);
      const ly = cy + Math.sin(a) * (radius + 22);
      ctx.fillStyle = STRATEGIES[k].color; ctx.font = "bold 8px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(STRATEGIES[k].name.slice(0, 7), lx, ly);
    });
    keys.forEach((sk, si) => {
      if (hovered !== null && hovered !== si) return;
      ctx.beginPath();
      keys.forEach((ok, oi) => {
        const match = tournament.results[`${sk}:${ok}`];
        if (!match) return;
        const coopRate = match.rounds.filter(r => r.m1 === "C").length / ROUNDS;
        const a = oi * angleStep - Math.PI / 2;
        const x = cx + Math.cos(a) * radius * coopRate;
        const y = cy + Math.sin(a) * radius * coopRate;
        oi === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = STRATEGIES[sk].color + (hovered === si ? "44" : "18");
      ctx.strokeStyle = STRATEGIES[sk].color + (hovered === si ? "cc" : "66");
      ctx.lineWidth = hovered === si ? 2 : 1;
      ctx.fill(); ctx.stroke();
    });
  }, [tournament, keys, hovered]);
  return (
    <div>
      <canvas ref={canvasRef} style={{ width: "100%", maxWidth: 320, height: 320, display: "block", margin: "0 auto" }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const y = e.clientY - rect.top - rect.height / 2;
          let angle = Math.atan2(y, x) + Math.PI / 2;
          if (angle < 0) angle += Math.PI * 2;
          setHovered(Math.round(angle / (Math.PI * 2 / keys.length)) % keys.length);
        }}
        onMouseLeave={() => setHovered(null)} />
      {hovered !== null && (
        <div style={{ textAlign: "center", fontSize: 11, color: STRATEGIES[keys[hovered]].color, fontWeight: 700, marginTop: 6 }}>
          {STRATEGIES[keys[hovered]].name} — cooperation profile
        </div>
      )}
    </div>
  );
}

/* ─── REPLAY ─── */

function Replay({ match, s1Key, s2Key }) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const timerRef = useRef(null);
  useEffect(() => { setPos(0); setPlaying(false); }, [s1Key, s2Key]);
  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setPos(p => { if (p >= ROUNDS - 1) { setPlaying(false); return ROUNDS - 1; } return p + 1; });
      }, 1000 / speed);
    }
    return () => clearInterval(timerRef.current);
  }, [playing, speed]);
  if (!match) return null;
  const r = match.rounds[pos];
  const stats = useMemo(() => getMatchStats(match), [match]);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 13, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: STRATEGIES[s1Key].color, fontWeight: 700 }}>{STRATEGIES[s1Key].name}</span>
          <span style={{ color: "#444", fontSize: 16 }}>⚔</span>
          <span style={{ color: STRATEGIES[s2Key].color, fontWeight: 700 }}>{STRATEGIES[s2Key].name}</span>
        </div>
        <span style={{ color: "#444", fontSize: 11, fontFamily: "monospace" }}>R{String(pos + 1).padStart(3, "0")}/{ROUNDS}</span>
      </div>
      {/* Timeline strip */}
      <div style={{ display: "flex", gap: 0, height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 4 }}>
        {match.rounds.slice(0, pos + 1).map((rd, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 0,
            background: rd.m1 === "C" && rd.m2 === "C" ? "#22c55e" :
              rd.m1 === "D" && rd.m2 === "D" ? "#ef4444" :
              rd.m1 === "D" ? "#f59e0b" : "#3b82f6",
            opacity: i === pos ? 1 : 0.55,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#444", marginBottom: 14 }}>
        <span>🟢 mutual coop</span><span>🔵 P1 coop only</span><span>🟡 P2 coop only</span><span>🔴 mutual defect</span>
      </div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setPlaying(!playing)} style={{ ...btnStyle, background: playing ? "#dc2626" : "#16a34a", color: "#fff", minWidth: 72 }}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button onClick={() => { setPlaying(false); setPos(0); }} style={btnStyle}>⟲</button>
        <input type="range" min={0} max={ROUNDS - 1} value={pos} onChange={e => { setPlaying(false); setPos(+e.target.value); }}
          style={{ flex: 1, minWidth: 80, accentColor: "#8b5cf6" }} />
        <select value={speed} onChange={e => setSpeed(+e.target.value)} style={{ ...btnStyle, minWidth: 56 }}>
          {[["5", "0.25x"], ["20", "1x"], ["60", "3x"], ["200", "10x"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {/* Score Progression */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Score Progression</div>
        <ScoreChart match={match} s1Key={s1Key} s2Key={s2Key} />
      </div>
      {/* Live Scores */}
      <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 16px", background: "#0a0a12", borderRadius: 8, border: "1px solid #1a1a24" }}>
        {[{ key: s1Key, sc: r.sc1, move: r.m1, pts: r.p1 }, { key: s2Key, sc: r.sc2, move: r.m2, pts: r.p2 }].map(({ key, sc, move, pts }) => (
          <div key={key} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{STRATEGIES[key].name}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: STRATEGIES[key].color, lineHeight: 1 }}>{sc}</div>
            <div style={{
              fontSize: 10, fontWeight: 700, marginTop: 8, padding: "3px 10px", borderRadius: 4,
              background: move === "C" ? "#22c55e18" : "#ef444418",
              color: move === "C" ? "#22c55e" : "#ef4444", display: "inline-block"
            }}>
              {move === "C" ? "COOP" : "DEFECT"} +{pts}
            </div>
          </div>
        ))}
      </div>
      {/* Deep Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 12 }}>
        {[
          { label: "Mutual Coop", val: `${((stats.cc / ROUNDS) * 100).toFixed(0)}%`, color: "#22c55e" },
          { label: "Mutual Defect", val: `${((stats.dd / ROUNDS) * 100).toFixed(0)}%`, color: "#ef4444" },
          { label: "Longest Peace", val: `${stats.longestCoop}r`, color: "#3b82f6" },
          { label: "1st Betrayal", val: stats.firstDefect1 === -1 && stats.firstDefect2 === -1 ? "Never" : `R${Math.min(stats.firstDefect1 === -1 ? 999 : stats.firstDefect1, stats.firstDefect2 === -1 ? 999 : stats.firstDefect2)}`, color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={{ background: "#0a0a12", borderRadius: 6, padding: "10px 6px", textAlign: "center", border: "1px solid #1a1a24" }}>
            <div style={{ fontSize: 8, color: "#444", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── HEATMAP ─── */

function HeatMap({ data, keys, onSelect }) {
  const max = Math.max(...keys.flatMap(k1 => keys.map(k2 => data[`${k1}:${k2}`]?.sc1 || 0)));
  const min = Math.min(...keys.flatMap(k1 => keys.map(k2 => data[`${k1}:${k2}`]?.sc1 || 0)));
  const getColor = (val) => {
    const t = max === min ? 0.5 : (val - min) / (max - min);
    return `rgb(${Math.round(200 * (1 - t) + 34 * t)},${Math.round(30 * (1 - t) + 197 * t)},${Math.round(30 * (1 - t) + 94 * t)})`;
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `96px repeat(${keys.length}, 1fr)`, gap: 2, minWidth: keys.length * 58 + 96 }}>
        <div />
        {keys.map(k => <div key={k} style={{ fontSize: 8, textAlign: "center", color: STRATEGIES[k].color, fontWeight: 700, padding: "4px 1px" }}>{STRATEGIES[k].name}</div>)}
        {keys.map(k1 => (
          <>
            <div key={`l-${k1}`} style={{ fontSize: 8, color: STRATEGIES[k1].color, fontWeight: 700, display: "flex", alignItems: "center" }}>{STRATEGIES[k1].name}</div>
            {keys.map(k2 => {
              const val = data[`${k1}:${k2}`]?.sc1 || 0;
              return (
                <div key={`${k1}-${k2}`} onClick={() => onSelect?.(k1, k2)}
                  style={{ background: getColor(val), borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", minHeight: 30, cursor: "pointer", textShadow: "0 1px 2px rgba(0,0,0,0.7)", transition: "transform 0.1s, box-shadow 0.1s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.12)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(139,92,246,0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}>
                  {val}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

/* ─── SUMMARY ─── */

function Summary({ tournament, keys }) {
  const lb = keys.map(k => ({ key: k, score: tournament.totals[k] })).sort((a, b) => b.score - a.score);
  const winner = lb[0], loser = lb[lb.length - 1];
  const coopRates = {};
  keys.forEach(k => {
    let total = 0, coops = 0;
    keys.forEach(k2 => {
      const m = tournament.results[`${k}:${k2}`];
      if (m) { m.rounds.forEach(r => { total++; if (r.m1 === "C") coops++; }); }
    });
    coopRates[k] = total > 0 ? coops / total : 0;
  });
  const mostCoop = keys.reduce((a, b) => coopRates[a] > coopRates[b] ? a : b);
  const leastCoop = keys.reduce((a, b) => coopRates[a] < coopRates[b] ? a : b);
  let biggestExploit = { diff: 0 };
  keys.forEach(k1 => keys.forEach(k2 => {
    if (k1 === k2) return;
    const m = tournament.results[`${k1}:${k2}`];
    if (m && m.sc1 - m.sc2 > biggestExploit.diff) biggestExploit = { k1, k2, diff: m.sc1 - m.sc2, sc1: m.sc1, sc2: m.sc2 };
  }));
  const avgScore = lb.reduce((s, e) => s + e.score, 0) / lb.length;

  return (
    <div style={{ background: "linear-gradient(135deg, #0d0d1a, #10102a)", borderRadius: 12, padding: 20, border: "1px solid #2a2a4a", marginBottom: 24 }}>
      <div style={{ fontSize: 10, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14, fontWeight: 700 }}>
        ◈ Tournament Insights
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <Ins icon="👑" text={<><C k={winner.key} /> dominated with <b style={{ color: "#fbbf24" }}>{winner.score}</b> pts — {((winner.score / loser.score - 1) * 100).toFixed(0)}% above last place</>} />
        <Ins icon="🕊" text={<><C k={mostCoop} /> was most cooperative — {(coopRates[mostCoop] * 100).toFixed(0)}% cooperation rate</>} />
        <Ins icon="🗡" text={<><C k={leastCoop} /> was most aggressive — only {(coopRates[leastCoop] * 100).toFixed(0)}% cooperation</>} />
        {biggestExploit.k1 && <Ins icon="💀" text={<><C k={biggestExploit.k1} /> crushed <C k={biggestExploit.k2} /> by {biggestExploit.diff} pts ({biggestExploit.sc1} vs {biggestExploit.sc2})</>} />}
        <Ins icon="📊" text={<>Average score: {Math.round(avgScore)} pts — {keys.filter(k => tournament.totals[k] > avgScore).length} strategies beat the average</>} />
        {coopRates[winner.key] > 0.6 && <Ins icon="📖" text={<>Axelrod's thesis confirmed: the winner cooperated {(coopRates[winner.key] * 100).toFixed(0)}% of the time — <em style={{ color: "#c4b5fd" }}>nice strategies win tournaments</em></>} />}
      </div>
    </div>
  );
}

function C({ k }) { return <b style={{ color: STRATEGIES[k]?.color || "#fff" }}>{STRATEGIES[k]?.name || k}</b>; }
function Ins({ icon, text }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span><span>{text}</span>
    </div>
  );
}

/* ─── MAIN ─── */

const btnStyle = {
  background: "#12121c",
  border: "1px solid #2a2a3a",
  color: "#bbb",
  padding: "7px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
};

export default function App() {
  const [selected, setSelected] = useState(Object.keys(STRATEGIES));
  const [tournament, setTournament] = useState(null);
  const [evolution, setEvolution] = useState(null);
  const [view, setView] = useState("setup");
  const [tab, setTab] = useState("leaderboard");
  const [replayKeys, setReplayKeys] = useState(null);

  const run = () => {
    if (selected.length < 2) return;
    setTournament(runTournament(selected));
    setEvolution(runEvolution(selected));
    setView("results");
    setTab("leaderboard");
    setReplayKeys(null);
  };

  const leaderboard = tournament ? selected.map(k => ({ key: k, score: tournament.totals[k] })).sort((a, b) => b.score - a.score) : [];
  const maxScore = leaderboard.length > 0 ? leaderboard[0].score : 1;

  const tabs = [
    { id: "leaderboard", label: "🏆 Leaderboard", },
    { id: "heatmap", label: "🔥 Heat Map" },
    { id: "radar", label: "🕸 Coop Radar" },
    { id: "evolution", label: "🧬 Evolution" },
    { id: "replay", label: "⚔ Replay" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#08080d", color: "#e0e0e8", fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{ padding: "24px 20px 12px", borderBottom: "1px solid #1a1a24", background: "linear-gradient(180deg, #0e0e1a, #08080d)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em", background: "linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            PD ARENA
          </h1>
          <span style={{ fontSize: 10, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Iterated Prisoner's Dilemma</span>
        </div>
        {view === "results" && (
          <div style={{ display: "flex", gap: 4, marginTop: 14, overflowX: "auto", paddingBottom: 4 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  ...btnStyle, fontSize: 11, padding: "6px 12px", whiteSpace: "nowrap",
                  background: tab === t.id ? "#8b5cf622" : "transparent",
                  borderColor: tab === t.id ? "#8b5cf6" : "#1a1a24",
                  color: tab === t.id ? "#c4b5fd" : "#555",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "20px", maxWidth: 820, margin: "0 auto" }}>

        {view === "setup" && (
          <div>
            <div style={{ fontSize: 10, color: "#444", marginBottom: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Select Strategies · {selected.length}/{Object.keys(STRATEGIES).length}
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              {Object.entries(STRATEGIES).map(([key, s]) => {
                const active = selected.includes(key);
                return (
                  <div key={key} onClick={() => setSelected(prev => active ? prev.filter(k => k !== key) : [...prev, key])}
                    style={{
                      padding: "11px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                      background: active ? "#0e0e1a" : "#08080d",
                      border: `1px solid ${active ? s.color + "44" : "#131320"}`,
                      opacity: active ? 1 : 0.4,
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 12, color: s.color }}>{s.name}</span>
                        <span style={{ fontSize: 10, color: "#555", marginLeft: 10 }}>{s.desc}</span>
                      </div>
                      <div style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                        border: `2px solid ${active ? s.color : "#2a2a3a"}`,
                        background: active ? s.color : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#fff", fontWeight: 800
                      }}>{active && "✓"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ margin: "14px 0", padding: "10px 14px", background: "#0a0a12", borderRadius: 8, border: "1px solid #1a1a24" }}>
              <div style={{ fontSize: 8, color: "#444", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Payoff Matrix · {ROUNDS} rounds/match</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10 }}>
                <div><span style={{ color: "#22c55e" }}>Both Coop</span> <span style={{ color: "#555" }}>→ 3 / 3</span></div>
                <div><span style={{ color: "#ef4444" }}>Both Defect</span> <span style={{ color: "#555" }}>→ 1 / 1</span></div>
                <div><span style={{ color: "#f59e0b" }}>D vs C</span> <span style={{ color: "#555" }}>→ 5 / 0</span></div>
                <div><span style={{ color: "#3b82f6" }}>C vs D</span> <span style={{ color: "#555" }}>→ 0 / 5</span></div>
              </div>
            </div>
            <button onClick={run} disabled={selected.length < 2}
              style={{
                width: "100%", padding: "14px", borderRadius: 8, border: "none",
                cursor: selected.length < 2 ? "not-allowed" : "pointer",
                background: selected.length < 2 ? "#1a1a24" : "linear-gradient(135deg, #8b5cf6, #ec4899)",
                color: "#fff", fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                fontFamily: "inherit",
              }}>
              ⚔ Run Tournament — {selected.length} strategies
            </button>
          </div>
        )}

        {view === "results" && tournament && (
          <div>
            <button onClick={() => { setView("setup"); setTournament(null); setEvolution(null); }} style={{ ...btnStyle, marginBottom: 16 }}>← New Tournament</button>
            <Summary tournament={tournament} keys={selected} />

            {tab === "leaderboard" && (
              <div>
                <ST>Final Standings</ST>
                <div style={{ display: "grid", gap: 3 }}>
                  {leaderboard.map((entry, i) => {
                    const s = STRATEGIES[entry.key];
                    return (
                      <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 20, fontSize: 12, fontWeight: 800, textAlign: "right",
                          color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7c32" : "#333" }}>{i + 1}</div>
                        <div style={{ width: 88, fontSize: 10, fontWeight: 700, color: s.color, flexShrink: 0 }}>{s.name}</div>
                        <div style={{ flex: 1, height: 20, background: "#0a0a12", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(entry.score / maxScore) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${s.color}55, ${s.color}18)`, borderRight: `2px solid ${s.color}` }} />
                        </div>
                        <div style={{ width: 50, textAlign: "right", fontSize: 11, fontWeight: 700, color: "#ccc", fontVariantNumeric: "tabular-nums" }}>{entry.score}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "heatmap" && (
              <div>
                <ST>Matchup Scores</ST>
                <div style={{ background: "#0a0a12", borderRadius: 8, padding: 12, border: "1px solid #1a1a24" }}>
                  <HeatMap data={tournament.results} keys={selected} onSelect={(k1, k2) => { setReplayKeys({ k1, k2 }); setTab("replay"); }} />
                </div>
                <div style={{ fontSize: 9, color: "#444", marginTop: 6 }}>Row score vs column · Click cell → replay</div>
              </div>
            )}

            {tab === "radar" && (
              <div>
                <ST>Cooperation Radar</ST>
                <p style={{ fontSize: 10, color: "#555", marginBottom: 10, marginTop: 0 }}>Each polygon = how cooperative a strategy was against each opponent. Hover to isolate.</p>
                <div style={{ background: "#0a0a12", borderRadius: 8, padding: 12, border: "1px solid #1a1a24" }}>
                  <CoopRadar tournament={tournament} keys={selected} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, justifyContent: "center" }}>
                  {selected.map(k => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: STRATEGIES[k].color }} />
                      <span style={{ color: "#555" }}>{STRATEGIES[k].name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "evolution" && evolution && (
              <div>
                <ST>Population Evolution</ST>
                <p style={{ fontSize: 10, color: "#555", marginBottom: 10, marginTop: 0 }}>
                  100 agents per strategy. Each generation: compete → reproduce proportional to fitness → repeat. Natural selection in action.
                </p>
                <div style={{ background: "#0a0a12", borderRadius: 8, padding: 12, border: "1px solid #1a1a24" }}>
                  <EvolutionChart history={evolution} keys={selected} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, justifyContent: "center" }}>
                  {selected.map(k => {
                    const fin = evolution[evolution.length - 1][k] || 0;
                    return (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, opacity: fin > 0 ? 1 : 0.3 }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: STRATEGIES[k].color }} />
                        <span style={{ color: "#666" }}>{STRATEGIES[k].name}</span>
                        <span style={{ color: fin > 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{fin}</span>
                      </div>
                    );
                  })}
                </div>
                {selected.filter(k => (evolution[evolution.length - 1][k] || 0) === 0).length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 10, color: "#555", textAlign: "center" }}>
                    ☠ Extinct: {selected.filter(k => (evolution[evolution.length - 1][k] || 0) === 0).map(k => STRATEGIES[k].name).join(", ")}
                  </div>
                )}
              </div>
            )}

            {tab === "replay" && (
              <div>
                <ST>Match Replay</ST>
                <select
                  value={replayKeys ? `${replayKeys.k1}:${replayKeys.k2}` : ""}
                  onChange={e => {
                    if (!e.target.value) { setReplayKeys(null); return; }
                    const [k1, k2] = e.target.value.split(":");
                    setReplayKeys({ k1, k2 });
                  }}
                  style={{ ...btnStyle, width: "100%", padding: "10px 14px", marginBottom: 16 }}>
                  <option value="">Select matchup...</option>
                  {selected.flatMap((k1, i) => selected.slice(i).map(k2 => (
                    <option key={`${k1}:${k2}`} value={`${k1}:${k2}`}>{STRATEGIES[k1].name} vs {STRATEGIES[k2].name}</option>
                  )))}
                </select>
                {replayKeys && tournament.results[`${replayKeys.k1}:${replayKeys.k2}`] && (
                  <div style={{ background: "#0a0a12", borderRadius: 8, padding: 18, border: "1px solid #1a1a24" }}>
                    <Replay match={tournament.results[`${replayKeys.k1}:${replayKeys.k2}`]} s1Key={replayKeys.k1} s2Key={replayKeys.k2} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ST({ children }) {
  return <div style={{ fontSize: 10, color: "#555", marginBottom: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{children}</div>;
}
