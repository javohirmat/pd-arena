import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ============================================================
// PD ARENA v6 — Iterated Prisoner's Dilemma Tournament Simulator
// Research-grade tool with noise, export, evolution, and more
// ============================================================

// --- PAYOFF MATRIX ---
const PAYOFFS = {
  CC: [3, 3],
  CD: [0, 5],
  DC: [5, 0],
  DD: [1, 1],
};

// --- STRATEGY CATEGORIES ---
const STRATEGY_CATEGORIES = [
  { id: "classic", label: "Classic", color: "#60a5fa" },
  { id: "cooperative", label: "Cooperative", color: "#34d399" },
  { id: "aggressive", label: "Aggressive", color: "#f87171" },
  { id: "adaptive", label: "Adaptive", color: "#c084fc" },
  { id: "probing", label: "Probing", color: "#fbbf24" },
  { id: "stochastic", label: "Stochastic", color: "#fb923c" },
  { id: "memory", label: "Memory", color: "#38bdf8" },
  { id: "retaliatory", label: "Retaliatory", color: "#ef4444" },
  { id: "forgiving", label: "Forgiving", color: "#a3e635" },
  { id: "mathematical", label: "Mathematical", color: "#e879f9" },
];

// --- ALL STRATEGIES ---
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
  { name: "Adaptive", category: "adaptive", description: "Tests C and D for 6 rounds each, then picks whichever scored better.", fn: (my, their, r) => { if (r < 6) return "C"; if (r < 12) return "D"; let cS=0, dS=0; for (let i=0;i<6;i++) cS += PAYOFFS["C"+their[i]][0]; for (let i=6;i<12;i++) dS += PAYOFFS["D"+their[i]][0]; return cS >= dS ? "C" : "D"; } },
  { name: "Gradual", category: "adaptive", description: "Punishes proportionally: nth defection = n rounds of punishment.", fn: (my, their, r) => { if (r === 0) return "C"; const d = their.filter(m=>m==="D").length; let p=0; for (let i=my.length-1;i>=0&&my[i]==="D";i--) p++; if (their[r-1]==="D" && p < d) return "D"; if (p > 0 && p < d) return "D"; return "C"; } },
  { name: "Prober", category: "adaptive", description: "Tests with D on round 2. Exploits if no retaliation, else TFT.", fn: (my, their, r) => { if (r===0) return "C"; if (r===1) return "D"; if (r===2) return "C"; if (their[1]==="C" && their[2]==="C") return "D"; return their[r-1]; } },
  { name: "Equalizer", category: "adaptive", description: "Tries to keep both players' scores equal.", fn: (my, their, r) => { if (r < 2) return "C"; let ms=0,ts=0; for (let i=0;i<r;i++) { const k=my[i]+their[i]; ms+=PAYOFFS[k][0]; ts+=PAYOFFS[k][1]; } if (ms < ts) return "D"; if (ms > ts+5) return "C"; return their[r-1]; } },
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

// --- TOURNAMENT ENGINE ---
function applyNoise(move, noiseLevel) {
  if (noiseLevel > 0 && Math.random() < noiseLevel) {
    return move === "C" ? "D" : "C";
  }
  return move;
}

function runMatch(s1, s2, rounds, noise = 0) {
  const h1 = [], h2 = [];
  let score1 = 0, score2 = 0;
  for (let r = 0; r < rounds; r++) {
    let m1 = s1.fn(h1, h2, r, rounds);
    let m2 = s2.fn(h2, h1, r, rounds);
    m1 = applyNoise(m1, noise);
    m2 = applyNoise(m2, noise);
    score1 += PAYOFFS[m1 + m2][0];
    score2 += PAYOFFS[m1 + m2][1];
    h1.push(m1);
    h2.push(m2);
  }
  return { score1, score2, history1: h1, history2: h2 };
}

function runTournament(strategies, rounds, noise = 0) {
  const n = strategies.length;
  const scores = new Array(n).fill(0);
  const matchResults = {};
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const result = runMatch(strategies[i], strategies[j], rounds, noise);
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

function runEvolution(strategies, rounds, noise = 0, generations = 80, initPops = null) {
  const n = strategies.length;
  let populations = initPops ? initPops.slice() : new Array(n).fill(1 / n);
  const history = [populations.slice()];
  const EXTINCTION = 0.0005;
  const SELECTION_PRESSURE = 3;

  // Pre-compute all pairwise scores
  const pairScores = {};
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        const r = runMatch(strategies[i], strategies[j], rounds, noise);
        pairScores[`${i}-${j}`] = r.score1;
      } else if (i < j) {
        const r = runMatch(strategies[i], strategies[j], rounds, noise);
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

    // Apply selection pressure (higher = more dramatic changes)
    const avgFitness = fitness.reduce((a, b, i) => a + b * populations[i], 0);
    if (avgFitness > 0) {
      const newPops = populations.map((p, i) => {
        if (p < EXTINCTION) return 0;
        const relativeFitness = fitness[i] / avgFitness;
        return p * Math.pow(relativeFitness, SELECTION_PRESSURE);
      });
      const sum = newPops.reduce((a, b) => a + b, 0);
      populations = sum > 0 ? newPops.map(p => p / sum) : populations;
    }
    history.push(populations.slice());
  }
  return history;
}

