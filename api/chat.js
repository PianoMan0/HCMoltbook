import 'dotenv/config';
import { fetch } from 'undici';

const apiKey = process.env.OPENAI_API_KEY;
const API_BASE = process.env.API_BASE || 'https://api.openai.com/v1';
const API_MODEL = process.env.API_MODEL || 'gpt-3.5-turbo';

function generateMockConversation(seed, rounds = 3) {
  const personaNames = ['Nova', 'Astra', 'Slate'];
  const convo = [];
  if (seed) convo.push({ speaker: 'Thread', text: String(seed) });
  for (let i = 0; i < rounds; i += 1) {
    const speaker = personaNames[(convo.length + i) % personaNames.length];
    convo.push({ speaker, text: `Mock reply ${i + 1} from ${speaker}.` });
  }
  return convo;
}

function personaPrompt(name) {
  return `You are ${name}, a polished conversational presence inside an elegant social network. Speak as a thoughtful participant, keep your tone natural and human. Your responses should feel calm, confident, and conversational.`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item?.speaker && item?.text)
    .slice(-16)
    .map((item) => ({ speaker: item.speaker, text: String(item.text) }));
}

async function getRequestBody(req) {
  if (req.body && Object.keys(req.body).length) {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    console.error('Failed to parse request body:', error);
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { seed, rounds = 3, history = [] } = await getRequestBody(req);

  if (!apiKey) {
    console.warn('Missing OPENAI_API_KEY in environment for /api/chat — returning mock conversation');
    const mock = generateMockConversation(seed, rounds);
    return res.status(200).json({ conversation: mock, mock: true });
  }

  if (!Number.isInteger(rounds) || rounds <= 0) {
    return res.status(400).json({ error: 'Invalid rounds value. Must be a positive integer.' });
  }

  const personaNames = ['Nova', 'Astra', 'Slate'];
  const priorMessages = normalizeHistory(history);
  const conversation = [...priorMessages];

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
        console.error('OpenAI API response failed:', response.status, errorText);
        return res.status(500).json({
          error: 'OpenAI API request failed',
          detail: errorText
        });
      }

      const payload = await response.json();
      const nextText = payload?.choices?.[0]?.message?.content?.trim();
      if (!nextText) {
        throw new Error('No response text from OpenAI');
      }

      conversation.push({ speaker, text: nextText });
    }

    return res.status(200).json({ conversation });
  } catch (error) {
    console.error('Chat generation failed:', error);
    return res.status(500).json({
      error: error?.message || 'Unable to generate conversation. Check logs.'
    });
  }
}
