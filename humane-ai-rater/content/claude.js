/**
 * Content Script for Claude (claude.ai)
 * Detects AI responses and injects HumaneBench rating buttons.
 * Uses real Claude DOM selectors from CLAUDE_CONFIG.
 */

(function () {
  const MODEL_NAME = 'Claude';
  const PROCESSED_ATTR = 'data-humane-processed';

  // --- Claude-specific selectors and detection logic ---
  const CLAUDE_CONFIG = {
    // Primary selectors
    responseSelector: '[data-testid="chat-message-content"]',
    containerSelector: '.prose',
    streamingIndicator: '[data-is-streaming="true"]',

    // Fallback selectors (Claude updates UI frequently)
    fallbackSelectors: {
      response: [
        '[data-testid="chat-message-content"]',
        '.chat-message-assistant',
        '[data-message-author="assistant"]',
        '.prose'
      ],
      streaming: [
        '[data-is-streaming="true"]',
        '.streaming',
        '[data-streaming="true"]'
      ]
    },

    // Check if this element is an AI response
    isResponse(element) {
      if (element.getAttribute('data-testid') === 'chat-message-content') return true;
      if (element.classList.contains('chat-message-assistant')) return true;
      const parent = element.closest('[data-testid="chat-message-content"]');
      if (parent) return true;
      return false;
    },

    // Check if response is still streaming
    isStreaming(element) {
      if (element.getAttribute('data-is-streaming') === 'true') return true;
      const streamingParent = element.closest('[data-is-streaming="true"]');
      if (streamingParent) return true;
      for (const selector of this.fallbackSelectors.streaming) {
        if (element.querySelector(selector)) return true;
      }
      return false;
    },

    // Get the text content of a response
    getResponseText(element) {
      const prose = element.querySelector('.prose') || element;
      return prose.textContent || '';
    },

    // Find the best insertion point for rating UI
    getInsertionPoint(element) {
      const prose = element.querySelector('.prose');
      if (prose) return prose;
      return element;
    }
  };

  /**
   * Extract the user prompt that precedes an assistant response.
   * Walks backward through conversation turns to find the human message.
   */
  function getUserPrompt(assistantElement) {
    // Strategy 1: Collect all chat-message-content elements, find this one, take the previous
    const allMessages = document.querySelectorAll(CLAUDE_CONFIG.responseSelector);
    const messagesArray = Array.from(allMessages);
    const currentIndex = messagesArray.indexOf(assistantElement);

    // Claude alternates human/assistant: index 0 = human, 1 = assistant, 2 = human, etc.
    // The human message before this assistant message is at currentIndex - 1
    if (currentIndex > 0) {
      const prevMsg = messagesArray[currentIndex - 1];
      const text = CLAUDE_CONFIG.getResponseText(prevMsg).trim();
      if (text && text.length > 0) return text;
    }

    // Strategy 2: Walk up to parent container and check previous siblings
    const messageContainer = assistantElement.closest('[data-testid="chat-message-content"]')
      || assistantElement.closest('[data-is-streaming]')
      || assistantElement.parentElement;

    if (messageContainer) {
      let current = messageContainer.parentElement;
      if (current) {
        let prev = current.previousElementSibling;
        while (prev) {
          const userContent = prev.querySelector('[data-testid="chat-message-content"]')
            || prev.querySelector('.prose')
            || prev.querySelector('p');
          if (userContent) {
            const text = userContent.textContent?.trim();
            if (text && text.length > 0 && text.length < 5000) return text;
          }
          prev = prev.previousElementSibling;
        }
      }
    }

    // Strategy 3: Fallback - find all .prose elements and take the one before
    const allProse = document.querySelectorAll('.prose');
    const proseArray = Array.from(allProse);
    const thisProseIndex = proseArray.findIndex(el =>
      assistantElement.contains(el) || el.contains(assistantElement) || el === assistantElement
    );
    if (thisProseIndex > 0) {
      const prevText = proseArray[thisProseIndex - 1].textContent?.trim();
      if (prevText) return prevText;
    }

    return '(User prompt not found)';
  }

  /**
   * Process a single assistant response element
   */
  function processResponse(responseElement) {
    if (responseElement.hasAttribute(PROCESSED_ATTR)) return;

    // Don't process if still streaming
    if (CLAUDE_CONFIG.isStreaming(responseElement)) return;

    responseElement.setAttribute(PROCESSED_ATTR, 'true');

    const aiResponse = CLAUDE_CONFIG.getResponseText(responseElement).trim();
    if (!aiResponse || aiResponse.length < 10) return;

    const userPrompt = getUserPrompt(responseElement);

    // Find best insertion point for the button
    const insertionPoint = CLAUDE_CONFIG.getInsertionPoint(responseElement);
    humaneOverlay.injectRateButton(insertionPoint, userPrompt, aiResponse, MODEL_NAME);
  }

  /**
   * Scan for Claude's assistant responses using config selectors
   */
  function scanForResponses() {
    const seen = new Set();

    // Primary: use data-testid selector
    const primaryElements = document.querySelectorAll(CLAUDE_CONFIG.responseSelector);

    // Claude's chat-message-content appears for both human and assistant.
    // We process every other one (assistant messages) by checking index parity
    // or by checking content characteristics.
    // Safer approach: process all, but let the overlay deduplicate via PROCESSED_ATTR.
    primaryElements.forEach((el, index) => {
      if (!seen.has(el) && !el.hasAttribute(PROCESSED_ATTR)) {
        // Skip elements inside input areas
        if (el.closest('[contenteditable]') || el.closest('textarea')) return;

        // Only process assistant messages (odd-indexed in alternating human/assistant pattern)
        // Index 0 = first human message, 1 = first assistant, 2 = second human, etc.
        if (index % 2 === 1) {
          seen.add(el);
          processResponse(el);
        }
      }
    });

    // Fallback: try other selectors
    for (const selector of CLAUDE_CONFIG.fallbackSelectors.response) {
      if (selector === CLAUDE_CONFIG.responseSelector) continue; // Already tried
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (!seen.has(el) && !el.hasAttribute(PROCESSED_ATTR)) {
            if (CLAUDE_CONFIG.isResponse(el)) {
              seen.add(el);
              processResponse(el);
            }
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }

  /**
   * Observe DOM for new responses (streaming completion, new messages)
   */
  function observeNewResponses() {
    let scanTimeout = null;

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
        // Also detect streaming completion (attribute change)
        if (mutation.type === 'attributes' &&
            (mutation.attributeName === 'data-is-streaming' || mutation.attributeName === 'data-streaming')) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        // Debounce to wait for streaming to finish
        clearTimeout(scanTimeout);
        scanTimeout = setTimeout(scanForResponses, 1500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-is-streaming', 'data-streaming']
    });
  }

  function init() {
    console.log('[Humane AI Rater] Claude content script loaded');
    scanForResponses();
    observeNewResponses();
    // Re-scan periodically in case DOM mutations are missed
    setInterval(scanForResponses, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 2000);
  }
})();
