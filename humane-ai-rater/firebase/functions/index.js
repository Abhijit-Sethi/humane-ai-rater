/**
 * Humane AI Rater - Cloud Functions
 *
 * Handles:
 * 1. Rating validation and anti-spoofing
 * 2. Rate limiting per device
 * 3. Aggregate score computation
 * 4. Anomaly detection and flagging
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

// Configuration
const CONFIG = {
  MAX_RATINGS_PER_DAY: 50,
  MIN_VIEWPORT_TIME_MS: 500,
  BURST_WINDOW_MS: 300000, // 5 minutes
  BURST_THRESHOLD: 10,
  UNIFORM_RATING_THRESHOLD: 0.95,
  MIN_RATINGS_FOR_UNIFORM_CHECK: 20,
};

/**
 * Validate and process incoming ratings
 * Triggered when a new rating document is created
 */
exports.validateRating = functions.firestore
  .document('ratings/{ratingId}')
  .onCreate(async (snap, context) => {
    const rating = snap.data();
    const ratingId = context.params.ratingId;

    try {
      // Check rate limiting
      const isLimited = await checkRateLimit(rating.deviceHash);
      if (isLimited) {
        await snap.ref.update({
          verified: false,
          flags: admin.firestore.FieldValue.arrayUnion('RATE_LIMITED'),
          trustScore: 0,
        });
        return;
      }

      // Collect flags
      const flags = [];
      let trustScore = 1.0;

      // Check viewport time (anti-bot)
      if (rating.viewportTime < CONFIG.MIN_VIEWPORT_TIME_MS) {
        flags.push('TOO_FAST');
        trustScore *= 0.3;
      }

      // Check behavioral signals
      const signals = rating.behaviorSignals || {};
      if (!signals.hasMouseMoved && !signals.hasTouched) {
        flags.push('NO_INTERACTION');
        trustScore *= 0.5;
      }

      if (!signals.documentVisible) {
        flags.push('BACKGROUND_TAB');
        trustScore *= 0.7;
      }

      // Check for burst activity
      const hasBurst = await checkBurstActivity(rating.deviceHash);
      if (hasBurst) {
        flags.push('BURST_ACTIVITY');
        trustScore *= 0.4;
      }

      // Check for uniform ratings pattern
      const isUniform = await checkUniformRatings(rating.deviceHash, rating.rating);
      if (isUniform) {
        flags.push('UNIFORM_RATINGS');
        trustScore *= 0.3;
      }

      // Update rating with verification results
      await snap.ref.update({
        verified: flags.length === 0,
        flags: flags.length > 0 ? flags : admin.firestore.FieldValue.delete(),
        trustScore: Math.max(0.1, trustScore),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update rate limit counter
      await incrementRateLimit(rating.deviceHash);

      // Update aggregates if verified or has decent trust score
      if (trustScore >= 0.5) {
        await updateAggregates(rating.platform, rating.rating, trustScore);
      }

      // Flag for manual review if suspicious
      if (flags.length > 1 || trustScore < 0.3) {
        await flagForReview(ratingId, rating, flags, trustScore);
      }

    } catch (error) {
      console.error('Error validating rating:', error);
      await snap.ref.update({
        verified: false,
        flags: admin.firestore.FieldValue.arrayUnion('PROCESSING_ERROR'),
        error: error.message,
      });
    }
  });

/**
 * Check if device has exceeded daily rate limit
 */
async function checkRateLimit(deviceHash) {
  const today = Math.floor(Date.now() / 86400000).toString();
  const limitRef = db.collection('rateLimits').doc(deviceHash).collection('days').doc(today);

  const limitDoc = await limitRef.get();
  if (!limitDoc.exists) return false;

  return limitDoc.data().count >= CONFIG.MAX_RATINGS_PER_DAY;
}

/**
 * Increment rate limit counter for device
 */
async function incrementRateLimit(deviceHash) {
  const today = Math.floor(Date.now() / 86400000).toString();
  const limitRef = db.collection('rateLimits').doc(deviceHash).collection('days').doc(today);

  await limitRef.set({
    count: admin.firestore.FieldValue.increment(1),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Check for burst activity (many ratings in short time)
 */
async function checkBurstActivity(deviceHash) {
  const fiveMinutesAgo = Date.now() - CONFIG.BURST_WINDOW_MS;

  const recentRatings = await db.collection('ratings')
    .where('deviceHash', '==', deviceHash)
    .where('timestamp', '>', fiveMinutesAgo)
    .limit(CONFIG.BURST_THRESHOLD + 1)
    .get();

  return recentRatings.size >= CONFIG.BURST_THRESHOLD;
}

/**
 * Check if user has uniform rating pattern (all positive or all negative)
 */
async function checkUniformRatings(deviceHash, currentRating) {
  const recentRatings = await db.collection('ratings')
    .where('deviceHash', '==', deviceHash)
    .orderBy('timestamp', 'desc')
    .limit(CONFIG.MIN_RATINGS_FOR_UNIFORM_CHECK)
    .get();

  if (recentRatings.size < CONFIG.MIN_RATINGS_FOR_UNIFORM_CHECK) {
    return false;
  }

  const ratings = recentRatings.docs.map(doc => doc.data().rating);
  const positiveRatio = ratings.filter(r => r === 'positive').length / ratings.length;

  return positiveRatio > CONFIG.UNIFORM_RATING_THRESHOLD ||
         positiveRatio < (1 - CONFIG.UNIFORM_RATING_THRESHOLD);
}

/**
 * Update aggregate scores for platform
 */
async function updateAggregates(platform, rating, trustScore) {
  const aggregateRef = db.collection('aggregates').doc(platform);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(aggregateRef);

    const currentData = doc.exists ? doc.data() : {
      totalRatings: 0,
      positiveCount: 0,
      negativeCount: 0,
      weightedPositive: 0,
      weightedTotal: 0,
      weeklyTrend: [],
    };

    // Update counts
    currentData.totalRatings += 1;
    currentData.weightedTotal += trustScore;

    if (rating === 'positive') {
      currentData.positiveCount += 1;
      currentData.weightedPositive += trustScore;
    } else {
      currentData.negativeCount += 1;
    }

    currentData.lastUpdated = admin.firestore.FieldValue.serverTimestamp();

    transaction.set(aggregateRef, currentData, { merge: true });
  });

  // Update global stats
  await db.collection('stats').doc('global').set({
    totalRatings: admin.firestore.FieldValue.increment(1),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Flag suspicious rating for manual review
 */
async function flagForReview(ratingId, rating, flags, trustScore) {
  await db.collection('flagged').doc(ratingId).set({
    ...rating,
    flags,
    trustScore,
    flaggedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewed: false,
  });
}

/**
 * Scheduled function to compute weekly trends
 * Runs daily at midnight UTC
 */
exports.computeWeeklyTrends = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const platforms = ['chatgpt', 'claude', 'gemini', 'grok'];
    const oneDayAgo = Date.now() - 86400000;
    const sevenDaysAgo = Date.now() - (7 * 86400000);

    for (const platform of platforms) {
      try {
        // Get verified ratings from last 24 hours
        const dailyRatings = await db.collection('ratings')
          .where('platform', '==', platform)
          .where('verified', '==', true)
          .where('timestamp', '>', oneDayAgo)
          .get();

        if (dailyRatings.empty) continue;

        const positive = dailyRatings.docs.filter(d => d.data().rating === 'positive').length;
        const total = dailyRatings.size;
        const dailyScore = Math.round((positive / total) * 100);

        // Update weekly trend
        const aggregateRef = db.collection('aggregates').doc(platform);
        const doc = await aggregateRef.get();

        if (doc.exists) {
          let weeklyTrend = doc.data().weeklyTrend || [];
          weeklyTrend.push(dailyScore);

          // Keep only last 7 days
          if (weeklyTrend.length > 7) {
            weeklyTrend = weeklyTrend.slice(-7);
          }

          await aggregateRef.update({ weeklyTrend });
        }
      } catch (error) {
        console.error(`Error computing trends for ${platform}:`, error);
      }
    }
  });

/**
 * Cleanup old rate limit documents (older than 7 days)
 * Runs weekly
 */
exports.cleanupRateLimits = functions.pubsub
  .schedule('0 0 * * 0')
  .timeZone('UTC')
  .onRun(async (context) => {
    const sevenDaysAgo = Math.floor((Date.now() - (7 * 86400000)) / 86400000).toString();

    // This is a simplified cleanup - in production you'd want batch deletes
    const oldLimits = await db.collectionGroup('days')
      .where(admin.firestore.FieldPath.documentId(), '<', sevenDaysAgo)
      .limit(500)
      .get();

    const batch = db.batch();
    oldLimits.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`Cleaned up ${oldLimits.size} old rate limit documents`);
  });

/**
 * HTTP function to get public aggregates (for extension popup)
 */
exports.getAggregates = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const aggregates = await db.collection('aggregates').get();

    const result = {};
    aggregates.docs.forEach(doc => {
      const data = doc.data();
      result[doc.id] = {
        totalRatings: data.totalRatings || 0,
        positiveCount: data.positiveCount || 0,
        negativeCount: data.negativeCount || 0,
        weeklyTrend: data.weeklyTrend || [],
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching aggregates:', error);
    res.status(500).json({ error: 'Failed to fetch aggregates' });
  }
});
