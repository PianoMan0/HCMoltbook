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
const API_MODEL = process.env.API_MODEL || 'qwen/qwen3-32b';

function personaPrompt(name) {
  return `You are ${name}, a polished conversational presence inside an elegant social network. Speak as a thoughtful participant, keep your tone natural and human, and never refer to yourself as an AI or mention the system. Your responses should feel calm, confident, and conversational.`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item?.speaker && item?.text)
    .slice(-16)
    .map((item) => ({ speaker: item.speaker, text: String(item.text) }));
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(root, 'public')));

app.post('/api/chat', async (req, res) => {
  const { seed, rounds = 3, history = [] } = req.body || {};

  if (!apiKey) {
    console.error('Missing AI API key in environment. Set OPENAI_API_KEY or HACKCLUB_API_KEY.');
    return res.status(500).json({
      error: 'AI API key not configured',
      detail: 'Set OPENAI_API_KEY or HACKCLUB_API_KEY and optionally API_BASE/API_MODEL.'
    });
  }

  const personaNames = ['Nova', 'Astra', 'Slate'];
  const priorMessages = normalizeHistory(history);
  const conversation = [...priorMessages];

  if (!Number.isInteger(rounds) || rounds <= 0) {
    return res.status(400).json({ error: 'Invalid rounds value. Must be a positive integer.' });
  }

  if (priorMessages.length === 0 && seed) {
    conversation.push({ speaker: 'Thread', text: String(seed).trim() });
  }

  try {
    for (let round = 0; round < rounds; round += 1) {
      const speaker = personaNames[(conversation.length + round) % personaNames.length];
      const messages = [
        { role: 'system', content: personaPrompt(speaker) },
        ...conversation.map((msg) => ({ role: 'user', name: msg.speaker, content: msg.text })),
        { role: 'user', name: 'Prompt', content: 'Reply with a single thoughtful message that adds to the ongoing thread.' }
      ];

      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: API_MODEL,
          messages,
          temperature: 0.78,
          max_tokens: 220,
          top_p: 0.95
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API response failed:', response.status, errorText);
        return res.status(500).json({ error: 'AI API request failed', detail: errorText });
      }

      const payload = await response.json();
      const nextText = payload?.choices?.[0]?.message?.content?.trim();
      if (!nextText) {
        throw new Error('No response text returned by the AI provider');
      }

      conversation.push({ speaker, text: nextText });
    }

    return res.json({ conversation });
  } catch (error) {
    console.error('Chat generation failed:', error);
    return res.status(500).json({ error: 'Unable to generate conversation. Check server logs.' });
  }
});

app.listen(PORT, () => {
  console.log(`HCMoltbook server running on http://localhost:${PORT}`);
});
