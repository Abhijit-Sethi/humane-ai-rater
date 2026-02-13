// Claude-specific selectors and detection logic

export const CLAUDE_CONFIG = {
  name: 'Claude',
  key: 'claude',
  hosts: ['claude.ai'],

  // Selectors for detecting AI responses
  responseSelector: '[data-testid="chat-message-content"]',
  containerSelector: '.prose',
  streamingIndicator: '[data-is-streaming="true"]',

  // Alternative selectors (Claude updates UI)
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
    // Check test id
    if (element.getAttribute('data-testid') === 'chat-message-content') {
      return true;
    }

    // Check for assistant message class
    if (element.classList.contains('chat-message-assistant')) return true;

    // Check parent context
    const parent = element.closest('[data-testid="chat-message-content"]');
    if (parent) return true;

    return false;
  },

  // Check if response is still streaming
  isStreaming(element) {
    // Check data attribute on element or parents
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
    // Find the prose container
    const prose = element.querySelector('.prose') || element;
    return prose.textContent || '';
  },

  // Find the best insertion point for rating UI
  getInsertionPoint(element) {
    // Insert after the prose content
    const prose = element.querySelector('.prose');
    if (prose) return prose;

    return element;
  }
};
