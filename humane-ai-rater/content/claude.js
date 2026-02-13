/**
 * Content Script for Claude (claude.ai)
 * Detects AI responses and injects HumaneBench rating buttons.
 */

(function () {
  const MODEL_NAME = 'Claude';
  const PROCESSED_ATTR = 'data-humane-processed';

  /**
   * Determine if a chat-message-content element is an assistant (not human) message.
   * Uses multiple heuristics since Claude doesn't have a simple author-role attribute.
   */
  function isAssistantMessage(element) {
    // Strategy 1: Check parent/ancestor for role or author indicators
    const parent = element.parentElement;
    if (!parent) return false;

    // Walk up to find the conversation turn container
    let turnContainer = element.closest('[data-testid]');
    if (turnContainer) {
      const testId = turnContainer.getAttribute('data-testid');
      // If there's an explicit human/user indicator, skip it
      if (testId && (testId.includes('human') || testId.includes('user'))) return false;
      // If there's an explicit assistant indicator, accept it
      if (testId && testId.includes('assistant')) return true;
    }

    // Strategy 2: Check for .prose container - assistant messages on Claude
    // are typically wrapped in a .prose div. Human messages usually don't have .prose.
    const hasProse = element.querySelector('.prose');
    if (hasProse) return true;

    // Strategy 3: Check surrounding elements for assistant-specific UI
    // Assistant messages often have action buttons (copy, retry, etc.) nearby
    const messageRow = element.closest('[class*="message"]') || element.closest('[class*="msg"]') || parent;
    if (messageRow) {
      // Look for copy/retry buttons that only appear on assistant messages
      const hasActionButtons = messageRow.querySelector('button[aria-label*="opy"]')
        || messageRow.querySelector('button[aria-label*="etry"]')
        || messageRow.querySelector('[class*="action"]');
      if (hasActionButtons) return true;
    }

    // Strategy 4: Check the content length heuristic
    // Assistant messages tend to be longer and have more structure
    const text = element.textContent || '';
    const hasStructuredContent = element.querySelector('pre') || element.querySelector('ol')
      || element.querySelector('ul') || element.querySelector('code')
      || element.querySelector('h1, h2, h3, h4');
    if (hasStructuredContent && text.length > 50) return true;

    // Strategy 5: Check for the message-content grid layout pattern
    // On Claude, assistant messages are in a specific grid column
    const gridParent = element.closest('[class*="col-start"]') || element.closest('[class*="grid"]');
    if (gridParent) {
      const className = gridParent.className || '';
      // Assistant messages typically start at col-start-2 or similar patterns
      if (className.includes('col-start-2') || className.includes('col-start-3')) return true;
    }

    // Strategy 6: Fallback - use index parity as last resort, but only if
    // we have a reasonable number of messages
    const allMessages = document.querySelectorAll('[data-testid="chat-message-content"]');
    const idx = Array.from(allMessages).indexOf(element);
    if (idx >= 0 && allMessages.length >= 2) {
      // Only use parity if we're somewhat confident (at least 2 messages)
      return idx % 2 === 1;
    }

    return false;
  }

  /**
   * Extract the user prompt that precedes an assistant response.
   */
  function getUserPrompt(assistantElement) {
    // Strategy 1: Get previous chat-message-content element
    const allMessages = document.querySelectorAll('[data-testid="chat-message-content"]');
    const messagesArray = Array.from(allMessages);
    const currentIndex = messagesArray.indexOf(assistantElement);

    if (currentIndex > 0) {
      const prevMsg = messagesArray[currentIndex - 1];
      const prose = prevMsg.querySelector('.prose') || prevMsg;
      const text = prose.textContent?.trim();
      if (text && text.length > 0 && text.length < 5000) return text;
    }

    // Strategy 2: Walk up to parent container and check previous siblings
    let container = assistantElement.closest('[data-testid="chat-message-content"]')
      || assistantElement.parentElement;

    if (container) {
      // Go up one more level to the turn wrapper
      let turnWrapper = container.parentElement;
      if (turnWrapper) {
        let prev = turnWrapper.previousElementSibling;
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

    // Strategy 3: Find all .prose elements and take the one before
    const allProse = document.querySelectorAll('.prose');
    const proseArray = Array.from(allProse);
    const thisProseIndex = proseArray.findIndex(el =>
      assistantElement.contains(el) || el.contains(assistantElement) || el === assistantElement
    );
    if (thisProseIndex > 0) {
      const prevText = proseArray[thisProseIndex - 1].textContent?.trim();
      if (prevText && prevText.length < 5000) return prevText;
    }

    return '(User prompt not found)';
  }

  /**
   * Check if an element is still streaming
   */
  function isStreaming(element) {
    if (element.getAttribute('data-is-streaming') === 'true') return true;
    const streamingParent = element.closest('[data-is-streaming="true"]');
    if (streamingParent) return true;
    // Check for streaming indicators in the subtree
    if (element.querySelector('[data-is-streaming="true"]')) return true;
    if (element.querySelector('.streaming')) return true;
    if (element.querySelector('[data-streaming="true"]')) return true;
    return false;
  }

  /**
   * Process a single response element
   */
  function processResponse(responseElement) {
    if (responseElement.hasAttribute(PROCESSED_ATTR)) return;

    // Don't process if still streaming
    if (isStreaming(responseElement)) return;

    // Mark as processed early to prevent re-processing
    responseElement.setAttribute(PROCESSED_ATTR, 'true');

    // Get the response text
    const prose = responseElement.querySelector('.prose') || responseElement;
    const aiResponse = prose.textContent?.trim();
    if (!aiResponse || aiResponse.length < 10) return;

    const userPrompt = getUserPrompt(responseElement);

    // Insert the rate button
    const insertionPoint = responseElement.querySelector('.prose') || responseElement;
    humaneOverlay.injectRateButton(insertionPoint, userPrompt, aiResponse, MODEL_NAME);
  }

  /**
   * Scan for Claude's assistant responses
   */
  function scanForResponses() {
    // Primary: find all chat-message-content elements
    const allMessages = document.querySelectorAll('[data-testid="chat-message-content"]');

    allMessages.forEach(el => {
      if (el.hasAttribute(PROCESSED_ATTR)) return;
      // Skip elements inside input areas
      if (el.closest('[contenteditable]') || el.closest('textarea')) return;

      // Check if this is an assistant message
      if (isAssistantMessage(el)) {
        processResponse(el);
      }
    });

    // Fallback: try finding .prose elements that haven't been processed
    // and appear to be assistant messages
    const proseElements = document.querySelectorAll('.prose');
    proseElements.forEach(el => {
      // Check if already processed via parent
      const parent = el.closest('[data-testid="chat-message-content"]');
      if (parent && parent.hasAttribute(PROCESSED_ATTR)) return;
      if (el.hasAttribute(PROCESSED_ATTR)) return;
      if (el.closest('[contenteditable]') || el.closest('textarea')) return;

      // Only process .prose that has substantial content and structured elements
      const text = el.textContent?.trim();
      if (!text || text.length < 10) return;

      // If parent is a chat-message-content, let the primary loop handle it
      if (parent) return;

      // Mark and process orphan .prose that look like responses
      const hasStructure = el.querySelector('p') || el.querySelector('pre')
        || el.querySelector('ul, ol') || el.querySelector('code');
      if (hasStructure && text.length > 50) {
        el.setAttribute(PROCESSED_ATTR, 'true');
        const userPrompt = getUserPrompt(el);
        humaneOverlay.injectRateButton(el, userPrompt, text, MODEL_NAME);
      }
    });
  }

  /**
   * Observe DOM for new responses
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
        if (mutation.type === 'attributes' &&
            (mutation.attributeName === 'data-is-streaming' || mutation.attributeName === 'data-streaming')) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
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
