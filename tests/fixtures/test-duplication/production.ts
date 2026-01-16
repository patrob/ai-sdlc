/**
 * Example production file with exported functions
 * Used as test fixture for detecting test duplication patterns
 */

export function parseStory(path: string): object {
  // Production implementation
  return { path, content: 'story content' };
}

export function loadConfig(dir: string): object {
  // Production implementation
  return { sdlcFolder: dir };
}

export const formatData = (data: any): string => {
  // Production implementation
  return JSON.stringify(data);
};

// Internal helper (not exported)
function internalHelper() {
  return 'internal';
}
