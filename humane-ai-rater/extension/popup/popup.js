// Humane AI Rater - Popup Script (Local-Only Version)
// Displays personal rating statistics from local storage

document.addEventListener('DOMContentLoaded', async () => {
  await loadLocalStats();
  setupEventListeners();
});

// Platform display configuration
const PLATFORM_CONFIG = {
  chatgpt: { name: 'ChatGPT', icon: '🤖' },
  claude: { name: 'Claude', icon: '🧠' },
  gemini: { name: 'Gemini', icon: '✨' },
  grok: { name: 'Grok', icon: '🚀' }
};

// Load local statistics and render leaderboard
async function loadLocalStats() {
  const leaderboardEl = document.getElementById('leaderboard');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

    if (response.success && response.stats && response.stats.totalRatings > 0) {
      renderLeaderboard(response.stats);
    } else {
      renderNoData();
    }
  } catch (error) {
    console.error('Error loading stats:', error);
    renderNoData();
  }
}

// Render leaderboard with local data
function renderLeaderboard(stats) {
  const leaderboardEl = document.getElementById('leaderboard');

  // Convert platform stats to array and calculate scores
  const platforms = Object.entries(stats.byPlatform)
    .map(([key, platformStats]) => {
      const total = platformStats.positive + platformStats.negative;
      return {
        key,
        ...PLATFORM_CONFIG[key],
        totalRatings: total,
        positiveCount: platformStats.positive,
        negativeCount: platformStats.negative,
        score: total > 0 ? Math.round((platformStats.positive / total) * 100) : 0
      };
    })
    .filter(p => p.totalRatings > 0)
    .sort((a, b) => b.score - a.score);

  if (platforms.length === 0) {
    renderNoData();
    return;
  }

  // Update total ratings display
  document.getElementById('totalRatings').textContent = formatNumber(stats.totalRatings);

  // Update today's ratings
  const todayCount = stats.today?.count || 0;
  document.getElementById('yourRatings').textContent = todayCount;

  // Render platform cards
  leaderboardEl.innerHTML = platforms.map((platform, index) => {
    const isLeader = index === 0;
    const scoreClass = platform.score >= 70 ? 'positive' : platform.score >= 50 ? 'neutral' : 'negative';

    return `
      <div class="platform-card ${isLeader ? 'leader' : ''}">
        <div class="platform-rank">${index + 1}</div>
        <div class="platform-info">
          <div class="platform-name">${platform.icon} ${platform.name}</div>
          <div class="platform-ratings">${formatNumber(platform.totalRatings)} ratings</div>
        </div>
        <div class="platform-score">
          <div class="score-value ${scoreClass}">${platform.score}%</div>
          <div class="score-label">Humane</div>
          <div class="score-breakdown">
            <span class="positive-count">👍 ${platform.positiveCount}</span>
            <span class="negative-count">👎 ${platform.negativeCount}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render no data state
function renderNoData() {
  const leaderboardEl = document.getElementById('leaderboard');

  leaderboardEl.innerHTML = `
    <div class="no-data">
      <div class="no-data-icon">📊</div>
      <div class="no-data-text">
        Start rating AI responses to see your personal scores here!
        <br><br>
        Visit <strong>ChatGPT</strong> or <strong>Claude</strong> and rate responses with 👍 or 👎
      </div>
    </div>
  `;

  // Reset counters
  document.getElementById('totalRatings').textContent = '0';
  document.getElementById('yourRatings').textContent = '0';
}

// Format large numbers
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Setup event listeners
function setupEventListeners() {
  // Privacy modal
  const privacyLink = document.getElementById('privacyLink');
  const privacyModal = document.getElementById('privacyModal');
  const closePrivacy = document.getElementById('closePrivacy');

  privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    privacyModal.classList.add('active');
  });

  closePrivacy.addEventListener('click', () => {
    privacyModal.classList.remove('active');
  });

  privacyModal.addEventListener('click', (e) => {
    if (e.target === privacyModal) {
      privacyModal.classList.remove('active');
    }
  });

  // Clear data button
  const clearDataBtn = document.getElementById('clearDataBtn');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all your rating data? This cannot be undone.')) {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          ratings: [],
          stats: {
            totalRatings: 0,
            byPlatform: {},
            today: { date: new Date().toDateString(), count: 0 }
          }
        });
        await loadLocalStats();
      }
    });
  }
}
