// Rate limiting using in-memory store (resets on cold start, but good enough for free tier)
const rateLimit = new Map();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_IP = 10; // 10 strategy creations per hour per IP

function getRateLimitKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimit.get(ip);
  
  if (!record || now - record.windowStart > WINDOW_MS) {
    rateLimit.set(ip, { windowStart: now, count: 1 });
    return { allowed: true, remaining: MAX_REQUESTS_PER_IP - 1 };
  }
  
  if (record.count >= MAX_REQUESTS_PER_IP) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_IP - record.count };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit check
  const ip = getRateLimitKey(req);
  const limit = checkRateLimit(ip);
  
  res.setHeader('X-RateLimit-Remaining', limit.remaining);
  
  if (!limit.allowed) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded. You can create up to 10 strategies per hour.' 
    });
  }

  // Validate request body
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 1000) {
    return res.status(400).json({ error: 'Invalid prompt. Must be a string under 1000 characters.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You create Prisoner's Dilemma strategies. Given a natural language description, output ONLY a JSON object (no markdown, no backticks) with these fields:
- "name": short catchy name (2-3 words)
- "description": one-sentence description  
- "category": one of: classic, cooperative, aggressive, adaptive, probing, stochastic, memory, retaliatory, forgiving, mathematical
- "code": a JavaScript arrow function as a string. The function signature is (myHistory, theirHistory, round, totalRounds) => 'C' or 'D'. myHistory and theirHistory are arrays of 'C'/'D' strings. round is 0-indexed. Use only basic JS (no imports). The function must be pure and deterministic-safe (Math.random is ok).

User's strategy description: "${prompt.replace(/"/g, '\\"')}"

Respond with ONLY the JSON object, nothing else.`
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'AI service temporarily unavailable' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
