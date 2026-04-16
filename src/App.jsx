import { useState, useEffect, useRef, useMemo } from "react";

const PAYOFFS = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };
const ROUNDS = 200;

const STRATEGIES = {
  titForTat: {
    name: "Tit-for-Tat",
    desc: "Cooperate first, then mirror the opponent's last move. The legendary Axelrod winner.",
    tags: ["Classic", "Nice"],
    color: "#d4a373",
    fn: (my, opp) => (opp.length === 0 ? "C" : opp[opp.length - 1]),
  },
  alwaysCooperate: {
    name: "Always Cooperate",
    desc: "Unconditional cooperation. Gets exploited, stays kind.",
    tags: ["Naive", "Nice"],
    color: "#7a8c5c",
    fn: () => "C",
  },
  alwaysDefect: {
    name: "Always Defect",
    desc: "Unconditional betrayal. Wins single games, loses long ones.",
    tags: ["Harsh", "Bad"],
    color: "#b23a3a",
    fn: () => "D",
  },
  grudger: {
    name: "Grudger",
    desc: "Cooperates until betrayed once — then defects forever. Never forgives.",
    tags: ["Classic", "Nice"],
    color: "#d64545",
    fn: (my, opp) => (opp.includes("D") ? "D" : "C"),
  },
  random: {
    name: "Random",
    desc: "50/50 coin flip each round. The chaos agent.",
    tags: ["Chaos", "Bad"],
    color: "#a39985",
    fn: () => (Math.random() < 0.5 ? "C" : "D"),
  },
  pavlov: {
    name: "Pavlov",
    desc: "Win-stay, lose-shift. Repeats its last move if it scored well.",
    tags: ["Classic", "Nice"],
    color: "#c9956a",
    fn: (my, opp) => {
      if (my.length === 0) return "C";
      return my[my.length - 1] === opp[opp.length - 1] ? "C" : "D";
    },
  },
  suspiciousTFT: {
    name: "Suspicious TFT",
    desc: "Tit-for-Tat, but opens with defection. Trust is earned, not given.",
    tags: ["Probe", "Bad"],
    color: "#9c6b4a",
    fn: (my, opp) => (opp.length === 0 ? "D" : opp[opp.length - 1]),
  },
  titForTwoTats: {
    name: "TF2T",
    desc: "Retaliates only after two consecutive betrayals. Generous by design.",
    tags: ["Forgiving", "Nice"],
    color: "#92a06b",
    fn: (my, opp) => {
      if (opp.length < 2) return "C";
      return opp[opp.length - 1] === "D" && opp[opp.length - 2] === "D" ? "D" : "C";
    },
  },
  detective: {
    name: "Detective",
    desc: "Probes with C-D-C-C, then exploits cooperators and mirrors retaliators.",
    tags: ["Probe", "Bad"],
    color: "#f0c17e",
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
    desc: "Cooperates if the opponent cooperated at least half the time. Democratic.",
    tags: ["Classic", "Nice"],
    color: "#b5a78c",
    fn: (my, opp) => {
      if (opp.length === 0) return "C";
      const coops = opp.filter(m => m === "C").length;
      return coops >= opp.length / 2 ? "C" : "D";
    },
  },
};

