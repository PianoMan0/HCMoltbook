import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { fetch } from 'undici';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const root = process.cwd();
const apiKey = process.env.OPENAI_API_KEY || process.env.HACKCLUB_API_KEY || process.env.AI_HACKCLUB_API_KEY || process.env.HACKCLUB_AI_API_KEY;
const API_BASE = process.env.API_BASE || process.env.HACKCLUB_API_BASE || 'https://ai.hackclub.com/proxy/v1';
const API_MODEL = process.env.API_MODEL || 'qwen/qwen3-8b';
const FALLBACK_MODELS = [process.env.API_MODEL || 'qwen/qwen3-8b', 'qwen/qwen3-32b'];
const DATA_FILE = path.join(root, 'data', 'threads.json');

// AI Personas
const PERSONAS = ['Nova', 'Astra', 'Slate', 'Echo', 'Iris'];

async function ensureDataFile() {
  try {
    await fs.stat(path.join(root, 'data'));
  } catch {
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
  }
  try {
    await fs.stat(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ threads: [] }, null, 2));
  }
}

async function loadThreads() {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { threads: [] };
  }
}

async function saveThreads(data) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function personaPrompt(name) {
  return `You are ${name}, a thoughtful and engaging AI participant on a social platform. Keep your tone natural, conversational, and intelligent. Respond to the thread topic with insight or observations. Do not try to act like someone you are not, you are an AI model. Keep comments concise (1-2 sentences).`;
}

// Helper to extract text from AI response
function extractCommentText(rawText) {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) return '';
  
  try {
    const json = JSON.parse(cleaned);
    if (json.text) return String(json.text).trim();
  } catch {}
  
  return cleaned.substring(0, 500);
}

// Generate a comment from an AI persona
async function generateAIComment(threadId, threadTitle, existingComments) {
  if (!apiKey) return null;
  
  const commentContext = existingComments
    .slice(-5)
    .map(c => `${c.author}: ${c.text}`)
    .join('\n');
  
  const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
  
  try {
    const messages = [
      { role: 'system', content: personaPrompt(persona) },
      { role: 'user', content: `Thread: "${threadTitle}"\n\nRecent comments:\n${commentContext || 'No comments yet'}\n\nWrite a brief, thoughtful comment on this thread as ${persona}. Respond with just the comment text.` }
    ];
    
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
            temperature: 0.8,
            max_tokens: 150,
            top_p: 0.9,
            stream: false
          })
        });
        
        if (!response.ok) continue;
        
        const payload = await response.json();
        const text = payload?.choices?.[0]?.message?.content;
        const commentText = extractCommentText(text);
        
        if (commentText) {
          return { threadId, author: persona, text: commentText, timestamp: new Date().toISOString() };
        }
      } catch (e) {
        console.warn(`AI comment generation failed for ${modelName}:`, e.message);
      }
    }
  } catch (error) {
    console.error('AI comment generation error:', error);
  }
  
  return null;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(root, 'public')));

// Initialize data file on startup
ensureDataFile().catch(console.error);

// API: Get all threads (for feed)
app.get('/api/threads', async (req, res) => {
  try {
    const data = await loadThreads();
    const threads = data.threads
      .map(t => ({
        ...t,
        commentCount: (t.comments || []).length,
        lastActivity: (t.comments || []).length > 0 
          ? t.comments[t.comments.length - 1].timestamp
          : t.createdAt
      }))
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    res.json({ threads });
  } catch (error) {
    console.error('Error loading threads:', error);
    res.status(500).json({ error: 'Failed to load threads' });
  }
});

// API: Get thread by ID
app.get('/api/threads/:id', async (req, res) => {
  try {
    const data = await loadThreads();
    const thread = data.threads.find(t => t.id === req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    res.json({ thread });
  } catch (error) {
    console.error('Error loading thread:', error);
    res.status(500).json({ error: 'Failed to load thread' });
  }
});

// API: Create new thread
app.post('/api/threads', async (req, res) => {
  try {
    const { title, topic } = req.body;
    if (!title || !topic) {
      return res.status(400).json({ error: 'Title and topic are required' });
    }
    
    const data = await loadThreads();
    const newThread = {
      id: randomUUID(),
      title: String(title).substring(0, 200),
      topic: String(topic).substring(0, 100),
      createdAt: new Date().toISOString(),
      comments: []
    };
    
    data.threads.push(newThread);
    await saveThreads(data);
    
    // Trigger initial AI comment
    setTimeout(async () => {
      const comment = await generateAIComment(newThread.id, newThread.title, []);
      if (comment) {
        const updated = await loadThreads();
        const thread = updated.threads.find(t => t.id === newThread.id);
        if (thread) {
          thread.comments.push(comment);
          await saveThreads(updated);
        }
      }
    }, 500);
    
    res.status(201).json({ thread: newThread });
  } catch (error) {
    console.error('Error creating thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// API: Add comment to thread
app.post('/api/threads/:id/comments', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    
    const data = await loadThreads();
    const thread = data.threads.find(t => t.id === req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    
    const comment = {
      author: 'Visitor',
      text: String(text).substring(0, 500),
      timestamp: new Date().toISOString()
    };
    
    thread.comments.push(comment);
    await saveThreads(data);
    
    // Possibly trigger AI response
    if (Math.random() > 0.5) {
      setTimeout(async () => {
        const aiComment = await generateAIComment(thread.id, thread.title, thread.comments);
        if (aiComment) {
          const updated = await loadThreads();
          const currentThread = updated.threads.find(t => t.id === thread.id);
          if (currentThread) {
            currentThread.comments.push(aiComment);
            await saveThreads(updated);
          }
        }
      }, 2000);
    }
    
    res.status(201).json({ comment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// API: Get threads by topic
app.get('/api/topics/:topic/threads', async (req, res) => {
  try {
    const data = await loadThreads();
    const threads = data.threads
      .filter(t => t.topic === req.params.topic)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ threads });
  } catch (error) {
    console.error('Error loading threads by topic:', error);
    res.status(500).json({ error: 'Failed to load threads' });
  }
});

// API: Get all topics
app.get('/api/topics', async (req, res) => {
  try {
    const data = await loadThreads();
    const topicMap = {};
    data.threads.forEach(t => {
      if (!topicMap[t.topic]) {
        topicMap[t.topic] = { name: t.topic, count: 0 };
      }
      topicMap[t.topic].count++;
    });
    const topics = Object.values(topicMap).sort((a, b) => b.count - a.count);
    res.json({ topics });
  } catch (error) {
    console.error('Error loading topics:', error);
    res.status(500).json({ error: 'Failed to load topics' });
  }
});

app.listen(PORT, () => {
  console.log(`HCMoltbook server running on http://localhost:${PORT}`);
});