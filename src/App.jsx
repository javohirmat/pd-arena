import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ============================================================
// PD ARENA — Iterated Prisoner's Dilemma Tournament Simulator
// ============================================================

// --- PAYOFF MATRIX ---
const PAYOFFS = {
  CC: [3, 3], // Both cooperate
  CD: [0, 5], // I cooperate, they defect
  DC: [5, 0], // I defect, they cooperate
  DD: [1, 1], // Both defect
};

// --- STRATEGY DEFINITIONS ---
// Each strategy: { name, category, description, fn(myHistory, theirHistory, round) => 'C' | 'D' }
// myHistory/theirHistory are arrays of 'C'/'D', round is 0-indexed

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

const STRATEGIES = [
  // === CLASSIC ===
  {
    name: "Tit-for-Tat",
    category: "classic",
    description: "Cooperate first, then copy opponent's last move. The famous Axelrod winner.",
    fn: (my, their, r) => r === 0 ? "C" : their[r - 1],
  },
  {
    name: "Always Cooperate",
    category: "classic",
    description: "Unconditional cooperation. Pure altruism.",
    fn: () => "C",
  },
  {
    name: "Always Defect",
    category: "classic",
    description: "Unconditional defection. Pure selfishness.",
    fn: () => "D",
  },
  {
    name: "Random",
    category: "classic",
    description: "50/50 coin flip each round. Complete chaos.",
    fn: () => (Math.random() < 0.5 ? "C" : "D"),
  },
  {
    name: "Grudger",
    category: "classic",
    description: "Cooperate until betrayed, then defect forever. Never forgives.",
    fn: (my, their) => their.includes("D") ? "D" : "C",
  },
  {
    name: "Pavlov",
    category: "classic",
    description: "Win-stay, lose-shift. Repeats last move if it scored well.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      const lastOutcome = my[r - 1] + their[r - 1];
      return lastOutcome === "CC" || lastOutcome === "DC" ? my[r - 1] : my[r - 1] === "C" ? "D" : "C";
    },
  },
  {
    name: "Suspicious TFT",
    category: "classic",
    description: "Like TFT but defects first. Trust must be earned.",
    fn: (my, their, r) => r === 0 ? "D" : their[r - 1],
  },
  {
    name: "Tit-for-Two-Tats",
    category: "classic",
    description: "Only retaliates after TWO consecutive defections. Extra forgiving.",
    fn: (my, their, r) => {
      if (r < 2) return "C";
      return their[r - 1] === "D" && their[r - 2] === "D" ? "D" : "C";
    },
  },
  {
    name: "Detective",
    category: "classic",
    description: "Probes with C,D,C,C. Exploits cooperators, plays TFT vs retaliators.",
    fn: (my, their, r) => {
      const opening = ["C", "D", "C", "C"];
      if (r < 4) return opening[r];
      const theyRetaliated = their.slice(0, 4).includes("D");
      if (theyRetaliated) return their[r - 1]; // TFT
      return "D"; // Exploit
    },
  },
  {
    name: "Soft Majority",
    category: "classic",
    description: "Cooperate if opponent has cooperated at least half the time.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      const coops = their.filter((m) => m === "C").length;
      return coops >= their.length / 2 ? "C" : "D";
    },
  },

  // === COOPERATIVE ===
  {
    name: "Generous TFT",
    category: "cooperative",
    description: "TFT but forgives defections 10% of the time. Breaks deadlocks.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (their[r - 1] === "D") return Math.random() < 0.1 ? "C" : "D";
      return "C";
    },
  },
  {
    name: "Firm but Fair",
    category: "cooperative",
    description: "Cooperate unless just got suckered. Quick to forgive mutual defection.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      return my[r - 1] === "C" && their[r - 1] === "D" ? "D" : "C";
    },
  },
  {
    name: "Peacemaker",
    category: "cooperative",
    description: "Like TFT but randomly cooperates 20% of the time when it would defect.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (their[r - 1] === "D") return Math.random() < 0.2 ? "C" : "D";
      return "C";
    },
  },
  {
    name: "Slow Grudger",
    category: "cooperative",
    description: "Needs 3 defections before it retaliates. Very patient.",
    fn: (my, their) => {
      const defCount = their.filter((m) => m === "D").length;
      return defCount >= 3 ? "D" : "C";
    },
  },
  {
    name: "Handshake",
    category: "cooperative",
    description: "Opens D,C,C. If opponent mirrors, cooperates forever. Otherwise plays TFT.",
    fn: (my, their, r) => {
      const sig = ["D", "C", "C"];
      if (r < 3) return sig[r];
      const mirrored = their[0] === "D" && their[1] === "C" && their[2] === "C";
      if (mirrored) return "C";
      return their[r - 1];
    },
  },
  {
    name: "Forgiver",
    category: "cooperative",
    description: "Cooperates, retaliates once for each defection, then forgives.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (their[r - 1] === "D") return "D";
      return "C";
    },
  },
  {
    name: "Soft Grudger",
    category: "cooperative",
    description: "After a defection, punishes with D,D,D,D,C,C then resets.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      // Find last defection
      for (let i = their.length - 1; i >= 0; i--) {
        if (their[i] === "D") {
          const since = r - i - 1;
          if (since < 4) return "D";
          if (since < 6) return "C";
          break;
        }
      }
      return "C";
    },
  },
  {
    name: "Omega TFT",
    category: "cooperative",
    description: "Tracks cooperation and randomness. Cooperates with cooperators, defects against chaos.",
    fn: (my, their, r) => {
      if (r < 3) return "C";
      let switches = 0;
      for (let i = 1; i < their.length; i++) {
        if (their[i] !== their[i - 1]) switches++;
      }
      const randomness = switches / (their.length - 1);
      if (randomness > 0.6) return "D"; // Too random/chaotic
      return their[r - 1]; // TFT otherwise
    },
  },

  // === AGGRESSIVE ===
  {
    name: "Bully",
    category: "aggressive",
    description: "Defects first. If opponent retaliates, backs down to cooperate.",
    fn: (my, their, r) => {
      if (r === 0) return "D";
      return their[r - 1] === "D" ? "C" : "D";
    },
  },
  {
    name: "Backstabber",
    category: "aggressive",
    description: "Cooperates for first 50 rounds building trust, then defects forever.",
    fn: (my, their, r) => r < 50 ? "C" : "D",
  },
  {
    name: "Spiteful CC",
    category: "aggressive",
    description: "Cooperates until opponent defects. Retaliates with 5 defections then grudges.",
    fn: (my, their, r) => {
      const firstDefect = their.indexOf("D");
      if (firstDefect === -1) return "C";
      return "D"; // Permanent grudge
    },
  },
  {
    name: "Aggravater",
    category: "aggressive",
    description: "Defects for first 3 rounds to provoke, then plays TFT.",
    fn: (my, their, r) => {
      if (r < 3) return "D";
      return their[r - 1];
    },
  },
  {
    name: "Punisher",
    category: "aggressive",
    description: "Tracks defection ratio. More defections = longer punishment streaks.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      const defRate = their.filter((m) => m === "D").length / their.length;
      if (defRate > 0.5) return "D";
      if (defRate > 0.3) return Math.random() < defRate ? "D" : "C";
      return their[r - 1];
    },
  },
  {
    name: "Joss",
    category: "aggressive",
    description: "TFT but randomly defects 10% of the time. Sneaky exploiter.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (their[r - 1] === "C") return Math.random() < 0.1 ? "D" : "C";
      return "D";
    },
  },
  {
    name: "Grim Trigger",
    category: "aggressive",
    description: "Cooperates until a SINGLE defection, then defects forever. Zero tolerance.",
    fn: (my, their) => their.includes("D") ? "D" : "C",
  },
  {
    name: "Endgame Defector",
    category: "aggressive",
    description: "Cooperates normally with TFT but defects in the last 10 rounds.",
    fn: (my, their, r, totalRounds) => {
      if (totalRounds && r >= totalRounds - 10) return "D";
      if (r >= 190) return "D"; // Fallback if totalRounds not passed
      if (r === 0) return "C";
      return their[r - 1];
    },
  },

  // === ADAPTIVE ===
  {
    name: "Adaptive",
    category: "adaptive",
    description: "Tries both C and D for 6 rounds each, then picks whichever scored higher.",
    fn: (my, their, r) => {
      if (r < 6) return "C";
      if (r < 12) return "D";
      // Calculate scores from test phases
      let cScore = 0, dScore = 0;
      for (let i = 0; i < 6; i++) {
        const key = "C" + their[i];
        cScore += PAYOFFS[key][0];
      }
      for (let i = 6; i < 12; i++) {
        const key = "D" + their[i];
        dScore += PAYOFFS[key][0];
      }
      return cScore >= dScore ? "C" : "D";
    },
  },
  {
    name: "Gradual",
    category: "adaptive",
    description: "Punishes proportionally: nth defection gets n rounds of punishment, then reconciles.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      const defections = their.filter((m) => m === "D").length;
      // Count recent punishment streak
      let punishing = 0;
      for (let i = my.length - 1; i >= 0 && my[i] === "D"; i--) punishing++;
      if (their[r - 1] === "D" && punishing < defections) return "D";
      if (punishing > 0 && punishing < defections) return "D";
      return "C";
    },
  },
  {
    name: "Prober",
    category: "adaptive",
    description: "Tests with D on round 2. If opponent doesn't retaliate, defects more. Otherwise TFT.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (r === 1) return "D";
      if (r === 2) return "C";
      if (r === 3) {
        if (their[2] === "C" && their[1] === "C") return "D"; // Exploit
        return their[r - 1]; // TFT
      }
      if (their[2] === "C" && their[1] === "C") return "D";
      return their[r - 1];
    },
  },
  {
    name: "Equalizer",
    category: "adaptive",
    description: "Tries to keep both players' scores equal by adjusting cooperation rate.",
    fn: (my, their, r) => {
      if (r < 2) return "C";
      let myScore = 0, theirScore = 0;
      for (let i = 0; i < r; i++) {
        const key = my[i] + their[i];
        myScore += PAYOFFS[key][0];
        theirScore += PAYOFFS[key][1];
      }
      if (myScore < theirScore) return "D";
      if (myScore > theirScore + 5) return "C";
      return their[r - 1];
    },
  },
  {
    name: "Mirror",
    category: "adaptive",
    description: "Matches the opponent's overall cooperation rate probabilistically.",
    fn: (my, their, r) => {
      if (r < 2) return "C";
      const coopRate = their.filter((m) => m === "C").length / their.length;
      return Math.random() < coopRate ? "C" : "D";
    },
  },
  {
    name: "TFT with Forgiveness",
    category: "adaptive",
    description: "TFT but after mutual defection, forgives with 30% probability.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (my[r - 1] === "D" && their[r - 1] === "D" && Math.random() < 0.3) return "C";
      return their[r - 1];
    },
  },
  {
    name: "Contrite TFT",
    category: "adaptive",
    description: "Like TFT but cooperates after its own accidental defection caused mutual defection.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (r >= 2 && my[r - 1] === "D" && my[r - 2] === "C" && their[r - 2] === "C") return "C";
      return their[r - 1];
    },
  },

  // === PROBING ===
  {
    name: "Hard Prober",
    category: "probing",
    description: "Opens D,D,C,C. If opponent cooperated on rounds 2-3, defects forever.",
    fn: (my, their, r) => {
      if (r < 2) return "D";
      if (r < 4) return "C";
      if (their[1] === "C" && their[2] === "C") return "D";
      return their[r - 1];
    },
  },
  {
    name: "Remorseful Prober",
    category: "probing",
    description: "Like Joss but if random defection triggers retaliation, cooperates twice to make up.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (r >= 2 && my[r - 1] === "D" && my[r - 2] === "C" && their[r - 1] === "D") return "C";
      if (their[r - 1] === "C") return Math.random() < 0.1 ? "D" : "C";
      return "D";
    },
  },
  {
    name: "Naive Prober",
    category: "probing",
    description: "TFT that randomly defects 5% of the time to test the waters.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (Math.random() < 0.05) return "D";
      return their[r - 1];
    },
  },
  {
    name: "Probe and Punish",
    category: "probing",
    description: "Cooperates 10 rounds, probes with D. If they don't retaliate, exploits gradually.",
    fn: (my, their, r) => {
      if (r < 10) return "C";
      if (r === 10) return "D";
      if (r === 11) {
        if (their[10] === "C") return "D"; // They didn't fight back
        return "C"; // They fought back, return to cooperation
      }
      if (their[10] === "C") {
        // Exploit pattern: defect every 3rd round, escalating
        const exploitRate = Math.min(0.8, 0.3 + (r - 12) * 0.005);
        return Math.random() < exploitRate ? "D" : "C";
      }
      return their[r - 1]; // TFT if they're strong
    },
  },

  // === STOCHASTIC ===
  {
    name: "Random 70C",
    category: "stochastic",
    description: "70% chance to cooperate each round. Biased toward niceness.",
    fn: () => Math.random() < 0.7 ? "C" : "D",
  },
  {
    name: "Random 30C",
    category: "stochastic",
    description: "30% chance to cooperate. Mostly defects but unpredictably.",
    fn: () => Math.random() < 0.3 ? "C" : "D",
  },
  {
    name: "Noisy TFT",
    category: "stochastic",
    description: "TFT but has a 5% error rate — sometimes misexecutes its intended move.",
    fn: (my, their, r) => {
      let intended = r === 0 ? "C" : their[r - 1];
      if (Math.random() < 0.05) intended = intended === "C" ? "D" : "C";
      return intended;
    },
  },
  {
    name: "Stochastic Grudger",
    category: "stochastic",
    description: "After betrayal, defects with increasing probability that never quite reaches 100%.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      const defCount = their.filter((m) => m === "D").length;
      if (defCount === 0) return "C";
      const pDefect = Math.min(0.95, defCount / (their.length * 0.5));
      return Math.random() < pDefect ? "D" : "C";
    },
  },
  {
    name: "Chaos Monkey",
    category: "stochastic",
    description: "Flips between cooperation streaks and defection streaks randomly.",
    fn: (my, their, r) => {
      const streakLen = 3 + Math.floor(Math.sin(r * 0.7) * 3);
      const phase = Math.floor(r / Math.max(1, Math.abs(streakLen)));
      return phase % 2 === 0 ? "C" : "D";
    },
  },

  // === MEMORY ===
  {
    name: "Two-Tits-for-Tat",
    category: "memory",
    description: "Retaliates with TWO defections for each opponent defection.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (their[r - 1] === "D") return "D";
      if (r >= 2 && their[r - 2] === "D") return "D";
      return "C";
    },
  },
  {
    name: "Memory Decay",
    category: "memory",
    description: "Weighs recent moves more heavily. Old betrayals matter less over time.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      let weightedCoop = 0, totalWeight = 0;
      for (let i = 0; i < their.length; i++) {
        const weight = Math.pow(0.95, their.length - 1 - i);
        if (their[i] === "C") weightedCoop += weight;
        totalWeight += weight;
      }
      return weightedCoop / totalWeight >= 0.5 ? "C" : "D";
    },
  },
  {
    name: "Last 3 Majority",
    category: "memory",
    description: "Looks at opponent's last 3 moves. Goes with the majority.",
    fn: (my, their, r) => {
      if (r < 3) return "C";
      const last3 = their.slice(-3);
      const coops = last3.filter((m) => m === "C").length;
      return coops >= 2 ? "C" : "D";
    },
  },
  {
    name: "Pattern Detector",
    category: "memory",
    description: "Looks for 2-move patterns in opponent history and predicts next move.",
    fn: (my, their, r) => {
      if (r < 4) return "C";
      const last2 = their[r - 2] + their[r - 1];
      // Count what followed this pattern before
      let cAfter = 0, dAfter = 0;
      for (let i = 0; i < their.length - 2; i++) {
        if (their[i] + their[i + 1] === last2) {
          if (their[i + 2] === "C") cAfter++;
          else dAfter++;
        }
      }
      if (cAfter + dAfter === 0) return "C";
      const predicted = cAfter >= dAfter ? "C" : "D";
      // If they'll cooperate, cooperate. If they'll defect, defect first.
      return predicted;
    },
  },
  {
    name: "Historian",
    category: "memory",
    description: "Tracks opponent's response to each of its own moves. Picks the move that historically gets cooperation.",
    fn: (my, their, r) => {
      if (r < 5) return "C";
      let cGetsC = 0, cTotal = 0, dGetsC = 0, dTotal = 0;
      for (let i = 0; i < my.length - 1; i++) {
        if (my[i] === "C") { cTotal++; if (their[i + 1] === "C") cGetsC++; }
        else { dTotal++; if (their[i + 1] === "C") dGetsC++; }
      }
      const cRate = cTotal > 0 ? cGetsC / cTotal : 0.5;
      const dRate = dTotal > 0 ? dGetsC / dTotal : 0.5;
      // Pick move that maximizes expected cooperation from opponent
      return cRate >= dRate ? "C" : "D";
    },
  },

  // === RETALIATORY ===
  {
    name: "Hard Majority",
    category: "retaliatory",
    description: "Defects if opponent has defected more than cooperated. Strict accountant.",
    fn: (my, their, r) => {
      if (r === 0) return "D";
      const defects = their.filter((m) => m === "D").length;
      return defects > their.length / 2 ? "D" : "C";
    },
  },
  {
    name: "Revenge",
    category: "retaliatory",
    description: "Keeps a running tally. Each defection adds 2 retaliatory defections to the queue.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      let debt = 0;
      let paid = 0;
      for (let i = 0; i < their.length; i++) {
        if (their[i] === "D") debt += 2;
        if (i > 0 && my[i] === "D" && their[i - 1] === "D") paid++;
      }
      return paid < debt ? "D" : "C";
    },
  },
  {
    name: "Berserk",
    category: "retaliatory",
    description: "One defection triggers 10 rounds of rage, then calms down.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      for (let i = Math.max(0, r - 10); i < r; i++) {
        if (their[i] === "D") return "D";
      }
      return "C";
    },
  },
  {
    name: "Resentful",
    category: "retaliatory",
    description: "Each defection permanently increases its defection probability by 15%.",
    fn: (my, their, r) => {
      const defCount = their.filter((m) => m === "D").length;
      const pDefect = Math.min(0.99, defCount * 0.15);
      return Math.random() < pDefect ? "D" : "C";
    },
  },

  // === FORGIVING ===
  {
    name: "Generous",
    category: "forgiving",
    description: "TFT but cooperates 30% of the time even after a defection.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      if (their[r - 1] === "D") return Math.random() < 0.3 ? "C" : "D";
      return "C";
    },
  },
  {
    name: "Soft Grudger v2",
    category: "forgiving",
    description: "Grudges for 5 rounds then tests cooperation again.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      const lastDefect = their.lastIndexOf("D");
      if (lastDefect === -1) return "C";
      if (r - lastDefect <= 5) return "D";
      return "C";
    },
  },
  {
    name: "Gradual Forgiver",
    category: "forgiving",
    description: "Defection triggers proportional punishment, but each time it takes more defections to trigger.",
    fn: (my, their, r) => {
      if (r < 2) return "C";
      const recent10 = their.slice(Math.max(0, r - 10));
      const defRate = recent10.filter((m) => m === "D").length / recent10.length;
      // Threshold increases over time
      const threshold = Math.min(0.8, 0.3 + r * 0.002);
      return defRate > threshold ? "D" : "C";
    },
  },
  {
    name: "Second Chance",
    category: "forgiving",
    description: "Forgives the first defection. Only retaliates from the second onward.",
    fn: (my, their, r) => {
      const defCount = their.filter((m) => m === "D").length;
      if (defCount <= 1) return "C";
      return their[r - 1] === "D" ? "D" : "C";
    },
  },

  // === MATHEMATICAL ===
  {
    name: "Golden Ratio",
    category: "mathematical",
    description: "Cooperates in a pattern based on the golden ratio. ~61.8% cooperation.",
    fn: (my, their, r) => {
      const phi = (1 + Math.sqrt(5)) / 2;
      return (r * phi) % 1 < 0.618 ? "C" : "D";
    },
  },
  {
    name: "Fibonacci",
    category: "mathematical",
    description: "Cooperates on Fibonacci-numbered rounds, defects on others.",
    fn: (my, their, r) => {
      let a = 1, b = 1;
      while (b <= r) { [a, b] = [b, a + b]; }
      return b === r || a === r ? "C" : "D";
    },
  },
  {
    name: "Pi Strategy",
    category: "mathematical",
    description: "Uses digits of pi to decide. Even digit = cooperate, odd = defect.",
    fn: (my, their, r) => {
      const piDigits = "31415926535897932384626433832795028841971693993751";
      const idx = r % piDigits.length;
      return parseInt(piDigits[idx]) % 2 === 0 ? "C" : "D";
    },
  },
  {
    name: "Bayesian",
    category: "mathematical",
    description: "Maintains a probability estimate of opponent cooperating and acts on expected value.",
    fn: (my, their, r) => {
      if (r < 3) return "C";
      // Prior: 0.5, update with evidence
      const alpha = 1 + their.filter((m) => m === "C").length;
      const beta = 1 + their.filter((m) => m === "D").length;
      const pCoop = alpha / (alpha + beta);
      // EV of cooperating: pCoop * 3 + (1-pCoop) * 0
      // EV of defecting: pCoop * 5 + (1-pCoop) * 1
      const evC = pCoop * 3;
      const evD = pCoop * 5 + (1 - pCoop) * 1;
      return evC >= evD - 1 ? "C" : "D"; // Slight bias toward cooperation
    },
  },
  {
    name: "Exponential Backoff",
    category: "mathematical",
    description: "After each defection, waits exponentially longer before trusting again.",
    fn: (my, their, r) => {
      if (r === 0) return "C";
      const defections = their.filter((m) => m === "D").length;
      if (defections === 0) return "C";
      const lastDefect = their.lastIndexOf("D");
      const waitTime = Math.pow(2, Math.min(defections, 6));
      return r - lastDefect > waitTime ? "C" : "D";
    },
  },
  {
    name: "Sine Wave",
    category: "mathematical",
    description: "Cooperation probability oscillates sinusoidally. Predictably unpredictable.",
    fn: (my, their, r) => {
      const p = 0.5 + 0.4 * Math.sin(r * 0.15);
      return Math.random() < p ? "C" : "D";
    },
  },
  {
    name: "Tidal",
    category: "mathematical",
    description: "Long cooperation tides followed by short defection bursts. 20C, 5D repeating.",
    fn: (my, their, r) => r % 25 < 20 ? "C" : "D",
  },
  {
    name: "E Strategy",
    category: "mathematical",
    description: "Uses digits of Euler's number to decide. Like Pi Strategy's twin.",
    fn: (my, their, r) => {
      const eDigits = "27182818284590452353602874713526624977572470936999";
      const idx = r % eDigits.length;
      return parseInt(eDigits[idx]) % 2 === 0 ? "C" : "D";
    },
  },
  {
    name: "Game Theorist",
    category: "mathematical",
    description: "Calculates opponent's likely strategy and best-responds. Minimax approach.",
    fn: (my, their, r) => {
      if (r < 5) return "C";
      // Estimate if opponent is TFT-like, cooperator, or defector
      let tftMatch = 0;
      for (let i = 1; i < their.length; i++) {
        if (their[i] === my[i - 1]) tftMatch++;
      }
      const tftRate = tftMatch / (their.length - 1);
      const coopRate = their.filter((m) => m === "C").length / their.length;

      if (tftRate > 0.8) return "C"; // They're TFT, cooperate
      if (coopRate > 0.8) return "D"; // They're a sucker, exploit
      if (coopRate < 0.2) return "D"; // They always defect, so do we
      return their[r - 1]; // Uncertain, play TFT
    },
  },
];

