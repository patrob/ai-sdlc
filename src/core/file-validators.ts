/**
 * File validation utilities for story file attachment
 */

import fs from 'fs';
import path from 'path';

/** Maximum allowed file size in megabytes */
export const MAX_FILE_SIZE_MB = 5;

/** Maximum allowed file size in bytes */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Allowed file extensions for story files */
export const ALLOWED_EXTENSIONS = ['.md', '.txt'] as const;

/**
 * Error codes for file validation failures
 */
export type FileValidationErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'INVALID_EXTENSION'
  | 'EMPTY_CONTENT'
  | 'BINARY_CONTENT'
  | 'READ_ERROR';

/**
 * Custom error class for file validation failures
 */
export class FileValidationError extends Error {
  constructor(
    message: string,
    public readonly code: FileValidationErrorCode
  ) {
    super(message);
    this.name = 'FileValidationError';
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FileValidationError);
    }
  }
}

/**
 * Validates that a file exists at the given path
 * @param filePath - Absolute path to the file
 * @throws {FileValidationError} If file does not exist
 */
export function validateFileExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new FileValidationError(
      `File not found: ${filePath}`,
      'FILE_NOT_FOUND'
    );
  }

  // Also check it's actually a file, not a directory
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new FileValidationError(
      `Path is not a file: ${filePath}`,
      'FILE_NOT_FOUND'
    );
  }
}

/**
 * Validates that a file does not exceed the maximum allowed size
 * @param filePath - Absolute path to the file
 * @throws {FileValidationError} If file exceeds MAX_FILE_SIZE_MB
 */
export function validateFileSize(filePath: string): void {
  const stats = fs.statSync(filePath);
  const fileSizeBytes = stats.size;

  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    throw new FileValidationError(
      `File too large: ${fileSizeMB}MB exceeds maximum of ${MAX_FILE_SIZE_MB}MB`,
      'FILE_TOO_LARGE'
    );
  }
}

/**
 * Validates that a file has an allowed extension
 * @param filePath - Absolute path to the file
 * @throws {FileValidationError} If extension is not in ALLOWED_EXTENSIONS
 */
export function validateFileExtension(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
    throw new FileValidationError(
      `Invalid file extension: "${ext}". Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
      'INVALID_EXTENSION'
    );
  }
}

/**
 * Checks if content appears to be binary (non-text)
 * Binary detection: checks for null bytes and high ratio of non-printable characters
 * @param content - String content to check
 * @returns true if content appears to be binary
 */
function isBinaryContent(content: string): boolean {
  // Check for null bytes (common in binary files)
  if (content.includes('\0')) {
    return true;
  }

  // Sample the first 1024 characters for efficiency
  const sample = content.slice(0, 1024);

  // Count non-printable characters (excluding common whitespace)
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Allow: tab (9), newline (10), carriage return (13), and printable ASCII (32-126)
    // Also allow extended ASCII and Unicode (> 126)
    if (code < 9 || (code > 13 && code < 32)) {
      nonPrintable++;
    }
  }

  // If more than 10% non-printable, likely binary
  return sample.length > 0 && nonPrintable / sample.length > 0.1;
}

/**
 * Validates that file content is non-empty and appears to be text
 * @param content - File content as string
 * @throws {FileValidationError} If content is empty or appears to be binary
 */
export function validateFileContent(content: string): void {
  // Check for empty content (after trimming whitespace)
  if (!content || content.trim().length === 0) {
    throw new FileValidationError(
      'File content is empty',
      'EMPTY_CONTENT'
    );
  }

  // Check for binary content
  if (isBinaryContent(content)) {
    throw new FileValidationError(
      'File appears to contain binary content, not text',
      'BINARY_CONTENT'
    );
  }
}

/**
 * Runs all validations on a story file
 * Validates: existence, size, extension, and content
 * @param filePath - Absolute path to the file
 * @throws {FileValidationError} If any validation fails
 */
export function validateStoryFile(filePath: string): void {
  // 1. Check file exists
  validateFileExists(filePath);

  // 2. Check file extension
  validateFileExtension(filePath);

  // 3. Check file size
  validateFileSize(filePath);

  // 4. Read and validate content
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new FileValidationError(
      `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      'READ_ERROR'
    );
  }

  validateFileContent(content);
}
