/**
 * Configuration loader
 *
 * This was changed from sync to async to support remote config loading.
 */
export interface AppConfig {
  port: number;
  host: string;
  database: string;
}

/**
 * Load application configuration (async)
 */
export async function loadConfig(): Promise<AppConfig> {
  // Simulate async config loading (e.g., from remote source)
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        port: 3000,
        host: 'localhost',
        database: 'postgres://localhost/myapp',
      });
    }, 10);
  });
}
