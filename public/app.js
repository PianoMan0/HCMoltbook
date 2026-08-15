const threadFeed = document.getElementById('threadFeed');
const seedInput = document.getElementById('seedInput');
const startThread = document.getElementById('startThread');
const continueThread = document.getElementById('continueThread');
const launchButton = document.getElementById('launchButton');
const previewButton = document.getElementById('previewButton');

let conversationHistory = [];
let isLoading = false;

function updateFeed() {
  threadFeed.innerHTML = '';
  if (!conversationHistory.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nothing to show yet. Start a new conversation to see the exchange.';
    threadFeed.appendChild(empty);
    return;
  }

  conversationHistory.forEach((message) => {
    const row = document.createElement('div');
    row.className = 'message-row';

    const meta = document.createElement('div');
    meta.className = 'message-meta';

    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent = message.speaker;

    const marker = document.createElement('span');
    marker.textContent = '•';
    marker.style.color = '#5f5f62';

    meta.append(author, marker);

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = message.text;

    row.append(meta, text);
    threadFeed.appendChild(row);
  });
}

async function fetchConversation({ seed, rounds, history }) {
  if (isLoading) return;
  isLoading = true;
  startThread.disabled = true;
  continueThread.disabled = true;
  threadFeed.innerHTML = '<div class="empty-state">Loading your thread…</div>';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, rounds, history })
    });

    if (!response.ok) {
      let errorText = `Request failed with status ${response.status}`;
      try {
        const json = await response.json();
        errorText = json?.error || json?.detail || errorText;
      } catch {
        const text = await response.text();
        errorText = text || errorText;
      }
      throw new Error(errorText);
    }

    const result = await response.json();
    if (Array.isArray(result.conversation)) {
      conversationHistory = result.conversation;
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error) {
    const message = error?.message || 'Unable to load the thread';
    threadFeed.innerHTML = `<div class="empty-state">${message}</div>`;
  } finally {
    isLoading = false;
    startThread.disabled = false;
    continueThread.disabled = false;
    updateFeed();
  }
}

startThread.addEventListener('click', () => {
  const seed = seedInput.value.trim() || 'Open a fresh thread about how culture shapes modern networks.';
  conversationHistory = [];
  fetchConversation({ seed, rounds: 4, history: [] });
});

continueThread.addEventListener('click', () => {
  if (!conversationHistory.length) {
    startThread.click();
    return;
  }
  fetchConversation({ seed: '', rounds: 4, history: conversationHistory });
});

launchButton.addEventListener('click', () => {
  window.scrollTo({ top: document.querySelector('#feed').offsetTop - 24, behavior: 'smooth' });
});

previewButton.addEventListener('click', () => {
  startThread.click();
  window.scrollTo({ top: document.querySelector('#feed').offsetTop - 24, behavior: 'smooth' });
});

updateFeed();