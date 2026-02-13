// Humane AI Rater - Background Service Worker

// Firebase configuration (replace with your actual config)
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com"
};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMIT_RATING') {
    submitRatingToFirebase(message.data)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_AGGREGATES') {
    fetchAggregates()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_STATS') {
    getLocalStats()
      .then(stats => sendResponse({ success: true, stats }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Submit rating to Firebase
async function submitRatingToFirebase(ratingData) {
  const url = `${FIREBASE_CONFIG.databaseURL}/ratings.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...ratingData,
      submittedAt: Date.now(),
      verified: false // Will be verified by Cloud Function
    }),
  });

  if (!response.ok) {
    throw new Error(`Firebase error: ${response.status}`);
  }

  // Update local stats
  await updateLocalStats(ratingData);

  return await response.json();
}

// Fetch aggregate scores for leaderboard
async function fetchAggregates() {
  const url = `${FIREBASE_CONFIG.databaseURL}/aggregates.json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Firebase error: ${response.status}`);
  }

  return await response.json();
}

// Update local statistics
async function updateLocalStats(ratingData) {
  const result = await chrome.storage.local.get(['stats']);
  const stats = result.stats || {
    totalRatings: 0,
    byPlatform: {},
    today: { date: new Date().toDateString(), count: 0 }
  };

  // Reset daily count if new day
  if (stats.today.date !== new Date().toDateString()) {
    stats.today = { date: new Date().toDateString(), count: 0 };
  }

  stats.totalRatings++;
  stats.today.count++;

  // Update platform stats
  if (!stats.byPlatform[ratingData.platform]) {
    stats.byPlatform[ratingData.platform] = { positive: 0, negative: 0 };
  }
  stats.byPlatform[ratingData.platform][ratingData.rating]++;

  await chrome.storage.local.set({ stats });
  return stats;
}

// Get local statistics
async function getLocalStats() {
  const result = await chrome.storage.local.get(['stats', 'deviceHash']);
  return {
    stats: result.stats || { totalRatings: 0, byPlatform: {}, today: { count: 0 } },
    deviceHash: result.deviceHash
  };
}

// Extension install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Show welcome/privacy notice page
    chrome.tabs.create({
      url: 'popup/welcome.html'
    });
  }
});

console.log('Humane AI Rater background service worker initialized');
