/**
 * Comparison Controller - Manage multiple parameter variants for comparison
 * @license GPL-3.0-or-later
 */

/**
 * Variant structure:
 * {
 *   id: string,
 *   name: string,
 *   parameters: object,
 *   stl: ArrayBuffer | null,
 *   stats: { triangles, size, boundingBox } | null,
 *   state: 'pending' | 'rendering' | 'complete' | 'error',
 *   error: string | null
 * }
 */

export class ComparisonController {
  /**
   * @param {object} stateManager - State manager instance
   * @param {Function} getRenderController - Getter function that returns the current renderController
   * @param {object} options - Configuration options
   */
  constructor(stateManager, getRenderController, options = {}) {
    this.stateManager = stateManager;
    // Store getter function instead of direct reference to handle lazy initialization
    this._getRenderController =
      typeof getRenderController === 'function'
        ? getRenderController
        : () => getRenderController;
    this.maxVariants = options.maxVariants || 10;
    this.variants = new Map(); // id -> variant
    this.nextId = 1;
    this.listeners = [];
    this.scadContent = null;
    this.projectFiles = null;
    this.mainFile = null;
    this.libraries = [];
  }

  /**
   * Get the current render controller (supports lazy initialization)
   * @returns {object|null} The render controller
   */
  get renderController() {
    return this._getRenderController();
  }

  /**
   * Set the current SCAD content and project files
   */
  setProject(
    scadContent,
    projectFiles = null,
    mainFile = null,
    libraries = []
  ) {
    this.scadContent = scadContent;
    const hasProjectFiles =
      projectFiles instanceof Map ? projectFiles.size > 0 : !!projectFiles;
    this.projectFiles = hasProjectFiles ? projectFiles : null;
    this.mainFile = hasProjectFiles ? mainFile : null;
    this.libraries = Array.isArray(libraries) ? libraries : [];
  }

  /**
   * Add a variant to comparison
   * @param {string} name - Variant name
   * @param {object} parameters - Parameter values
   * @returns {string} Variant ID
   */
  addVariant(name, parameters) {
    if (this.variants.size >= this.maxVariants) {
      throw new Error(`Maximum ${this.maxVariants} variants allowed`);
    }

    const id = `variant-${this.nextId++}`;
    const variant = {
      id,
      name: name || `Variant ${this.variants.size + 1}`,
      parameters: { ...parameters },
      stl: null,
      stats: null,
      state: 'pending',
      error: null,
      timestamp: Date.now(),
    };

    this.variants.set(id, variant);
    this.notifyListeners('add', variant);
    return id;
  }

  /**
   * Remove a variant
   * @param {string} id - Variant ID
   */
  removeVariant(id) {
    const variant = this.variants.get(id);
    if (variant) {
      this.variants.delete(id);
      this.notifyListeners('remove', variant);
    }
  }

  /**
   * Update variant properties
   * @param {string} id - Variant ID
   * @param {object} updates - Properties to update
   */
  updateVariant(id, updates) {
    const variant = this.variants.get(id);
    if (variant) {
      Object.assign(variant, updates);
      this.variants.set(id, variant);
      this.notifyListeners('update', variant);
    }
  }

  /**
   * Rename a variant
   * @param {string} id - Variant ID
   * @param {string} name - New name
   */
  renameVariant(id, name) {
    this.updateVariant(id, { name });
  }

  /**
   * Update variant parameters
   * @param {string} id - Variant ID
   * @param {object} parameters - New parameter values
   */
  updateVariantParameters(id, parameters) {
    this.updateVariant(id, {
      parameters: { ...parameters },
      state: 'pending',
      stl: null,
      stats: null,
    });
  }

  /**
   * Render a specific variant
   * @param {string} id - Variant ID
   * @returns {Promise<void>}
   */
  async renderVariant(id) {
    const variant = this.variants.get(id);
    if (!variant) {
      throw new Error(`Variant ${id} not found`);
    }

    if (!this.scadContent) {
      throw new Error('No SCAD content loaded');
    }

    if (!this.renderController) {
      throw new Error('Render controller not initialized');
    }

    // Update state to rendering
    this.updateVariant(id, { state: 'rendering', error: null });

    try {
      const result = await this.renderController.render(
        this.scadContent,
        variant.parameters,
        {
          timeoutMs: 60000,
          files: this.projectFiles,
          mainFile: this.mainFile,
          libraries: this.libraries,
        }
      );

      this.updateVariant(id, {
        state: 'complete',
        stl: result.stl,
        stats: result.stats,
        error: null,
      });

      return result;
    } catch (error) {
      this.updateVariant(id, {
        state: 'error',
        error: error.message || 'Render failed',
      });
      throw error;
    }
  }

  /**
   * Render all pending variants
   * @returns {Promise<void>}
   */
  async renderAllVariants() {
    const pending = Array.from(this.variants.values()).filter(
      (v) => v.state === 'pending' || v.state === 'error'
    );

    // Render sequentially to avoid overwhelming the system
    for (const variant of pending) {
      try {
        await this.renderVariant(variant.id);
      } catch (error) {
        console.error(`Failed to render variant ${variant.id}:`, error);
        // Continue with next variant
      }
    }
  }

  /**
   * Get a variant by ID
   * @param {string} id - Variant ID
   * @returns {object|null} Variant object
   */
  getVariant(id) {
    return this.variants.get(id) || null;
  }

  /**
   * Get all variants
   * @returns {Array} Array of variant objects
   */
  getAllVariants() {
    return Array.from(this.variants.values());
  }

  /**
   * Get variant count
   * @returns {number}
   */
  getVariantCount() {
    return this.variants.size;
  }

  /**
   * Check if at max capacity
   * @returns {boolean}
   */
  isAtMaxCapacity() {
    return this.variants.size >= this.maxVariants;
  }

  /**
   * Clear all variants
   */
  clearAll() {
    const ids = Array.from(this.variants.keys());
    this.variants.clear();
    this.notifyListeners('clear', { ids });
  }

  /**
   * Export all variants to JSON
   * @returns {object} Serializable comparison data
   */
  exportComparison() {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      variants: Array.from(this.variants.values()).map((v) => ({
        id: v.id,
        name: v.name,
        parameters: v.parameters,
        stats: v.stats,
        // Don't include STL data (too large)
      })),
    };
  }

  /**
   * Import variants from JSON
   * @param {object} data - Exported comparison data
   */
  importComparison(data) {
    if (!data.variants || !Array.isArray(data.variants)) {
      throw new Error('Invalid comparison data format');
    }

    this.clearAll();

    for (const variantData of data.variants) {
      if (this.variants.size >= this.maxVariants) break;

      this.addVariant(variantData.name, variantData.parameters);
    }
  }

  /**
   * Subscribe to variant changes
   * @param {Function} callback - (event, variant) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify listeners of changes
   * @private
   */
  notifyListeners(event, data) {
    this.listeners.forEach((callback) => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Comparison listener error:', error);
      }
    });
  }

  /**
   * Get statistics about all variants
   * @returns {object} Statistics
   */
  getStatistics() {
    const variants = this.getAllVariants();
    return {
      total: variants.length,
      pending: variants.filter((v) => v.state === 'pending').length,
      rendering: variants.filter((v) => v.state === 'rendering').length,
      complete: variants.filter((v) => v.state === 'complete').length,
      error: variants.filter((v) => v.state === 'error').length,
      totalTriangles: variants
        .filter((v) => v.stats)
        .reduce((sum, v) => sum + (v.stats.triangles || 0), 0),
    };
  }
}
