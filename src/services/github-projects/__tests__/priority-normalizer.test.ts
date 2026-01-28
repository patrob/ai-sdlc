import { describe, it, expect } from 'vitest';
import { normalizePositionPriority, normalizeMappedPriority } from '../priority-normalizer.js';

describe('priority-normalizer', () => {
  describe('normalizePositionPriority', () => {
    it('should normalize position to priority (position * 10)', () => {
      expect(normalizePositionPriority(1)).toBe(10);
      expect(normalizePositionPriority(2)).toBe(20);
      expect(normalizePositionPriority(3)).toBe(30);
      expect(normalizePositionPriority(10)).toBe(100);
    });

    it('should throw error for invalid position (0 or negative)', () => {
      expect(() => normalizePositionPriority(0)).toThrow('Invalid position: 0');
      expect(() => normalizePositionPriority(-1)).toThrow('Invalid position: -1');
    });

    it('should handle large positions', () => {
      expect(normalizePositionPriority(100)).toBe(1000);
      expect(normalizePositionPriority(1000)).toBe(10000);
    });
  });

  describe('normalizeMappedPriority', () => {
    const mapping = {
      P0: 10,
      P1: 20,
      P2: 30,
      P3: 40,
      High: 10,
      Medium: 30,
      Low: 50,
    };

    it('should map priority values correctly', () => {
      expect(normalizeMappedPriority('P0', mapping)).toBe(10);
      expect(normalizeMappedPriority('P1', mapping)).toBe(20);
      expect(normalizeMappedPriority('P2', mapping)).toBe(30);
      expect(normalizeMappedPriority('P3', mapping)).toBe(40);
    });

    it('should map custom priority values', () => {
      expect(normalizeMappedPriority('High', mapping)).toBe(10);
      expect(normalizeMappedPriority('Medium', mapping)).toBe(30);
      expect(normalizeMappedPriority('Low', mapping)).toBe(50);
    });

    it('should return null for unmapped values', () => {
      expect(normalizeMappedPriority('Unknown', mapping)).toBeNull();
      expect(normalizeMappedPriority('P4', mapping)).toBeNull();
      expect(normalizeMappedPriority('', mapping)).toBeNull();
    });

    it('should throw error for invalid mapped priority (non-number)', () => {
      const invalidMapping = { P0: 'invalid' as any };
      expect(() => normalizeMappedPriority('P0', invalidMapping)).toThrow(
        'Invalid priority mapping for "P0": invalid'
      );
    });

    it('should throw error for invalid mapped priority (non-positive)', () => {
      const negativeMapping = { P0: -10 };
      expect(() => normalizeMappedPriority('P0', negativeMapping)).toThrow(
        'Invalid priority mapping for "P0": -10'
      );

      const zeroMapping = { P0: 0 };
      expect(() => normalizeMappedPriority('P0', zeroMapping)).toThrow(
        'Invalid priority mapping for "P0": 0'
      );
    });

    it('should throw error for invalid mapped priority (infinity)', () => {
      const infinityMapping = { P0: Infinity };
      expect(() => normalizeMappedPriority('P0', infinityMapping)).toThrow(
        'Invalid priority mapping for "P0": Infinity'
      );
    });
  });
});
