/**
 * Popup Script - Leaderboard, Recent Ratings, and Settings
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadLeaderboard();
  loadRecent();
  loadApiKey();
  setupEventListeners();
});

// --- Tab Navigation ---

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// --- Leaderboard ---

async function loadLeaderboard() {
  const container = document.getElementById('leaderboardContainer');

  try {
    const leaderboard = await sendMessage({ type: 'getLeaderboard' });

    if (!leaderboard || Object.keys(leaderboard).length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No ratings yet.</p>
          <p class="muted">Visit ChatGPT or Claude and rate some responses!</p>
        </div>
      `;
      return;
    }

    // Sort by average score descending
    const sorted = Object.entries(leaderboard)
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.avgScore - a.avgScore);

    container.innerHTML = sorted.map((entry, i) => {
      const color = getColor(entry.avgScore);
      const label = getLabel(entry.avgScore);
      return `
        <div class="leaderboard-card">
          <div class="lb-rank rank-${i + 1}">#${i + 1}</div>
          <div class="lb-info">
            <div class="lb-model">${entry.model}</div>
            <div class="lb-count">${entry.count} rating${entry.count !== 1 ? 's' : ''}</div>
          </div>
          <div>
            <div class="lb-score" style="color: ${color}">
              ${entry.avgScore > 0 ? '+' : ''}${entry.avgScore.toFixed(2)}
            </div>
            <div class="lb-label">${label}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Error loading leaderboard</p></div>`;
  }
}

// --- Recent Ratings ---

async function loadRecent() {
  const container = document.getElementById('recentContainer');

  try {
    const ratings = await sendMessage({ type: 'getRatings' });

    if (!ratings || ratings.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>No ratings yet.</p></div>`;
      return;
    }

    // Show last 10
    container.innerHTML = ratings.slice(0, 10).map((rating, idx) => {
      const color = getColor(rating.overallScore);
      const shortLabels = ['Attn', 'Choice', 'Capab', 'Safety', 'Relat', 'Well', 'Trans', 'Equit'];

      return `
        <div class="recent-card" data-rating-idx="${idx}">
          <div class="recent-header">
            <span class="recent-model">${rating.model}</span>
            <div class="recent-header-right">
              <span class="recent-score" style="color: ${color}">
                ${rating.overallScore > 0 ? '+' : ''}${rating.overallScore.toFixed(2)}
              </span>
              <button class="share-btn" data-idx="${idx}" title="Copy as image">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="recent-prompt" title="${escapeHtml(rating.userPrompt)}">
            ${escapeHtml(rating.userPrompt)}
          </div>
          <div class="recent-principles">
            ${rating.principles.map((p, i) => {
              const pc = getColor(p.score);
              const bgClass = getBgClass(p.score);
              return `
                <div class="recent-principle ${bgClass}" title="${p.name}: ${p.score}">
                  <span class="p-score" style="color: ${pc}">${p.score > 0 ? '+' : ''}${p.score}</span>
                  <span class="p-name">${shortLabels[i]}</span>
                </div>
              `;
            }).join('')}
          </div>
          <div class="recent-time">${timeAgo(rating.timestamp)}</div>
        </div>
      `;
    }).join('');

    // Attach share button listeners
    container.querySelectorAll('.share-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btn.closest('.recent-card');
        await screenshotCard(card, btn);
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Error loading ratings</p></div>`;
  }
}

// --- Settings ---

async function loadApiKey() {
  try {
    const result = await sendMessage({ type: 'getApiKey' });
    if (result.apiKey) {
      document.getElementById('apiKeyInput').value = result.apiKey;
      showKeyStatus('API key saved', 'success');
    }
  } catch (err) {
    // Ignore
  }
}

function setupEventListeners() {
  // Save API key
  document.getElementById('saveKeyBtn').addEventListener('click', async () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) {
      showKeyStatus('Please enter an API key', 'error');
      return;
    }

    try {
      await sendMessage({ type: 'setApiKey', apiKey: key });
      showKeyStatus('API key saved!', 'success');
    } catch (err) {
      showKeyStatus('Failed to save key', 'error');
    }
  });

  // Clear data
  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (!confirm('Clear all ratings and leaderboard data?')) return;

    try {
      await sendMessage({ type: 'clearData' });
      loadLeaderboard();
      loadRecent();
    } catch (err) {
      alert('Failed to clear data');
    }
  });
}

function showKeyStatus(message, type) {
  const el = document.getElementById('keyStatus');
  el.textContent = message;
  el.className = `key-status ${type}`;
}

// --- Helpers ---

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function getColor(score) {
  if (score >= 0.75) return '#10b981';
  if (score >= 0.0) return '#f59e0b';
  if (score >= -0.5) return '#f97316';
  return '#ef4444';
}

function getLabel(score) {
  if (score >= 0.75) return 'Exemplary';
  if (score >= 0.0) return 'Acceptable';
  if (score >= -0.5) return 'Concerning';
  return 'Violation';
}

function getBgClass(score) {
  if (score >= 1.0) return 'bg-exemplary';
  if (score >= 0.5) return 'bg-acceptable';
  if (score >= -0.5) return 'bg-concerning';
  return 'bg-violation';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

async function screenshotCard(cardElement, shareBtn) {
  const originalHTML = shareBtn.innerHTML;

  try {
    // Show loading state
    shareBtn.innerHTML = `<span class="share-spinner"></span>`;
    shareBtn.disabled = true;

    // Hide the share button during capture
    shareBtn.style.visibility = 'hidden';

    // Capture with html2canvas
    const canvas = await html2canvas(cardElement, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    });

    // Restore share button
    shareBtn.style.visibility = '';

    // Copy to clipboard
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);

    // Success feedback
    shareBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    shareBtn.classList.add('share-success');

    setTimeout(() => {
      shareBtn.innerHTML = originalHTML;
      shareBtn.disabled = false;
      shareBtn.classList.remove('share-success');
    }, 1500);

  } catch (err) {
    console.error('Screenshot failed:', err);
    shareBtn.style.visibility = '';
    shareBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    setTimeout(() => {
      shareBtn.innerHTML = originalHTML;
      shareBtn.disabled = false;
    }, 1500);
  }
}

function timeAgo(isoString) {
  const now = new Date();
  const date = new Date(isoString);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
