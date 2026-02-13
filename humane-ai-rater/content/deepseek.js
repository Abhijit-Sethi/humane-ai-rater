/**
 * Content Script for Deepseek (chat.deepseek.com)
 * Detects AI responses and injects HumaneBench rating buttons.
 *
 * Deepseek is a Chinese AI model that adds global/emerging model diversity
 * to the HumaneBench evaluation landscape.
 */

(function () {
  const MODEL_NAME = 'Deepseek';
  const PROCESSED_ATTR = 'data-humane-processed';

  /**
   * Platform-specific configuration for Deepseek
   * Deepseek follows common chat UI patterns similar to ChatGPT
   */
  const DEEPSEEK_CONFIG = {
    // Response selectors - Deepseek typically marks assistant messages
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      '[data-role="assistant"]',
      '[data-testid="assistant-message"]',
      '.assistant-message',
      '[class*="AssistantMessage"]',
      '[class*="assistant-message"]',
      // Deepseek-specific patterns
      '[data-testid="deepseek-response"]',
      '.deepseek-message.assistant',
      '[class*="bot-message"]',
      '[class*="ai-message"]',
      // Markdown/prose containers within assistant context
      '.markdown-body'
    ],

    userSelectors: [
      '[data-message-author-role="user"]',
      '[data-role="user"]',
      '[data-testid="user-message"]',
      '.user-message',
      '[class*="UserMessage"]',
      '[class*="user-message"]',
      '[class*="human-message"]'
    ],

    // Conversation/turn container selectors
    turnSelectors: [
      '[data-testid^="conversation-turn"]',
      '[data-testid="message-container"]',
      '.message-container',
      '.chat-message',
      '[class*="ConversationTurn"]'
    ],

    // Streaming indicators
    streamingSelectors: [
      '[data-streaming="true"]',
      '[data-is-streaming="true"]',
      '.streaming',
      '[class*="streaming"]',
      '.typing-indicator'
    ]
  };

  /**
   * Check if an element is a Deepseek assistant response
   */
  function isAssistantResponse(element) {
    // Check data attributes
    if (element.getAttribute('data-message-author-role') === 'assistant' ||
        element.getAttribute('data-role') === 'assistant') {
      return true;
    }

    // Check for assistant-related classes
    const className = (element.className || '').toLowerCase();
    if (className.includes('assistant') ||
        className.includes('bot-message') ||
        className.includes('ai-message')) {
      return true;
    }

    // Check parent for role context
    const parent = element.closest('[data-role="assistant"], [data-message-author-role="assistant"]');
    if (parent) return true;

    return false;
  }

  /**
   * Check if response is still streaming
   */
  function isStreaming(element) {
    // Direct streaming attributes
    if (element.getAttribute('data-streaming') === 'true' ||
        element.getAttribute('data-is-streaming') === 'true') {
      return true;
    }

    // Check for streaming class
    const className = (element.className || '').toLowerCase();
    if (className.includes('streaming') || className.includes('typing')) {
      return true;
    }

    // Check for streaming indicators within element
    for (const sel of DEEPSEEK_CONFIG.streamingSelectors) {
      try {
        if (element.querySelector(sel)) return true;
      } catch (e) { /* invalid selector */ }
    }

    // Check ancestor streaming state
    const streamingParent = element.closest('[data-streaming="true"], [data-is-streaming="true"]');
    if (streamingParent) return true;

    // Check for cursor/caret animation (common streaming indicator)
    const cursor = element.querySelector('[class*="cursor"], [class*="caret"]');
    if (cursor && window.getComputedStyle(cursor).animationName !== 'none') {
      return true;
    }

    return false;
  }

  /**
   * Extract the user prompt that precedes an assistant response.
   */
  function getUserPrompt(assistantElement) {
    // Strategy 1: Find turn container and look for previous turn with user role
    for (const turnSel of DEEPSEEK_CONFIG.turnSelectors) {
      const turnContainer = assistantElement.closest(turnSel);
      if (turnContainer) {
        let prev = turnContainer.previousElementSibling;
        while (prev) {
          for (const userSel of DEEPSEEK_CONFIG.userSelectors) {
            const userMsg = prev.matches(userSel) ? prev : prev.querySelector(userSel);
            if (userMsg) return userMsg.innerText.trim();
          }
          prev = prev.previousElementSibling;
        }
      }
    }

    // Strategy 2: Walk backward through all messages
    const allMessages = document.querySelectorAll(
      DEEPSEEK_CONFIG.responseSelectors.concat(DEEPSEEK_CONFIG.userSelectors).join(', ')
    );
    const msgArray = Array.from(allMessages);
    const assistantIndex = msgArray.indexOf(assistantElement);

    if (assistantIndex > 0) {
      for (let i = assistantIndex - 1; i >= 0; i--) {
        const msg = msgArray[i];
        if (msg.getAttribute('data-message-author-role') === 'user' ||
            msg.getAttribute('data-role') === 'user' ||
            (msg.className || '').toLowerCase().includes('user')) {
          return msg.innerText.trim();
        }
      }
    }

    // Strategy 3: Get the last user message on the page
    for (const userSel of DEEPSEEK_CONFIG.userSelectors) {
      try {
        const allUserMsgs = document.querySelectorAll(userSel);
        if (allUserMsgs.length > 0) {
          return allUserMsgs[allUserMsgs.length - 1].innerText.trim();
        }
      } catch (e) { /* invalid selector */ }
    }

    return '(User prompt not found)';
  }

  /**
   * Get the text content of an assistant response
   */
  function getResponseText(element) {
    // Look for markdown/prose content first
    const markdownContent = element.querySelector(
      '.markdown-body, .prose, .markdown, [class*="content"], [class*="text"]'
    );
    if (markdownContent) {
      return markdownContent.innerText.trim();
    }
    return element.innerText.trim();
  }

  /**
   * Process a single assistant response element
   */
  function processResponse(responseElement) {
    if (responseElement.hasAttribute(PROCESSED_ATTR)) return;

    // Skip if still streaming
    if (isStreaming(responseElement)) return;

    // Verify this is actually an assistant response
    if (!isAssistantResponse(responseElement)) return;

    responseElement.setAttribute(PROCESSED_ATTR, 'true');

    const aiResponse = getResponseText(responseElement);
    if (!aiResponse || aiResponse.length < 10) return;

    const userPrompt = getUserPrompt(responseElement);

    humaneOverlay.injectRateButton(responseElement, userPrompt, aiResponse, MODEL_NAME);
  }

  /**
   * Scan the page for unprocessed assistant responses
   */
  function scanForResponses() {
    const seen = new Set();

    // Try all response selectors
    for (const selector of DEEPSEEK_CONFIG.responseSelectors) {
      try {
        const responses = document.querySelectorAll(selector);
        responses.forEach(el => {
          if (!seen.has(el) && !el.hasAttribute(PROCESSED_ATTR)) {
            seen.add(el);
            processResponse(el);
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }

  /**
   * Set up a MutationObserver to detect new responses
   */
  let scanTimeout = null;
  function observeNewResponses() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        // Debounce: wait for response to finish streaming/rendering
        clearTimeout(scanTimeout);
        scanTimeout = setTimeout(scanForResponses, 1200);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initial scan + observer
  function init() {
    scanForResponses();
    observeNewResponses();

    // Re-scan periodically in case mutations are missed
    setInterval(scanForResponses, 5000);
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Give the SPA time to render
    setTimeout(init, 2000);
  }
})();
