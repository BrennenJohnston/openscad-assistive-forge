/**
 * Comparison View - UI for comparing multiple parameter variants
 * @license GPL-3.0-or-later
 */

import { PreviewManager } from './preview.js';
import { escapeHtml } from './html-utils.js';

/**
 * ComparisonView handles the multi-panel comparison UI
 */
export class ComparisonView {
  constructor(container, comparisonController, options = {}) {
    this.container = container;
    this.comparisonController = comparisonController;
    this.theme = options.theme || 'light';
    this.highContrast = options.highContrast || false;

    // Track preview managers for each variant
    this.previewManagers = new Map(); // variantId -> PreviewManager

    // Flag to prevent concurrent auto-render cycles
    this.isAutoRendering = false;

    // Subscribe to comparison controller changes
    this.comparisonController.subscribe((event, data) => {
      this.handleComparisonEvent(event, data);
    });
  }

  /**
   * Initialize the comparison view
   */
  async init() {
    this.container.innerHTML = this.createComparisonLayout();
    this.attachEventListeners();

    // Render any existing variants (they may have been added before init)
    const existingVariants = this.comparisonController.getAllVariants();
    for (const variant of existingVariants) {
      await this.addVariantCard(variant);
    }

    // Auto-render all pending variants for better UX
    this.autoRenderPendingVariants();
  }

  /**
   * Automatically render all pending variants
   */
  async autoRenderPendingVariants() {
    // Prevent concurrent auto-render cycles
    if (this.isAutoRendering) {
      return;
    }

    const pendingVariants = this.comparisonController
      .getAllVariants()
      .filter((v) => v.state === 'pending');

    if (pendingVariants.length === 0) return;

    this.isAutoRendering = true;

    try {
      // Render each pending variant sequentially
      for (const variant of pendingVariants) {
        // Re-check if variant is still pending (might have been rendered by manual click)
        const currentVariant = this.comparisonController.getVariant(variant.id);
        if (!currentVariant || currentVariant.state !== 'pending') continue;

        try {
          await this.comparisonController.renderVariant(variant.id);
        } catch (error) {
          console.error(`Auto-render failed for ${variant.id}:`, error);
          // Continue with next variant even if one fails
        }
      }

      // After completing, check if new pending variants were added during rendering
      const newPendingVariants = this.comparisonController
        .getAllVariants()
        .filter((v) => v.state === 'pending');

      if (newPendingVariants.length > 0) {
        // Render new pending variants (isAutoRendering is still true)
        for (const variant of newPendingVariants) {
          try {
            await this.comparisonController.renderVariant(variant.id);
          } catch (error) {
            console.error(`Auto-render failed for ${variant.id}:`, error);
          }
        }
      }
    } finally {
      this.isAutoRendering = false;
    }
  }

