/**
 * Print Optimization Utilities
 * Micro-performance improvements and caching for print rendering
 */

// Cache for print-optimized content to avoid re-processing
const printCache = new Map<string, any>();

/**
 * Memoized print optimization helper
 * Reduces repeated calculations during print rendering
 */
export function getPrintCached<T>(key: string, factory: () => T): T {
  if (printCache.has(key)) {
    return printCache.get(key);
  }
  
  const value = factory();
  printCache.set(key, value);
  return value;
}

/**
 * Clear print cache when needed (e.g., data updates)
 */
export function clearPrintCache(keyPattern?: string): void {
  if (keyPattern) {
    for (const key of printCache.keys()) {
      if (key.includes(keyPattern)) {
        printCache.delete(key);
      }
    }
  } else {
    printCache.clear();
  }
}

/**
 * Optimize text for print rendering
 * Removes unnecessary characters and normalizes whitespace
 */
export function optimizeTextForPrint(text: string): string {
  // Use a hash-based key to avoid collisions
  const textHash = text.length.toString() + '_' + text.charAt(0) + text.charAt(Math.floor(text.length / 2)) + text.charAt(text.length - 1);
  return getPrintCached(`text_${textHash}`, () => 
    text
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/[\u200B-\u200D]/g, '') // Remove zero-width characters
      .trim()
  );
}

/**
 * Print-safe number formatting with caching
 */
export function formatNumberForPrint(num: number, options: Intl.NumberFormatOptions = {}): string {
  const key = `num_${num}_${JSON.stringify(options)}`;
  return getPrintCached(key, () => num.toLocaleString(undefined, options));
}

/**
 * Generate print-optimized CSS class combinations
 */
export function printOptimizedClasses(...classes: (string | undefined | boolean)[]): string {
  const key = `classes_${classes.join('_')}`;
  return getPrintCached(key, () => 
    classes
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Detect if we're currently in print mode
 */
export function isPrintMode(): boolean {
  return window.matchMedia('print').matches;
}

/**
 * Add print-specific event handlers
 */
export function setupPrintHandlers(): void {
  if (typeof window !== 'undefined') {
    // Clear cache before printing to ensure fresh data
    window.addEventListener('beforeprint', () => {
      clearPrintCache();
      // Load print styles and prepare for printing
      loadPrintStyles();
      document.body.classList.add('printing');
    });
    
    // Clean up after printing
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing');
      // Clear cache after printing to free memory
      setTimeout(() => clearPrintCache(), 1000);
    });
  }
}

/**
 * Lazy load print styles only when needed
 */
export function loadPrintStyles(): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('link[href*="print.css"]')) {
      resolve();
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // Use bundler-safe URL for production builds
    link.href = new URL('../brand/print.css', import.meta.url).href;
    link.media = 'print';
    link.onload = () => resolve();
    link.onerror = () => resolve(); // Graceful fallback
    document.head.appendChild(link);
  });
}

/**
 * Pre-process data for optimal print performance
 */
export function optimizeDataForPrint<T extends Record<string, any>>(
  data: T[], 
  maxItems: number = 1000
): T[] {
  const dataHash = `${data.length}_${maxItems}_${data.slice(0, 3).map(item => Object.keys(item).length).join('')}`;
  return getPrintCached(`data_${dataHash}`, () => 
    data
      .slice(0, maxItems) // Limit items for performance
      .map(item => {
        const optimized = { ...item };
        
        // Optimize string fields
        Object.keys(optimized).forEach(key => {
          if (typeof optimized[key] === 'string') {
            optimized[key] = optimizeTextForPrint(optimized[key]);
          }
        });
        
        return optimized;
      })
  );
}

// Initialize print handlers on module load
if (typeof window !== 'undefined') {
  setupPrintHandlers();
}