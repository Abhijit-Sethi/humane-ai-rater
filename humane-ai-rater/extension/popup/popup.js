// Humane AI Rater - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  await loadLeaderboard();
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

// Load leaderboard data
async function loadLeaderboard() {
  const leaderboardEl = document.getElementById('leaderboard');

  try {
    // Try to get data from background script
    const response = await chrome.runtime.sendMessage({ type: 'GET_AGGREGATES' });

    if (response.success && response.data) {
      renderLeaderboard(response.data);
    } else {
      // Show demo/placeholder data if no real data yet
      renderDemoLeaderboard();
    }
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    renderDemoLeaderboard();
  }
}

// Render leaderboard with real data
function renderLeaderboard(data) {
  const leaderboardEl = document.getElementById('leaderboard');

  // Convert to array and calculate scores
  const platforms = Object.entries(data)
    .map(([key, stats]) => ({
      key,
      ...PLATFORM_CONFIG[key],
      totalRatings: stats.totalRatings || 0,
      positiveCount: stats.positiveCount || 0,
      negativeCount: stats.negativeCount || 0,
      score: stats.totalRatings > 0
        ? Math.round((stats.positiveCount / stats.totalRatings) * 100)
        : 0,
      weeklyTrend: stats.weeklyTrend || []
    }))
    .filter(p => p.totalRatings > 0)
    .sort((a, b) => b.score - a.score);

  if (platforms.length === 0) {
    renderDemoLeaderboard();
    return;
  }

  // Update total ratings
  const totalRatings = platforms.reduce((sum, p) => sum + p.totalRatings, 0);
  document.getElementById('totalRatings').textContent = formatNumber(totalRatings);

  // Render cards
  leaderboardEl.innerHTML = platforms.map((platform, index) => {
    const isLeader = index === 0;
    const trend = calculateTrend(platform.weeklyTrend);
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
          ${trend !== 0 ? `
            <div class="score-trend ${trend > 0 ? 'up' : 'down'}">
              ${trend > 0 ? '↑' : '↓'} ${Math.abs(trend)}% this week
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Render demo leaderboard when no data
function renderDemoLeaderboard() {
  const leaderboardEl = document.getElementById('leaderboard');

  // Demo data to show UI
  const demoData = [
    { key: 'claude', name: 'Claude', icon: '🧠', score: 78, ratings: 0 },
    { key: 'chatgpt', name: 'ChatGPT', icon: '🤖', score: 72, ratings: 0 }
  ];

  leaderboardEl.innerHTML = `
    <div class="no-data">
      <div class="no-data-icon">📊</div>
      <div class="no-data-text">
        Start rating AI responses to see community scores here!
        <br><br>
        Visit <strong>ChatGPT</strong> or <strong>Claude</strong> and rate responses with 👍 or 👎
      </div>
    </div>
  `;
}

// Calculate trend from weekly data
function calculateTrend(weeklyTrend) {
  if (!weeklyTrend || weeklyTrend.length < 2) return 0;

  const recent = weeklyTrend.slice(-3);
  const older = weeklyTrend.slice(0, -3);

  if (recent.length === 0 || older.length === 0) return 0;

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  return Math.round(recentAvg - olderAvg);
}

// Load local user stats
async function loadLocalStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

    if (response.success && response.stats) {
      const todayCount = response.stats.today?.count || 0;
      document.getElementById('yourRatings').textContent = todayCount;
    }
  } catch (error) {
    console.error('Error loading local stats:', error);
  }
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
}