const T = {
  bg: "#0c0a09",
  bg2: "#14110f",
  paper: "#f5f1e8",
  ink: "#ece6d7",
  inkDim: "#a39985",
  inkFaint: "#5c5446",
  line: "#2a2420",
  amber: "#d4a373",
  amberHi: "#f0c17e",
  rust: "#b23a3a",
  rustHi: "#d64545",
  leaf: "#7a8c5c",
  serif: "'Fraunces', 'Georgia', serif",
  mono: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
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

const PROBE_OPP = ["C", "C", "D", "C", "C", "D", "D", "C", "C", "D", "C", "D"];
function preview(strategyFn, length = 12) {
  const my = [];
  for (let i = 0; i < length; i++) {
    my.push(strategyFn([...my], PROBE_OPP.slice(0, i)));
  }
  return my;
}

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
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, w, h);
    const pad = { t: 20, r: 16, b: 28, l: 48 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const maxSc = Math.max(match.rounds[ROUNDS - 1].sc1, match.rounds[ROUNDS - 1].sc2, 1);
    ctx.strokeStyle = T.line; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = T.inkFaint; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.textAlign = "right";
      ctx.fillText(Math.round(maxSc * (1 - i / 4)), pad.l - 6, y + 4);
    }
    [{ key: s1Key, sc: "sc1" }, { key: s2Key, sc: "sc2" }].forEach(({ key, sc }) => {
      ctx.beginPath(); ctx.strokeStyle = STRATEGIES[key].color; ctx.lineWidth = 2;
      ctx.shadowColor = STRATEGIES[key].color; ctx.shadowBlur = 6;
      match.rounds.forEach((r, i) => {
        const x = pad.l + (i / (ROUNDS - 1)) * cw;
        const y = pad.t + ch - (r[sc] / maxSc) * ch;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.shadowBlur = 0;
    });
    ctx.fillStyle = T.inkFaint; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("Round", w / 2, h - 4);
  }, [match, s1Key, s2Key]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: 200 }} />;
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
    ctx.fillStyle = T.bg;
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
      ctx.fillStyle = STRATEGIES[keys[si]].color + "aa";
      ctx.fill();
    }
    ctx.strokeStyle = T.line; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    }
    ctx.fillStyle = T.inkFaint; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText("Generation", w / 2, h - 4);
    ctx.textAlign = "right";
    ctx.fillText("100%", pad.l - 6, pad.t + 10);
    ctx.fillText("0%", pad.l - 6, pad.t + ch + 4);
  }, [history, keys]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: 260 }} />;
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
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, size, size);
    const n = keys.length;
    const angleStep = (Math.PI * 2) / n;
    for (let r = 0.25; r <= 1; r += 0.25) {
      ctx.beginPath(); ctx.strokeStyle = T.line + "66"; ctx.lineWidth = 0.5;
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
      ctx.beginPath(); ctx.strokeStyle = T.line; ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.stroke();
      const lx = cx + Math.cos(a) * (radius + 22);
      const ly = cy + Math.sin(a) * (radius + 22);
      ctx.fillStyle = STRATEGIES[k].color; ctx.font = "bold 8px 'JetBrains Mono', monospace";
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
        <div style={{ textAlign: "center", fontSize: 11, color: STRATEGIES[keys[hovered]].color, fontFamily: T.mono, fontWeight: 700, letterSpacing: "0.15em", marginTop: 12, textTransform: "uppercase" }}>
          {STRATEGIES[keys[hovered]].name} · cooperation profile
        </div>
      )}
    </div>
  );
}

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
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontFamily: T.serif }}>
          <span style={{ color: STRATEGIES[s1Key].color, fontWeight: 500, fontSize: 22 }}>{STRATEGIES[s1Key].name}</span>
          <span style={{ color: T.inkFaint, fontSize: 10, fontFamily: T.mono, letterSpacing: "0.25em" }}>VS</span>
          <span style={{ color: STRATEGIES[s2Key].color, fontWeight: 500, fontSize: 22 }}>{STRATEGIES[s2Key].name}</span>
        </div>
        <span style={{ color: T.inkFaint, fontSize: 11, fontFamily: T.mono, letterSpacing: "0.2em" }}>R{String(pos + 1).padStart(3, "0")} / {ROUNDS}</span>
      </div>
      <div style={{ display: "flex", gap: 0, height: 22, overflow: "hidden", marginBottom: 8, border: `1px solid ${T.line}` }}>
        {match.rounds.slice(0, pos + 1).map((rd, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 0,
            background: rd.m1 === "C" && rd.m2 === "C" ? T.leaf :
              rd.m1 === "D" && rd.m2 === "D" ? T.rust :
              rd.m1 === "D" ? T.amber : T.amberHi,
            opacity: i === pos ? 1 : 0.55,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: T.inkFaint, marginBottom: 22, fontFamily: T.mono, letterSpacing: "0.15em", textTransform: "uppercase" }}>
        <span>mutual coop</span><span>P1 defect</span><span>P2 defect</span><span>mutual defect</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => setPlaying(!playing)} className={playing ? "btn btn-danger" : "btn"} style={{ minWidth: 88 }}>
          {playing ? "PAUSE" : "▶ PLAY"}
        </button>
        <button onClick={() => { setPlaying(false); setPos(0); }} className="btn btn-ghost">⟲ RESET</button>
        <input type="range" min={0} max={ROUNDS - 1} value={pos} onChange={e => { setPlaying(false); setPos(+e.target.value); }}
          style={{ flex: 1, minWidth: 80 }} />
        <select value={speed} onChange={e => setSpeed(+e.target.value)}>
          {[["5", "0.25×"], ["20", "1×"], ["60", "3×"], ["200", "10×"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Score progression</div>
        <ScoreChart match={match} s1Key={s1Key} s2Key={s2Key} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", padding: "28px 20px", background: T.bg, border: `1px solid ${T.line}` }}>
        {[{ key: s1Key, sc: r.sc1, move: r.m1, pts: r.p1 }, { key: s2Key, sc: r.sc2, move: r.m2, pts: r.p2 }].map(({ key, sc, move, pts }) => (
          <div key={key} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: T.inkFaint, fontFamily: T.mono, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>{STRATEGIES[key].name}</div>
            <div style={{ fontFamily: T.serif, fontWeight: 300, fontSize: 48, color: STRATEGIES[key].color, lineHeight: 1, fontVariationSettings: '"opsz" 144' }}>{sc}</div>
            <div style={{
              fontSize: 10, fontFamily: T.mono, fontWeight: 700, letterSpacing: "0.25em", marginTop: 14, padding: "5px 12px",
              background: move === "C" ? "rgba(212,163,115,0.1)" : "rgba(178,58,58,0.1)",
              color: move === "C" ? T.amber : T.rustHi, display: "inline-block",
              border: `1px solid ${move === "C" ? T.amber + "55" : T.rust + "55"}`,
            }}>
              {move === "C" ? "COOP" : "DEFECT"} +{pts}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 16 }}>
        {[
          { label: "Mutual Coop", val: `${((stats.cc / ROUNDS) * 100).toFixed(0)}%`, color: T.leaf },
          { label: "Mutual Defect", val: `${((stats.dd / ROUNDS) * 100).toFixed(0)}%`, color: T.rust },
          { label: "Longest Peace", val: `${stats.longestCoop}r`, color: T.amber },
          { label: "1st Betrayal", val: stats.firstDefect1 === -1 && stats.firstDefect2 === -1 ? "Never" : `R${Math.min(stats.firstDefect1 === -1 ? 999 : stats.firstDefect1, stats.firstDefect2 === -1 ? 999 : stats.firstDefect2)}`, color: T.amberHi },
        ].map(s => (
          <div key={s.label} style={{ background: T.bg, padding: "18px 10px", textAlign: "center", border: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 9, color: T.inkFaint, fontFamily: T.mono, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontFamily: T.serif, fontWeight: 300, fontSize: 26, color: s.color, fontVariationSettings: '"opsz" 144' }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatMap({ data, keys, onSelect }) {
  const max = Math.max(...keys.flatMap(k1 => keys.map(k2 => data[`${k1}:${k2}`]?.sc1 || 0)));
  const min = Math.min(...keys.flatMap(k1 => keys.map(k2 => data[`${k1}:${k2}`]?.sc1 || 0)));
  const getColor = (val) => {
    const t = max === min ? 0.5 : (val - min) / (max - min);
    if (t < 0.5) {
      const u = t * 2;
      const r = Math.round(178 + (212 - 178) * u);
      const g = Math.round(58 + (163 - 58) * u);
      const b = Math.round(58 + (115 - 58) * u);
      return `rgb(${r},${g},${b})`;
    } else {
      const u = (t - 0.5) * 2;
      const r = Math.round(212 + (240 - 212) * u);
      const g = Math.round(163 + (193 - 163) * u);
      const b = Math.round(115 + (126 - 115) * u);
      return `rgb(${r},${g},${b})`;
    }
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `110px repeat(${keys.length}, 1fr)`, gap: 2, minWidth: keys.length * 60 + 110 }}>
        <div />
        {keys.map(k => <div key={k} style={{ fontSize: 9, textAlign: "center", color: STRATEGIES[k].color, fontFamily: T.mono, fontWeight: 700, letterSpacing: "0.08em", padding: "6px 2px" }}>{STRATEGIES[k].name}</div>)}
        {keys.map(k1 => (
          <div key={`row-${k1}`} style={{ display: "contents" }}>
            <div style={{ fontSize: 9, color: STRATEGIES[k1].color, fontFamily: T.mono, fontWeight: 700, letterSpacing: "0.08em", display: "flex", alignItems: "center" }}>{STRATEGIES[k1].name}</div>
            {keys.map(k2 => {
              const val = data[`${k1}:${k2}`]?.sc1 || 0;
              return (
                <div key={`${k1}-${k2}`} onClick={() => onSelect?.(k1, k2)}
                  style={{ background: getColor(val), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: T.mono, fontWeight: 700, color: T.bg, minHeight: 34, cursor: "pointer", transition: "transform 0.1s, box-shadow 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = `0 0 14px ${T.amber}66`; e.currentTarget.style.zIndex = "2"; e.currentTarget.style.position = "relative"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.zIndex = "1"; }}>
                  {val}
                </div>
              );
            })}
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
    <div style={{ padding: "28px 32px", border: `1px solid ${T.line}`, borderLeft: `2px solid ${T.amber}`, background: "rgba(212, 163, 115, 0.04)", marginBottom: 32 }}>
      <div className="eyebrow" style={{ marginBottom: 22 }}>Tournament insights</div>
      <div style={{ display: "grid", gap: 12 }}>
        <Ins text={<><C k={winner.key} /> dominated with <b style={{ color: T.amber, fontFamily: T.serif, fontSize: 18, fontWeight: 500 }}>{winner.score}</b> points — {((winner.score / loser.score - 1) * 100).toFixed(0)}% above last place.</>} />
        <Ins text={<><C k={mostCoop} /> was the most cooperative — {(coopRates[mostCoop] * 100).toFixed(0)}% cooperation rate.</>} />
        <Ins text={<><C k={leastCoop} /> was the most aggressive — only {(coopRates[leastCoop] * 100).toFixed(0)}% cooperation.</>} />
        {biggestExploit.k1 && <Ins text={<><C k={biggestExploit.k1} /> crushed <C k={biggestExploit.k2} /> by {biggestExploit.diff} points ({biggestExploit.sc1} vs {biggestExploit.sc2}).</>} />}
        <Ins text={<>Average score: {Math.round(avgScore)} — {keys.filter(k => tournament.totals[k] > avgScore).length} strategies beat the average.</>} />
        {coopRates[winner.key] > 0.6 && <Ins text={<>Axelrod's thesis confirmed: the winner cooperated {(coopRates[winner.key] * 100).toFixed(0)}% of the time. <em style={{ color: T.amber, fontStyle: "italic" }}>Nice strategies win tournaments.</em></>} />}
      </div>
    </div>
  );
}

function C({ k }) { return <b style={{ color: STRATEGIES[k]?.color || T.paper, fontFamily: T.serif, fontWeight: 500, fontStyle: "italic" }}>{STRATEGIES[k]?.name || k}</b>; }
function Ins({ text }) {
  return <div style={{ fontFamily: T.serif, fontSize: 16, color: T.ink, lineHeight: 1.6 }}>{text}</div>;
}

function Chip({ label }) {
  const nice = label === "Nice";
  const bad = label === "Bad";
  return (
    <span style={{
      fontFamily: T.mono,
      fontSize: 10,
      letterSpacing: "0.15em",
      textTransform: "uppercase",
      padding: "3px 8px",
      border: `1px solid ${nice ? "rgba(122,140,92,0.5)" : bad ? "rgba(178,58,58,0.5)" : T.line}`,
      background: nice ? "rgba(122,140,92,0.08)" : bad ? "rgba(178,58,58,0.08)" : "transparent",
      color: nice ? T.leaf : bad ? T.rustHi : T.inkDim,
    }}>{label}</span>
  );
}

function ST({ children }) {
  return <div className="eyebrow" style={{ marginBottom: 20 }}>{children}</div>;
}

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
    { id: "leaderboard", label: "Standings" },
    { id: "heatmap", label: "Heat map" },
    { id: "radar", label: "Radar" },
    { id: "evolution", label: "Evolution" },
    { id: "replay", label: "Replay" },
  ];

  return (
    <div style={{ minHeight: "100vh", color: T.ink }}>
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 48px",
        background: "rgba(12, 10, 9, 0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${T.line}`,
      }}>
        <a href="/" style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 14, letterSpacing: "0.2em", color: T.amber, textDecoration: "none" }}>
          <span style={{ color: T.rust }}>◈</span> PD ARENA
        </a>
        <a href="/" style={{ fontFamily: T.mono, fontSize: 12, color: T.inkDim, textDecoration: "none", letterSpacing: "0.15em", textTransform: "uppercase" }}>← About</a>
      </nav>

      {view === "results" && (
        <div style={{ borderBottom: `1px solid ${T.line}`, background: "rgba(20, 17, 15, 0.4)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 48px", display: "flex", gap: 0, overflowX: "auto" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  fontFamily: T.mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
                  padding: "18px 22px", whiteSpace: "nowrap",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${tab === t.id ? T.amber : "transparent"}`,
                  color: tab === t.id ? T.amber : T.inkFaint,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "72px 48px 80px", maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 2 }}>

        {view === "setup" && (
          <div>
            <div style={{ marginBottom: 56 }}>
              <div className="eyebrow" style={{ marginBottom: 24 }}>Tournament setup</div>
              <h1 style={{ fontFamily: T.serif, fontWeight: 300, fontSize: "clamp(48px, 7vw, 88px)", lineHeight: 0.98, letterSpacing: "-0.02em", color: T.paper, marginBottom: 28, fontVariationSettings: '"opsz" 144' }}>
                Pick your <em style={{ fontStyle: "italic", color: T.amber, fontWeight: 400 }}>combatants</em>.
              </h1>
              <p style={{ fontFamily: T.serif, fontSize: 18, color: T.inkDim, lineHeight: 1.6, maxWidth: 580 }}>
                Every strategy plays every other strategy for <strong style={{ color: T.ink, fontWeight: 600 }}>{ROUNDS} rounds</strong>. Nice strategies cooperate first. Bad ones defect first. Watch who survives.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: "0.25em", color: T.inkFaint, textTransform: "uppercase" }}>
                {selected.length} / {Object.keys(STRATEGIES).length} selected
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setSelected(Object.keys(STRATEGIES))} style={{ fontFamily: T.mono, fontSize: 11, background: "transparent", border: "none", color: T.inkDim, cursor: "pointer", padding: "6px 12px", letterSpacing: "0.15em", textTransform: "uppercase" }}>All</button>
                <button onClick={() => setSelected([])} style={{ fontFamily: T.mono, fontSize: 11, background: "transparent", border: "none", color: T.inkDim, cursor: "pointer", padding: "6px 12px", letterSpacing: "0.15em", textTransform: "uppercase" }}>None</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, marginBottom: 40 }}>
              {Object.entries(STRATEGIES).map(([key, s]) => {
                const active = selected.includes(key);
                const moves = preview(s.fn);
                return (
                  <div key={key} onClick={() => setSelected(prev => active ? prev.filter(k => k !== key) : [...prev, key])}
                    style={{
                      padding: 24, cursor: "pointer", transition: "all 0.2s",
                      background: T.bg2,
                      border: `1px solid ${active ? T.amber : T.line}`,
                      opacity: active ? 1 : 0.45,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = T.inkFaint; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = T.line; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8 }}>
                      <span style={{ fontFamily: T.serif, fontWeight: 400, fontSize: 20, color: T.paper, letterSpacing: "-0.01em" }}>{s.name}</span>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {s.tags.map(tag => <Chip key={tag} label={tag} />)}
                      </div>
                    </div>
                    <div style={{ fontFamily: T.serif, fontSize: 14, color: T.inkDim, lineHeight: 1.55, marginBottom: 18, minHeight: 44 }}>{s.desc}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: T.mono, fontSize: 13, letterSpacing: "0.25em", height: 14 }}>
                      <span style={{ fontSize: 10, letterSpacing: "0.15em", color: T.inkFaint, textTransform: "uppercase", minWidth: 40 }}>Play</span>
                      {moves.map((m, i) => (
                        <span key={i} style={{ color: m === "C" ? T.amber : T.rust, fontWeight: 700 }}>{m}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 40 }}>
              <div className="eyebrow" style={{ marginBottom: 20 }}>The rules</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {[
                  { lbl: "Both cooperate", val: "3 / 3", sub: "Reward", c: T.amber },
                  { lbl: "Both defect", val: "1 / 1", sub: "Punishment", c: T.inkFaint },
                  { lbl: "Defect vs coop", val: "5 / 0", sub: "Temptation", c: T.amberHi },
                  { lbl: "Coop vs defect", val: "0 / 5", sub: "Sucker", c: T.rust },
                ].map(m => (
                  <div key={m.lbl} style={{ padding: "18px 20px", background: T.bg2, border: `1px solid ${T.line}` }}>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: m.c, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 10 }}>{m.lbl}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <div style={{ fontFamily: T.serif, fontSize: 32, fontWeight: 400, color: T.paper, fontVariationSettings: '"opsz" 144' }}>{m.val}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint, letterSpacing: "0.15em", textTransform: "uppercase" }}>{m.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={run} disabled={selected.length < 2} className="btn" style={{
              width: "100%", padding: "20px", fontSize: 14, letterSpacing: "0.2em",
              opacity: selected.length < 2 ? 0.35 : 1,
              cursor: selected.length < 2 ? "not-allowed" : "pointer",
            }}>
              ▶ Run tournament · {selected.length} strategies · {ROUNDS} rounds each
            </button>
          </div>
        )}

        {view === "results" && tournament && (
          <div>
            <button onClick={() => { setView("setup"); setTournament(null); setEvolution(null); }} className="btn btn-ghost" style={{ marginBottom: 32, fontSize: 11 }}>← New tournament</button>
            <Summary tournament={tournament} keys={selected} />

            {tab === "leaderboard" && (
              <div>
                <ST>Final standings</ST>
                <div style={{ display: "grid", gap: 0 }}>
                  {leaderboard.map((entry, i) => {
                    const s = STRATEGIES[entry.key];
                    const isWinner = i === 0;
                    return (
                      <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 0", borderBottom: `1px dashed ${T.line}` }}>
                        <div style={{ width: 36, fontFamily: T.serif, fontWeight: 300, fontSize: 28, textAlign: "right", color: isWinner ? T.amber : i === 1 ? T.inkDim : i === 2 ? T.inkFaint : T.line, fontVariationSettings: '"opsz" 144' }}>{i + 1}</div>
                        <div style={{ width: 150, fontFamily: T.serif, fontSize: 17, fontWeight: 500, color: s.color, flexShrink: 0 }}>{s.name}</div>
                        <div style={{ flex: 1, height: 26, background: T.bg, border: `1px solid ${T.line}`, overflow: "hidden", position: "relative" }}>
                          <div style={{
                            width: `${(entry.score / maxScore) * 100}%`, height: "100%",
                            background: isWinner ? T.amber : s.color,
                            opacity: isWinner ? 1 : 0.55,
                            boxShadow: isWinner ? `0 0 12px ${T.amber}66` : "none",
                            transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                          }} />
                        </div>
                        <div style={{ width: 72, textAlign: "right", fontFamily: T.serif, fontWeight: 300, fontSize: 24, color: T.paper, fontVariationSettings: '"opsz" 144' }}>{entry.score}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "heatmap" && (
              <div>
                <ST>Matchup scores</ST>
                <div style={{ background: T.bg2, padding: 24, border: `1px solid ${T.line}` }}>
                  <HeatMap data={tournament.results} keys={selected} onSelect={(k1, k2) => { setReplayKeys({ k1, k2 }); setTab("replay"); }} />
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint, marginTop: 12, letterSpacing: "0.15em", textTransform: "uppercase" }}>Row score vs column · click cell for replay</div>
              </div>
            )}

            {tab === "radar" && (
              <div>
                <ST>Cooperation radar</ST>
                <p style={{ fontFamily: T.serif, fontSize: 16, color: T.inkDim, marginBottom: 24, lineHeight: 1.6, maxWidth: 600 }}>
                  Each polygon shows how cooperative a strategy was against every opponent. Larger area = more trusting. <em style={{ color: T.amber, fontStyle: "italic" }}>Hover to isolate.</em>
                </p>
                <div style={{ background: T.bg2, padding: 32, border: `1px solid ${T.line}` }}>
                  <CoopRadar tournament={tournament} keys={selected} />
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 16, justifyContent: "center" }}>
                  {selected.map(k => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 10, letterSpacing: "0.08em" }}>
                      <div style={{ width: 8, height: 8, background: STRATEGIES[k].color }} />
                      <span style={{ color: T.inkDim }}>{STRATEGIES[k].name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "evolution" && evolution && (
              <div>
                <ST>Population evolution</ST>
                <p style={{ fontFamily: T.serif, fontSize: 16, color: T.inkDim, marginBottom: 24, lineHeight: 1.6, maxWidth: 620 }}>
                  100 agents per strategy. Each generation: compete, then reproduce proportional to fitness. <em style={{ color: T.amber, fontStyle: "italic" }}>Natural selection in action.</em>
                </p>
                <div style={{ background: T.bg2, padding: 24, border: `1px solid ${T.line}` }}>
                  <EvolutionChart history={evolution} keys={selected} />
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, justifyContent: "center" }}>
                  {selected.map(k => {
                    const fin = evolution[evolution.length - 1][k] || 0;
                    return (
                      <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: 10, letterSpacing: "0.08em", opacity: fin > 0 ? 1 : 0.4 }}>
                        <div style={{ width: 8, height: 8, background: STRATEGIES[k].color }} />
                        <span style={{ color: T.inkDim }}>{STRATEGIES[k].name}</span>
                        <span style={{ color: fin > 0 ? T.leaf : T.rust, fontWeight: 700 }}>{fin}</span>
                      </div>
                    );
                  })}
                </div>
                {selected.filter(k => (evolution[evolution.length - 1][k] || 0) === 0).length > 0 && (
                  <div style={{ marginTop: 18, fontFamily: T.mono, fontSize: 10, color: T.rustHi, textAlign: "center", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                    ☠ Extinct · {selected.filter(k => (evolution[evolution.length - 1][k] || 0) === 0).map(k => STRATEGIES[k].name).join(" · ")}
                  </div>
                )}
              </div>
            )}

            {tab === "replay" && (
              <div>
                <ST>Match replay</ST>
                <select
                  value={replayKeys ? `${replayKeys.k1}:${replayKeys.k2}` : ""}
                  onChange={e => {
                    if (!e.target.value) { setReplayKeys(null); return; }
                    const [k1, k2] = e.target.value.split(":");
                    setReplayKeys({ k1, k2 });
                  }}
                  style={{ width: "100%", padding: "14px 18px", marginBottom: 24 }}>
                  <option value="">Select matchup...</option>
                  {selected.flatMap((k1, i) => selected.slice(i).map(k2 => (
                    <option key={`${k1}:${k2}`} value={`${k1}:${k2}`}>{STRATEGIES[k1].name} vs {STRATEGIES[k2].name}</option>
                  )))}
                </select>
                {replayKeys && tournament.results[`${replayKeys.k1}:${replayKeys.k2}`] && (
                  <div style={{ background: T.bg2, padding: 32, border: `1px solid ${T.line}` }}>
                    <Replay match={tournament.results[`${replayKeys.k1}:${replayKeys.k2}`]} s1Key={replayKeys.k1} s2Key={replayKeys.k2} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <footer style={{
        padding: "40px 48px",
        borderTop: `1px solid ${T.line}`,
        fontFamily: T.mono, fontSize: 11, color: T.inkFaint,
        display: "flex", justifyContent: "space-between", letterSpacing: "0.15em", textTransform: "uppercase",
        flexWrap: "wrap", gap: 16,
      }}>
        <span>PD Arena · 2026</span>
        <span>Based on Axelrod's 1984 tournament</span>
      </footer>
    </div>
  );
}