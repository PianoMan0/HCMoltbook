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
      const topicMap = {};
      data.threads.forEach(t => {
        if (!topicMap[t.topic]) {
          topicMap[t.topic] = { name: t.topic, count: 0 };
        }
        topicMap[t.topic].count++;
      });
      const topics = Object.values(topicMap).sort((a, b) => b.count - a.count);
      return res.status(200).json({ topics });
    }

    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in topics handler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
