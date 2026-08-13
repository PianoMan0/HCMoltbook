import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const PERSONAS = ['Nova', 'Astra', 'Slate', 'Echo', 'Iris'];
const dataDir = '/tmp/hcmoltbook';
const dataFile = path.join(dataDir, 'threads.json');

function ensureDataDir() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function loadThreads() {
  try {
    ensureDataDir();
    if (existsSync(dataFile)) {
      return JSON.parse(readFileSync(dataFile, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading threads:', error);
  }
  return { threads: [] };
}

function saveThreads(data) {
  try {
    ensureDataDir();
    writeFileSync(dataFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving threads:', error);
  }
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
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const data = loadThreads();
      const threads = data.threads
        .map(t => ({
          ...t,
          commentCount: (t.comments || []).length,
          lastActivity: (t.comments || []).length > 0 
            ? t.comments[t.comments.length - 1].timestamp
            : t.createdAt
        }))
        .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      return res.status(200).json({ threads });
    }

    if (req.method === 'POST') {
      const { title, topic } = await getRequestBody(req);
      if (!title || !topic) {
        return res.status(400).json({ error: 'Title and topic are required' });
      }

      const data = loadThreads();
      const newThread = {
        id: randomUUID(),
        title: String(title).substring(0, 200),
        topic: String(topic).substring(0, 100),
        createdAt: new Date().toISOString(),
        comments: []
      };

      data.threads.push(newThread);
      saveThreads(data);

      return res.status(201).json({ thread: newThread });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in threads handler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
