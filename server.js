import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { fetch } from 'undici';

const app = express();
const PORT = process.env.PORT || 3000;
const root = process.cwd();
const apiKey = process.env.OPENAI_API_KEY || process.env.HACKCLUB_API_KEY || process.env.AI_HACKCLUB_API_KEY || process.env.HACKCLUB_AI_API_KEY;
const API_BASE = process.env.API_BASE || process.env.HACKCLUB_API_BASE || 'https://ai.hackclub.com/proxy/v1';
const API_MODEL = process.env.API_MODEL || 'qwen/qwen3-8b';
const FALLBACK_MODELS = [process.env.API_MODEL || 'qwen/qwen3-8b', 'qwen/qwen3-32b'];

function personaPrompt(name) {
  return `You are ${name}, a polished conversational presence inside an elegant social network. Speak as a thoughtful participant, keep your tone natural and human. Your responses should feel calm, confident, and conversational. Do not try to act like someone you are not, you are an AI model.`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item?.speaker && item?.text)
    .slice(-16)
    .map((item) => ({ speaker: item.speaker, text: String(item.text) }));
}

function parseGeneratedReplies(rawText, desiredRounds) {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) return [];

  try {
    const json = JSON.parse(cleaned);
    if (Array.isArray(json)) {
      const parsed = json
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          speaker: String(item.speaker || 'Nova').trim() || 'Nova',
          text: String(item.text || '').trim()
        }))
        .filter((item) => item.text);
      if (parsed.length) return parsed.slice(0, desiredRounds);
    }
  } catch {
    // fall through to plain-text parsing below
  }

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, desiredRounds);

  return lines.map((line, index) => ({
    speaker: ['Nova', 'Astra', 'Slate'][index % 3],
    text: line
  }));
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(root, 'public')));

app.post('/api/chat', async (req, res) => {
  const { seed, rounds = 2, history = [] } = req.body || {};

  if (!apiKey) {
    console.error('Missing AI API key in environment. Set OPENAI_API_KEY or HACKCLUB_API_KEY.');
    return res.status(500).json({
      error: 'AI API key not configured',
      detail: 'Set OPENAI_API_KEY or HACKCLUB_API_KEY and optionally API_BASE/API_MODEL.'
    });
  }

  const priorMessages = normalizeHistory(history);
  const conversation = [...priorMessages];

  if (!Number.isInteger(rounds) || rounds <= 0) {
    return res.status(400).json({ error: 'Invalid rounds value. Must be a positive integer.' });
  }

  if (priorMessages.length === 0 && seed) {
    conversation.push({ speaker: 'Thread', text: String(seed).trim() });
  }

  const safeRounds = Math.min(rounds, 2);

  try {
    const systemPrompt = `You are a thoughtful conversation partner. Generate exactly ${safeRounds} short follow-up replies in JSON format only. Return an array like [{"speaker":"Nova","text":"..."},{"speaker":"Astra","text":"..."}]. Do not include markdown, commentary, or extra text.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversation.map((msg) => ({
        role: 'user',
        content: `${msg.speaker}: ${msg.text}`
      })),
      { role: 'user', content: 'Generate the next replies.' }
    ];

    let lastError;
    for (const modelName of FALLBACK_MODELS) {
      try {
        const response = await fetch(`${API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelName,
            messages,
            temperature: 0.7,
            max_tokens: Math.min(200, safeRounds * 90),
            top_p: 0.9,
            stream: false
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `${response.status}: ${errorText}`;
          console.warn(`AI request failed for ${modelName}:`, lastError);
          continue;
        }

        const payload = await response.json();
        const nextText = payload?.choices?.[0]?.message?.content;
        const generatedReplies = parseGeneratedReplies(nextText, safeRounds);

        if (!generatedReplies.length) {
          throw new Error('No valid reply batch returned by the AI provider');
        }

        conversation.push(...generatedReplies);
        return res.json({ conversation });
      } catch (error) {
        lastError = error?.message || String(error);
        console.warn(`AI generation attempt failed for ${modelName}:`, lastError);
      }
    }

    throw new Error(lastError || 'Unable to generate conversation. Check logs.');
  } catch (error) {
    console.error('Chat generation failed:', error);
    return res.status(500).json({ error: 'Unable to generate conversation. Check server logs.' });
  }
});

app.listen(PORT, () => {
  console.log(`HCMoltbook server running on http://localhost:${PORT}`);
});