// --- TOURNAMENT ENGINE ---
function runMatch(s1, s2, rounds) {
  const h1 = [], h2 = [];
  let score1 = 0, score2 = 0;
  for (let r = 0; r < rounds; r++) {
    const m1 = s1.fn(h1, h2, r, rounds);
    const m2 = s2.fn(h2, h1, r, rounds);
    const key = m1 + m2;
    score1 += PAYOFFS[key][0];
    score2 += PAYOFFS[key][1];
    h1.push(m1);
    h2.push(m2);
  }
  return { score1, score2, history1: h1, history2: h2 };
}

function runTournament(strategies, rounds) {
  const n = strategies.length;
  const scores = new Array(n).fill(0);
  const matchResults = {};

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const result = runMatch(strategies[i], strategies[j], rounds);
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

function runEvolution(strategies, rounds, generations = 80) {
  const n = strategies.length;
  let populations = new Array(n).fill(1 / n);
  const history = [populations.slice()];

  for (let gen = 0; gen < generations; gen++) {
    const scores = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (populations[i] < 0.001) continue;
      for (let j = 0; j < n; j++) {
        if (i === j || populations[j] < 0.001) continue;
        const result = runMatch(strategies[i], strategies[j], rounds);
        scores[i] += result.score1 * populations[j];
      }
    }
    const totalFitness = scores.reduce((a, b, i) => a + b * populations[i], 0);
    if (totalFitness > 0) {
      populations = populations.map((p, i) => (p * scores[i]) / totalFitness);
    }
    // Normalize
    const sum = populations.reduce((a, b) => a + b, 0);
    populations = populations.map((p) => p / sum);
    history.push(populations.slice());
  }
  return history;
}

