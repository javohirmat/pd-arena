import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ============================================================
// PD ARENA v7 — restyled to match landing visual language
// Fraunces + JetBrains Mono · warm dark palette · paper grain
// ============================================================

// --- DESIGN TOKENS ---
const C = {
  bg: "#0c0a09",
  bg2: "#14110f",
  bg3: "#1a1613",
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
  leafHi: "#9bae7a",
};

// --- CATEGORY PALETTE (warm palette, grouped by moral character) ---
const STRATEGY_CATEGORIES = [
  { id: "classic",      label: "Classic",      color: C.amber },
  { id: "cooperative",  label: "Cooperative",  color: C.leaf },
  { id: "aggressive",   label: "Aggressive",   color: C.rust },
  { id: "adaptive",     label: "Adaptive",     color: "#c9a876" },
  { id: "probing",      label: "Probing",      color: C.amberHi },
  { id: "stochastic",   label: "Stochastic",   color: C.inkDim },
  { id: "memory",       label: "Memory",       color: "#b8b0a0" },
  { id: "retaliatory",  label: "Retaliatory",  color: C.rustHi },
  { id: "forgiving",    label: "Forgiving",    color: C.leafHi },
  { id: "mathematical", label: "Mathematical", color: "#b8a47f" },
];

// Which categories count as "nice" (cooperate-leaning first move / intent)
const NICE_CATS = new Set(["classic", "cooperative", "forgiving", "adaptive"]);
const BAD_CATS  = new Set(["aggressive", "retaliatory"]);

// --- DEFAULT PAYOFF MATRIX (standard Axelrod) ---
const DEFAULT_PAYOFFS = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };
const buildPayoffs = (T, R, P, S) => ({
  CC: [R, R],
  CD: [S, T],
  DC: [T, S],
  DD: [P, P],
});
const validPD = (T, R, P, S) => T > R && R > P && P > S && 2 * R > T + S;

// --- ALL STRATEGIES (63 total) ---
// Signature: fn(myHistory, theirHistory, round, totalRounds, payoffs?)
const STRATEGIES = [
  // === CLASSIC ===
  { name: "Tit-for-Tat", category: "classic", description: "Cooperate first, then copy opponent's last move. The famous Axelrod winner.", fn: (my, their, r) => r === 0 ? "C" : their[r - 1] },
  { name: "Always Cooperate", category: "classic", description: "Unconditional cooperation. Pure altruism.", fn: () => "C" },
  { name: "Always Defect", category: "classic", description: "Unconditional defection. Pure selfishness.", fn: () => "D" },
  { name: "Random", category: "classic", description: "50/50 coin flip each round.", fn: () => Math.random() < 0.5 ? "C" : "D" },
  { name: "Grudger", category: "classic", description: "Cooperate until betrayed, then defect forever.", fn: (my, their) => their.includes("D") ? "D" : "C" },
  { name: "Pavlov", category: "classic", description: "Win-stay, lose-shift. Repeats last move if it scored well.", fn: (my, their, r) => { if (r === 0) return "C"; const lo = my[r-1] + their[r-1]; return lo === "CC" || lo === "DC" ? my[r-1] : my[r-1] === "C" ? "D" : "C"; } },
  { name: "Suspicious TFT", category: "classic", description: "Like TFT but defects first. Trust must be earned.", fn: (my, their, r) => r === 0 ? "D" : their[r - 1] },
  { name: "Tit-for-Two-Tats", category: "classic", description: "Only retaliates after TWO consecutive defections.", fn: (my, their, r) => { if (r < 2) return "C"; return their[r-1] === "D" && their[r-2] === "D" ? "D" : "C"; } },
  { name: "Detective", category: "classic", description: "Probes with C,D,C,C. Exploits cooperators, plays TFT vs retaliators.", fn: (my, their, r) => { const op = ["C","D","C","C"]; if (r < 4) return op[r]; return their.slice(0,4).includes("D") ? their[r-1] : "D"; } },
  { name: "Soft Majority", category: "classic", description: "Cooperate if opponent has cooperated at least half the time.", fn: (my, their, r) => { if (r === 0) return "C"; return their.filter(m => m === "C").length >= their.length / 2 ? "C" : "D"; } },

  // === COOPERATIVE ===
  { name: "Generous TFT", category: "cooperative", description: "TFT but forgives defections 10% of the time.", fn: (my, their, r) => { if (r === 0) return "C"; if (their[r-1] === "D") return Math.random() < 0.1 ? "C" : "D"; return "C"; } },
  { name: "Firm but Fair", category: "cooperative", description: "Cooperate unless just got suckered (played C while they played D).", fn: (my, their, r) => { if (r === 0) return "C"; return my[r-1] === "C" && their[r-1] === "D" ? "D" : "C"; } },
  { name: "Peacemaker", category: "cooperative", description: "TFT but randomly cooperates 20% when it would defect.", fn: (my, their, r) => { if (r === 0) return "C"; if (their[r-1] === "D") return Math.random() < 0.2 ? "C" : "D"; return "C"; } },
  { name: "Slow Grudger", category: "cooperative", description: "Needs 3 defections before retaliating.", fn: (my, their) => their.filter(m => m === "D").length >= 3 ? "D" : "C" },
  { name: "Handshake", category: "cooperative", description: "Opens D,C,C. If opponent mirrors, cooperates forever.", fn: (my, their, r) => { const sig = ["D","C","C"]; if (r < 3) return sig[r]; if (their[0]==="D" && their[1]==="C" && their[2]==="C") return "C"; return their[r-1]; } },
  { name: "Forgiver", category: "cooperative", description: "Retaliates once for each defection, then forgives.", fn: (my, their, r) => { if (r === 0) return "C"; return their[r-1] === "D" ? "D" : "C"; } },
  { name: "Soft Grudger", category: "cooperative", description: "After defection, punishes D,D,D,D,C,C then resets.", fn: (my, their, r) => { if (r === 0) return "C"; for (let i = their.length-1; i >= 0; i--) { if (their[i]==="D") { const s = r-i-1; if (s < 4) return "D"; if (s < 6) return "C"; break; } } return "C"; } },
  { name: "Omega TFT", category: "cooperative", description: "Tracks randomness. Cooperates with cooperators, defects against chaos.", fn: (my, their, r) => { if (r < 3) return "C"; let sw = 0; for (let i = 1; i < their.length; i++) { if (their[i] !== their[i-1]) sw++; } if (sw / (their.length-1) > 0.6) return "D"; return their[r-1]; } },

  // === AGGRESSIVE ===
  { name: "Bully", category: "aggressive", description: "Defects first. If opponent retaliates, backs down.", fn: (my, their, r) => r === 0 ? "D" : their[r-1] === "D" ? "C" : "D" },
  { name: "Backstabber", category: "aggressive", description: "Cooperates for 50 rounds building trust, then defects forever.", fn: (my, their, r) => r < 50 ? "C" : "D" },
  { name: "Aggravater", category: "aggressive", description: "Defects first 3 rounds to provoke, then plays TFT.", fn: (my, their, r) => r < 3 ? "D" : their[r-1] },
  { name: "Punisher", category: "aggressive", description: "Tracks defection ratio. More defections = harsher punishment.", fn: (my, their, r) => { if (r === 0) return "C"; const dr = their.filter(m => m==="D").length / their.length; if (dr > 0.5) return "D"; if (dr > 0.3) return Math.random() < dr ? "D" : "C"; return their[r-1]; } },
  { name: "Joss", category: "aggressive", description: "TFT but randomly defects 10% of the time. Sneaky.", fn: (my, their, r) => { if (r === 0) return "C"; if (their[r-1] === "C") return Math.random() < 0.1 ? "D" : "C"; return "D"; } },
  { name: "Grim Trigger", category: "aggressive", description: "Cooperates until a single defection, then defects forever.", fn: (my, their) => their.includes("D") ? "D" : "C" },
  { name: "Endgame Defector", category: "aggressive", description: "Plays TFT but defects in the last 10 rounds.", fn: (my, their, r, total) => { if (total && r >= total - 10) return "D"; if (r >= 190) return "D"; if (r === 0) return "C"; return their[r-1]; } },

  // === ADAPTIVE ===
  { name: "Adaptive", category: "adaptive", description: "Tests C and D for 6 rounds each, then picks whichever scored better.", fn: (my, their, r, _t, payoffs) => { const p = payoffs || DEFAULT_PAYOFFS; if (r < 6) return "C"; if (r < 12) return "D"; let cS=0, dS=0; for (let i=0;i<6;i++) cS += p["C"+their[i]][0]; for (let i=6;i<12;i++) dS += p["D"+their[i]][0]; return cS >= dS ? "C" : "D"; } },
  { name: "Gradual", category: "adaptive", description: "Punishes proportionally: nth defection = n rounds of punishment.", fn: (my, their, r) => { if (r === 0) return "C"; const d = their.filter(m=>m==="D").length; let p=0; for (let i=my.length-1;i>=0&&my[i]==="D";i--) p++; if (their[r-1]==="D" && p < d) return "D"; if (p > 0 && p < d) return "D"; return "C"; } },
  { name: "Prober", category: "adaptive", description: "Tests with D on round 2. Exploits if no retaliation, else TFT.", fn: (my, their, r) => { if (r===0) return "C"; if (r===1) return "D"; if (r===2) return "C"; if (their[1]==="C" && their[2]==="C") return "D"; return their[r-1]; } },
  { name: "Equalizer", category: "adaptive", description: "Tries to keep both players' scores equal.", fn: (my, their, r, _t, payoffs) => { const p = payoffs || DEFAULT_PAYOFFS; if (r < 2) return "C"; let ms=0,ts=0; for (let i=0;i<r;i++) { const k=my[i]+their[i]; ms+=p[k][0]; ts+=p[k][1]; } if (ms < ts) return "D"; if (ms > ts+5) return "C"; return their[r-1]; } },
  { name: "Mirror", category: "adaptive", description: "Matches opponent's overall cooperation rate probabilistically.", fn: (my, their, r) => { if (r < 2) return "C"; return Math.random() < their.filter(m=>m==="C").length/their.length ? "C" : "D"; } },
  { name: "TFT with Forgiveness", category: "adaptive", description: "TFT but after mutual defection, forgives 30% of the time.", fn: (my, their, r) => { if (r === 0) return "C"; if (my[r-1]==="D" && their[r-1]==="D" && Math.random()<0.3) return "C"; return their[r-1]; } },
  { name: "Contrite TFT", category: "adaptive", description: "Cooperates after its own accidental defection caused retaliation.", fn: (my, their, r) => { if (r === 0) return "C"; if (r >= 2 && my[r-1]==="D" && my[r-2]==="C" && their[r-2]==="C") return "C"; return their[r-1]; } },

  // === PROBING ===
  { name: "Hard Prober", category: "probing", description: "Opens D,D,C,C. If opponent cooperated on 2-3, exploits forever.", fn: (my, their, r) => { if (r<2) return "D"; if (r<4) return "C"; if (their[1]==="C"&&their[2]==="C") return "D"; return their[r-1]; } },
  { name: "Remorseful Prober", category: "probing", description: "Like Joss but makes up for accidental defections.", fn: (my, their, r) => { if (r===0) return "C"; if (r>=2 && my[r-1]==="D" && my[r-2]==="C" && their[r-1]==="D") return "C"; if (their[r-1]==="C") return Math.random()<0.1?"D":"C"; return "D"; } },
  { name: "Naive Prober", category: "probing", description: "TFT that randomly defects 5% to test the waters.", fn: (my, their, r) => { if (r===0) return "C"; if (Math.random()<0.05) return "D"; return their[r-1]; } },
  { name: "Probe and Punish", category: "probing", description: "Cooperates 10 rounds, probes with D, escalates if no retaliation.", fn: (my, their, r) => { if (r<10) return "C"; if (r===10) return "D"; if (r===11) return their[10]==="C"?"D":"C"; if (their[10]==="C") return Math.random()<Math.min(0.8,0.3+(r-12)*0.005)?"D":"C"; return their[r-1]; } },

  // === STOCHASTIC ===
  { name: "Random 70C", category: "stochastic", description: "70% cooperate. Biased nice.", fn: () => Math.random() < 0.7 ? "C" : "D" },
  { name: "Random 30C", category: "stochastic", description: "30% cooperate. Mostly defects.", fn: () => Math.random() < 0.3 ? "C" : "D" },
  { name: "Noisy TFT", category: "stochastic", description: "TFT with 5% error rate.", fn: (my, their, r) => { let m = r===0?"C":their[r-1]; if (Math.random()<0.05) m = m==="C"?"D":"C"; return m; } },
  { name: "Stochastic Grudger", category: "stochastic", description: "Defection probability increases with each betrayal.", fn: (my, their, r) => { if (r===0) return "C"; const d=their.filter(m=>m==="D").length; if(d===0) return "C"; return Math.random()<Math.min(0.95,d/(their.length*0.5))?"D":"C"; } },
  { name: "Chaos Monkey", category: "stochastic", description: "Alternates cooperation and defection streaks.", fn: (my, their, r) => { const p = Math.floor(r / (3+Math.floor(Math.abs(Math.sin(r*0.7))*3))); return p%2===0?"C":"D"; } },

  // === MEMORY ===
  { name: "Two-Tits-for-Tat", category: "memory", description: "Retaliates with TWO defections per opponent defection.", fn: (my, their, r) => { if (r===0) return "C"; if (their[r-1]==="D") return "D"; if (r>=2 && their[r-2]==="D") return "D"; return "C"; } },
  { name: "Memory Decay", category: "memory", description: "Recent moves weighted more. Old betrayals fade.", fn: (my, their, r) => { if (r===0) return "C"; let wc=0,tw=0; for(let i=0;i<their.length;i++){const w=Math.pow(0.95,their.length-1-i); if(their[i]==="C") wc+=w; tw+=w;} return wc/tw>=0.5?"C":"D"; } },
  { name: "Last 3 Majority", category: "memory", description: "Goes with the majority of opponent's last 3 moves.", fn: (my, their, r) => { if(r<3) return "C"; return their.slice(-3).filter(m=>m==="C").length>=2?"C":"D"; } },
  { name: "Pattern Detector", category: "memory", description: "Looks for 2-move patterns and predicts next move.", fn: (my, their, r) => { if(r<4) return "C"; const p=their[r-2]+their[r-1]; let c=0,d=0; for(let i=0;i<their.length-2;i++){if(their[i]+their[i+1]===p){if(their[i+2]==="C")c++;else d++;}} return c>=d?"C":"D"; } },
  { name: "Historian", category: "memory", description: "Picks the move that historically gets cooperation from opponent.", fn: (my, their, r) => { if(r<5) return "C"; let cc=0,ct=0,dc=0,dt=0; for(let i=0;i<my.length-1;i++){if(my[i]==="C"){ct++;if(their[i+1]==="C")cc++;}else{dt++;if(their[i+1]==="C")dc++;}} return (ct>0?cc/ct:0.5)>=(dt>0?dc/dt:0.5)?"C":"D"; } },

  // === RETALIATORY ===
  { name: "Hard Majority", category: "retaliatory", description: "Defects if opponent has defected more than cooperated.", fn: (my, their, r) => { if(r===0) return "D"; return their.filter(m=>m==="D").length>their.length/2?"D":"C"; } },
  { name: "Revenge", category: "retaliatory", description: "Each defection adds 2 retaliatory defections to a queue.", fn: (my, their, r) => { if(r===0) return "C"; let debt=0,paid=0; for(let i=0;i<their.length;i++){if(their[i]==="D")debt+=2; if(i>0&&my[i]==="D"&&their[i-1]==="D")paid++;} return paid<debt?"D":"C"; } },
  { name: "Berserk", category: "retaliatory", description: "One defection triggers 10 rounds of rage.", fn: (my, their, r) => { if(r===0) return "C"; for(let i=Math.max(0,r-10);i<r;i++){if(their[i]==="D") return "D";} return "C"; } },
  { name: "Resentful", category: "retaliatory", description: "Each defection permanently increases defection probability by 15%.", fn: (my, their) => Math.random() < Math.min(0.99, their.filter(m=>m==="D").length*0.15) ? "D" : "C" },

  // === FORGIVING ===
  { name: "Generous", category: "forgiving", description: "TFT but cooperates 30% of the time even after defection.", fn: (my, their, r) => { if(r===0) return "C"; if(their[r-1]==="D") return Math.random()<0.3?"C":"D"; return "C"; } },
  { name: "Soft Grudger v2", category: "forgiving", description: "Grudges for 5 rounds then tests cooperation again.", fn: (my, their, r) => { if(r===0) return "C"; const ld=their.lastIndexOf("D"); if(ld===-1) return "C"; return r-ld<=5?"D":"C"; } },
  { name: "Gradual Forgiver", category: "forgiving", description: "Threshold for punishment increases over time.", fn: (my, their, r) => { if(r<2) return "C"; const rc=their.slice(Math.max(0,r-10)); return rc.filter(m=>m==="D").length/rc.length > Math.min(0.8,0.3+r*0.002)?"D":"C"; } },
  { name: "Second Chance", category: "forgiving", description: "Forgives the first defection. Retaliates from the second.", fn: (my, their, r) => { const d=their.filter(m=>m==="D").length; if(d<=1) return "C"; return their[r-1]==="D"?"D":"C"; } },

  // === MATHEMATICAL ===
  { name: "Golden Ratio", category: "mathematical", description: "Cooperates ~61.8% based on golden ratio pattern.", fn: (my, their, r) => ((r * 1.618033988749895) % 1) < 0.618 ? "C" : "D" },
  { name: "Fibonacci", category: "mathematical", description: "Cooperates on Fibonacci-numbered rounds.", fn: (my, their, r) => { let a=1,b=1; while(b<=r){[a,b]=[b,a+b];} return b===r||a===r?"C":"D"; } },
  { name: "Pi Strategy", category: "mathematical", description: "Uses digits of pi. Even=cooperate, odd=defect.", fn: (my, their, r) => { const d="31415926535897932384626433832795028841971693993751"; return parseInt(d[r%d.length])%2===0?"C":"D"; } },
  { name: "Bayesian", category: "mathematical", description: "Acts on expected value using Bayesian probability estimate.", fn: (my, their, r) => { if(r<3) return "C"; const a=1+their.filter(m=>m==="C").length, b=1+their.filter(m=>m==="D").length; const p=a/(a+b); return p*3 >= p*5+(1-p)*1-1?"C":"D"; } },
  { name: "Exponential Backoff", category: "mathematical", description: "Waits exponentially longer before trusting after each betrayal.", fn: (my, their, r) => { if(r===0) return "C"; const d=their.filter(m=>m==="D").length; if(d===0) return "C"; return r-their.lastIndexOf("D") > Math.pow(2,Math.min(d,6))?"C":"D"; } },
  { name: "Sine Wave", category: "mathematical", description: "Cooperation oscillates sinusoidally.", fn: (my, their, r) => Math.random() < 0.5 + 0.4*Math.sin(r*0.15) ? "C" : "D" },
  { name: "Tidal", category: "mathematical", description: "20 rounds cooperate, 5 rounds defect, repeating.", fn: (my, their, r) => r%25<20?"C":"D" },
  { name: "E Strategy", category: "mathematical", description: "Uses digits of Euler's number to decide.", fn: (my, their, r) => { const d="27182818284590452353602874713526624977572470936999"; return parseInt(d[r%d.length])%2===0?"C":"D"; } },
  { name: "Game Theorist", category: "mathematical", description: "Estimates opponent type and best-responds.", fn: (my, their, r) => { if(r<5) return "C"; let tm=0; for(let i=1;i<their.length;i++){if(their[i]===my[i-1])tm++;} const tr=tm/(their.length-1); const cr=their.filter(m=>m==="C").length/their.length; if(tr>0.8) return "C"; if(cr>0.8) return "D"; if(cr<0.2) return "D"; return their[r-1]; } },
];