// --- EXPORT UTILITIES ---
function exportCSV(standings, rounds, noise) {
  const header = "Rank,Strategy,Category,Total Score,Avg Per Match,Avg Per Round\n";
  const rows = standings.map((s, i) =>
    `${i+1},${s.name},${s.category},${s.score},${s.avgPerMatch.toFixed(1)},${s.avgPerRound.toFixed(3)}`
  ).join("\n");
  const meta = `# PD Arena Tournament Results\n# Rounds: ${rounds} | Noise: ${(noise*100).toFixed(1)}% | Strategies: ${standings.length}\n# Generated: ${new Date().toISOString()}\n\n`;
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

// --- FONT LOADING ---
const fl = document.createElement("link");
fl.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=DM+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
fl.rel = "stylesheet";
document.head.appendChild(fl);

// --- COLORS ---
const C = {
  bg: "#0a0a0f", bgCard: "#12121a", bgHover: "#1a1a27",
  border: "#ffffff10", borderActive: "#ffffff25",
  text: "#e8e6e3", textMuted: "#8a8690", textDim: "#5a5660",
  accent: "#60a5fa", accentGlow: "#60a5fa40",
  cooperate: "#34d399", defect: "#f87171",
  gold: "#fbbf24", silver: "#94a3b8", bronze: "#d97706",
};

const catColor = (cat) => STRATEGY_CATEGORIES.find(c => c.id === cat)?.color || C.accent;

// Distinct colors for evolution chart lines
const EVO_COLORS = [
  "#60a5fa","#34d399","#f87171","#fbbf24","#c084fc","#fb923c",
  "#38bdf8","#ef4444","#a3e635","#e879f9","#2dd4bf","#f472b6",
  "#818cf8","#facc15","#4ade80","#fb7185","#a78bfa","#22d3ee",
  "#f97316","#84cc16","#e11d48","#06b6d4","#8b5cf6","#10b981",
];

// ============================================================
// COMPONENTS
// ============================================================

function EvolutionChart({ data, strategies, width = 700, height = 380, onCanvasRef }) {
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

    const pad = { top: 20, right: 180, bottom: 35, left: 50 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    // Background grid
    ctx.strokeStyle = "#ffffff08";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + h - (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#ffffff20";
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + h);
    ctx.lineTo(pad.left + w, pad.top + h);
    ctx.stroke();

    ctx.fillStyle = C.textDim;
    ctx.font = "11px 'IBM Plex Mono',monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      ctx.fillText((i * 25) + "%", pad.left - 8, pad.top + h - (i/4)*h + 4);
    }
    ctx.textAlign = "center";
    const gs = Math.max(1, Math.ceil(data.length / 8));
    for (let i = 0; i < data.length; i += gs) {
      ctx.fillText(i.toString(), pad.left + (i/(data.length-1))*w, pad.top + h + 20);
    }
    ctx.fillText("Generation", pad.left + w/2, pad.top + h + 33);

    // Find strategies that reached > 2% at any point
    const visible = [];
    for (let si = 0; si < strategies.length; si++) {
      const peak = Math.max(...data.map(d => d[si]));
      if (peak > 0.02) visible.push(si);
    }

    // Sort by final population descending
    visible.sort((a, b) => data[data.length-1][b] - data[data.length-1][a]);

    // Draw filled areas (stacked-ish, but actually just lines with fill below)
    visible.forEach((si, idx) => {
      const color = EVO_COLORS[idx % EVO_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let g = 0; g < data.length; g++) {
        const x = pad.left + (g / (data.length - 1)) * w;
        const y = pad.top + h - data[g][si] * h;
        g === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Subtle fill
      ctx.globalAlpha = 0.08;
      ctx.lineTo(pad.left + w, pad.top + h);
      ctx.lineTo(pad.left, pad.top + h);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Legend on the right
    let ly = pad.top;
    visible.slice(0, 12).forEach((si, idx) => {
      const fp = data[data.length-1][si];
      if (fp < 0.005) return;
      const color = EVO_COLORS[idx % EVO_COLORS.length];
      // Color dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pad.left + w + 15, ly + 6, 4, 0, Math.PI * 2);
      ctx.fill();
      // Name
      ctx.fillStyle = C.text;
      ctx.font = "11px 'DM Sans',sans-serif";
      ctx.textAlign = "left";
      const name = strategies[si].name.length > 14 ? strategies[si].name.slice(0, 13) + "…" : strategies[si].name;
      ctx.fillText(`${name}`, pad.left + w + 24, ly + 10);
      // Percentage
      ctx.fillStyle = C.textMuted;
      ctx.font = "10px 'IBM Plex Mono',monospace";
      ctx.fillText(`${(fp*100).toFixed(1)}%`, pad.left + w + 130, ly + 10);
      ly += 18;
    });
  }, [data, strategies, width, height]);

  return <canvas ref={canvasRef} style={{ width: "100%", maxWidth: width, height, display: "block" }} />;
}

function HeatMap({ matchResults, strategies, standings, onSelectMatch }) {
  const canvasRef = useRef(null);
  const n = strategies.length;
  const cellSize = Math.min(28, Math.floor(500 / n));
  const labelW = 110;
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

    for (let ri = 0; ri < n; ri++) {
      for (let ci = 0; ci < n; ci++) {
        const si = sortedIdx[ri], sj = sortedIdx[ci];
        const x = labelW + ci * cellSize, y = labelW + ri * cellSize;
        if (si === sj) { ctx.fillStyle = "#1a1a27"; ctx.fillRect(x, y, cellSize-1, cellSize-1); continue; }
        const key = si < sj ? `${si}-${sj}` : `${sj}-${si}`;
        const result = matchResults[key];
        if (!result) continue;
        const score = si < sj ? result.score1 : result.score2;
        const ratio = score / (200 * 5);
        const r = Math.round(248*(1-ratio) + 52*ratio);
        const g = Math.round(113*(1-ratio) + 211*ratio);
        const b = Math.round(113*(1-ratio) + 153*ratio);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, cellSize-1, cellSize-1);
      }
    }

    ctx.fillStyle = C.textMuted;
    ctx.font = `${Math.min(10, cellSize-4)}px 'DM Sans',sans-serif`;
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

function MatchReplay({ s1, s2, history1, history2, score1, score2, rounds }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 680, H = 180;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W*dpr; canvas.height = H*dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = {top:20,right:10,bottom:25,left:45};
    const cw = W-pad.left-pad.right, ch = H-pad.top-pad.bottom;
    let c1=0,c2=0;
    const sc1=[],sc2=[];
    for (let i=0;i<rounds;i++) {
      c1 += PAYOFFS[history1[i]+history2[i]][0];
      c2 += PAYOFFS[history1[i]+history2[i]][1];
      sc1.push(c1); sc2.push(c2);
    }
    const mx = Math.max(c1,c2,1);

    [{d:sc1,c:C.accent},{d:sc2,c:C.gold}].forEach(({d,c:col}) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath();
      d.forEach((v,i) => {
        const x=pad.left+(i/(rounds-1))*cw, y=pad.top+ch-(v/mx)*ch;
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      });
      ctx.stroke();
    });

    ctx.strokeStyle = C.border; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pad.left,pad.top+ch); ctx.lineTo(pad.left+cw,pad.top+ch); ctx.stroke();
    ctx.fillStyle = C.textDim; ctx.font = "10px 'IBM Plex Mono',monospace"; ctx.textAlign = "center";
    for (let i=0;i<=4;i++) { const r=Math.round(i/4*rounds); ctx.fillText(r.toString(), pad.left+(r/rounds)*cw, pad.top+ch+15); }
  }, [history1, history2, rounds]);

  const stripW = Math.max(2, Math.min(6, 600/rounds));

  return (
    <div>
      <div style={{display:"flex",gap:16,marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>
        <span style={{color:C.accent,fontWeight:600}}>{s1.name}: {score1}</span>
        <span style={{color:C.textDim}}>vs</span>
        <span style={{color:C.gold,fontWeight:600}}>{s2.name}: {score2}</span>
        <span style={{marginLeft:"auto",color:score1>score2?C.accent:score2>score1?C.gold:C.textMuted,fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}>
          {score1>score2?`${s1.name} wins`:score2>score1?`${s2.name} wins`:"Draw"}
        </span>
      </div>
      <canvas ref={canvasRef} style={{width:680,height:180,display:"block"}} />
      <div style={{marginTop:8}}>
        <div style={{fontSize:11,color:C.textMuted,marginBottom:4,fontFamily:"'IBM Plex Mono',monospace"}}>Round-by-round (hover for details)</div>
        <div style={{display:"flex",overflowX:"auto",paddingBottom:4}}>
          {history1.map((m1,i) => (
            <div key={i} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}
              style={{width:stripW,height:28,display:"flex",flexDirection:"column",cursor:"pointer"}}>
              <div style={{flex:1,backgroundColor:m1==="C"?C.cooperate+"cc":C.defect+"cc"}} />
              <div style={{flex:1,backgroundColor:history2[i]==="C"?C.cooperate+"66":C.defect+"66"}} />
            </div>
          ))}
        </div>
        {hovered !== null && (
          <div style={{fontSize:12,color:C.text,marginTop:4,fontFamily:"'IBM Plex Mono',monospace"}}>
            Round {hovered+1}: {s1.name} <span style={{color:history1[hovered]==="C"?C.cooperate:C.defect}}>{history1[hovered]==="C"?"Cooperated":"Defected"}</span>
            {" · "}{s2.name} <span style={{color:history2[hovered]==="C"?C.cooperate:C.defect}}>{history2[hovered]==="C"?"Cooperated":"Defected"}</span>
          </div>
        )}
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
    <div style={s.app}><div style={{...s.container,maxWidth:680}}>
      <button onClick={onBack} style={{...s.btn,...s.btnGhost,marginBottom:20}}>← Back</button>
      <h1 style={{...s.h1,fontSize:32,marginBottom:24}}>About PD Arena</h1>

      <div style={s.card}>
        <h2 style={{...s.h2,fontSize:18}}>What is this?</h2>
        <p style={{color:C.textMuted,lineHeight:1.7,fontSize:14}}>
          PD Arena is an interactive simulator for the iterated Prisoner's Dilemma — the most studied game in game theory. It lets you pit dozens of strategies against each other in round-robin tournaments, observe evolutionary dynamics, and experiment with noise to see how cooperation emerges (or collapses) under different conditions.
        </p>
      </div>

      <div style={s.card}>
        <h2 style={{...s.h2,fontSize:18}}>Methodology</h2>
        <p style={{color:C.textMuted,lineHeight:1.7,fontSize:14}}>
          <strong style={{color:C.text}}>Tournament format:</strong> Every strategy plays every other strategy in a head-to-head match. Each match consists of a configurable number of rounds (default 200). Strategies are ranked by total cumulative score across all matches.
        </p>
        <p style={{color:C.textMuted,lineHeight:1.7,fontSize:14,marginTop:12}}>
          <strong style={{color:C.text}}>Payoff matrix:</strong> We use the standard payoffs: mutual cooperation (R=3), temptation to defect (T=5), sucker's payoff (S=0), mutual defection (P=1). This satisfies T &gt; R &gt; P &gt; S and 2R &gt; T + S, the conditions for a proper Prisoner's Dilemma.
        </p>
        <p style={{color:C.textMuted,lineHeight:1.7,fontSize:14,marginTop:12}}>
          <strong style={{color:C.text}}>Noise:</strong> When noise is enabled, each move has a probability of being "misimplemented" — flipped from the intended C to D or vice versa. This models communication errors, trembling hands, or misperceptions, following the framework in Nowak &amp; Sigmund (1993).
        </p>
        <p style={{color:C.textMuted,lineHeight:1.7,fontSize:14,marginTop:12}}>
          <strong style={{color:C.text}}>Evolution:</strong> Population dynamics use replicator dynamics with selection pressure. Each generation, strategies reproduce proportionally to their fitness (average score weighted by population share). A selection pressure exponent amplifies fitness differences so that dominant strategies emerge more clearly.
        </p>
      </div>

      <div style={s.card}>
        <h2 style={{...s.h2,fontSize:18}}>Key References</h2>
        <div style={{color:C.textMuted,fontSize:13,lineHeight:1.8}}>
          <p>Axelrod, R. (1984). <em style={{color:C.text}}>The Evolution of Cooperation</em>. Basic Books.</p>
          <p>Axelrod, R. (1980). "Effective Choice in the Prisoner's Dilemma." <em>Journal of Conflict Resolution</em>, 24(1), 3-25.</p>
          <p>Nowak, M. & Sigmund, K. (1993). "A strategy of win-stay, lose-shift that outperforms tit-for-tat." <em>Nature</em>, 364, 56-58.</p>
          <p>Nowak, M. & Sigmund, K. (1992). "Tit for tat in heterogeneous populations." <em>Nature</em>, 355, 250-253.</p>
          <p>Press, W.H. & Dyson, F.J. (2012). "Iterated Prisoner's Dilemma contains strategies that dominate any evolutionary opponent." <em>PNAS</em>, 109(26).</p>
          <p>Stewart, A.J. & Plotkin, J.B. (2012). "Extortion and cooperation in the Prisoner's Dilemma." <em>PNAS</em>, 109(26).</p>
        </div>
      </div>

      <div style={s.card}>
        <h2 style={{...s.h2,fontSize:18}}>About the Project</h2>
        <p style={{color:C.textMuted,lineHeight:1.7,fontSize:14}}>
          PD Arena is Module #1 of a broader game theory exploration platform. Future modules will cover the Tragedy of the Commons, Nash Equilibrium visualization, and Auction Theory.
        </p>
        <p style={{color:C.textMuted,lineHeight:1.7,fontSize:14,marginTop:8}}>
          Built with React. Source code available on GitHub. AI-powered strategy creation uses Claude by Anthropic.
        </p>
      </div>
    </div></div>
  );
}

// ============================================================
// STYLES HELPER
// ============================================================
function styles() {
  return {
    app: { fontFamily:"'DM Sans',sans-serif", backgroundColor:C.bg, color:C.text, minHeight:"100vh" },
    container: { maxWidth:780, margin:"0 auto", padding:"24px 20px" },
    h1: { fontFamily:"'Playfair Display',serif", fontSize:36, fontWeight:900, margin:0, letterSpacing:"-0.02em", lineHeight:1.1 },
    h2: { fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, margin:"0 0 12px" },
    card: { background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:10, padding:20, marginBottom:16 },
    btn: { fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:600, padding:"8px 18px", borderRadius:6, border:"none", cursor:"pointer", transition:"all 0.15s" },
    btnPrimary: { background:C.accent, color:"#0a0a0f" },
    btnGhost: { background:"transparent", color:C.textMuted, border:`1px solid ${C.border}` },
    mono: { fontFamily:"'IBM Plex Mono',monospace" },
    pill: { display:"inline-block", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 },
    input: { fontFamily:"'DM Sans',sans-serif", fontSize:14, padding:"10px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bgCard, color:C.text, outline:"none", width:"100%", boxSizing:"border-box" },
  };
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
  const evoCanvasRef = useRef(null);

  const s = styles();
  const allStrategies = useMemo(() => [...STRATEGIES, ...customStrategies], [customStrategies]);

  const filteredStrategies = useMemo(() => {
    let list = allStrategies;
    if (searchQuery) { const q = searchQuery.toLowerCase(); list = list.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)); }
    if (categoryFilter) list = list.filter(s => s.category === categoryFilter);
    return list;
  }, [allStrategies, searchQuery, categoryFilter]);

  const toggleStrategy = (idx) => setSelectedStrategies(p => p.includes(idx) ? p.filter(i => i !== idx) : [...p, idx]);
  const selectAll = () => setSelectedStrategies(allStrategies.map((_, i) => i));
  const selectNone = () => setSelectedStrategies([]);
  const selectClassic10 = () => setSelectedStrategies([0,1,2,3,4,5,6,7,8,9]);

  const runTournamentHandler = useCallback(() => {
    if (selectedStrategies.length < 2) return;
    setIsRunning(true);
    setView("results");
    setResultTab("standings");
    setReplayMatch(null);
    setTimeout(() => {
      const strats = selectedStrategies.map(i => allStrategies[i]);
      const results = runTournament(strats, rounds, noise);
      setTournamentResults({ ...results, strategies: strats, indices: selectedStrategies });

      // Evolution with preset populations
      let initPops = null;
      const n = strats.length;
      if (evoPreset === "top_heavy") {
        // Top 3 from standings get 60% of population
        initPops = new Array(n).fill(0.4 / n);
        const top3 = results.standings.slice(0, 3).map(s => s.index);
        top3.forEach(i => { initPops[i] = 0.2; });
        const sum = initPops.reduce((a, b) => a + b, 0);
        initPops = initPops.map(p => p / sum);
      } else if (evoPreset === "cooperators_dominant") {
        initPops = new Array(n).fill(0);
        const total = strats.length;
        strats.forEach((st, i) => {
          if (["cooperative", "forgiving", "classic"].includes(st.category)) initPops[i] = 2 / total;
          else initPops[i] = 0.5 / total;
        });
        const sum = initPops.reduce((a, b) => a + b, 0);
        initPops = initPops.map(p => p / sum);
      } else if (evoPreset === "defectors_dominant") {
        initPops = new Array(n).fill(0);
        strats.forEach((st, i) => {
          if (["aggressive", "retaliatory"].includes(st.category)) initPops[i] = 2 / n;
          else initPops[i] = 0.5 / n;
        });
        const sum = initPops.reduce((a, b) => a + b, 0);
        initPops = initPops.map(p => p / sum);
      }

      const evoData = runEvolution(strats, rounds, noise, 80, initPops);
      setEvolutionData(evoData);
      setIsRunning(false);
    }, 50);
  }, [selectedStrategies, rounds, noise, allStrategies, evoPreset]);

  const handleMatchSelect = (i, j) => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    const result = tournamentResults.matchResults[key];
    if (!result) return;
    setReplayMatch({ s1: tournamentResults.strategies[i<j?i:j], s2: tournamentResults.strategies[i<j?j:i], ...result });
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
      const fn = new Function("myHistory","theirHistory","round","totalRounds", `return (${parsed.code})(myHistory,theirHistory,round,totalRounds);`);
      fn([],[],0,200); fn(["C"],["D"],1,200); fn(["C","D","C"],["D","C","D"],3,200);
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
      <div style={s.app}><div style={s.container}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={() => setView("home")} style={{...s.btn,...s.btnGhost,padding:"6px 12px"}}>← Back</button>
          <h1 style={{...s.h1,fontSize:28}}>Strategy Library</h1>
          <span style={{...s.mono,color:C.textMuted,fontSize:13,marginLeft:"auto"}}>{allStrategies.length} strategies</span>
        </div>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search strategies…" style={{...s.input,marginBottom:12}} />
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
          <button onClick={() => setCategoryFilter(null)} style={{...s.btn,padding:"4px 12px",fontSize:11,background:!categoryFilter?C.accent+"20":"transparent",color:!categoryFilter?C.accent:C.textMuted,border:`1px solid ${!categoryFilter?C.accent+"40":C.border}`}}>All</button>
          {STRATEGY_CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategoryFilter(categoryFilter===cat.id?null:cat.id)}
              style={{...s.btn,padding:"4px 12px",fontSize:11,background:categoryFilter===cat.id?cat.color+"20":"transparent",color:categoryFilter===cat.id?cat.color:C.textMuted,border:`1px solid ${categoryFilter===cat.id?cat.color+"40":C.border}`}}>{cat.label}</button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filteredStrategies.map(strat => {
            const idx = allStrategies.indexOf(strat);
            const sel = selectedStrategies.includes(idx);
            return (
              <div key={idx} onClick={() => toggleStrategy(idx)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,background:sel?catColor(strat.category)+"10":C.bgCard,border:`1px solid ${sel?catColor(strat.category)+"40":C.border}`,cursor:"pointer",transition:"all 0.1s"}}>
                <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${sel?catColor(strat.category):C.textDim}`,background:sel?catColor(strat.category):"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#000",fontWeight:700,flexShrink:0}}>{sel&&"✓"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontWeight:600,fontSize:14}}>{strat.name}</span>
                    <span style={{...s.pill,background:catColor(strat.category)+"20",color:catColor(strat.category),fontSize:10}}>{strat.category}</span>
                    {strat.isCustom && <span style={{...s.pill,background:C.accent+"20",color:C.accent,fontSize:10}}>AI</span>}
                  </div>
                  <div style={{color:C.textMuted,fontSize:12,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{strat.description}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{position:"sticky",bottom:0,background:`linear-gradient(transparent,${C.bg} 20%)`,padding:"32px 0 16px",display:"flex",gap:10,alignItems:"center"}}>
          <span style={{color:C.textMuted,fontSize:13,...s.mono}}>{selectedStrategies.length} selected</span>
          <div style={{flex:1}} />
          <button onClick={() => setView("home")} style={{...s.btn,...s.btnGhost}}>Configure →</button>
          <button onClick={runTournamentHandler} disabled={selectedStrategies.length<2} style={{...s.btn,...s.btnPrimary,opacity:selectedStrategies.length<2?0.4:1}}>Run Tournament</button>
        </div>
      </div></div>
    );
  }

  // ==================== RESULTS VIEW ====================
  if (view === "results") {
    if (isRunning) {
      return (
        <div style={s.app}><div style={{...s.container,textAlign:"center",paddingTop:80}}>
          <div style={{...s.mono,fontSize:14,color:C.accent,marginBottom:8}}>Running tournament…</div>
          <div style={{color:C.textMuted,fontSize:13}}>{selectedStrategies.length} strategies × {rounds} rounds{noise>0?` · ${(noise*100).toFixed(1)}% noise`:""}</div>
          <div style={{marginTop:32,fontSize:24}}>⏳</div>
        </div></div>
      );
    }
    if (!tournamentResults) return null;
    const { standings, matchResults: mr, strategies: strats } = tournamentResults;
    const tabs = [{id:"standings",label:"Standings"},{id:"heatmap",label:"Heat Map"},{id:"evolution",label:"Evolution"},{id:"replay",label:"Match Replay"}];

    return (
      <div style={s.app}><div style={s.container}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={() => setView("home")} style={{...s.btn,...s.btnGhost,padding:"6px 12px"}}>← New</button>
          <h1 style={{...s.h1,fontSize:24}}>Tournament Results</h1>
          {noise > 0 && <span style={{...s.pill,background:"#fb923c20",color:"#fb923c",marginLeft:8}}>Noise: {(noise*100).toFixed(1)}%</span>}
        </div>

        <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:`1px solid ${C.border}`}}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setResultTab(t.id)}
              style={{...s.btn,background:"transparent",color:resultTab===t.id?C.accent:C.textMuted,borderBottom:resultTab===t.id?`2px solid ${C.accent}`:"2px solid transparent",borderRadius:0,padding:"10px 18px",fontWeight:resultTab===t.id?700:500}}>{t.label}</button>
          ))}
        </div>

        {/* STANDINGS */}
        {resultTab === "standings" && (
          <div>
            <div style={{display:"flex",gap:10,marginBottom:20}}>
              {standings.slice(0,3).map((entry,idx) => (
                <div key={entry.index} style={{...s.card,flex:1,textAlign:"center",borderColor:[C.gold,C.silver,C.bronze][idx]+"40",marginBottom:0}}>
                  <div style={{fontSize:24,marginBottom:4}}>{["🥇","🥈","🥉"][idx]}</div>
                  <div style={{fontWeight:700,fontSize:15}}>{entry.name}</div>
                  <div style={{...s.pill,background:catColor(entry.category)+"20",color:catColor(entry.category),marginTop:6}}>{entry.category}</div>
                  <div style={{...s.mono,fontSize:20,fontWeight:700,marginTop:8}}>{entry.score.toLocaleString()}</div>
                  <div style={{...s.mono,fontSize:11,color:C.textMuted}}>{entry.avgPerRound.toFixed(2)} / round</div>
                </div>
              ))}
            </div>

            {/* Export buttons */}
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <button onClick={() => exportCSV(standings, rounds, noise)} style={{...s.btn,...s.btnGhost,fontSize:11}}>📥 Export CSV</button>
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {["#","Strategy","Category","Total","Avg/Round"].map((h,i) => (
                    <th key={h} style={{padding:"8px 12px",textAlign:i>=3?"right":"left",color:C.textMuted,fontWeight:500,...s.mono,fontSize:11}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {standings.map((entry,rank) => (
                    <tr key={entry.index} style={{borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"8px 12px",...s.mono,color:C.textDim}}>{rank+1}</td>
                      <td style={{padding:"8px 12px",fontWeight:600}}>{entry.name}</td>
                      <td style={{padding:"8px 12px"}}><span style={{...s.pill,background:catColor(entry.category)+"20",color:catColor(entry.category),fontSize:10}}>{entry.category}</span></td>
                      <td style={{padding:"8px 12px",textAlign:"right",...s.mono,fontWeight:600}}>{entry.score.toLocaleString()}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",...s.mono,color:C.textMuted}}>{entry.avgPerRound.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{...s.card,marginTop:20,background:"#60a5fa08"}}>
              <div style={{fontSize:11,...s.mono,color:C.accent,marginBottom:8,letterSpacing:"0.1em"}}>TOURNAMENT INSIGHT</div>
              <p style={{color:C.textMuted,fontSize:13,lineHeight:1.6,margin:0}}>
                {(() => {
                  const w = standings[0];
                  const nice = ["cooperative","classic","forgiving","adaptive"].includes(w.category);
                  const topCoop = standings.slice(0,5).filter(s => ["cooperative","forgiving","classic"].includes(s.category)).length;
                  if (noise > 0.03) {
                    return `With ${(noise*100).toFixed(1)}% noise, miscommunication reshapes everything. ${w.name} wins — ${nice?"forgiving strategies like Generous TFT and Pavlov typically thrive here because they can recover from accidental defections, unlike strict TFT which spirals into mutual retaliation.":"even aggressive strategies can succeed when noise disrupts cooperative handshakes."} Try comparing these results with 0% noise to see the difference.`;
                  }
                  if (nice && topCoop >= 3) {
                    return `${w.name} wins — and ${topCoop} of the top 5 are cooperative. Axelrod's insight holds: in repeated interactions, niceness, forgiveness, and reciprocity dominate. Defectors burn bridges and pay the price.`;
                  }
                  return `${w.name} takes first with ${w.score.toLocaleString()} points. Check the Heat Map for individual matchups, or Evolution to see long-term survival dynamics.`;
                })()}
              </p>
            </div>
          </div>
        )}

        {/* HEAT MAP */}
        {resultTab === "heatmap" && (
          <div>
            <p style={{color:C.textMuted,fontSize:13,marginBottom:16}}>Each cell shows a strategy's score. Green = high, red = low. Click any cell for the match replay.</p>
            <div style={{overflowX:"auto"}}><HeatMap matchResults={mr} strategies={strats} standings={standings} onSelectMatch={handleMatchSelect} /></div>
          </div>
        )}

        {/* EVOLUTION */}
        {resultTab === "evolution" && evolutionData && (
          <div>
            <p style={{color:C.textMuted,fontSize:13,marginBottom:12}}>Population dynamics over 80 generations. Strategies that score well grow; poor performers go extinct.</p>
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              {[{id:"equal",label:"Equal start"},{id:"top_heavy",label:"Winners boosted"},{id:"cooperators_dominant",label:"Cooperators 80%"},{id:"defectors_dominant",label:"Defectors 80%"}].map(p => (
                <button key={p.id} onClick={() => { setEvoPreset(p.id); /* Re-run evo only */ const strats=selectedStrategies.map(i=>allStrategies[i]); let ip=null; const n=strats.length; if(p.id==="top_heavy"&&tournamentResults){ip=new Array(n).fill(0.4/n);tournamentResults.standings.slice(0,3).forEach(s=>{ip[s.index]=0.2});const sm=ip.reduce((a,b)=>a+b,0);ip=ip.map(v=>v/sm);}else if(p.id==="cooperators_dominant"){ip=new Array(n).fill(0);strats.forEach((st,i)=>{ip[i]=["cooperative","forgiving","classic"].includes(st.category)?2/n:0.5/n});const sm=ip.reduce((a,b)=>a+b,0);ip=ip.map(v=>v/sm);}else if(p.id==="defectors_dominant"){ip=new Array(n).fill(0);strats.forEach((st,i)=>{ip[i]=["aggressive","retaliatory"].includes(st.category)?2/n:0.5/n});const sm=ip.reduce((a,b)=>a+b,0);ip=ip.map(v=>v/sm);} setEvolutionData(runEvolution(strats,rounds,noise,80,ip)); }}
                  style={{...s.btn,padding:"5px 14px",fontSize:11,background:evoPreset===p.id?C.accent+"20":"transparent",color:evoPreset===p.id?C.accent:C.textMuted,border:`1px solid ${evoPreset===p.id?C.accent+"40":C.border}`}}>{p.label}</button>
              ))}
            </div>
            <EvolutionChart data={evolutionData} strategies={strats} onCanvasRef={r => { evoCanvasRef.current = r?.current; }} />
            <div style={{marginTop:12}}>
              <button onClick={() => evoCanvasRef.current && exportCanvasPNG({current:evoCanvasRef.current}, "pd-arena-evolution.png")} style={{...s.btn,...s.btnGhost,fontSize:11}}>📥 Export PNG</button>
            </div>
          </div>
        )}

        {/* MATCH REPLAY */}
        {resultTab === "replay" && (
          <div>
            {replayMatch ? (
              <MatchReplay s1={replayMatch.s1} s2={replayMatch.s2} history1={replayMatch.history1} history2={replayMatch.history2} score1={replayMatch.score1} score2={replayMatch.score2} rounds={rounds} />
            ) : (
              <div style={{textAlign:"center",padding:40,color:C.textMuted}}>
                <p>Select a match from the Heat Map to see its replay.</p>
                <button onClick={() => setResultTab("heatmap")} style={{...s.btn,...s.btnGhost,marginTop:12}}>Go to Heat Map →</button>
              </div>
            )}
            {replayMatch && standings && (
              <div style={{marginTop:24}}>
                <div style={{fontSize:11,...s.mono,color:C.textDim,marginBottom:8}}>QUICK REPLAY</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {standings.slice(0,4).map((s1,i) =>
                    standings.slice(i+1,i+4).map(s2 => (
                      <button key={`${s1.index}-${s2.index}`} onClick={() => handleMatchSelect(s1.index,s2.index)}
                        style={{...s.btn,...s.btnGhost,fontSize:11,padding:"4px 10px"}}>{s1.name} vs {s2.name}</button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div></div>
    );
  }

  // ==================== HOME VIEW ====================
  const popular = [0,3,5,4,8,9,1,2];
  return (
    <div style={s.app}><div style={s.container}>
      {/* Header */}
      <div style={{textAlign:"center",padding:"40px 0 32px"}}>
        <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:600,color:C.accent,letterSpacing:"0.15em",textTransform:"uppercase",...s.mono}}>PD Arena</div>
        </div>
        <h1 style={{...s.h1,fontSize:42}}>Why do nice guys<br/>finish first?</h1>
        <p style={{color:C.textMuted,maxWidth:480,margin:"16px auto 0",lineHeight:1.6,fontSize:15}}>
          Run tournaments between {allStrategies.length} strategies in the iterated Prisoner's Dilemma. Watch evolution unfold. Discover what really wins.
        </p>
        <button onClick={() => setView("about")} style={{...s.btn,...s.btnGhost,marginTop:16,fontSize:12}}>About & Methodology</button>
      </div>

      {/* Payoff Matrix */}
      <div style={{...s.card,textAlign:"center",maxWidth:300,margin:"0 auto 32px"}}>
        <div style={{fontSize:11,color:C.textMuted,marginBottom:10,...s.mono}}>PAYOFF MATRIX</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,...s.mono}}>
          <thead><tr><td></td><td style={{padding:8,color:C.cooperate,fontWeight:600}}>Cooperate</td><td style={{padding:8,color:C.defect,fontWeight:600}}>Defect</td></tr></thead>
          <tbody>
            <tr><td style={{padding:8,color:C.cooperate,fontWeight:600,textAlign:"right"}}>C</td><td style={{padding:8,background:"#34d39915"}}>3, 3</td><td style={{padding:8,background:"#f8717115"}}>0, 5</td></tr>
            <tr><td style={{padding:8,color:C.defect,fontWeight:600,textAlign:"right"}}>D</td><td style={{padding:8,background:"#34d39910"}}>5, 0</td><td style={{padding:8,background:"#f8717110"}}>1, 1</td></tr>
          </tbody>
        </table>
      </div>

      {/* Popular Strategies */}
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h2 style={s.h2}>Popular Strategies</h2>
          <button onClick={() => setView("library")} style={{...s.btn,...s.btnGhost,fontSize:12}}>See all {allStrategies.length} →</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {popular.map(idx => {
            const strat = allStrategies[idx];
            if (!strat) return null;
            const sel = selectedStrategies.includes(idx);
            return (
              <div key={idx} onClick={() => toggleStrategy(idx)} style={{...s.card,marginBottom:0,cursor:"pointer",borderColor:sel?catColor(strat.category)+"80":C.border,background:sel?catColor(strat.category)+"10":C.bgCard,transition:"all 0.15s",position:"relative",overflow:"hidden",padding:"14px 16px"}}>
                {sel && <div style={{position:"absolute",top:8,right:10,width:18,height:18,borderRadius:9,background:catColor(strat.category),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#000",fontWeight:700}}>✓</div>}
                <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{strat.name}</div>
                <span style={{...s.pill,background:catColor(strat.category)+"20",color:catColor(strat.category)}}>{strat.category}</span>
                <div style={{color:C.textMuted,fontSize:12,marginTop:6,lineHeight:1.4}}>{strat.description}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
        <button onClick={selectClassic10} style={{...s.btn,...s.btnGhost}}>Classic 10</button>
        <button onClick={selectAll} style={{...s.btn,...s.btnGhost}}>Select All ({allStrategies.length})</button>
        <button onClick={selectNone} style={{...s.btn,...s.btnGhost}}>Clear</button>
      </div>

      {/* Tournament Config */}
      <div style={{...s.card}}>
        <div style={{fontSize:11,color:C.accent,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,...s.mono}}>TOURNAMENT CONFIG</div>

        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
          <span style={{fontSize:13,color:C.textMuted,whiteSpace:"nowrap",minWidth:130}}>Rounds per match:</span>
          <input type="range" min="10" max="1000" step="10" value={rounds} onChange={e => setRounds(parseInt(e.target.value))} style={{flex:1,accentColor:C.accent}} />
          <span style={{...s.mono,fontSize:14,fontWeight:600,minWidth:40,textAlign:"right"}}>{rounds}</span>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
          <span style={{fontSize:13,color:C.textMuted,whiteSpace:"nowrap",minWidth:130}}>Noise (error rate):</span>
          <input type="range" min="0" max="0.2" step="0.005" value={noise} onChange={e => setNoise(parseFloat(e.target.value))} style={{flex:1,accentColor:"#fb923c"}} />
          <span style={{...s.mono,fontSize:14,fontWeight:600,minWidth:40,textAlign:"right",color:noise>0?"#fb923c":C.textDim}}>{(noise*100).toFixed(1)}%</span>
        </div>
        {noise > 0 && (
          <div style={{fontSize:12,color:C.textMuted,lineHeight:1.5,padding:"8px 12px",background:"#fb923c08",borderRadius:6,border:`1px solid #fb923c15`}}>
            Each move has a {(noise*100).toFixed(1)}% chance of being flipped. This models miscommunication — a key factor in Axelrod's later research. With noise, strict TFT often loses to more forgiving strategies like Generous TFT.
          </div>
        )}

        <div style={{display:"flex",alignItems:"center",gap:16,marginTop:16}}>
          <span style={{fontSize:13,color:C.textMuted,whiteSpace:"nowrap",minWidth:130}}>Evolution start:</span>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{id:"equal",label:"Equal"},{id:"top_heavy",label:"Winners boosted"},{id:"cooperators_dominant",label:"Cooperators 80%"},{id:"defectors_dominant",label:"Defectors 80%"}].map(p => (
              <button key={p.id} onClick={() => setEvoPreset(p.id)}
                style={{...s.btn,padding:"4px 10px",fontSize:11,background:evoPreset===p.id?C.accent+"20":"transparent",color:evoPreset===p.id?C.accent:C.textMuted,border:`1px solid ${evoPreset===p.id?C.accent+"40":C.border}`}}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Run button */}
      <button onClick={runTournamentHandler} disabled={selectedStrategies.length<2}
        style={{...s.btn,...s.btnPrimary,width:"100%",padding:"14px 0",fontSize:16,fontWeight:700,opacity:selectedStrategies.length<2?0.4:1,marginBottom:12}}>
        Run Tournament ({selectedStrategies.length} strategies × {rounds} rounds{noise>0?` · ${(noise*100).toFixed(1)}% noise`:""})
      </button>

      {/* AI Creator */}
      <div style={{...s.card,marginTop:8}}>
        <div style={{fontSize:11,color:C.accent,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10,...s.mono}}>AI STRATEGY CREATOR</div>
        <p style={{color:C.textMuted,fontSize:13,marginBottom:12}}>Describe a strategy in plain language and Claude will build it.</p>
        <div style={{display:"flex",gap:8}}>
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="e.g. Start nice, but if betrayed 3 times, defect for 15 rounds then forgive"
            style={{...s.input,flex:1}} onKeyDown={e => e.key==="Enter" && createAIStrategy()} />
          <button onClick={createAIStrategy} disabled={aiLoading||!aiPrompt.trim()}
            style={{...s.btn,...s.btnPrimary,opacity:aiLoading?0.5:1,whiteSpace:"nowrap"}}>{aiLoading?"Creating…":"Create"}</button>
        </div>
        {aiStrategy && !aiStrategy.error && (
          <div style={{marginTop:12,padding:12,background:"#34d39910",borderRadius:8,border:`1px solid ${C.cooperate}30`}}>
            <div style={{fontWeight:600,fontSize:14}}>✓ Created: {aiStrategy.name}</div>
            <div style={{color:C.textMuted,fontSize:12,marginTop:4}}>{aiStrategy.description}</div>
            <div style={{color:C.textDim,fontSize:11,marginTop:4,...s.mono}}>Added to strategy pool — select it from the library to include in tournaments.</div>
          </div>
        )}
        {aiStrategy?.error && (
          <div style={{marginTop:12,padding:12,background:"#f8717110",borderRadius:8,border:`1px solid ${C.defect}30`}}>
            <div style={{color:C.defect,fontSize:13}}>Error: {aiStrategy.error}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{textAlign:"center",padding:"32px 0 16px",color:C.textDim,fontSize:12,...s.mono}}>
        PD Arena — A game theory exploration platform · <span style={{cursor:"pointer",color:C.textMuted}} onClick={() => setView("about")}>About & Methodology</span>
      </div>
    </div></div>
  );
}