// --- FONT LOADING ---
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=DM+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// --- STYLES ---
const COLORS = {
  bg: "#0a0a0f",
  bgCard: "#12121a",
  bgHover: "#1a1a27",
  border: "#ffffff10",
  borderActive: "#ffffff25",
  text: "#e8e6e3",
  textMuted: "#8a8690",
  textDim: "#5a5660",
  accent: "#60a5fa",
  accentGlow: "#60a5fa40",
  cooperate: "#34d399",
  defect: "#f87171",
  gold: "#fbbf24",
  silver: "#94a3b8",
  bronze: "#d97706",
};

// --- COMPONENTS ---

// Canvas chart for evolution
function EvolutionChart({ data, strategies, width = 700, height = 360 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = { top: 10, right: 10, bottom: 30, left: 40 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    // Axes
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + h);
    ctx.lineTo(pad.left + w, pad.top + h);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = COLORS.textDim;
    ctx.font = "11px 'IBM Plex Mono'";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + h - (i / 4) * h;
      ctx.fillText((i * 25) + "%", pad.left - 6, y + 4);
    }

    // X-axis
    ctx.textAlign = "center";
    const genStep = Math.ceil(data.length / 8);
    for (let i = 0; i < data.length; i += genStep) {
      const x = pad.left + (i / (data.length - 1)) * w;
      ctx.fillText(i.toString(), x, pad.top + h + 18);
    }

    // Find top strategies to show (those that were ever > 5% population)
    const significant = [];
    for (let si = 0; si < strategies.length; si++) {
      const maxPop = Math.max(...data.map(d => d[si]));
      if (maxPop > 0.01) significant.push(si);
    }

    // Colors
    const catColors = {};
    STRATEGY_CATEGORIES.forEach(c => catColors[c.id] = c.color);
    const palette = significant.map((si, idx) => {
      const base = catColors[strategies[si].category] || COLORS.accent;
      return base;
    });

    // Draw lines
    significant.forEach((si, idx) => {
      ctx.strokeStyle = palette[idx];
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let g = 0; g < data.length; g++) {
        const x = pad.left + (g / (data.length - 1)) * w;
        const y = pad.top + h - data[g][si] * h;
        if (g === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Labels at end
    const sorted = significant.sort((a, b) => data[data.length - 1][b] - data[data.length - 1][a]);
    let labelY = pad.top;
    sorted.slice(0, 8).forEach((si, idx) => {
      const finalPop = data[data.length - 1][si];
      if (finalPop < 0.01) return;
      ctx.fillStyle = palette[significant.indexOf(si)];
      ctx.font = "10px 'DM Sans'";
      ctx.textAlign = "left";
      const name = strategies[si].name.length > 16 ? strategies[si].name.slice(0, 15) + "…" : strategies[si].name;
      ctx.fillText(`${name} ${(finalPop * 100).toFixed(1)}%`, pad.left + w - 150, labelY + 12);
      labelY += 14;
    });
  }, [data, strategies, width, height]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: height, display: "block" }} />;
}