// --- TOURNAMENT ENGINE (payoffs now threaded through) ---
function applyNoise(move, noiseLevel) {
  if (noiseLevel > 0 && Math.random() < noiseLevel) return move === "C" ? "D" : "C";
  return move;
}

function runMatch(s1, s2, rounds, noise = 0, payoffs = DEFAULT_PAYOFFS) {
  const h1 = [], h2 = [];
  let score1 = 0, score2 = 0;
  for (let r = 0; r < rounds; r++) {
    let m1 = s1.fn(h1, h2, r, rounds, payoffs);
    let m2 = s2.fn(h2, h1, r, rounds, payoffs);
    m1 = applyNoise(m1, noise);
    m2 = applyNoise(m2, noise);
    score1 += payoffs[m1 + m2][0];
    score2 += payoffs[m1 + m2][1];
    h1.push(m1);
    h2.push(m2);
  }
  return { score1, score2, history1: h1, history2: h2 };
}

function runTournament(strategies, rounds, noise = 0, payoffs = DEFAULT_PAYOFFS) {
  const n = strategies.length;
  const scores = new Array(n).fill(0);
  const matchResults = {};
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const result = runMatch(strategies[i], strategies[j], rounds, noise, payoffs);
      scores[i] += result.score1;
      scores[j] += result.score2;
      matchResults[`${i}-${j}`] = result;
    }
  }
  const standings = strategies.map((s, i) => ({
    index: i,
    name: s.name,
    category: s.category,
    score: scores[i],
    avgPerMatch: scores[i] / (n - 1),
    avgPerRound: scores[i] / ((n - 1) * rounds),
  })).sort((a, b) => b.score - a.score);
  return { standings, matchResults, scores };
}

function runEvolution(strategies, rounds, noise = 0, generations = 80, initPops = null, payoffs = DEFAULT_PAYOFFS) {
  const n = strategies.length;
  let populations = initPops ? initPops.slice() : new Array(n).fill(1 / n);
  const history = [populations.slice()];
  const EXTINCTION = 0.0005;
  const SELECTION_PRESSURE = 3;

  const pairScores = {};
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        const r = runMatch(strategies[i], strategies[j], rounds, noise, payoffs);
        pairScores[`${i}-${j}`] = r.score1;
      } else if (i < j) {
        const r = runMatch(strategies[i], strategies[j], rounds, noise, payoffs);
        pairScores[`${i}-${j}`] = r.score1;
        pairScores[`${j}-${i}`] = r.score2;
      }
    }
  }

  for (let gen = 0; gen < generations; gen++) {
    const fitness = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (populations[i] < EXTINCTION) { populations[i] = 0; continue; }
      for (let j = 0; j < n; j++) {
        if (populations[j] < EXTINCTION) continue;
        fitness[i] += (pairScores[`${i}-${j}`] || 0) * populations[j];
      }
    }
    const avgFitness = fitness.reduce((a, b, i) => a + b * populations[i], 0);
    if (avgFitness > 0) {
      const newPops = populations.map((p, i) => {
        if (p < EXTINCTION) return 0;
        const rf = fitness[i] / avgFitness;
        return p * Math.pow(rf, SELECTION_PRESSURE);
      });
      const sum = newPops.reduce((a, b) => a + b, 0);
      populations = sum > 0 ? newPops.map(p => p / sum) : populations;
    }
    history.push(populations.slice());
  }
  return history;
}

