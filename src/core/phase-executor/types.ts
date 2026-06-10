/**
 * Type definitions for phase executor
 */

/**
 * Options for phase execution
 */
export interface PhaseExecutorOptions {
  /** AI provider to use (defaults to registry default) */
  provider?: any; // IProvider
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}
