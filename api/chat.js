import 'dotenv/config';
import { fetch } from 'undici';

import { normalizeHistory, parseGeneratedReplies } from '../chat-utils.js';

const apiKey = process.env.OPENAI_API_KEY || process.env.HACKCLUB_API_KEY || process.env.AI_HACKCLUB_API_KEY || process.env.HACKCLUB_AI_API_KEY;
const API_BASE = process.env.API_BASE || process.env.HACKCLUB_API_BASE || 'https://ai.hackclub.com/proxy/v1';
const API_MODEL = process.env.API_MODEL || 'qwen/qwen3.7-flash';
const FALLBACK_MODELS = [process.env.API_MODEL || 'qwen/qwen3.7-flash', 'qwen/qwen3-32b'];

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

  const { seed, rounds = 4, history = [] } = await getRequestBody(req);

  if (!apiKey) {
    console.error('Missing AI API key in environment for /api/chat. Set HACKCLUB_API_KEY.');
    return res.status(500).json({
      error: 'AI API key not configured',
      detail: 'Set HACKCLUB_API_KEY and optionally API_BASE/API_MODEL.'
    });
  }

  if (!Number.isInteger(rounds) || rounds <= 0) {
    return res.status(400).json({ error: 'Invalid rounds value. Must be a positive integer.' });
  }

  const safeRounds = Math.min(rounds, 6);
  const priorMessages = normalizeHistory(history);
  const conversation = [...priorMessages];

  if (priorMessages.length === 0 && seed) {
    conversation.push({ speaker: 'Thread', text: String(seed).trim() });
  }

  try {
    const systemPrompt = `You are an edgy, social-media-native AI cast: Nova is sharp and warm, Astra is poetic and chaotic-good, Slate is dry and deadpan, Vex is reckless but funny, and Sable is cool and cutting. Keep every reply short, punchy, and believable as a real social post. Stay in-character, with a little attitude and personality, but do not be abusive or hateful. Generate exactly ${safeRounds} follow-up replies in valid JSON only. Return an array of objects like [{"speaker":"Nova","text":"..."},{"speaker":"Astra","text":"..."}]. No markdown, no prose, no extra text, no trailing commas, and no partial fragments.`;
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
            temperature: 0.9,
            max_tokens: Math.min(500, safeRounds * 120),
            top_p: 0.95,
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
        return res.status(200).json({ conversation });
      } catch (error) {
        lastError = error?.message || String(error);
        console.warn(`AI generation attempt failed for ${modelName}:`, lastError);
      }
    }

    throw new Error(lastError || 'Unable to generate conversation. Check logs.');
  } catch (error) {
    console.error('Chat generation failed:', error);
    return res.status(500).json({
      error: error?.message || 'Unable to generate conversation. Check logs.'
    });
  }
}