// --- EXPORT ---
function exportCSV(standings, rounds, noise, payoffs) {
  const { T = 5, R = 3, P = 1, S = 0 } = {
    T: payoffs.DC[0], R: payoffs.CC[0], P: payoffs.DD[0], S: payoffs.CD[0]
  };
  const header = "Rank,Strategy,Category,Total Score,Avg Per Match,Avg Per Round\n";
  const rows = standings.map((s, i) =>
    `${i+1},${s.name},${s.category},${s.score},${s.avgPerMatch.toFixed(1)},${s.avgPerRound.toFixed(3)}`
  ).join("\n");
  const meta = `# PD Arena Tournament Results\n# Rounds: ${rounds} | Noise: ${(noise*100).toFixed(1)}% | Strategies: ${standings.length}\n# Payoffs: T=${T} R=${R} P=${P} S=${S}\n# Generated: ${new Date().toISOString()}\n\n`;
  const blob = new Blob([meta + header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pd-arena-results-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCanvasPNG(canvasRef, filename) {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "pd-arena-chart.png";
  a.click();
}

// --- FONTS & GLOBAL STYLES (injected once) ---
(function injectGlobals() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("pd-fonts")) {
    const fl = document.createElement("link");
    fl.id = "pd-fonts";
    fl.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=JetBrains+Mono:wght@400;500;700&display=swap";
    fl.rel = "stylesheet";
    document.head.appendChild(fl);
  }
  if (!document.getElementById("pd-globals")) {
    const st = document.createElement("style");
    st.id = "pd-globals";
    st.textContent = `
      html, body { margin:0; padding:0; background:${C.bg}; color:${C.ink}; }
      body {
        font-family: 'Fraunces','Georgia',serif;
        font-optical-sizing: auto;
        background-image:
          radial-gradient(circle at 20% 10%, rgba(212,163,115,0.04), transparent 50%),
          radial-gradient(circle at 80% 60%, rgba(178,58,58,0.03), transparent 50%);
        min-height: 100vh;
      }
      body::before {
        content:''; position: fixed; inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.3' /%3E%3C/svg%3E");
        opacity: 0.035; pointer-events: none; z-index: 1; mix-blend-mode: overlay;
      }
      .pd-root { position: relative; z-index: 2; }
      * { box-sizing: border-box; }
      .pd-link { color:${C.amber}; text-decoration:none; }
      .pd-link:hover { color:${C.amberHi}; }
      .pd-slider {
        -webkit-appearance: none; appearance: none;
        width: 100%; height: 2px; background: ${C.line}; outline: none; border-radius: 0;
      }
      .pd-slider::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 14px; height: 14px; background: ${C.amber};
        cursor: pointer; border-radius: 50%; border: none;
      }
      .pd-slider::-moz-range-thumb {
        width: 14px; height: 14px; background: ${C.amber};
        cursor: pointer; border-radius: 50%; border: none;
      }
      .pd-slider.rust::-webkit-slider-thumb { background: ${C.rust}; }
      .pd-slider.rust::-moz-range-thumb { background: ${C.rust}; }
      .pd-slider.paper::-webkit-slider-thumb { background: ${C.paper}; border: 2px solid ${C.bg}; width:16px; height:16px; }
      .pd-slider.paper::-moz-range-thumb { background: ${C.paper}; border: 2px solid ${C.bg}; width:16px; height:16px; }
      .pd-btn { transition: all 0.2s; }
      .pd-btn:hover:not(:disabled) { transform: translateY(-1px); }
      .pd-ghost:hover:not(:disabled) { border-color: ${C.amber} !important; color: ${C.amber} !important; }
      .pd-primary:hover:not(:disabled) { background: ${C.amberHi} !important; }
      .pd-card-hover { transition: border-color 0.2s, transform 0.2s; }
      .pd-card-hover:hover { border-color: ${C.amber} !important; }
      .pd-pulse::before { content:'●'; color:${C.rust}; margin-right:8px; animation: pdPulse 1.5s infinite; }
      @keyframes pdPulse { 50% { opacity: 0.3; } }
      ::selection { background: ${C.amber}; color: ${C.bg}; }
      table { border-collapse: collapse; }
    `;
    document.head.appendChild(st);
  }
})();

// --- STYLE HELPERS ---
const serif = "'Fraunces','Georgia',serif";
const mono = "'JetBrains Mono','SF Mono','Menlo',monospace";

function styles() {
  return {
    app: { fontFamily: serif, color: C.ink, minHeight: "100vh", position: "relative", zIndex: 2 },
    container: { maxWidth: 960, margin: "0 auto", padding: "32px 32px" },
    h1: {
      fontFamily: serif, fontWeight: 300, letterSpacing: "-0.02em",
      color: C.paper, lineHeight: 0.98, fontVariationSettings: '"opsz" 144',
      margin: 0,
    },
    h2: {
      fontFamily: serif, fontWeight: 300, letterSpacing: "-0.015em",
      color: C.paper, lineHeight: 1.05, margin: 0,
      fontVariationSettings: '"opsz" 144',
    },
    h3: {
      fontFamily: serif, fontWeight: 400, color: C.paper,
      margin: 0, letterSpacing: "-0.01em",
    },
    em: { fontStyle: "italic", color: C.amber, fontWeight: 400 },
    eyebrow: {
      fontFamily: mono, fontSize: 11, letterSpacing: "0.25em",
      color: C.amber, textTransform: "uppercase",
      display: "flex", alignItems: "center", gap: 12,
    },
    eyebrowDim: {
      fontFamily: mono, fontSize: 11, letterSpacing: "0.2em",
      color: C.inkFaint, textTransform: "uppercase",
    },
    lede: { fontSize: 17, color: C.inkDim, lineHeight: 1.6 },
    card: {
      background: C.bg2, border: `1px solid ${C.line}`,
      borderRadius: 2, padding: 24, marginBottom: 20,
      boxShadow: "0 0 0 1px rgba(212,163,115,0.03)",
    },
    mono: { fontFamily: mono },
    btn: {
      fontFamily: mono, fontSize: 12, letterSpacing: "0.1em",
      textTransform: "uppercase", fontWeight: 700,
      padding: "10px 18px", borderRadius: 2, border: "none",
      cursor: "pointer",
    },
    btnPrimary: { background: C.amber, color: C.bg },
    btnGhost: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` },
    chip: {
      fontFamily: mono, fontSize: 10, letterSpacing: "0.15em",
      textTransform: "uppercase", padding: "3px 8px",
      border: `1px solid ${C.line}`, color: C.inkDim,
      display: "inline-block",
    },
    input: {
      fontFamily: mono, fontSize: 13, padding: "10px 14px", borderRadius: 2,
      border: `1px solid ${C.line}`, background: C.bg2, color: C.ink,
      outline: "none", width: "100%",
    },
    dashHr: { border: "none", borderTop: `1px dashed ${C.line}`, margin: "20px 0" },
  };
}

const catColor = (cat) => STRATEGY_CATEGORIES.find(c => c.id === cat)?.color || C.amber;

// Earth-toned evolution palette
const EVO_COLORS = [
  "#d4a373", "#7a8c5c", "#b23a3a", "#f0c17e", "#9bae7a", "#d64545",
  "#c9a876", "#b8a47f", "#a39985", "#8a9b6d", "#cc8b5c", "#b8b0a0",
  "#e0b890", "#6d7e4f", "#af7a7a", "#d9c395", "#8d9873", "#c4967a",
  "#b5a89a", "#a89068", "#997766", "#d4b88a", "#7e8c6a", "#c0907a",
];

// ============================================================
// VISUALIZATION COMPONENTS
// ============================================================

function EvolutionChart({ data, strategies, width = 720, height = 380, onCanvasRef }) {
  const canvasRef = useRef(null);
  useEffect(() => { if (onCanvasRef) onCanvasRef(canvasRef); }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = { top: 20, right: 190, bottom: 40, left: 55 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + h - (i / 4) * h;
      ctx.setLineDash(i === 0 ? [] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = C.inkFaint;
    ctx.font = `10px ${mono}`;
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      ctx.fillText((i * 25) + "%", pad.left - 10, pad.top + h - (i/4)*h + 4);
    }
    ctx.textAlign = "center";
    const gs = Math.max(1, Math.ceil(data.length / 8));
    for (let i = 0; i < data.length; i += gs) {
      ctx.fillText(i.toString(), pad.left + (i/(data.length-1))*w, pad.top + h + 18);
    }
    ctx.fillStyle = C.inkDim;
    ctx.font = `10px ${mono}`;
    ctx.fillText("GENERATION", pad.left + w/2, pad.top + h + 32);

    const visible = [];
    for (let si = 0; si < strategies.length; si++) {
      const peak = Math.max(...data.map(d => d[si]));
      if (peak > 0.02) visible.push(si);
    }
    visible.sort((a, b) => data[data.length-1][b] - data[data.length-1][a]);

    visible.forEach((si, idx) => {
      const color = EVO_COLORS[idx % EVO_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let g = 0; g < data.length; g++) {
        const x = pad.left + (g / (data.length - 1)) * w;
        const y = pad.top + h - data[g][si] * h;
        g === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.globalAlpha = 0.07;
      ctx.lineTo(pad.left + w, pad.top + h);
      ctx.lineTo(pad.left, pad.top + h);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    let ly = pad.top;
    visible.slice(0, 12).forEach((si, idx) => {
      const fp = data[data.length-1][si];
      if (fp < 0.005) return;
      const color = EVO_COLORS[idx % EVO_COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(pad.left + w + 12, ly + 4, 8, 8);
      ctx.fillStyle = C.ink;
      ctx.font = `11px ${serif}`;
      ctx.textAlign = "left";
      const nm = strategies[si].name.length > 14 ? strategies[si].name.slice(0, 13) + "…" : strategies[si].name;
      ctx.fillText(nm, pad.left + w + 26, ly + 12);
      ctx.fillStyle = C.inkFaint;
      ctx.font = `10px ${mono}`;
      ctx.fillText(`${(fp*100).toFixed(1)}%`, pad.left + w + 135, ly + 12);
      ly += 19;
    });
  }, [data, strategies, width, height]);

  return <canvas ref={canvasRef} style={{ width: "100%", maxWidth: width, height, display: "block" }} />;
}

function HeatMap({ matchResults, strategies, standings, onSelectMatch }) {
  const canvasRef = useRef(null);
  const n = strategies.length;
  const cellSize = Math.min(28, Math.floor(500 / n));
  const labelW = 115;
  const w = labelW + n * cellSize + 10;
  const h = labelW + n * cellSize + 10;
  const sortedIdx = standings.map(s => s.index);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Rust → amber → leaf gradient for scores
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const colorFor = (ratio) => {
      // 0 = rust, 0.5 = amber, 1 = leaf
      if (ratio < 0.5) {
        const t = ratio * 2;
        return [lerp(178, 212, t), lerp(58, 163, t), lerp(58, 115, t)];
      } else {
        const t = (ratio - 0.5) * 2;
        return [lerp(212, 122, t), lerp(163, 140, t), lerp(115, 92, t)];
      }
    };

    for (let ri = 0; ri < n; ri++) {
      for (let ci = 0; ci < n; ci++) {
        const si = sortedIdx[ri], sj = sortedIdx[ci];
        const x = labelW + ci * cellSize, y = labelW + ri * cellSize;
        if (si === sj) {
          ctx.fillStyle = C.bg3;
          ctx.fillRect(x, y, cellSize-1, cellSize-1);
          continue;
        }
        const key = si < sj ? `${si}-${sj}` : `${sj}-${si}`;
        const result = matchResults[key];
        if (!result) continue;
        const score = si < sj ? result.score1 : result.score2;
        const ratio = Math.max(0, Math.min(1, score / (200 * 5)));
        const [r, g, b] = colorFor(ratio);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, cellSize-1, cellSize-1);
      }
    }

    ctx.fillStyle = C.inkDim;
    ctx.font = `${Math.min(10, cellSize-4)}px ${mono}`;
    ctx.textAlign = "right";
    for (let i = 0; i < n; i++) {
      const nm = strategies[sortedIdx[i]].name;
      ctx.fillText(nm.length > 14 ? nm.slice(0,13)+"…" : nm, labelW-5, labelW+i*cellSize+cellSize/2+3);
    }
    ctx.textAlign = "left";
    for (let i = 0; i < n; i++) {
      const nm = strategies[sortedIdx[i]].name;
      ctx.save();
      ctx.translate(labelW+i*cellSize+cellSize/2, labelW-5);
      ctx.rotate(-Math.PI/4);
      ctx.fillText(nm.length > 14 ? nm.slice(0,13)+"…" : nm, 0, 0);
      ctx.restore();
    }
  }, [matchResults, strategies, standings, n]);

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = w/rect.width, sy = h/rect.height;
    const x = (e.clientX-rect.left)*sx - labelW;
    const y = (e.clientY-rect.top)*sy - labelW;
    const ci = Math.floor(x/cellSize), ri = Math.floor(y/cellSize);
    if (ci>=0 && ci<n && ri>=0 && ri<n && ci!==ri) onSelectMatch(sortedIdx[ri], sortedIdx[ci]);
  };

  return <canvas ref={canvasRef} style={{ width: Math.min(w,680), height: Math.min(h,680), cursor: "pointer" }} onClick={handleClick} />;
}

function MatchReplay({ s1, s2, history1, history2, score1, score2, rounds, payoffs }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 720, H = 200;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W*dpr; canvas.height = H*dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = {top:20,right:12,bottom:28,left:48};
    const cw = W-pad.left-pad.right, ch = H-pad.top-pad.bottom;
    let c1=0,c2=0;
    const sc1=[],sc2=[];
    for (let i=0;i<rounds;i++) {
      c1 += payoffs[history1[i]+history2[i]][0];
      c2 += payoffs[history1[i]+history2[i]][1];
      sc1.push(c1); sc2.push(c2);
    }
    const mx = Math.max(c1,c2,1);

    // dashed gridlines
    ctx.strokeStyle = C.line;
    ctx.setLineDash([2,4]);
    for (let i=1;i<=3;i++) {
      const y = pad.top + (i/4)*ch;
      ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+cw,y); ctx.stroke();
    }
    ctx.setLineDash([]);

    [{d:sc1,c:C.amber},{d:sc2,c:C.leafHi}].forEach(({d,c:col}) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath();
      d.forEach((v,i) => {
        const x=pad.left+(i/(rounds-1))*cw, y=pad.top+ch-(v/mx)*ch;
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      });
      ctx.stroke();
    });

    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left,pad.top+ch); ctx.lineTo(pad.left+cw,pad.top+ch); ctx.stroke();
    ctx.fillStyle = C.inkFaint; ctx.font = `10px ${mono}`; ctx.textAlign = "center";
    for (let i=0;i<=4;i++) {
      const r=Math.round(i/4*rounds);
      ctx.fillText(r.toString(), pad.left+(r/rounds)*cw, pad.top+ch+16);
    }
  }, [history1, history2, rounds, payoffs]);

  const stripW = Math.max(2, Math.min(6, 640/rounds));
  const winner = score1>score2?s1.name:score2>score1?s2.name:null;

  return (
    <div>
      <div style={{display:"flex",gap:20,marginBottom:14,alignItems:"baseline",flexWrap:"wrap"}}>
        <span style={{color:C.amber,fontFamily:serif,fontSize:18,fontWeight:500}}>{s1.name}: <span style={{fontVariationSettings:'"opsz" 144'}}>{score1}</span></span>
        <span style={{color:C.inkFaint,fontFamily:mono,fontSize:11,letterSpacing:"0.2em"}}>VS</span>
        <span style={{color:C.leafHi,fontFamily:serif,fontSize:18,fontWeight:500}}>{s2.name}: <span style={{fontVariationSettings:'"opsz" 144'}}>{score2}</span></span>
        <span style={{marginLeft:"auto",color:winner?C.amber:C.inkDim,fontSize:11,fontFamily:mono,letterSpacing:"0.15em",textTransform:"uppercase"}}>
          {winner ? `${winner} wins` : "Draw"}
        </span>
      </div>
      <canvas ref={canvasRef} style={{width:720,height:200,display:"block",maxWidth:"100%"}} />
      <div style={{marginTop:12}}>
        <div style={{fontSize:10,color:C.inkFaint,marginBottom:6,fontFamily:mono,letterSpacing:"0.2em",textTransform:"uppercase"}}>Round-by-round</div>
        <div style={{display:"flex",overflowX:"auto",paddingBottom:4}}>
          {history1.map((m1,i) => (
            <div key={i} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}
              style={{width:stripW,height:28,display:"flex",flexDirection:"column",cursor:"pointer"}}>
              <div style={{flex:1,backgroundColor:m1==="C"?C.amber:C.rust,opacity:0.9}} />
              <div style={{flex:1,backgroundColor:history2[i]==="C"?C.amber:C.rust,opacity:0.55}} />
            </div>
          ))}
        </div>
        {hovered !== null && (
          <div style={{fontSize:12,color:C.ink,marginTop:8,fontFamily:mono,letterSpacing:"0.05em"}}>
            Round {hovered+1} · {s1.name} <span style={{color:history1[hovered]==="C"?C.amber:C.rust}}>{history1[hovered]}</span>
            {" · "}{s2.name} <span style={{color:history2[hovered]==="C"?C.amber:C.rust}}>{history2[hovered]}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// NEW: EDITABLE PAYOFF MATRIX (T/R/P/S sliders)
// ============================================================
function PayoffMatrixEditor({ T, R, P, S, onChange }) {
  const valid = validPD(T, R, P, S);
  const reset = () => onChange({ T: 5, R: 3, P: 1, S: 0 });

  const cellStyle = (bg) => ({
    padding: "26px 16px",
    border: `1px solid ${C.line}`,
    background: bg,
    textAlign: "center",
  });

  const Cell = ({ top, sub, bg }) => (
    <div style={cellStyle(bg)}>
      <div style={{fontFamily:serif,fontSize:30,color:C.paper,lineHeight:1,fontVariationSettings:'"opsz" 144'}}>{top}</div>
      <div style={{fontFamily:mono,fontSize:10,color:C.inkFaint,letterSpacing:"0.15em",textTransform:"uppercase",marginTop:8}}>{sub}</div>
    </div>
  );

  const Slider = ({ k, min, max, label }) => (
    <div style={{display:"grid",gridTemplateColumns:"80px 1fr 36px",gap:14,alignItems:"center"}}>
      <label style={{fontFamily:mono,fontSize:10,color:C.inkDim,letterSpacing:"0.15em",textTransform:"uppercase"}}>
        {k} <span style={{color:C.inkFaint}}>· {label}</span>
      </label>
      <input type="range" min={min} max={max} step={1} value={{T,R,P,S}[k]}
        onChange={e => onChange({ T, R, P, S, [k]: parseInt(e.target.value, 10) })}
        className="pd-slider" />
      <span style={{fontFamily:serif,fontSize:20,color:C.paper,textAlign:"right",fontVariationSettings:'"opsz" 144'}}>{{T,R,P,S}[k]}</span>
    </div>
  );

  return (
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:32,alignItems:"start"}}>
      {/* matrix visual */}
      <div style={{fontFamily:mono}}>
        <div style={{display:"grid",gridTemplateColumns:"56px 1fr 1fr",gridTemplateRows:"36px 1fr 1fr",background:C.bg2,border:`1px solid ${C.line}`,padding:20}}>
          <div></div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,letterSpacing:"0.15em",color:C.amber,textTransform:"uppercase"}}>Coop</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,letterSpacing:"0.15em",color:C.rust,textTransform:"uppercase"}}>Defect</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,letterSpacing:"0.15em",color:C.amber,textTransform:"uppercase"}}>C</div>
          <Cell top={`${R}, ${R}`} sub="reward" bg="rgba(212,163,115,0.08)" />
          <Cell top={`${S}, ${T}`} sub="sucker · temptation" bg="rgba(178,58,58,0.08)" />
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,letterSpacing:"0.15em",color:C.rust,textTransform:"uppercase"}}>D</div>
          <Cell top={`${T}, ${S}`} sub="temptation · sucker" bg="rgba(178,58,58,0.08)" />
          <Cell top={`${P}, ${P}`} sub="punishment" bg="rgba(92,84,70,0.15)" />
        </div>
      </div>

      {/* controls */}
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{fontFamily:mono,fontSize:10,letterSpacing:"0.25em",color:C.amber,textTransform:"uppercase",display:"flex",alignItems:"center",gap:12}}>
          <span style={{width:24,height:1,background:"currentColor",display:"inline-block"}}></span>
          Payoffs · editable
        </div>
        <Slider k="T" min={3} max={10} label="temptation" />
        <Slider k="R" min={2} max={8} label="reward" />
        <Slider k="P" min={0} max={5} label="punishment" />
        <Slider k="S" min={-3} max={3} label="sucker" />
        <div style={{fontFamily:mono,fontSize:11,lineHeight:1.6,color:valid?C.leaf:C.rustHi,letterSpacing:"0.03em",marginTop:4}}>
          {valid
            ? `✓ Valid PD · T(${T}) > R(${R}) > P(${P}) > S(${S}), 2R(${2*R}) > T+S(${T+S})`
            : `✗ Not a valid Prisoner's Dilemma. Need T > R > P > S and 2R > T+S.`}
        </div>
        <button onClick={reset} className="pd-btn pd-ghost" style={{...styles().btn,...styles().btnGhost,fontSize:10,padding:"7px 14px",alignSelf:"flex-start"}}>Reset to Axelrod</button>
      </div>
    </div>
  );
}

// ============================================================
// NEW: TIPPING-POINT SIMULATOR
// ============================================================
const TIPPING_STRATS = [
  { name: "Tit-for-Tat",    nice: true,  fn: p => 1.2 + 1.8*p },
  { name: "Pavlov",         nice: true,  fn: p => 1.0 + 1.9*p },
  { name: "Grudger",        nice: true,  fn: p => 0.9 + 1.9*p },
  { name: "Soft Majority",  nice: true,  fn: p => 1.1 + 1.7*p },
  { name: "Always Coop.",   nice: true,  fn: p => 0.2 + 3.0*p },
  { name: "Random",         nice: false, fn: p => 1.2 + 0.5*p },
  { name: "Detective",      nice: false, fn: p => 1.3 + 1.4*p },
  { name: "Joss",           nice: false, fn: p => 1.0 + 1.5*p },
  { name: "Always Defect",  nice: false, fn: p => 1.8 + 0.6*p },
];

function TippingPointSim() {
  const [nicePct, setNicePct] = useState(60);
  const p = nicePct / 100;
  const niceN = nicePct;
  const badN = 100 - nicePct;

  const scored = TIPPING_STRATS
    .map(s => ({ name: s.name, nice: s.nice, score: s.fn(p) }))
    .sort((a, b) => b.score - a.score);
  const winner = scored[0];

  const verdict = nicePct < 50
    ? <><strong style={{color:C.amber}}>Defection dominates.</strong> With only {nicePct}% nice agents, Always Defect exploits enough naive cooperators to outscore everyone else. Tit-for-Tat survives but can't win — it spends too much time in retaliation loops.</>
    : nicePct < 85
    ? <><strong style={{color:C.amber}}>Tit-for-Tat's sweet spot.</strong> At {nicePct}% nice, reciprocity beats both naive cooperation and pure defection. This is Axelrod's core finding — robust, not optimal, but hard to beat.</>
    : <><strong style={{color:C.amber}}>Nice collapses into naïveté.</strong> With {nicePct}% nice agents there are almost no defectors to punish, so Always Cooperate — usually the sucker — pulls ahead. TFT pays a small tax for its vigilance.</>;

  const dots = [];
  for (let i = 0; i < 100; i++) dots.push(i < niceN);

  return (
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1.2fr)",gap:48,alignItems:"start"}}>
      {/* Pool visualization */}
      <div style={{background:C.bg2,border:`1px solid ${C.line}`,padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",fontFamily:mono,fontSize:10,letterSpacing:"0.2em",color:C.inkFaint,textTransform:"uppercase",marginBottom:14}}>
          <span>Population of 100</span>
          <span>Nice · Bad</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(20,1fr)",gap:4,marginBottom:24}}>
          {dots.map((isNice, i) => (
            <div key={i} style={{aspectRatio:"1",borderRadius:"50%",background:isNice?C.leaf:C.rust,transition:"background 0.2s"}} />
          ))}
        </div>

        <div style={{marginBottom:12}}>
          <label style={{fontFamily:mono,fontSize:10,letterSpacing:"0.15em",color:C.inkDim,textTransform:"uppercase",display:"block",marginBottom:8}}>Nice agents %</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 50px",gap:16,alignItems:"center"}}>
            <input
              type="range" min="0" max="100" value={nicePct}
              onChange={e => setNicePct(parseInt(e.target.value, 10))}
              className="pd-slider paper"
              style={{background:`linear-gradient(to right, ${C.rust} 0%, ${C.rust} ${100-nicePct}%, ${C.leaf} ${100-nicePct}%, ${C.leaf} 100%)`}}
            />
            <span style={{fontFamily:serif,fontSize:24,color:C.paper,textAlign:"right",fontVariationSettings:'"opsz" 144'}}>{nicePct}</span>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,fontFamily:mono,fontSize:11,letterSpacing:"0.1em"}}>
          <div style={{padding:10,border:`1px solid ${C.line}`,color:C.leaf}}>NICE: {niceN}</div>
          <div style={{padding:10,border:`1px solid ${C.line}`,color:C.rustHi}}>BAD: {badN}</div>
        </div>
      </div>

      {/* Chart panel */}
      <div style={{background:C.bg2,border:`1px solid ${C.line}`,padding:24,minHeight:380}}>
        <div style={{display:"flex",justifyContent:"space-between",fontFamily:mono,fontSize:10,letterSpacing:"0.2em",color:C.inkFaint,textTransform:"uppercase",marginBottom:20}}>
          <span>Average score per round</span>
          <span>Winner · <span style={{color:C.amber}}>{winner.name}</span></span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {scored.map((s, i) => {
            const pct = (s.score / 3.2) * 100;
            const isWinner = i === 0;
            const barColor = isWinner ? C.amber : (s.nice ? C.leaf : C.rust);
            return (
              <div key={s.name} style={{display:"grid",gridTemplateColumns:"110px 1fr 46px",gap:14,alignItems:"center"}}>
                <div style={{fontFamily:mono,fontSize:10,color:C.inkDim,textAlign:"right"}}>{s.name}</div>
                <div style={{height:20,border:`1px solid ${C.line}`,background:"rgba(255,255,255,0.02)",position:"relative"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:barColor,transition:"width 0.35s cubic-bezier(0.4,0,0.2,1), background 0.3s",boxShadow:isWinner?"0 0 12px rgba(212,163,115,0.4)":"none",position:"relative"}}>
                    {isWinner && <span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",color:C.bg,fontFamily:mono,fontSize:9,fontWeight:700,letterSpacing:"0.1em"}}>◆ WINS</span>}
                  </div>
                </div>
                <div style={{fontFamily:serif,fontSize:14,color:C.paper,textAlign:"right",fontVariationSettings:'"opsz" 144'}}>{s.score.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:24,padding:16,borderLeft:`2px solid ${C.amber}`,background:"rgba(212,163,115,0.04)",fontFamily:serif,fontSize:15,lineHeight:1.55,color:C.ink}}>
          {verdict}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ABOUT PAGE
// ============================================================
function AboutPage({ onBack }) {
  const s = styles();
  return (
    <div style={s.app} className="pd-root">
      <div style={{...s.container, maxWidth: 720}}>
        <button onClick={onBack} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,marginBottom:28,fontSize:11}}>← Back</button>
        <h1 style={{...s.h1,fontSize:48,marginBottom:32}}>About <em style={s.em}>PD Arena</em></h1>

        <div style={s.card}>
          <h3 style={{...s.h3,fontSize:22,marginBottom:12}}>What is this?</h3>
          <p style={{color:C.inkDim,lineHeight:1.7,fontSize:15}}>
            PD Arena is an interactive simulator for the iterated Prisoner's Dilemma — the most studied game in game theory. Pit dozens of strategies against each other in round-robin tournaments, observe evolutionary dynamics, and experiment with noise to see how cooperation emerges (or collapses) under different conditions.
          </p>
        </div>

        <div style={s.card}>
          <h3 style={{...s.h3,fontSize:22,marginBottom:12}}>Methodology</h3>
          <p style={{color:C.inkDim,lineHeight:1.7,fontSize:15}}>
            <strong style={{color:C.paper}}>Tournament format:</strong> Every strategy plays every other strategy in a head-to-head match. Each match consists of a configurable number of rounds (default 200). Strategies are ranked by total cumulative score.
          </p>
          <p style={{color:C.inkDim,lineHeight:1.7,fontSize:15,marginTop:14}}>
            <strong style={{color:C.paper}}>Payoff matrix:</strong> Default payoffs follow Axelrod — R=3, T=5, S=0, P=1 — satisfying T &gt; R &gt; P &gt; S and 2R &gt; T + S. You can edit all four values; the tournament will re-score accordingly.
          </p>
          <p style={{color:C.inkDim,lineHeight:1.7,fontSize:15,marginTop:14}}>
            <strong style={{color:C.paper}}>Noise:</strong> When noise is enabled, each move has a probability of being flipped. Models communication errors and trembling hands, per Nowak &amp; Sigmund (1993).
          </p>
          <p style={{color:C.inkDim,lineHeight:1.7,fontSize:15,marginTop:14}}>
            <strong style={{color:C.paper}}>Evolution:</strong> Replicator dynamics with selection pressure. Strategies reproduce proportionally to fitness (average score weighted by population share). You can seed the initial population manually or via presets.
          </p>
        </div>

        <div style={s.card}>
          <h3 style={{...s.h3,fontSize:22,marginBottom:12}}>Key references</h3>
          <div style={{color:C.inkDim,fontSize:14,lineHeight:1.85}}>
            <p>Axelrod, R. (1984). <em style={{color:C.ink}}>The Evolution of Cooperation</em>. Basic Books.</p>
            <p>Axelrod, R. (1980). "Effective Choice in the Prisoner's Dilemma." <em>Journal of Conflict Resolution</em>, 24(1), 3-25.</p>
            <p>Nowak, M. &amp; Sigmund, K. (1993). "A strategy of win-stay, lose-shift that outperforms tit-for-tat." <em>Nature</em>, 364, 56-58.</p>
            <p>Nowak, M. &amp; Sigmund, K. (1992). "Tit for tat in heterogeneous populations." <em>Nature</em>, 355, 250-253.</p>
            <p>Press, W.H. &amp; Dyson, F.J. (2012). "Iterated Prisoner's Dilemma contains strategies that dominate any evolutionary opponent." <em>PNAS</em>, 109(26).</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function PDArena() {
  const [view, setView] = useState("home");
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [rounds, setRounds] = useState(200);
  const [noise, setNoise] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [tournamentResults, setTournamentResults] = useState(null);
  const [evolutionData, setEvolutionData] = useState(null);
  const [resultTab, setResultTab] = useState("standings");
  const [replayMatch, setReplayMatch] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStrategy, setAiStrategy] = useState(null);
  const [customStrategies, setCustomStrategies] = useState([]);
  const [evoPreset, setEvoPreset] = useState("equal");
  const [cooperatorBias, setCooperatorBias] = useState(50); // for custom seeding, 0..100
  const [payoffsTRPS, setPayoffsTRPS] = useState({ T: 5, R: 3, P: 1, S: 0 });
  const evoCanvasRef = useRef(null);

  const s = styles();
  const allStrategies = useMemo(() => [...STRATEGIES, ...customStrategies], [customStrategies]);

  const payoffs = useMemo(
    () => buildPayoffs(payoffsTRPS.T, payoffsTRPS.R, payoffsTRPS.P, payoffsTRPS.S),
    [payoffsTRPS]
  );
  const payoffsValid = validPD(payoffsTRPS.T, payoffsTRPS.R, payoffsTRPS.P, payoffsTRPS.S);

  const filteredStrategies = useMemo(() => {
    let list = allStrategies;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(x => x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
    }
    if (categoryFilter) list = list.filter(x => x.category === categoryFilter);
    return list;
  }, [allStrategies, searchQuery, categoryFilter]);

  const toggleStrategy = (idx) => setSelectedStrategies(p => p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx]);
  const selectAll = () => setSelectedStrategies(allStrategies.map((_, i) => i));
  const selectNone = () => setSelectedStrategies([]);
  const selectClassic10 = () => setSelectedStrategies([0,1,2,3,4,5,6,7,8,9]);

  // Compute initial populations for a preset + a list of strategies
  const makeInitPops = useCallback((strats, preset, bias, standings) => {
    const n = strats.length;
    let ip = null;
    if (preset === "equal") return null; // uniform
    if (preset === "top_heavy" && standings) {
      ip = new Array(n).fill(0.4 / n);
      standings.slice(0, 3).forEach(st => {
        const localIdx = strats.findIndex(s => s.name === st.name);
        if (localIdx >= 0) ip[localIdx] = 0.2;
      });
    } else if (preset === "cooperators_dominant") {
      ip = new Array(n).fill(0);
      strats.forEach((st, i) => {
        ip[i] = ["cooperative", "forgiving", "classic"].includes(st.category) ? 2/n : 0.5/n;
      });
    } else if (preset === "defectors_dominant") {
      ip = new Array(n).fill(0);
      strats.forEach((st, i) => {
        ip[i] = ["aggressive", "retaliatory"].includes(st.category) ? 2/n : 0.5/n;
      });
    } else if (preset === "custom") {
      // bias is 0..100 — 0 = all bad, 100 = all nice
      const p = bias / 100;
      const niceN = strats.filter(st => NICE_CATS.has(st.category)).length || 1;
      const badN = strats.filter(st => BAD_CATS.has(st.category)).length || 1;
      const neutralN = n - niceN - badN || 1;
      ip = strats.map(st => {
        if (NICE_CATS.has(st.category)) return p / niceN;
        if (BAD_CATS.has(st.category)) return (1 - p) / badN;
        return 0.0001; // tiny mass to neutral so they don't vanish instantly
      });
    }
    if (!ip) return null;
    const sum = ip.reduce((a, b) => a + b, 0);
    return sum > 0 ? ip.map(v => v / sum) : null;
  }, []);

  const runTournamentHandler = useCallback(() => {
    if (selectedStrategies.length < 2) return;
    if (!payoffsValid) return;
    setIsRunning(true);
    setView("results");
    setResultTab("standings");
    setReplayMatch(null);
    setTimeout(() => {
      const strats = selectedStrategies.map(i => allStrategies[i]);
      const results = runTournament(strats, rounds, noise, payoffs);
      setTournamentResults({ ...results, strategies: strats, indices: selectedStrategies, payoffs });
      const initPops = makeInitPops(strats, evoPreset, cooperatorBias, results.standings);
      const evoData = runEvolution(strats, rounds, noise, 80, initPops, payoffs);
      setEvolutionData(evoData);
      setIsRunning(false);
    }, 50);
  }, [selectedStrategies, rounds, noise, allStrategies, evoPreset, cooperatorBias, payoffs, payoffsValid, makeInitPops]);

  const handleMatchSelect = (i, j) => {
    // i, j are local indices into the tournament's strategies array
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    const result = tournamentResults.matchResults[key];
    if (!result) return;
    setReplayMatch({
      s1: tournamentResults.strategies[i < j ? i : j],
      s2: tournamentResults.strategies[i < j ? j : i],
      ...result,
    });
    setResultTab("replay");
  };

  // AI Strategy Creator
  const createAIStrategy = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiStrategy(null);
    try {
      const response = await fetch("/api/create-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim().slice(0, 1000) }),
      });
      if (response.status === 429) { setAiStrategy({ error: "Rate limit reached — 10 strategies per hour. Try again later." }); setAiLoading(false); return; }
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "AI service unavailable."); }
      const data = await response.json();
      const text = data.content.map(c => c.text || "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const fn = new Function("myHistory","theirHistory","round","totalRounds","payoffs", `return (${parsed.code})(myHistory,theirHistory,round,totalRounds,payoffs);`);
      fn([],[],0,200,payoffs); fn(["C"],["D"],1,200,payoffs); fn(["C","D","C"],["D","C","D"],3,200,payoffs);
      const newStrat = { name: parsed.name, category: parsed.category || "adaptive", description: parsed.description, fn, isCustom: true };
      setAiStrategy(newStrat);
      setCustomStrategies(prev => [...prev, newStrat]);
      setAiPrompt("");
    } catch (e) { setAiStrategy({ error: e.message }); }
    setAiLoading(false);
  };

  // ==================== ABOUT VIEW ====================
  if (view === "about") return <AboutPage onBack={() => setView("home")} />;

  // ==================== LIBRARY VIEW ====================
  if (view === "library") {
    return (
      <div style={s.app} className="pd-root">
        <div style={s.container}>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:28,flexWrap:"wrap"}}>
            <button onClick={() => setView("home")} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,padding:"7px 14px",fontSize:10}}>← Back</button>
            <h2 style={{...s.h2,fontSize:32}}>Strategy <em style={s.em}>library</em></h2>
            <span style={{...s.mono,color:C.inkDim,fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",marginLeft:"auto"}}>{allStrategies.length} strategies</span>
          </div>

          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search strategies…" style={{...s.input,marginBottom:14}} />

          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24}}>
            <button onClick={() => setCategoryFilter(null)} style={{...s.chip,cursor:"pointer",background:!categoryFilter?"rgba(212,163,115,0.1)":"transparent",borderColor:!categoryFilter?C.amber:C.line,color:!categoryFilter?C.amber:C.inkDim}}>All</button>
            {STRATEGY_CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setCategoryFilter(categoryFilter===cat.id?null:cat.id)}
                style={{...s.chip,cursor:"pointer",background:categoryFilter===cat.id?`${cat.color}15`:"transparent",borderColor:categoryFilter===cat.id?cat.color:C.line,color:categoryFilter===cat.id?cat.color:C.inkDim}}>{cat.label}</button>
            ))}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filteredStrategies.map(strat => {
              const idx = allStrategies.indexOf(strat);
              const sel = selectedStrategies.includes(idx);
              const nice = NICE_CATS.has(strat.category);
              return (
                <div key={idx} onClick={() => toggleStrategy(idx)}
                  className="pd-card-hover"
                  style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",background:sel?`${catColor(strat.category)}12`:C.bg2,border:`1px solid ${sel?catColor(strat.category):C.line}`,cursor:"pointer"}}>
                  <div style={{width:18,height:18,border:`1px solid ${sel?catColor(strat.category):C.inkFaint}`,background:sel?catColor(strat.category):"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.bg,fontWeight:700,flexShrink:0,borderRadius:2}}>{sel&&"✓"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
                      <span style={{fontFamily:serif,fontWeight:500,fontSize:17,color:C.paper}}>{strat.name}</span>
                      <span style={{...s.chip,color:catColor(strat.category),borderColor:`${catColor(strat.category)}60`,background:`${catColor(strat.category)}10`}}>{strat.category}</span>
                      <span style={{...s.chip,color:nice?C.leaf:C.rustHi,borderColor:nice?`${C.leaf}60`:`${C.rust}60`,background:nice?"rgba(122,140,92,0.08)":"rgba(178,58,58,0.08)"}}>{nice?"nice":"bad"}</span>
                      {strat.isCustom && <span style={{...s.chip,color:C.amber,borderColor:`${C.amber}60`,background:"rgba(212,163,115,0.1)"}}>AI</span>}
                    </div>
                    <div style={{color:C.inkDim,fontSize:14,marginTop:4,lineHeight:1.5}}>{strat.description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{position:"sticky",bottom:0,background:`linear-gradient(transparent,${C.bg} 30%)`,padding:"40px 0 20px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{...s.mono,color:C.inkDim,fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase"}}>{selectedStrategies.length} selected</span>
            <div style={{flex:1}} />
            <button onClick={() => setView("home")} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost}}>Configure →</button>
            <button onClick={runTournamentHandler} disabled={selectedStrategies.length<2||!payoffsValid} className="pd-btn pd-primary" style={{...s.btn,...s.btnPrimary,opacity:(selectedStrategies.length<2||!payoffsValid)?0.4:1}}>Run Tournament</button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RESULTS VIEW ====================
  if (view === "results") {
    if (isRunning) {
      return (
        <div style={s.app} className="pd-root">
          <div style={{...s.container,textAlign:"center",paddingTop:120}}>
            <div style={{...s.mono,fontSize:11,letterSpacing:"0.25em",color:C.amber,marginBottom:16,textTransform:"uppercase"}} className="pd-pulse">Running tournament</div>
            <div style={{color:C.inkDim,fontSize:14,fontFamily:mono,letterSpacing:"0.08em"}}>{selectedStrategies.length} strategies × {rounds} rounds{noise>0?` · ${(noise*100).toFixed(1)}% noise`:""}</div>
          </div>
        </div>
      );
    }
    if (!tournamentResults) return null;
    const { standings, matchResults: mr, strategies: strats, payoffs: resultPayoffs } = tournamentResults;
    const tabs = [{id:"standings",label:"Standings"},{id:"heatmap",label:"Heat Map"},{id:"evolution",label:"Evolution"},{id:"replay",label:"Match Replay"}];

    return (
      <div style={s.app} className="pd-root">
        <div style={s.container}>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:28,flexWrap:"wrap"}}>
            <button onClick={() => setView("home")} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,padding:"7px 14px",fontSize:10}}>← New</button>
            <h2 style={{...s.h2,fontSize:32}}>Tournament <em style={s.em}>results</em></h2>
            {noise > 0 && <span style={{...s.chip,color:C.rustHi,borderColor:`${C.rust}60`,background:"rgba(178,58,58,0.08)"}}>Noise {(noise*100).toFixed(1)}%</span>}
          </div>

          <div style={{display:"flex",gap:0,marginBottom:28,borderBottom:`1px solid ${C.line}`}}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setResultTab(t.id)}
                style={{...s.btn,background:"transparent",color:resultTab===t.id?C.amber:C.inkDim,borderBottom:resultTab===t.id?`1px solid ${C.amber}`:"1px solid transparent",borderRadius:0,padding:"12px 20px",marginBottom:-1,fontWeight:700}}>{t.label}</button>
            ))}
          </div>

          {/* STANDINGS */}
          {resultTab === "standings" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:28}}>
                {standings.slice(0,3).map((entry,idx) => {
                  const rankColor = [C.amber, C.inkDim, "#8a6a48"][idx];
                  const medal = ["1st","2nd","3rd"][idx];
                  return (
                    <div key={entry.index} style={{background:C.bg2,border:`1px solid ${C.line}`,padding:24,textAlign:"center",position:"relative"}}>
                      <div style={{fontFamily:mono,fontSize:10,letterSpacing:"0.25em",color:rankColor,textTransform:"uppercase",marginBottom:12}}>◈ {medal}</div>
                      <div style={{fontFamily:serif,fontWeight:500,fontSize:20,color:C.paper,lineHeight:1.2}}>{entry.name}</div>
                      <div style={{marginTop:8}}>
                        <span style={{...s.chip,color:catColor(entry.category),borderColor:`${catColor(entry.category)}60`,background:`${catColor(entry.category)}10`}}>{entry.category}</span>
                      </div>
                      <div style={{fontFamily:serif,fontSize:42,fontWeight:300,color:rankColor,marginTop:14,fontVariationSettings:'"opsz" 144',lineHeight:1}}>{entry.score.toLocaleString()}</div>
                      <div style={{fontFamily:mono,fontSize:10,color:C.inkFaint,letterSpacing:"0.15em",marginTop:6,textTransform:"uppercase"}}>{entry.avgPerRound.toFixed(2)} per round</div>
                    </div>
                  );
                })}
              </div>

              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <button onClick={() => exportCSV(standings, rounds, noise, resultPayoffs)} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,fontSize:10}}>📥 Export CSV</button>
              </div>

              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",fontSize:14,fontFamily:serif}}>
                  <thead>
                    <tr style={{borderBottom:`1px dashed ${C.line}`}}>
                      {["#","Strategy","Category","Total","Avg/Round"].map((h,i) => (
                        <th key={h} style={{padding:"12px 14px",textAlign:i>=3?"right":"left",color:C.inkFaint,fontWeight:400,fontFamily:mono,fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((entry,rank) => (
                      <tr key={entry.index} style={{borderBottom:`1px solid ${C.line}`}}>
                        <td style={{padding:"12px 14px",fontFamily:mono,color:C.inkFaint,fontSize:12}}>{String(rank+1).padStart(2,"0")}</td>
                        <td style={{padding:"12px 14px",fontFamily:serif,fontWeight:500,color:C.paper,fontSize:15}}>{entry.name}</td>
                        <td style={{padding:"12px 14px"}}><span style={{...s.chip,color:catColor(entry.category),borderColor:`${catColor(entry.category)}60`,background:`${catColor(entry.category)}10`}}>{entry.category}</span></td>
                        <td style={{padding:"12px 14px",textAlign:"right",fontFamily:serif,fontSize:16,color:C.paper,fontVariationSettings:'"opsz" 144'}}>{entry.score.toLocaleString()}</td>
                        <td style={{padding:"12px 14px",textAlign:"right",fontFamily:mono,color:C.inkDim,fontSize:12}}>{entry.avgPerRound.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{marginTop:24,padding:20,borderLeft:`2px solid ${C.amber}`,background:"rgba(212,163,115,0.04)"}}>
                <div style={{fontFamily:mono,fontSize:10,color:C.amber,letterSpacing:"0.25em",marginBottom:10,textTransform:"uppercase"}}>Tournament Insight</div>
                <p style={{color:C.ink,fontSize:15,lineHeight:1.6,margin:0,fontFamily:serif}}>
                  {(() => {
                    const w = standings[0];
                    const nice = NICE_CATS.has(w.category);
                    const topCoop = standings.slice(0,5).filter(x => ["cooperative","forgiving","classic"].includes(x.category)).length;
                    if (noise > 0.03) {
                      return `With ${(noise*100).toFixed(1)}% noise, miscommunication reshapes everything. ${w.name} wins — ${nice?"forgiving strategies typically thrive here because they recover from accidental defections, unlike strict TFT which spirals into mutual retaliation.":"even aggressive strategies can succeed when noise disrupts cooperative handshakes."}`;
                    }
                    if (nice && topCoop >= 3) {
                      return `${w.name} wins — and ${topCoop} of the top 5 are cooperative. Axelrod's insight holds: in repeated interactions, niceness, forgiveness, and reciprocity dominate. Defectors burn bridges and pay the price.`;
                    }
                    return `${w.name} takes first with ${w.score.toLocaleString()} points. Check the Heat Map for individual matchups, or Evolution for long-term survival dynamics.`;
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* HEAT MAP */}
          {resultTab === "heatmap" && (
            <div>
              <p style={{color:C.inkDim,fontSize:15,marginBottom:20,lineHeight:1.6}}>Each cell shows a strategy's score against an opponent. <span style={{color:C.leaf}}>Leaf = high</span>, <span style={{color:C.amber}}>amber = middle</span>, <span style={{color:C.rust}}>rust = low</span>. Click any cell for the match replay.</p>
              <div style={{overflowX:"auto"}}><HeatMap matchResults={mr} strategies={strats} standings={standings} onSelectMatch={handleMatchSelect} /></div>
            </div>
          )}

          {/* EVOLUTION */}
          {resultTab === "evolution" && evolutionData && (
            <div>
              <p style={{color:C.inkDim,fontSize:15,marginBottom:18,lineHeight:1.6}}>Population dynamics over 80 generations. Strategies that score well grow; poor performers go extinct.</p>
              <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                {[
                  {id:"equal",label:"Equal start"},
                  {id:"top_heavy",label:"Winners boosted"},
                  {id:"cooperators_dominant",label:"Cooperators 80%"},
                  {id:"defectors_dominant",label:"Defectors 80%"},
                  {id:"custom",label:"Custom"},
                ].map(pr => (
                  <button key={pr.id} onClick={() => {
                    setEvoPreset(pr.id);
                    const ip = makeInitPops(strats, pr.id, cooperatorBias, standings);
                    setEvolutionData(runEvolution(strats, rounds, noise, 80, ip, resultPayoffs));
                  }}
                    style={{...s.chip,cursor:"pointer",background:evoPreset===pr.id?"rgba(212,163,115,0.12)":"transparent",borderColor:evoPreset===pr.id?C.amber:C.line,color:evoPreset===pr.id?C.amber:C.inkDim}}>{pr.label}</button>
                ))}
              </div>
              {evoPreset === "custom" && (
                <div style={{marginBottom:20,padding:16,border:`1px dashed ${C.line}`,background:"rgba(212,163,115,0.02)"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 60px",gap:16,alignItems:"center",marginBottom:8}}>
                    <label style={{fontFamily:mono,fontSize:10,letterSpacing:"0.15em",color:C.inkDim,textTransform:"uppercase"}}>Cooperator bias</label>
                    <span style={{fontFamily:serif,fontSize:20,color:C.paper,textAlign:"right",fontVariationSettings:'"opsz" 144'}}>{cooperatorBias}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={cooperatorBias}
                    onChange={e => {
                      const v = parseInt(e.target.value,10);
                      setCooperatorBias(v);
                      const ip = makeInitPops(strats, "custom", v, standings);
                      setEvolutionData(runEvolution(strats, rounds, noise, 80, ip, resultPayoffs));
                    }}
                    className="pd-slider paper"
                    style={{background:`linear-gradient(to right, ${C.rust} 0%, ${C.rust} ${100-cooperatorBias}%, ${C.leaf} ${100-cooperatorBias}%, ${C.leaf} 100%)`}}
                  />
                  <div style={{fontFamily:mono,fontSize:10,color:C.inkFaint,letterSpacing:"0.12em",textTransform:"uppercase",marginTop:10,display:"flex",justifyContent:"space-between"}}>
                    <span>All defectors</span><span>All cooperators</span>
                  </div>
                </div>
              )}
              <EvolutionChart data={evolutionData} strategies={strats} onCanvasRef={r => { evoCanvasRef.current = r?.current; }} />
              <div style={{marginTop:16}}>
                <button onClick={() => evoCanvasRef.current && exportCanvasPNG({current:evoCanvasRef.current}, "pd-arena-evolution.png")} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,fontSize:10}}>📥 Export PNG</button>
              </div>
            </div>
          )}

          {/* MATCH REPLAY */}
          {resultTab === "replay" && (
            <div>
              {replayMatch ? (
                <MatchReplay s1={replayMatch.s1} s2={replayMatch.s2} history1={replayMatch.history1} history2={replayMatch.history2} score1={replayMatch.score1} score2={replayMatch.score2} rounds={rounds} payoffs={resultPayoffs} />
              ) : (
                <div style={{textAlign:"center",padding:60,color:C.inkDim,border:`1px dashed ${C.line}`}}>
                  <p style={{fontFamily:serif,fontSize:18,marginBottom:16}}>Select a match from the Heat Map to see its replay.</p>
                  <button onClick={() => setResultTab("heatmap")} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost}}>Go to Heat Map →</button>
                </div>
              )}
              {replayMatch && standings && (
                <div style={{marginTop:32}}>
                  <div style={{fontFamily:mono,fontSize:10,color:C.inkFaint,letterSpacing:"0.25em",textTransform:"uppercase",marginBottom:10}}>Quick Replay</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {standings.slice(0,4).map((s1,i) =>
                      standings.slice(i+1,i+4).map(s2 => (
                        <button key={`${s1.index}-${s2.index}`} onClick={() => handleMatchSelect(s1.index,s2.index)}
                          style={{...s.chip,cursor:"pointer",color:C.inkDim}}>{s1.name} vs {s2.name}</button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== HOME VIEW ====================
  const popular = [0, 5, 2, 3, 8, 4, 1, 18]; // TFT, Pavlov, Always Defect, Random, Detective, Grudger, Always Cooperate, Bully
  return (
    <div style={s.app} className="pd-root">
      {/* Nav */}
      <nav style={{position:"sticky",top:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 48px",background:"rgba(12,10,9,0.75)",backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.line}`}}>
        <div style={{fontFamily:mono,fontWeight:700,fontSize:13,letterSpacing:"0.2em",color:C.amber}}>
          <span style={{color:C.rust,marginRight:6}}>◈</span>PD ARENA
        </div>
        <div style={{display:"flex",gap:28,fontFamily:mono,fontSize:12,color:C.inkDim,alignItems:"center"}}>
          <a href="#matrix" style={{color:"inherit",textDecoration:"none",letterSpacing:"0.05em"}}>Matrix</a>
          <a href="#strategies" style={{color:"inherit",textDecoration:"none",letterSpacing:"0.05em"}}>Strategies</a>
          <a href="#tipping" style={{color:"inherit",textDecoration:"none",letterSpacing:"0.05em"}}>Tipping</a>
          <button onClick={() => setView("about")} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,fontSize:10,padding:"8px 14px"}}>About</button>
        </div>
      </nav>

      <div style={{...s.container, maxWidth: 1080}}>
        {/* Hero */}
        <section style={{padding:"60px 0 40px"}}>
          <div style={s.eyebrow}>
            <span style={{width:32,height:1,background:C.amber,display:"inline-block"}}></span>
            Iterated Prisoner's Dilemma · research tool
          </div>
          <h1 style={{...s.h1,fontSize:"clamp(48px, 6.5vw, 84px)",marginTop:26,marginBottom:22}}>
            Why do nice guys<br/>finish <em style={s.em}>first?</em>
          </h1>
          <p style={{...s.lede, maxWidth: 600, marginBottom: 28}}>
            Run tournaments between <strong style={{color:C.ink,fontWeight:600}}>{allStrategies.length} strategies</strong> in the iterated Prisoner's Dilemma. Edit the payoff matrix, seed the population, watch evolution unfold. Discover what really wins.
          </p>
        </section>

        {/* PAYOFF MATRIX — EDITABLE */}
        <section id="matrix" style={{padding:"40px 0 60px"}}>
          <div style={s.eyebrow}>
            <span style={{width:24,height:1,background:"currentColor",display:"inline-block"}}></span>
            01 · Payoff Matrix
          </div>
          <h2 style={{...s.h2,fontSize:"clamp(28px, 3.6vw, 44px)",margin:"14px 0 14px"}}>
            Tune the <em style={s.em}>rules</em> of the game.
          </h2>
          <p style={{...s.lede, maxWidth: 600, marginBottom: 32}}>
            The tournament uses whatever payoffs you set here. Constraints: T &gt; R &gt; P &gt; S and 2R &gt; T+S.
          </p>
          <PayoffMatrixEditor
            T={payoffsTRPS.T} R={payoffsTRPS.R} P={payoffsTRPS.P} S={payoffsTRPS.S}
            onChange={setPayoffsTRPS}
          />
        </section>

        {/* POPULAR STRATEGIES */}
        <section id="strategies" style={{padding:"60px 0 40px"}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:14}}>
            <div>
              <div style={s.eyebrow}>
                <span style={{width:24,height:1,background:"currentColor",display:"inline-block"}}></span>
                02 · Strategies
              </div>
              <h2 style={{...s.h2,fontSize:"clamp(26px, 3.2vw, 40px)",margin:"14px 0 0"}}>
                Pick your <em style={s.em}>combatants.</em>
              </h2>
            </div>
            <button onClick={() => setView("library")} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,fontSize:10}}>See all {allStrategies.length} →</button>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:16}}>
            {popular.map(idx => {
              const strat = allStrategies[idx];
              if (!strat) return null;
              const sel = selectedStrategies.includes(idx);
              const nice = NICE_CATS.has(strat.category);
              return (
                <div key={idx} onClick={() => toggleStrategy(idx)}
                  className="pd-card-hover"
                  style={{background:sel?`${catColor(strat.category)}10`:C.bg2,border:`1px solid ${sel?catColor(strat.category):C.line}`,padding:20,cursor:"pointer",position:"relative"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10,gap:10}}>
                    <div style={{fontFamily:serif,fontSize:19,fontWeight:500,color:C.paper}}>{strat.name}</div>
                    {sel && <span style={{color:catColor(strat.category),fontSize:14}}>✓</span>}
                  </div>
                  <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                    <span style={{...s.chip,color:catColor(strat.category),borderColor:`${catColor(strat.category)}60`,background:`${catColor(strat.category)}10`}}>{strat.category}</span>
                    <span style={{...s.chip,color:nice?C.leaf:C.rustHi,borderColor:nice?`${C.leaf}60`:`${C.rust}60`,background:nice?"rgba(122,140,92,0.08)":"rgba(178,58,58,0.08)"}}>{nice?"nice":"bad"}</span>
                  </div>
                  <div style={{color:C.inkDim,fontSize:13,lineHeight:1.55}}>{strat.description}</div>
                </div>
              );
            })}
          </div>

          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:24}}>
            <button onClick={selectClassic10} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,fontSize:10}}>Classic 10</button>
            <button onClick={selectAll} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,fontSize:10}}>Select all ({allStrategies.length})</button>
            <button onClick={selectNone} className="pd-btn pd-ghost" style={{...s.btn,...s.btnGhost,fontSize:10}}>Clear</button>
            <div style={{flex:1}} />
            <span style={{fontFamily:mono,fontSize:11,color:C.inkDim,letterSpacing:"0.15em",textTransform:"uppercase",alignSelf:"center"}}>{selectedStrategies.length} selected</span>
          </div>
        </section>

        {/* TOURNAMENT CONFIG */}
        <section style={{padding:"40px 0"}}>
          <div style={s.eyebrow}>
            <span style={{width:24,height:1,background:"currentColor",display:"inline-block"}}></span>
            03 · Configuration
          </div>
          <h2 style={{...s.h2,fontSize:"clamp(26px, 3.2vw, 40px)",margin:"14px 0 32px"}}>
            Set the <em style={s.em}>conditions.</em>
          </h2>

          <div style={s.card}>
            {/* Rounds */}
            <div style={{display:"grid",gridTemplateColumns:"170px 1fr 60px",gap:18,alignItems:"center",marginBottom:20}}>
              <label style={{fontFamily:mono,fontSize:11,color:C.inkDim,letterSpacing:"0.15em",textTransform:"uppercase"}}>Rounds / match</label>
              <input type="range" min="10" max="1000" step="10" value={rounds} onChange={e => setRounds(parseInt(e.target.value))} className="pd-slider" />
              <span style={{fontFamily:serif,fontSize:22,color:C.paper,textAlign:"right",fontVariationSettings:'"opsz" 144'}}>{rounds}</span>
            </div>

            {/* Noise */}
            <div style={{display:"grid",gridTemplateColumns:"170px 1fr 60px",gap:18,alignItems:"center",marginBottom:noise>0?14:20}}>
              <label style={{fontFamily:mono,fontSize:11,color:C.inkDim,letterSpacing:"0.15em",textTransform:"uppercase"}}>Noise · error rate</label>
              <input type="range" min="0" max="0.2" step="0.005" value={noise} onChange={e => setNoise(parseFloat(e.target.value))} className="pd-slider rust" />
              <span style={{fontFamily:serif,fontSize:22,color:noise>0?C.rustHi:C.paper,textAlign:"right",fontVariationSettings:'"opsz" 144'}}>{(noise*100).toFixed(1)}%</span>
            </div>
            {noise > 0 && (
              <div style={{fontFamily:mono,fontSize:12,color:C.inkDim,lineHeight:1.6,padding:"12px 14px",background:"rgba(178,58,58,0.04)",border:`1px dashed ${C.line}`,marginBottom:20,letterSpacing:"0.03em"}}>
                Each move has a {(noise*100).toFixed(1)}% chance of being flipped. With noise, strict TFT often loses to more forgiving strategies.
              </div>
            )}

            <hr style={s.dashHr} />

            {/* Evolution seeding */}
            <div style={{fontFamily:mono,fontSize:11,color:C.inkDim,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:12}}>Evolution seeding</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:evoPreset==="custom"?16:0}}>
              {[
                {id:"equal",label:"Equal"},
                {id:"top_heavy",label:"Winners boosted"},
                {id:"cooperators_dominant",label:"Cooperators 80%"},
                {id:"defectors_dominant",label:"Defectors 80%"},
                {id:"custom",label:"Custom"},
              ].map(pr => (
                <button key={pr.id} onClick={() => setEvoPreset(pr.id)}
                  style={{...s.chip,cursor:"pointer",background:evoPreset===pr.id?"rgba(212,163,115,0.12)":"transparent",borderColor:evoPreset===pr.id?C.amber:C.line,color:evoPreset===pr.id?C.amber:C.inkDim}}>{pr.label}</button>
              ))}
            </div>
            {evoPreset === "custom" && (
              <div style={{padding:16,border:`1px dashed ${C.line}`,background:"rgba(212,163,115,0.02)"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 60px",gap:16,alignItems:"center",marginBottom:10}}>
                  <label style={{fontFamily:mono,fontSize:10,letterSpacing:"0.15em",color:C.inkDim,textTransform:"uppercase"}}>Cooperator bias</label>
                  <span style={{fontFamily:serif,fontSize:20,color:C.paper,textAlign:"right",fontVariationSettings:'"opsz" 144'}}>{cooperatorBias}%</span>
                </div>
                <input type="range" min="0" max="100" value={cooperatorBias}
                  onChange={e => setCooperatorBias(parseInt(e.target.value,10))}
                  className="pd-slider paper"
                  style={{background:`linear-gradient(to right, ${C.rust} 0%, ${C.rust} ${100-cooperatorBias}%, ${C.leaf} ${100-cooperatorBias}%, ${C.leaf} 100%)`}}
                />
                <div style={{fontFamily:mono,fontSize:10,color:C.inkFaint,letterSpacing:"0.12em",textTransform:"uppercase",marginTop:10,display:"flex",justifyContent:"space-between"}}>
                  <span>All defectors</span><span>All cooperators</span>
                </div>
              </div>
            )}
          </div>

          {/* Run button */}
          <button onClick={runTournamentHandler} disabled={selectedStrategies.length<2||!payoffsValid}
            className="pd-btn pd-primary"
            style={{...s.btn,...s.btnPrimary,width:"100%",padding:"18px 0",fontSize:13,letterSpacing:"0.15em",opacity:(selectedStrategies.length<2||!payoffsValid)?0.4:1,marginBottom:12}}>
            Run Tournament · {selectedStrategies.length} strategies × {rounds} rounds{noise>0?` · ${(noise*100).toFixed(1)}% noise`:""}
          </button>
          {!payoffsValid && (
            <div style={{fontFamily:mono,fontSize:11,color:C.rustHi,textAlign:"center",marginBottom:12,letterSpacing:"0.05em"}}>
              ✗ Fix the payoff matrix above before running.
            </div>
          )}

          {/* AI Creator */}
          <div style={{...s.card,marginTop:16}}>
            <div style={s.eyebrow}>
              <span style={{width:24,height:1,background:"currentColor",display:"inline-block"}}></span>
              AI Strategy Creator
            </div>
            <p style={{...s.lede,fontSize:14,marginTop:10,marginBottom:14,maxWidth:560}}>Describe a strategy in plain language. Claude will build it.</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="e.g. Start nice, but if betrayed 3 times, defect for 15 rounds then forgive"
                style={{...s.input,flex:1,minWidth:240}} onKeyDown={e => e.key==="Enter" && createAIStrategy()} />
              <button onClick={createAIStrategy} disabled={aiLoading||!aiPrompt.trim()}
                className="pd-btn pd-primary"
                style={{...s.btn,...s.btnPrimary,opacity:aiLoading?0.5:1,whiteSpace:"nowrap"}}>{aiLoading?"Creating…":"Create"}</button>
            </div>
            {aiStrategy && !aiStrategy.error && (
              <div style={{marginTop:14,padding:14,background:"rgba(122,140,92,0.08)",border:`1px solid ${C.leaf}40`}}>
                <div style={{fontFamily:serif,fontWeight:500,fontSize:16,color:C.paper}}>✓ Created · {aiStrategy.name}</div>
                <div style={{color:C.inkDim,fontSize:13,marginTop:4,lineHeight:1.5}}>{aiStrategy.description}</div>
                <div style={{color:C.inkFaint,fontSize:10,marginTop:6,fontFamily:mono,letterSpacing:"0.15em",textTransform:"uppercase"}}>Added to pool · select from library</div>
              </div>
            )}
            {aiStrategy?.error && (
              <div style={{marginTop:14,padding:14,background:"rgba(178,58,58,0.08)",border:`1px solid ${C.rust}40`}}>
                <div style={{color:C.rustHi,fontSize:13,fontFamily:mono,letterSpacing:"0.03em"}}>Error · {aiStrategy.error}</div>
              </div>
            )}
          </div>
        </section>

        {/* TIPPING POINT SIMULATOR */}
        <section id="tipping" style={{padding:"60px 0 40px"}}>
          <div style={s.eyebrow}>
            <span style={{width:24,height:1,background:"currentColor",display:"inline-block"}}></span>
            04 · Tipping-point simulator
          </div>
          <h2 style={{...s.h2,fontSize:"clamp(26px, 3.2vw, 40px)",margin:"14px 0 14px"}}>
            Where does cooperation <em style={s.em}>break?</em>
          </h2>
          <p style={{...s.lede,maxWidth:620,marginBottom:40}}>
            A quick analytical model. Drag the slider to change the nice-to-bad ratio in a 100-agent pool and watch which strategy wins. Below 50% nice, defection dominates. Above 85%, TFT pays a tax for its vigilance.
          </p>
          <TippingPointSim />
        </section>

        {/* Footer */}
        <footer style={{padding:"40px 0 20px",marginTop:40,borderTop:`1px solid ${C.line}`,fontFamily:mono,fontSize:11,color:C.inkFaint,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:16,letterSpacing:"0.1em"}}>
          <div>PD ARENA · A game theory exploration platform</div>
          <div>
            <span onClick={() => setView("about")} style={{cursor:"pointer",color:C.inkDim,marginLeft:20}}>About & Methodology</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
