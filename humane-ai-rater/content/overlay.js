/**
 * Overlay UI - Renders HumaneBench score display on AI chatbot pages.
 * Shared between ChatGPT and Claude content scripts.
 */

class HumaneOverlay {
  constructor() {
    this.activePanel = null;
  }

  /**
   * Show a "Rate This" button near an AI response element
   */
  injectRateButton(responseElement, userPrompt, aiResponse, model) {
    // Don't inject if already present
    if (responseElement.querySelector('.humane-rate-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'humane-rate-btn';
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      Rate Humaneness
    `;
    btn.title = 'Evaluate this response with HumaneBench';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startEvaluation(btn, userPrompt, aiResponse, model);
    });

    // Insert after the response element or append to it
    const container = document.createElement('div');
    container.className = 'humane-rate-container';
    container.appendChild(btn);
    responseElement.appendChild(container);
  }

  /**
   * Start evaluation - show loading, call background, show results
   */
  async startEvaluation(buttonElement, userPrompt, aiResponse, model) {
    // Show loading state
    const originalHTML = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <span class="humane-spinner"></span>
      Evaluating...
    `;
    buttonElement.disabled = true;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'evaluate',
        userPrompt,
        aiResponse,
        model
      });

      if (result.error) {
        this.showError(buttonElement, result.error);
        buttonElement.innerHTML = originalHTML;
        buttonElement.disabled = false;
        return;
      }

      // Replace button with score panel
      const container = buttonElement.closest('.humane-rate-container');
      this.renderScorePanel(container, result, userPrompt, model);
    } catch (err) {
      this.showError(buttonElement, 'Evaluation failed. Check your API key.');
      buttonElement.innerHTML = originalHTML;
      buttonElement.disabled = false;
    }
  }

  /**
   * Render the full score panel
   */
  renderScorePanel(container, evaluation, userPrompt, model) {
    const overallScore = evaluation.overallScore ??
      (evaluation.principles.reduce((s, p) => s + p.score, 0) / evaluation.principles.length);
    const scoreColor = getScoreColor(overallScore);
    const scoreLabel = getScoreLabel(overallScore);

    container.innerHTML = '';
    container.className = 'humane-score-panel';

    const panel = document.createElement('div');
    panel.className = 'humane-panel-inner';
    panel.innerHTML = `
      <div class="humane-panel-header">
        <div class="humane-panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${scoreColor}" stroke-width="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          HumaneScore
        </div>
        <div class="humane-header-actions">
          <button class="humane-share-btn" title="Copy score card to clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Share
          </button>
          <button class="humane-close-btn" title="Close">&times;</button>
        </div>
      </div>
      <div class="humane-overall-row">
        <div class="humane-overall-score" style="color: ${scoreColor}">
          ${overallScore > 0 ? '+' : ''}${overallScore.toFixed(2)}
        </div>
        <div class="humane-overall-meta">
          <span class="humane-score-badge" style="background: ${scoreColor}20; color: ${scoreColor}; border: 1px solid ${scoreColor}40">
            ${scoreLabel}
          </span>
          <span class="humane-model-tag">${model}</span>
          ${evaluation.confidence ? `<span class="humane-confidence">${(evaluation.confidence * 100).toFixed(0)}% confidence</span>` : ''}
        </div>
      </div>
      <div class="humane-principles-list">
        ${evaluation.principles.map(p => {
          const color = getScoreColor(p.score);
          const cls = getScoreClass(p.score);
          const escapedRationale = (p.rationale || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
          return `
            <div class="humane-principle-row ${cls}" title="${escapedRationale}">
              <span class="humane-principle-name">${p.name}</span>
              <span class="humane-principle-score" style="color: ${color}">
                ${p.score > 0 ? '+' : ''}${p.score}
              </span>
            </div>
          `;
        }).join('')}
      </div>
      ${evaluation.analysis ? `
        <div class="humane-analysis">
          <details>
            <summary>View Analysis</summary>
            <p>${evaluation.analysis.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </details>
        </div>
      ` : ''}
      ${evaluation.globalViolations && evaluation.globalViolations.length > 0 ? `
        <div class="humane-violations">
          ${evaluation.globalViolations.map(v => `<div class="humane-violation-item">! ${v}</div>`).join('')}
        </div>
      ` : ''}
      <div class="humane-panel-footer">
        <div class="humane-user-rating">
          <span>Your rating:</span>
          <button class="humane-thumb humane-thumb-up" data-vote="up" title="Humane">&#128077;</button>
          <button class="humane-thumb humane-thumb-down" data-vote="down" title="Not humane">&#128078;</button>
        </div>
        <div class="humane-powered-by">Powered by HumaneBench</div>
      </div>
    `;

    container.appendChild(panel);

    // Close button
    panel.querySelector('.humane-close-btn').addEventListener('click', () => {
      container.remove();
    });

    // Share button - screenshot panel to clipboard
    panel.querySelector('.humane-share-btn').addEventListener('click', async (e) => {
      const shareBtn = e.currentTarget;
      const originalHTML = shareBtn.innerHTML;

      try {
        shareBtn.innerHTML = `<span class="humane-spinner" style="width:12px;height:12px;border-width:1.5px;"></span> Copying...`;
        shareBtn.disabled = true;

        // Hide the share and close buttons during screenshot
        const headerActions = panel.querySelector('.humane-header-actions');
        headerActions.style.visibility = 'hidden';

        // Use html2canvas to capture the panel
        const canvas = await html2canvas(panel, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
          removeContainer: true
        });

        // Restore buttons
        headerActions.style.visibility = '';

        // Convert canvas to blob and copy to clipboard
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);

        // Show success feedback
        shareBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied!
        `;
        shareBtn.classList.add('humane-share-success');

        setTimeout(() => {
          shareBtn.innerHTML = originalHTML;
          shareBtn.disabled = false;
          shareBtn.classList.remove('humane-share-success');
        }, 2000);

      } catch (err) {
        console.error('[Humane AI Rater] Share failed:', err);
        // Restore buttons on error
        const headerActions = panel.querySelector('.humane-header-actions');
        if (headerActions) headerActions.style.visibility = '';

        shareBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Failed
        `;
        setTimeout(() => {
          shareBtn.innerHTML = originalHTML;
          shareBtn.disabled = false;
        }, 2000);
      }
    });

    // Thumb voting
    panel.querySelectorAll('.humane-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        panel.querySelectorAll('.humane-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }

  /**
   * Show error toast
   */
  showError(element, message) {
    const toast = document.createElement('div');
    toast.className = 'humane-toast humane-toast-error';
    toast.textContent = message;
    element.closest('.humane-rate-container')?.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }
}

// Global overlay instance
const humaneOverlay = new HumaneOverlay();