// Heat map
function HeatMap({ matchResults, strategies, standings, onSelectMatch }) {
  const canvasRef = useRef(null);
  const n = strategies.length;
  const cellSize = Math.min(28, Math.floor(560 / n));
  const labelWidth = 110;
  const width = labelWidth + n * cellSize + 10;
  const height = labelWidth + n * cellSize + 10;

  const sortedIndices = standings.map(s => s.index);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Draw cells
    for (let ri = 0; ri < n; ri++) {
      for (let ci = 0; ci < n; ci++) {
        const si = sortedIndices[ri];
        const sj = sortedIndices[ci];
        const x = labelWidth + ci * cellSize;
        const y = labelWidth + ri * cellSize;

        if (si === sj) {
          ctx.fillStyle = "#1a1a27";
          ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
          continue;
        }

        const key = si < sj ? `${si}-${sj}` : `${sj}-${si}`;
        const result = matchResults[key];
        if (!result) continue;
        const score = si < sj ? result.score1 : result.score2;
        const maxPossible = 200 * 5;
        const ratio = score / maxPossible;

        // Color: green for high scores, red for low
        const r = Math.round(248 * (1 - ratio) + 52 * ratio);
        const g = Math.round(113 * (1 - ratio) + 211 * ratio);
        const b = Math.round(113 * (1 - ratio) + 153 * ratio);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
      }
    }

    // Row labels
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = `${Math.min(10, cellSize - 4)}px 'DM Sans'`;
    ctx.textAlign = "right";
    for (let i = 0; i < n; i++) {
      const name = strategies[sortedIndices[i]].name;
      const display = name.length > 14 ? name.slice(0, 13) + "…" : name;
      ctx.fillText(display, labelWidth - 5, labelWidth + i * cellSize + cellSize / 2 + 3);
    }

    // Column labels (rotated)
    ctx.save();
    ctx.textAlign = "left";
    for (let i = 0; i < n; i++) {
      const name = strategies[sortedIndices[i]].name;
      const display = name.length > 14 ? name.slice(0, 13) + "…" : name;
      ctx.save();
      ctx.translate(labelWidth + i * cellSize + cellSize / 2, labelWidth - 5);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(display, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }, [matchResults, strategies, standings, n]);

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX - labelWidth;
    const y = (e.clientY - rect.top) * scaleY - labelWidth;
    const ci = Math.floor(x / cellSize);
    const ri = Math.floor(y / cellSize);
    if (ci >= 0 && ci < n && ri >= 0 && ri < n && ci !== ri) {
      onSelectMatch(sortedIndices[ri], sortedIndices[ci]);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: Math.min(width, 680), height: Math.min(height, 680), cursor: "pointer" }}
      onClick={handleClick}
    />
  );
}

