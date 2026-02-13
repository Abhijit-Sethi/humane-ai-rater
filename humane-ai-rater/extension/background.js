// Humane AI Rater - Background Service Worker (Local-Only Version)
// All data stored locally in chrome.storage.local - no network requests

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMIT_RATING') {
    saveRatingLocally(message.data)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_STATS') {
    getLocalStats()
      .then(stats => sendResponse({ success: true, stats }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Save rating to local storage
async function saveRatingLocally(ratingData) {
  const result = await chrome.storage.local.get(['ratings', 'stats']);
  const ratings = result.ratings || [];
  const stats = result.stats || {
    totalRatings: 0,
    byPlatform: {},
    today: { date: new Date().toDateString(), count: 0 }
  };

  // Add new rating
  ratings.push({
    id: crypto.randomUUID(),
    rating: ratingData.rating,
    platform: ratingData.platform,
    responseLength: ratingData.responseLength,
    timestamp: Date.now()
  });

  // Keep only last 1000 ratings to avoid storage limits
  if (ratings.length > 1000) {
    ratings.splice(0, ratings.length - 1000);
  }

  // Update total stats
  stats.totalRatings++;

  // Update platform-specific stats
  if (!stats.byPlatform[ratingData.platform]) {
    stats.byPlatform[ratingData.platform] = { positive: 0, negative: 0 };
  }
  stats.byPlatform[ratingData.platform][ratingData.rating]++;

  // Update daily count (reset if new day)
  if (stats.today.date !== new Date().toDateString()) {
    stats.today = { date: new Date().toDateString(), count: 0 };
  }
  stats.today.count++;

  await chrome.storage.local.set({ ratings, stats });
  return stats;
}

// Get local statistics
async function getLocalStats() {
  const result = await chrome.storage.local.get(['stats']);
  return result.stats || {
    totalRatings: 0,
    byPlatform: {},
    today: { date: new Date().toDateString(), count: 0 }
  };
}

// Extension install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize storage with empty stats
    chrome.storage.local.set({
      ratings: [],
      stats: {
        totalRatings: 0,
        byPlatform: {},
        today: { date: new Date().toDateString(), count: 0 }
      }
    });

    // Could show welcome page here if desired
    // chrome.tabs.create({ url: 'popup/welcome.html' });
  }
});

console.log('Humane AI Rater background service worker initialized (local-only mode)');
