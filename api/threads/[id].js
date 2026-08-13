import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

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
    const { id } = req.query;

    if (req.method === 'GET') {
      const data = loadThreads();
      const thread = data.threads.find(t => t.id === id);
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      return res.status(200).json({ thread });
    }

    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in thread handler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