// Match Replay
function MatchReplay({ s1, s2, history1, history2, score1, score2, rounds }) {
  const canvasRef = useRef(null);
  const [hoveredRound, setHoveredRound] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = 680, h = 180;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Score progression
    const pad = { top: 20, right: 10, bottom: 25, left: 45 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    let cum1 = 0, cum2 = 0;
    const scores1 = [], scores2 = [];
    for (let i = 0; i < rounds; i++) {
      const key = history1[i] + history2[i];
      cum1 += PAYOFFS[key][0];
      cum2 += PAYOFFS[key][1];
      scores1.push(cum1);
      scores2.push(cum2);
    }
    const maxScore = Math.max(cum1, cum2, 1);

    // Lines
    [{ data: scores1, color: COLORS.accent }, { data: scores2, color: COLORS.gold }].forEach(({ data, color }) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = pad.left + (i / (rounds - 1)) * cw;
        const y = pad.top + ch - (v / maxScore) * ch;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Axis
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + ch);
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.stroke();

    ctx.fillStyle = COLORS.textDim;
    ctx.font = "10px 'IBM Plex Mono'";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const r = Math.round((i / 4) * rounds);
      ctx.fillText(r.toString(), pad.left + (r / rounds) * cw, pad.top + ch + 15);
    }
  }, [history1, history2, rounds]);

  // Timeline strip
  const stripH = 28;
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontFamily: "'DM Sans'" }}>
        <span style={{ color: COLORS.accent, fontWeight: 600 }}>{s1.name}: {score1}</span>
        <span style={{ color: COLORS.textDim }}>vs</span>
        <span style={{ color: COLORS.gold, fontWeight: 600 }}>{s2.name}: {score2}</span>
      </div>
      <canvas ref={canvasRef} style={{ width: 680, height: 180 }} />
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, fontFamily: "'IBM Plex Mono'" }}>Round-by-round (hover for details)</div>
        <div style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
          {history1.map((m1, i) => {
            const m2 = history2[i];
            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredRound(i)}
                onMouseLeave={() => setHoveredRound(null)}
                style={{
                  width: Math.max(2, Math.min(6, 600 / rounds)),
                  height: stripH,
                  display: "flex",
                  flexDirection: "column",
                  cursor: "pointer",
                }}
              >
                <div style={{
                  flex: 1,
                  backgroundColor: m1 === "C" ? COLORS.cooperate + "cc" : COLORS.defect + "cc",
                }} />
                <div style={{
                  flex: 1,
                  backgroundColor: m2 === "C" ? COLORS.cooperate + "66" : COLORS.defect + "66",
                }} />
              </div>
            );
          })}
        </div>
        {hoveredRound !== null && (
          <div style={{ fontSize: 12, color: COLORS.text, marginTop: 4, fontFamily: "'IBM Plex Mono'" }}>
            Round {hoveredRound + 1}: {s1.name} <span style={{ color: history1[hoveredRound] === "C" ? COLORS.cooperate : COLORS.defect }}>{history1[hoveredRound] === "C" ? "Cooperated" : "Defected"}</span>
            {" · "}{s2.name} <span style={{ color: history2[hoveredRound] === "C" ? COLORS.cooperate : COLORS.defect }}>{history2[hoveredRound] === "C" ? "Cooperated" : "Defected"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// --- MAIN APP ---
export default function PDArena() {
  const [view, setView] = useState("home"); // home, library, tournament, results
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [rounds, setRounds] = useState(200);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [showAllStrategies, setShowAllStrategies] = useState(false);
  const [tournamentResults, setTournamentResults] = useState(null);
  const [evolutionData, setEvolutionData] = useState(null);
  const [resultTab, setResultTab] = useState("standings");
  const [replayMatch, setReplayMatch] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStrategy, setAiStrategy] = useState(null);
  const [customStrategies, setCustomStrategies] = useState([]);

  const allStrategies = useMemo(() => [...STRATEGIES, ...customStrategies], [customStrategies]);

  const filteredStrategies = useMemo(() => {
    let list = allStrategies;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }
    if (categoryFilter) {
      list = list.filter(s => s.category === categoryFilter);
    }
    return list;
  }, [allStrategies, searchQuery, categoryFilter]);

  const toggleStrategy = (idx) => {
    setSelectedStrategies(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const selectAll = () => setSelectedStrategies(allStrategies.map((_, i) => i));
  const selectNone = () => setSelectedStrategies([]);
  const selectClassic10 = () => setSelectedStrategies([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const runTournamentHandler = useCallback(() => {
    if (selectedStrategies.length < 2) return;
    setIsRunning(true);
    setView("results");
    setResultTab("standings");

    setTimeout(() => {
      const strats = selectedStrategies.map(i => allStrategies[i]);
      const results = runTournament(strats, rounds);
      setTournamentResults({ ...results, strategies: strats, indices: selectedStrategies });

      // Run evolution
      const evoData = runEvolution(strats, rounds);
      setEvolutionData(evoData);
      setIsRunning(false);
    }, 50);
  }, [selectedStrategies, rounds, allStrategies]);

  const handleMatchSelect = (i, j) => {
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

      if (response.status === 429) {
        setAiStrategy({ error: "Rate limit reached — you can create up to 10 strategies per hour. Try again later." });
        setAiLoading(false);
        return;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "AI service unavailable. Try again in a moment.");
      }

      const data = await response.json();
      const text = data.content.map(c => c.text || "").join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Create the function safely
      const fn = new Function("myHistory", "theirHistory", "round", "totalRounds", `return (${parsed.code})(myHistory, theirHistory, round, totalRounds);`);

      // Test it doesn't crash
      fn([], [], 0, 200);
      fn(["C"], ["D"], 1, 200);
      fn(["C","D","C"], ["D","C","D"], 3, 200);

      const newStrat = {
        name: parsed.name,
        category: parsed.category || "adaptive",
        description: parsed.description,
        fn,
        isCustom: true,
      };

      setAiStrategy(newStrat);
      setCustomStrategies(prev => [...prev, newStrat]);
      setAiPrompt("");
    } catch (e) {
      setAiStrategy({ error: e.message });
    }
    setAiLoading(false);
  };

  // --- RENDER ---
  const s = {
    app: {
      fontFamily: "'DM Sans', sans-serif",
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      minHeight: "100vh",
      padding: 0,
      margin: 0,
    },
    container: {
      maxWidth: 780,
      margin: "0 auto",
      padding: "24px 20px",
    },
    h1: {
      fontFamily: "'Playfair Display', serif",
      fontSize: 36,
      fontWeight: 900,
      margin: 0,
      letterSpacing: "-0.02em",
      lineHeight: 1.1,
    },
    h2: {
      fontFamily: "'Playfair Display', serif",
      fontSize: 22,
      fontWeight: 700,
      margin: "0 0 12px",
    },
    card: {
      background: COLORS.bgCard,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 10,
      padding: 20,
      marginBottom: 16,
    },
    btn: {
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 13,
      fontWeight: 600,
      padding: "8px 18px",
      borderRadius: 6,
      border: "none",
      cursor: "pointer",
      transition: "all 0.15s",
    },
    btnPrimary: {
      background: COLORS.accent,
      color: "#0a0a0f",
    },
    btnGhost: {
      background: "transparent",
      color: COLORS.textMuted,
      border: `1px solid ${COLORS.border}`,
    },
    mono: {
      fontFamily: "'IBM Plex Mono', monospace",
    },
    pill: {
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
    },
    input: {
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 14,
      padding: "10px 14px",
      borderRadius: 8,
      border: `1px solid ${COLORS.border}`,
      background: COLORS.bgCard,
      color: COLORS.text,
      outline: "none",
      width: "100%",
      boxSizing: "border-box",
    },
  };

  const catColor = (cat) => STRATEGY_CATEGORIES.find(c => c.id === cat)?.color || COLORS.accent;

  // =====================
  // HOME VIEW
  // =====================
  if (view === "home") {
    const popular = [0, 3, 5, 4, 8, 9, 1, 2]; // TFT, Random, Pavlov, Grudger, Detective, Soft Maj, Always C, Always D
    return (
      <div style={s.app}>
        <div style={s.container}>
          {/* Header */}
          <div style={{ textAlign: "center", padding: "40px 0 32px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12, ...s.mono }}>PD Arena</div>
            <h1 style={{ ...s.h1, fontSize: 42 }}>Why do nice guys<br />finish first?</h1>
            <p style={{ color: COLORS.textMuted, maxWidth: 480, margin: "16px auto 0", lineHeight: 1.6, fontSize: 15 }}>
              Run tournaments between {allStrategies.length} strategies in the iterated Prisoner's Dilemma. Watch evolution unfold. Discover what really wins.
            </p>
          </div>

          {/* Payoff Matrix */}
          <div style={{ ...s.card, textAlign: "center", maxWidth: 300, margin: "0 auto 32px" }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10, ...s.mono }}>PAYOFF MATRIX</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, ...s.mono }}>
              <thead>
                <tr>
                  <td></td>
                  <td style={{ padding: 8, color: COLORS.cooperate, fontWeight: 600 }}>Cooperate</td>
                  <td style={{ padding: 8, color: COLORS.defect, fontWeight: 600 }}>Defect</td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: 8, color: COLORS.cooperate, fontWeight: 600, textAlign: "right" }}>C</td>
                  <td style={{ padding: 8, background: "#34d39915" }}>3, 3</td>
                  <td style={{ padding: 8, background: "#f8717115" }}>0, 5</td>
                </tr>
                <tr>
                  <td style={{ padding: 8, color: COLORS.defect, fontWeight: 600, textAlign: "right" }}>D</td>
                  <td style={{ padding: 8, background: "#34d39910" }}>5, 0</td>
                  <td style={{ padding: 8, background: "#f8717110" }}>1, 1</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Popular Strategies */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={s.h2}>Popular Strategies</h2>
              <button
                onClick={() => setView("library")}
                style={{ ...s.btn, ...s.btnGhost, fontSize: 12 }}
              >
                See all {allStrategies.length} →
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {popular.map(idx => {
                const strat = allStrategies[idx];
                if (!strat) return null;
                const isSelected = selectedStrategies.includes(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleStrategy(idx)}
                    style={{
                      ...s.card,
                      marginBottom: 0,
                      cursor: "pointer",
                      borderColor: isSelected ? catColor(strat.category) + "80" : COLORS.border,
                      background: isSelected ? catColor(strat.category) + "10" : COLORS.bgCard,
                      transition: "all 0.15s",
                      position: "relative",
                      overflow: "hidden",
                      padding: "14px 16px",
                    }}
                  >
                    {isSelected && (
                      <div style={{
                        position: "absolute", top: 8, right: 10,
                        width: 18, height: 18, borderRadius: 9,
                        background: catColor(strat.category),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "#000", fontWeight: 700,
                      }}>✓</div>
                    )}
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{strat.name}</div>
                    <span style={{ ...s.pill, background: catColor(strat.category) + "20", color: catColor(strat.category) }}>{strat.category}</span>
                    <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>{strat.description}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            <button onClick={selectClassic10} style={{ ...s.btn, ...s.btnGhost }}>Select Classic 10</button>
            <button onClick={selectAll} style={{ ...s.btn, ...s.btnGhost }}>Select All ({allStrategies.length})</button>
            <button onClick={selectNone} style={{ ...s.btn, ...s.btnGhost }}>Clear</button>
          </div>

          {/* Rounds slider */}
          <div style={{ ...s.card, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 13, color: COLORS.textMuted, whiteSpace: "nowrap" }}>Rounds per match:</span>
            <input
              type="range" min="10" max="1000" step="10" value={rounds}
              onChange={(e) => setRounds(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: COLORS.accent }}
            />
            <span style={{ ...s.mono, fontSize: 14, fontWeight: 600, minWidth: 40, textAlign: "right" }}>{rounds}</span>
          </div>

          {/* Run button */}
          <button
            onClick={runTournamentHandler}
            disabled={selectedStrategies.length < 2}
            style={{
              ...s.btn,
              ...s.btnPrimary,
              width: "100%",
              padding: "14px 0",
              fontSize: 16,
              fontWeight: 700,
              opacity: selectedStrategies.length < 2 ? 0.4 : 1,
              marginBottom: 12,
            }}
          >
            Run Tournament ({selectedStrategies.length} strategies × {rounds} rounds)
          </button>

          {/* AI Creator */}
          <div style={{ ...s.card, marginTop: 8 }}>
            <div style={{ fontSize: 11, color: COLORS.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, ...s.mono }}>AI Strategy Creator</div>
            <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 12 }}>
              Describe a strategy in plain language and Claude will build it for you.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Start nice, but if betrayed 3 times, go on a defection spree for 10 rounds"
                style={{ ...s.input, flex: 1 }}
                onKeyDown={(e) => e.key === "Enter" && createAIStrategy()}
              />
              <button
                onClick={createAIStrategy}
                disabled={aiLoading || !aiPrompt.trim()}
                style={{ ...s.btn, ...s.btnPrimary, opacity: aiLoading ? 0.5 : 1, whiteSpace: "nowrap" }}
              >
                {aiLoading ? "Creating…" : "Create"}
              </button>
            </div>
            {aiStrategy && !aiStrategy.error && (
              <div style={{ marginTop: 12, padding: 12, background: "#34d39910", borderRadius: 8, border: `1px solid ${COLORS.cooperate}30` }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>✓ Created: {aiStrategy.name}</div>
                <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>{aiStrategy.description}</div>
                <div style={{ color: COLORS.textDim, fontSize: 11, marginTop: 4, ...s.mono }}>Added to strategy pool. Select it to include in tournaments.</div>
              </div>
            )}
            {aiStrategy?.error && (
              <div style={{ marginTop: 12, padding: 12, background: "#f8717110", borderRadius: 8, border: `1px solid ${COLORS.defect}30` }}>
                <div style={{ color: COLORS.defect, fontSize: 13 }}>Error: {aiStrategy.error}</div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", padding: "32px 0 16px", color: COLORS.textDim, fontSize: 12, ...s.mono }}>
            PD Arena — Module #1 of a game theory exploration platform
          </div>
        </div>
      </div>
    );
  }

  // =====================
  // LIBRARY VIEW
  // =====================
  if (view === "library") {
    return (
      <div style={s.app}>
        <div style={s.container}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setView("home")} style={{ ...s.btn, ...s.btnGhost, padding: "6px 12px" }}>← Back</button>
            <h1 style={{ ...s.h1, fontSize: 28 }}>Strategy Library</h1>
            <span style={{ ...s.mono, color: COLORS.textMuted, fontSize: 13, marginLeft: "auto" }}>{allStrategies.length} strategies</span>
          </div>

          {/* Search */}
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search strategies…"
            style={{ ...s.input, marginBottom: 12 }}
          />

          {/* Category filters */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            <button
              onClick={() => setCategoryFilter(null)}
              style={{
                ...s.btn, padding: "4px 12px", fontSize: 11,
                background: !categoryFilter ? COLORS.accent + "20" : "transparent",
                color: !categoryFilter ? COLORS.accent : COLORS.textMuted,
                border: `1px solid ${!categoryFilter ? COLORS.accent + "40" : COLORS.border}`,
              }}
            >All</button>
            {STRATEGY_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
                style={{
                  ...s.btn, padding: "4px 12px", fontSize: 11,
                  background: categoryFilter === cat.id ? cat.color + "20" : "transparent",
                  color: categoryFilter === cat.id ? cat.color : COLORS.textMuted,
                  border: `1px solid ${categoryFilter === cat.id ? cat.color + "40" : COLORS.border}`,
                }}
              >{cat.label}</button>
            ))}
          </div>

          {/* Strategy list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredStrategies.map(strat => {
              const idx = allStrategies.indexOf(strat);
              const isSelected = selectedStrategies.includes(idx);
              return (
                <div
                  key={idx}
                  onClick={() => toggleStrategy(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: isSelected ? catColor(strat.category) + "10" : COLORS.bgCard,
                    border: `1px solid ${isSelected ? catColor(strat.category) + "40" : COLORS.border}`,
                    cursor: "pointer",
                    transition: "all 0.1s",
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    border: `2px solid ${isSelected ? catColor(strat.category) : COLORS.textDim}`,
                    background: isSelected ? catColor(strat.category) : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: "#000", fontWeight: 700, flexShrink: 0,
                  }}>
                    {isSelected && "✓"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{strat.name}</span>
                      <span style={{ ...s.pill, background: catColor(strat.category) + "20", color: catColor(strat.category), fontSize: 10 }}>{strat.category}</span>
                    </div>
                    <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{strat.description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom action bar */}
          <div style={{
            position: "sticky", bottom: 0,
            background: `linear-gradient(transparent, ${COLORS.bg} 20%)`,
            padding: "32px 0 16px",
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <span style={{ color: COLORS.textMuted, fontSize: 13, ...s.mono }}>
              {selectedStrategies.length} selected
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setView("home")} style={{ ...s.btn, ...s.btnGhost }}>Configure →</button>
            <button
              onClick={runTournamentHandler}
              disabled={selectedStrategies.length < 2}
              style={{ ...s.btn, ...s.btnPrimary, opacity: selectedStrategies.length < 2 ? 0.4 : 1 }}
            >
              Run Tournament
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =====================
  // RESULTS VIEW
  // =====================
  if (view === "results") {
    if (isRunning) {
      return (
        <div style={s.app}>
          <div style={{ ...s.container, textAlign: "center", paddingTop: 80 }}>
            <div style={{ ...s.mono, fontSize: 14, color: COLORS.accent, marginBottom: 8 }}>Running tournament…</div>
            <div style={{ color: COLORS.textMuted, fontSize: 13 }}>{selectedStrategies.length} strategies × {rounds} rounds</div>
            <div style={{ marginTop: 32, fontSize: 24 }}>⏳</div>
          </div>
        </div>
      );
    }

    if (!tournamentResults) return null;

    const { standings, matchResults: mr, strategies: strats } = tournamentResults;
    const tabs = [
      { id: "standings", label: "Standings" },
      { id: "heatmap", label: "Heat Map" },
      { id: "evolution", label: "Evolution" },
      { id: "replay", label: "Match Replay" },
    ];

    return (
      <div style={s.app}>
        <div style={s.container}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setView("home")} style={{ ...s.btn, ...s.btnGhost, padding: "6px 12px" }}>← New</button>
            <h1 style={{ ...s.h1, fontSize: 24 }}>Tournament Results</h1>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${COLORS.border}` }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setResultTab(t.id)}
                style={{
                  ...s.btn,
                  background: "transparent",
                  color: resultTab === t.id ? COLORS.accent : COLORS.textMuted,
                  borderBottom: resultTab === t.id ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                  borderRadius: 0,
                  padding: "10px 18px",
                  fontWeight: resultTab === t.id ? 700 : 500,
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* STANDINGS TAB */}
          {resultTab === "standings" && (
            <div>
              {/* Top 3 */}
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {standings.slice(0, 3).map((entry, idx) => (
                  <div key={entry.index} style={{
                    ...s.card,
                    flex: 1,
                    textAlign: "center",
                    borderColor: [COLORS.gold, COLORS.silver, COLORS.bronze][idx] + "40",
                    marginBottom: 0,
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{["🥇", "🥈", "🥉"][idx]}</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{entry.name}</div>
                    <div style={{ ...s.pill, background: catColor(entry.category) + "20", color: catColor(entry.category), marginTop: 6 }}>{entry.category}</div>
                    <div style={{ ...s.mono, fontSize: 20, fontWeight: 700, marginTop: 8, color: COLORS.text }}>{entry.score.toLocaleString()}</div>
                    <div style={{ ...s.mono, fontSize: 11, color: COLORS.textMuted }}>{entry.avgPerRound.toFixed(2)} / round</div>
                  </div>
                ))}
              </div>

              {/* Full table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", color: COLORS.textMuted, fontWeight: 500, ...s.mono, fontSize: 11 }}>#</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", color: COLORS.textMuted, fontWeight: 500, ...s.mono, fontSize: 11 }}>Strategy</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", color: COLORS.textMuted, fontWeight: 500, ...s.mono, fontSize: 11 }}>Category</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", color: COLORS.textMuted, fontWeight: 500, ...s.mono, fontSize: 11 }}>Total</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", color: COLORS.textMuted, fontWeight: 500, ...s.mono, fontSize: 11 }}>Avg/Round</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((entry, rank) => (
                      <tr key={entry.index} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={{ padding: "8px 12px", ...s.mono, color: COLORS.textDim }}>{rank + 1}</td>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{entry.name}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ ...s.pill, background: catColor(entry.category) + "20", color: catColor(entry.category), fontSize: 10 }}>{entry.category}</span>
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", ...s.mono, fontWeight: 600 }}>{entry.score.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", ...s.mono, color: COLORS.textMuted }}>{entry.avgPerRound.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Quick insight */}
              <div style={{ ...s.card, marginTop: 20, background: "#60a5fa08" }}>
                <div style={{ fontSize: 11, ...s.mono, color: COLORS.accent, marginBottom: 8, letterSpacing: "0.1em" }}>TOURNAMENT INSIGHT</div>
                <p style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  {(() => {
                    const winner = standings[0];
                    const isNice = ["cooperative", "classic", "forgiving", "adaptive"].includes(winner.category);
                    const coopWinners = standings.slice(0, 5).filter(s =>
                      ["cooperative", "forgiving", "classic"].includes(s.category)
                    ).length;
                    if (isNice && coopWinners >= 3) {
                      return `${winner.name} wins — and ${coopWinners} of the top 5 are cooperative strategies. Axelrod's insight holds: in repeated interactions, niceness, forgiveness, and reciprocity dominate. Defectors burn bridges and pay the price.`;
                    } else if (!isNice) {
                      return `${winner.name} took first place — an aggressive/unconventional strategy wins this particular mix. The composition of strategies matters enormously: when cooperators are scarce, exploitation can pay off. But add more TFT-like strategies and the dynamics shift.`;
                    }
                    return `${winner.name} claims the top spot with ${winner.score.toLocaleString()} points across ${strats.length - 1} opponents over ${rounds} rounds each. Click the Heat Map to see individual matchups, or check Evolution to see which strategies would dominate over time.`;
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* HEAT MAP TAB */}
          {resultTab === "heatmap" && (
            <div>
              <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 16 }}>
                Each cell shows a strategy's score against another. Green = high score, red = low. Click any cell to see the match replay.
              </p>
              <div style={{ overflowX: "auto" }}>
                <HeatMap
                  matchResults={mr}
                  strategies={strats}
                  standings={standings}
                  onSelectMatch={handleMatchSelect}
                />
              </div>
            </div>
          )}

          {/* EVOLUTION TAB */}
          {resultTab === "evolution" && evolutionData && (
            <div>
              <p style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 16 }}>
                Population dynamics over 80 generations. Strategies that score well grow; poor performers shrink. Watch who survives.
              </p>
              <EvolutionChart data={evolutionData} strategies={strats} />
            </div>
          )}

          {/* MATCH REPLAY TAB */}
          {resultTab === "replay" && (
            <div>
              {replayMatch ? (
                <MatchReplay
                  s1={replayMatch.s1}
                  s2={replayMatch.s2}
                  history1={replayMatch.history1}
                  history2={replayMatch.history2}
                  score1={replayMatch.score1}
                  score2={replayMatch.score2}
                  rounds={rounds}
                />
              ) : (
                <div style={{ textAlign: "center", padding: 40, color: COLORS.textMuted }}>
                  <p>Select a match from the Heat Map to see its replay here.</p>
                  <button onClick={() => setResultTab("heatmap")} style={{ ...s.btn, ...s.btnGhost, marginTop: 12 }}>Go to Heat Map →</button>
                </div>
              )}
              {/* Quick match selector */}
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, ...s.mono, color: COLORS.textDim, marginBottom: 8 }}>QUICK REPLAY</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {standings.slice(0, 3).map((s1, i) =>
                    standings.slice(i + 1, Math.min(i + 4, standings.length)).map(s2 => (
                      <button
                        key={`${s1.index}-${s2.index}`}
                        onClick={() => handleMatchSelect(s1.index, s2.index)}
                        style={{ ...s.btn, ...s.btnGhost, fontSize: 11, padding: "4px 10px" }}
                      >
                        {s1.name} vs {s2.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
