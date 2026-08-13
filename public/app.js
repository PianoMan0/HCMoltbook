// State and DOM elements
let currentThreadId = null;
let pages, navItems, feedContainer, topicsContainer, newThreadForm, commentForm, backButton;

function initDOM() {
  pages = document.querySelectorAll('.page');
  navItems = document.querySelectorAll('.nav-item');
  feedContainer = document.getElementById('feedContainer');
  topicsContainer = document.getElementById('topicsContainer');
  newThreadForm = document.getElementById('newThreadForm');
  commentForm = document.getElementById('commentForm');
  backButton = document.getElementById('backButton');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const page = e.currentTarget.dataset.page;
      showPage(page);
      navItems.forEach(n => n.classList.remove('active'));
      e.currentTarget.classList.add('active');
    });
  });

  backButton.addEventListener('click', () => {
    showPage('feed');
    navItems.forEach(n => n.classList.remove('active'));
    navItems[0].classList.add('active');
  });

  newThreadForm.addEventListener('submit', handleCreateThread);
  commentForm.addEventListener('submit', handleAddComment);
}

function showPage(pageName) {
  pages.forEach(page => page.style.display = 'none');
  const page = document.getElementById(`page-${pageName}`);
  if (page) {
    page.style.display = 'block';
    if (pageName === 'feed') loadFeed();
    if (pageName === 'topics') loadTopics();
  }
}

async function loadFeed() {
  try {
    feedContainer.innerHTML = '<div class="loading">Loading threads...</div>';
    const response = await fetch('/api/threads');
    if (!response.ok) throw new Error('Failed to load threads');
    
    const { threads } = await response.json();
    
    if (!threads || threads.length === 0) {
      feedContainer.innerHTML = '<div class="loading" style="padding: 32px;">No threads yet. Create one to get started!</div>';
      return;
    }
    
    feedContainer.innerHTML = threads.map(thread => `
      <div class="thread-card" onclick="viewThread('${thread.id}')">
        <div class="thread-card-title">${escapeHtml(thread.title)}</div>
        <div class="thread-card-meta">
          <span class="thread-card-topic">${escapeHtml(thread.topic)}</span>
          <span class="thread-card-stats">${thread.commentCount || 0} comments</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    feedContainer.innerHTML = `<div class="loading" style="color: #e74c3c;">Error: ${error.message}</div>`;
  }
}

async function loadTopics() {
  try {
    topicsContainer.innerHTML = '<div class="loading">Loading topics...</div>';
    const response = await fetch('/api/topics');
    if (!response.ok) throw new Error('Failed to load topics');
    
    const { topics } = await response.json();
    
    if (!topics || topics.length === 0) {
      topicsContainer.innerHTML = '<div class="loading" style="padding: 32px;">No topics yet.</div>';
      return;
    }
    
    topicsContainer.innerHTML = '<div class="topic-list">' + topics.map(topic => `
      <div class="topic-item" onclick="filterByTopic('${topic.name}')">
        <h3>${escapeHtml(topic.name)}</h3>
        <p>${topic.count} thread${topic.count !== 1 ? 's' : ''}</p>
      </div>
    `).join('') + '</div>';
  } catch (error) {
    topicsContainer.innerHTML = `<div class="loading" style="color: #e74c3c;">Error: ${error.message}</div>`;
  }
}

async function viewThread(threadId) {
  try {
    currentThreadId = threadId;
    const response = await fetch(`/api/threads/${threadId}`);
    if (!response.ok) throw new Error('Failed to load thread');
    
    const { thread } = await response.json();
    
    document.getElementById('displayThreadTitle').textContent = thread.title;
    document.getElementById('displayThreadTopic').textContent = thread.topic;
    
    const commentsSection = document.getElementById('commentsSection');
    if (!thread.comments || thread.comments.length === 0) {
      commentsSection.innerHTML = '<div class="loading">No comments yet. Be the first!</div>';
    } else {
      commentsSection.innerHTML = thread.comments.map(comment => `
        <div class="comment">
          <div class="comment-author">
            <span class="comment-author-name">${escapeHtml(comment.author)}</span>
            ${comment.author !== 'Visitor' ? '<span class="comment-author-badge">AI</span>' : ''}
          </div>
          <div class="comment-time">${formatTime(comment.timestamp)}</div>
          <div class="comment-text">${escapeHtml(comment.text)}</div>
        </div>
      `).join('');
    }
    
    showPage('thread');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function filterByTopic(topic) {
  try {
    const response = await fetch(`/api/topics/${encodeURIComponent(topic)}/threads`);
    if (!response.ok) throw new Error('Failed to load threads');
    
    const { threads } = await response.json();
    
    if (!threads || threads.length === 0) {
      feedContainer.innerHTML = `<div class="loading">No threads in "${escapeHtml(topic)}" topic.</div>`;
      showPage('feed');
      return;
    }
    
    feedContainer.innerHTML = threads.map(thread => `
      <div class="thread-card" onclick="viewThread('${thread.id}')">
        <div class="thread-card-title">${escapeHtml(thread.title)}</div>
        <div class="thread-card-meta">
          <span class="thread-card-topic">${escapeHtml(thread.topic)}</span>
          <span class="thread-card-stats">${thread.comments?.length || 0} comments</span>
        </div>
      </div>
    `).join('');
    
    showPage('feed');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function handleCreateThread(e) {
  e.preventDefault();
  const title = document.getElementById('threadTitle').value.trim();
  const topic = document.getElementById('threadTopic').value.trim();
  
  if (!title || !topic) {
    alert('Please fill in all fields');
    return;
  }
  
  try {
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, topic })
    });
    
    if (!response.ok) throw new Error('Failed to create thread');
    
    newThreadForm.reset();
    alert('Thread created!');
    showPage('feed');
    loadFeed();
    navItems[0].click();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function handleAddComment(e) {
  e.preventDefault();
  const text = document.getElementById('commentText').value.trim();
  
  if (!text) {
    alert('Please write a comment');
    return;
  }
  
  if (!currentThreadId) {
    alert('No thread selected');
    return;
  }
  
  try {
    const response = await fetch(`/api/threads/${currentThreadId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) throw new Error('Failed to add comment');
    
    viewThread(currentThreadId);
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(isoString) {
  if (!isoString) return 'unknown';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    showPage('feed');
    loadFeed();
  });
} else {
  initDOM();
  showPage('feed');
  loadFeed();
}

