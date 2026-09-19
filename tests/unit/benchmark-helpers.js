/**
 * Benchmark helper utilities for performance testing
 */

/**
 * Run a render and return timing info
 * @param {RenderController} controller - Initialized render controller
 * @param {string} scadContent - OpenSCAD code to render
 * @param {Object} options - Render options
 * @returns {Promise<Object>} Timing results
 */
export async function benchmarkRender(controller, scadContent, options = {}) {
  const startTime = performance.now();
  
  try {
    const result = await controller.render(scadContent, {}, {
      quality: options.quality,
      timeoutMs: options.timeoutMs || 120000 // 2 minute default for benchmarks
    });
    
    const endTime = performance.now();
    
    return {
      success: true,
      totalMs: Math.round(endTime - startTime),
      renderMs: result.timing?.renderMs || 0,
      triangles: result.stats?.triangles || 0,
      bytes: result.data?.byteLength || 0,
      bytesPerTriangle: result.stats?.triangles 
        ? Math.round(result.data?.byteLength / result.stats.triangles) 
        : 0
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      totalMs: Math.round(performance.now() - startTime)
    };
  }
}

/**
 * Format benchmark results for display
 * @param {Object} results - Results from benchmarkRender
 * @returns {string} Formatted string
 */
export function formatBenchmarkResults(results) {
  if (!results.success) {
    return `FAILED: ${results.error} (after ${results.totalMs}ms)`;
  }
  
  return [
    `Total: ${results.totalMs}ms`,
    `Render: ${results.renderMs}ms`,
    `Triangles: ${results.triangles.toLocaleString()}`,
    `Size: ${(results.bytes / 1024).toFixed(1)}KB`,
    `Bytes/tri: ${results.bytesPerTriangle}`,
    results.bytesPerTriangle > 100 ? '(ASCII STL detected!)' : '(Binary STL)'
  ].join(' | ');
}
