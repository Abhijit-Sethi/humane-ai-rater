// Humane AI Rater - Content Script Injector

(function() {
  'use strict';

  // Prevent double-initialization
  if (window.humaneAIRaterInitialized) return;
  window.humaneAIRaterInitialized = true;

  // Platform configurations with selectors
  const PLATFORMS = {
    chatgpt: {
      hosts: ['chat.openai.com', 'chatgpt.com'],
      responseSelector: '[data-message-author-role="assistant"]',
      containerSelector: '.markdown',
      streamingIndicator: '.result-streaming',
      name: 'ChatGPT'
    },
    claude: {
      hosts: ['claude.ai'],
      responseSelector: '[data-testid="chat-message-content"]',
      containerSelector: '.prose',
      streamingIndicator: '[data-is-streaming="true"]',
      name: 'Claude'
    }
  };

  // Behavioral tracking for anti-spoofing
  const behaviorTracker = {
    pageLoadTime: Date.now(),
    hasMouseMoved: false,
    hasTouched: false,
    hasScrolled: false,
    maxScrollDepth: 0,
    interactionCount: 0,
    lastInteractionTime: null
  };

  // Track user behavior
  document.addEventListener('mousemove', () => {
    behaviorTracker.hasMouseMoved = true;
    behaviorTracker.interactionCount++;
    behaviorTracker.lastInteractionTime = Date.now();
  }, { passive: true, once: true });

  document.addEventListener('touchstart', () => {
    behaviorTracker.hasTouched = true;
    behaviorTracker.interactionCount++;
    behaviorTracker.lastInteractionTime = Date.now();
  }, { passive: true, once: true });

  document.addEventListener('scroll', () => {
    behaviorTracker.hasScrolled = true;
    behaviorTracker.maxScrollDepth = Math.max(
      behaviorTracker.maxScrollDepth,
      window.scrollY + window.innerHeight
    );
  }, { passive: true });

  // Detect current platform
  function detectPlatform() {
    const hostname = window.location.hostname;
    for (const [key, config] of Object.entries(PLATFORMS)) {
      if (config.hosts.some(host => hostname.includes(host))) {
        return { key, config };
      }
    }
    return null;
  }

  const platform = detectPlatform();
  if (!platform) {
    console.log('Humane AI Rater: Unsupported platform');
    return;
  }

  console.log(`Humane AI Rater: Detected ${platform.config.name}`);

  // Generate privacy-preserving device fingerprint
  async function getDeviceFingerprint() {
    // Check for cached fingerprint
    const cached = await chrome.storage.local.get(['deviceHash']);
    if (cached.deviceHash) {
      return cached.deviceHash;
    }

    // Generate new fingerprint
    const data = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone
    ].join('|');

    // Hash to preserve privacy
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Cache the fingerprint
    await chrome.storage.local.set({ deviceHash: hash });
    return hash;
  }

  // Generate session ID (rotates per browser session)
  function getSessionId() {
    if (!window.humaneSessionId) {
      window.humaneSessionId = crypto.randomUUID();
    }
    return window.humaneSessionId;
  }

  // Collect behavioral signals for anti-spoofing
  function collectBehaviorSignals() {
    return {
      timeSincePageLoad: Date.now() - behaviorTracker.pageLoadTime,
      hasMouseMoved: behaviorTracker.hasMouseMoved,
      hasTouched: behaviorTracker.hasTouched,
      hasScrolled: behaviorTracker.hasScrolled,
      maxScrollDepth: behaviorTracker.maxScrollDepth,
      interactionCount: behaviorTracker.interactionCount,
      documentVisible: !document.hidden
    };
  }

  // Check if response is still streaming
  function isStreaming(element) {
    if (!platform.config.streamingIndicator) return false;

    // Check if this element or parents have streaming indicator
    const streamingEl = element.querySelector(platform.config.streamingIndicator) ||
                        element.closest(platform.config.streamingIndicator);
    return !!streamingEl;
  }

  // Create rating UI element
  function createRatingUI(responseElement) {
    const container = document.createElement('div');
    container.className = 'humane-rater';
    container.setAttribute('data-humane-id', crypto.randomUUID());

    const label = document.createElement('span');
    label.className = 'humane-label';
    label.textContent = 'Rate this';

    const positiveBtn = document.createElement('button');
    positiveBtn.className = 'humane-rate-btn humane-positive';
    positiveBtn.setAttribute('data-rating', 'positive');
    positiveBtn.innerHTML = '<span class="humane-emoji">👍</span>';
    positiveBtn.title = 'This response was helpful and respectful';

    const negativeBtn = document.createElement('button');
    negativeBtn.className = 'humane-rate-btn humane-negative';
    negativeBtn.setAttribute('data-rating', 'negative');
    negativeBtn.innerHTML = '<span class="humane-emoji">👎</span>';
    negativeBtn.title = 'This response wasted my time or felt manipulative';

    container.appendChild(label);
    container.appendChild(positiveBtn);
    container.appendChild(negativeBtn);

    // Add click handlers
    const handleRating = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rating = e.currentTarget.getAttribute('data-rating');
      const responseAppearedAt = parseInt(responseElement.getAttribute('data-humane-appeared') || Date.now());

      await submitRating(rating, responseElement, responseAppearedAt, container);
    };

    positiveBtn.addEventListener('click', handleRating);
    negativeBtn.addEventListener('click', handleRating);

    return container;
  }

  // Create expanded tags UI (shown after rating)
  function createTagsUI(rating) {
    const container = document.createElement('div');
    container.className = 'humane-tags-container';

    const tags = rating === 'positive'
      ? [
          { id: 'respectful', label: 'Respected my attention' },
          { id: 'transparent', label: 'Was transparent' },
          { id: 'helpful', label: 'Actually helpful' },
          { id: 'concise', label: 'Appropriately concise' }
        ]
      : [
          { id: 'wasteful', label: 'Wasted my time' },
          { id: 'manipulative', label: 'Felt manipulative' },
          { id: 'verbose', label: 'Too verbose' },
          { id: 'unhelpful', label: 'Not helpful' }
        ];

    container.innerHTML = `
      <div class="humane-tags-header">
        <span class="humane-checkmark">✓</span>
        <span>Rated! Add details? (optional)</span>
      </div>
      <div class="humane-tags-list">
        ${tags.map(tag => `
          <label class="humane-tag-option">
            <input type="checkbox" value="${tag.id}" />
            <span>${tag.label}</span>
          </label>
        `).join('')}
      </div>
      <div class="humane-tags-actions">
        <button class="humane-skip-btn">Skip</button>
        <button class="humane-submit-tags-btn">Submit</button>
      </div>
    `;

    return container;
  }

  // Submit rating
  async function submitRating(rating, responseElement, responseAppearedAt, ratingUI) {
    const timeSinceAppeared = Date.now() - responseAppearedAt;

    // Anti-spoofing: Reject instant ratings
    if (timeSinceAppeared < 500) {
      console.warn('Humane AI Rater: Rating too fast, likely automated');
      showError(ratingUI, 'Please take time to read the response');
      return;
    }

    // Anti-spoofing: Require some interaction
    const signals = collectBehaviorSignals();
    if (!signals.hasMouseMoved && !signals.hasTouched) {
      console.warn('Humane AI Rater: No user interaction detected');
    }

    try {
      // Disable buttons during submission
      ratingUI.classList.add('humane-submitting');

      const deviceHash = await getDeviceFingerprint();
      const responseText = responseElement.textContent || '';

      // Create rating payload
      const ratingData = {
        rating,
        platform: platform.key,
        timestamp: Date.now(),
        sessionId: getSessionId(),
        deviceHash,
        responseLength: responseText.length,
        responseHash: await hashString(responseText.substring(0, 100)), // Privacy: only hash first 100 chars
        viewportTime: timeSinceAppeared,
        behaviorSignals: signals
      };

      // Send to background script
      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_RATING',
        data: ratingData
      });

      if (response.success) {
        showConfirmation(ratingUI, rating);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Humane AI Rater: Error submitting rating', error);
      showError(ratingUI, 'Failed to submit rating');
    }
  }

  // Hash string for privacy-preserving proof of interaction
  async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  // Show confirmation animation
  function showConfirmation(ratingUI, rating) {
    ratingUI.classList.remove('humane-submitting');
    ratingUI.classList.add('humane-rated');

    const emoji = rating === 'positive' ? '👍' : '👎';
    const color = rating === 'positive' ? '#22C55E' : '#EF4444';

    ratingUI.innerHTML = `
      <div class="humane-confirmation" style="color: ${color}">
        <span class="humane-emoji humane-bounce">${emoji}</span>
        <span class="humane-thanks">Thanks!</span>
      </div>
    `;

    // Fade out after delay
    setTimeout(() => {
      ratingUI.classList.add('humane-fade-out');
    }, 2000);
  }

  // Show error message
  function showError(ratingUI, message) {
    ratingUI.classList.remove('humane-submitting');

    const errorEl = document.createElement('div');
    errorEl.className = 'humane-error';
    errorEl.textContent = message;
    ratingUI.appendChild(errorEl);

    setTimeout(() => {
      errorEl.remove();
    }, 3000);
  }

  // Inject rating UI into response element
  function injectRatingUI(responseElement) {
    // Skip if already has rating UI
    if (responseElement.querySelector('.humane-rater')) return;

    // Skip if still streaming
    if (isStreaming(responseElement)) return;

    // Mark when this response appeared
    if (!responseElement.getAttribute('data-humane-appeared')) {
      responseElement.setAttribute('data-humane-appeared', Date.now().toString());
    }

    // Create and inject the UI
    const ratingUI = createRatingUI(responseElement);

    // Position appropriately based on platform
    responseElement.style.position = 'relative';
    responseElement.appendChild(ratingUI);
  }

  // Process all visible responses
  function processResponses() {
    const responses = document.querySelectorAll(platform.config.responseSelector);
    responses.forEach(response => {
      // Only inject if not streaming
      if (!isStreaming(response)) {
        injectRatingUI(response);
      }
    });
  }

  // Observe for new responses
  const observer = new MutationObserver((mutations) => {
    // Debounce processing
    clearTimeout(window.humaneProcessTimeout);
    window.humaneProcessTimeout = setTimeout(processResponses, 200);
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-is-streaming', 'data-message-author-role']
  });

  // Initial processing
  setTimeout(processResponses, 500);

  console.log('Humane AI Rater: Content script initialized');
})();