  /**
   * Create the comparison layout HTML
   */
  createComparisonLayout() {
    return `
      <div class="comparison-container">
        <div class="comparison-header">
          <h2>Comparison Mode</h2>
          <div class="comparison-controls">
            <button 
              id="render-all-btn" 
              class="btn btn-secondary"
              aria-label="Render all variants"
            >
              <span aria-hidden="true">🔄</span> Render All
            </button>
            <button 
              id="export-comparison-btn" 
              class="btn btn-secondary"
              aria-label="Export comparison"
            >
              <span aria-hidden="true">💾</span> Export
            </button>
            <button 
              id="exit-comparison-btn" 
              class="btn btn-secondary"
              aria-label="Return to customizer"
            >
              <span aria-hidden="true">↩</span> Return to Customizer
            </button>
          </div>
        </div>
        <div class="comparison-grid" id="comparison-grid">
          <div class="comparison-empty-state">
            <p>No variants added for comparison.</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const renderAllBtn = document.getElementById('render-all-btn');
    const exportBtn = document.getElementById('export-comparison-btn');
    const exitBtn = document.getElementById('exit-comparison-btn');

    if (renderAllBtn) {
      renderAllBtn.addEventListener('click', () => this.handleRenderAll());
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport());
    }
    if (exitBtn) {
      exitBtn.addEventListener('click', () => this.handleExit());
    }
  }

  /**
   * Handle comparison controller events
   */
  handleComparisonEvent(event, data) {
    switch (event) {
      case 'add':
        this.addVariantCard(data);
        // Trigger auto-render for newly added variant
        this.autoRenderPendingVariants();
        break;
      case 'remove':
        this.removeVariantCard(data.id);
        break;
      case 'update':
        this.updateVariantCard(data);
        break;
      case 'clear':
        this.clearAllVariantCards();
        break;
    }

    this.updateControls();
    this.updateEmptyState();
  }

  /**
   * Add a variant card to the grid
   */
  async addVariantCard(variant) {
    const grid = document.getElementById('comparison-grid');
    if (!grid) return;

    // Remove empty state if present
    const emptyState = grid.querySelector('.comparison-empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    // Create variant card
    const card = document.createElement('div');
    card.className = 'variant-card';
    card.id = `variant-card-${variant.id}`;
    card.dataset.variantId = variant.id;
    card.innerHTML = this.createVariantCardHTML(variant);

    grid.appendChild(card);

    // Initialize preview manager for this variant (lazy loads Three.js)
    const previewContainer = card.querySelector('.variant-preview');
    if (previewContainer) {
      const previewManager = new PreviewManager(previewContainer, {
        theme: this.theme,
        highContrast: this.highContrast,
      });
      await previewManager.init();
      this.previewManagers.set(variant.id, previewManager);

      // If variant already has an STL (from previous render), load it immediately
      if (variant.stl && variant.state === 'complete') {
        previewManager.loadSTL(variant.stl);
      }
    }

    // Attach event listeners for this card
    this.attachVariantCardListeners(variant.id);
  }

  /**
   * Create variant card HTML
   */
  createVariantCardHTML(variant) {
    const stateClass = `variant-state-${variant.state}`;
    const stateLabel = this.getStateLabel(variant.state);

    return `
      <div class="variant-header">
        <input 
          type="text" 
          class="variant-name-input" 
          value="${escapeHtml(variant.name)}"
          data-variant-id="${variant.id}"
          aria-label="Variant name"
        />
        <div class="variant-actions">
          <button 
            class="btn-icon variant-render-btn" 
            data-variant-id="${variant.id}"
            aria-label="Render this variant"
            title="Render"
          >
            🔄
          </button>
          <button 
            class="btn-icon variant-download-btn" 
            data-variant-id="${variant.id}"
            aria-label="Download STL"
            title="Download"
            ${variant.state !== 'complete' ? 'disabled' : ''}
          >
            ⬇️
          </button>
          <button 
            class="btn-icon variant-edit-btn" 
            data-variant-id="${variant.id}"
            aria-label="Edit parameters"
            title="Edit"
          >
            ✏️
          </button>
          <button 
            class="btn-icon variant-delete-btn" 
            data-variant-id="${variant.id}"
            aria-label="Delete variant"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
      <div class="variant-preview" data-variant-id="${variant.id}">
        <!-- Three.js preview will be initialized here -->
      </div>
      <div class="variant-status ${stateClass}">
        <span class="status-label">${stateLabel}</span>
        ${variant.stats ? `<span class="status-stats">${variant.stats.triangles || 0} triangles</span>` : ''}
        ${variant.error ? `<span class="status-error">${escapeHtml(variant.error)}</span>` : ''}
      </div>
    `;
  }

  /**
   * Update a variant card
   */
  updateVariantCard(variant) {
    const card = document.getElementById(`variant-card-${variant.id}`);
    if (!card) return;

    // Update status
    const statusDiv = card.querySelector('.variant-status');
    if (statusDiv) {
      const stateClass = `variant-state-${variant.state}`;
      statusDiv.className = `variant-status ${stateClass}`;

      const stateLabel = this.getStateLabel(variant.state);
      statusDiv.innerHTML = `
        <span class="status-label">${stateLabel}</span>
        ${variant.stats ? `<span class="status-stats">${variant.stats.triangles || 0} triangles</span>` : ''}
        ${variant.error ? `<span class="status-error">${escapeHtml(variant.error)}</span>` : ''}
      `;
    }

    // Update download button state
    const downloadBtn = card.querySelector('.variant-download-btn');
    if (downloadBtn) {
      downloadBtn.disabled = variant.state !== 'complete';
    }

    // Update name if changed
    const nameInput = card.querySelector('.variant-name-input');
    if (nameInput && nameInput.value !== variant.name) {
      nameInput.value = variant.name;
    }

    // Update preview if STL is available
    if (variant.stl && variant.state === 'complete') {
      const previewManager = this.previewManagers.get(variant.id);
      if (previewManager) {
        previewManager.loadSTL(variant.stl);
      }
    }
  }

  /**
   * Remove a variant card
   */
  removeVariantCard(variantId) {
    const card = document.getElementById(`variant-card-${variantId}`);
    if (card) {
      card.remove();
    }

    // Clean up preview manager
    const previewManager = this.previewManagers.get(variantId);
    if (previewManager) {
      previewManager.dispose();
      this.previewManagers.delete(variantId);
    }

    this.updateEmptyState();
  }

  /**
   * Clear all variant cards
   */
  clearAllVariantCards() {
    // Dispose all preview managers
    this.previewManagers.forEach((pm) => pm.dispose());
    this.previewManagers.clear();

    // Clear grid
    const grid = document.getElementById('comparison-grid');
    if (grid) {
      grid.innerHTML =
        '<div class="comparison-empty-state"><p>No variants added for comparison.</p></div>';
    }
  }

  /**
   * Update empty state visibility
   */
  updateEmptyState() {
    const grid = document.getElementById('comparison-grid');
    if (!grid) return;

    const hasVariants = this.comparisonController.getVariantCount() > 0;
    const emptyState = grid.querySelector('.comparison-empty-state');

    if (!hasVariants && !emptyState) {
      grid.innerHTML =
        '<div class="comparison-empty-state"><p>No variants added for comparison.</p></div>';
    } else if (hasVariants && emptyState) {
      emptyState.remove();
    }
  }

  /**
   * Update control button states
   */
  updateControls() {
    const renderAllBtn = document.getElementById('render-all-btn');
    const exportBtn = document.getElementById('export-comparison-btn');

    const count = this.comparisonController.getVariantCount();

    if (renderAllBtn) {
      renderAllBtn.disabled = count === 0;
    }

    if (exportBtn) {
      exportBtn.disabled = count === 0;
    }
  }

  /**
   * Attach event listeners for a specific variant card
   */
  attachVariantCardListeners(variantId) {
    const card = document.getElementById(`variant-card-${variantId}`);
    if (!card) return;

    // Name input
    const nameInput = card.querySelector('.variant-name-input');
    if (nameInput) {
      nameInput.addEventListener('change', (e) => {
        const newName = e.target.value.trim();
        if (newName) {
          this.comparisonController.renameVariant(variantId, newName);
        }
      });
    }

    // Render button
    const renderBtn = card.querySelector('.variant-render-btn');
    if (renderBtn) {
      renderBtn.addEventListener('click', () =>
        this.handleRenderVariant(variantId)
      );
    }

    // Download button
    const downloadBtn = card.querySelector('.variant-download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () =>
        this.handleDownloadVariant(variantId)
      );
    }

    // Edit button
    const editBtn = card.querySelector('.variant-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () =>
        this.handleEditVariant(variantId)
      );
    }

    // Delete button
    const deleteBtn = card.querySelector('.variant-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () =>
        this.handleDeleteVariant(variantId)
      );
    }
  }

  /**
   * Handle render all
   */
  async handleRenderAll() {
    const btn = document.getElementById('render-all-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Rendering...';
    }

    try {
      await this.comparisonController.renderAllVariants();
    } catch (error) {
      console.error('Failed to render all variants:', error);
      alert('Some variants failed to render. Check console for details.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span aria-hidden="true">🔄</span> Render All';
      }
    }
  }

  /**
   * Handle export
   */
  handleExport() {
    const data = this.comparisonController.exportComparison();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Handle exit comparison mode
   */
  handleExit() {
    const event = new CustomEvent('comparison:exit');
    window.dispatchEvent(event);
  }

  /**
   * Handle render variant
   */
  async handleRenderVariant(variantId) {
    try {
      await this.comparisonController.renderVariant(variantId);
    } catch (error) {
      console.error(`Failed to render variant ${variantId}:`, error);
      alert(`Render failed: ${error.message}`);
    }
  }

  /**
   * Handle download variant
   */
  handleDownloadVariant(variantId) {
    const variant = this.comparisonController.getVariant(variantId);
    if (!variant || !variant.stl) {
      alert('No STL available for this variant');
      return;
    }

    // Trigger download (will be handled by main app)
    const event = new CustomEvent('comparison:download-variant', {
      detail: { variantId, variant },
    });
    window.dispatchEvent(event);
  }

  /**
   * Handle edit variant
   */
  handleEditVariant(variantId) {
    // Switch back to normal mode with this variant's parameters
    const event = new CustomEvent('comparison:edit-variant', {
      detail: { variantId },
    });
    window.dispatchEvent(event);
  }

  /**
   * Handle delete variant
   */
  handleDeleteVariant(variantId) {
    const variant = this.comparisonController.getVariant(variantId);
    if (!variant) return;

    if (confirm(`Delete variant "${variant.name}"?`)) {
      this.comparisonController.removeVariant(variantId);
    }
  }

  /**
   * Update theme
   */
  updateTheme(theme, highContrast) {
    this.theme = theme;
    this.highContrast = highContrast;

    // Update all preview managers
    this.previewManagers.forEach((pm) => {
      pm.updateTheme(theme, highContrast);
    });
  }

  /**
   * Get state label for display
   */
  getStateLabel(state) {
    const labels = {
      pending: 'Pending',
      rendering: 'Rendering...',
      complete: 'Complete',
      error: 'Error',
    };
    return labels[state] || state;
  }

  /**
   * Dispose the comparison view
   */
  dispose() {
    // Dispose all preview managers
    this.previewManagers.forEach((pm) => pm.dispose());
    this.previewManagers.clear();

    // Clear container
    this.container.innerHTML = '';
  }
}
