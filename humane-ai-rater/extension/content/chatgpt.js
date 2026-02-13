// ChatGPT-specific selectors and detection logic

export const CHATGPT_CONFIG = {
  name: 'ChatGPT',
  key: 'chatgpt',
  hosts: ['chat.openai.com', 'chatgpt.com'],

  // Selectors for detecting AI responses
  responseSelector: '[data-message-author-role="assistant"]',
  containerSelector: '.markdown',
  streamingIndicator: '.result-streaming',

  // Alternative selectors (ChatGPT updates UI frequently)
  fallbackSelectors: {
    response: [
      '[data-message-author-role="assistant"]',
      '.agent-turn .markdown',
      '[data-testid="conversation-turn"] .markdown'
    ],
    streaming: [
      '.result-streaming',
      '[data-testid="streaming"]',
      '.animate-pulse'
    ]
  },

  // Check if this element is an AI response
  isResponse(element) {
    // Check direct attribute
    if (element.getAttribute('data-message-author-role') === 'assistant') {
      return true;
    }

    // Check parent for assistant role
    const parent = element.closest('[data-message-author-role="assistant"]');
    if (parent) return true;

    // Check for agent turn class (newer ChatGPT UI)
    if (element.classList.contains('agent-turn')) return true;

    return false;
  },

  // Check if response is still streaming
  isStreaming(element) {
    for (const selector of this.fallbackSelectors.streaming) {
      if (element.querySelector(selector)) return true;
    }
    return false;
  },

  // Get the text content of a response
  getResponseText(element) {
    // Find the markdown container
    const markdown = element.querySelector('.markdown') || element;
    return markdown.textContent || '';
  },

  // Find the best insertion point for rating UI
  getInsertionPoint(element) {
    // Insert after the markdown content
    const markdown = element.querySelector('.markdown');
    if (markdown) return markdown;

    return element;
  }
};
