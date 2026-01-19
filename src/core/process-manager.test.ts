import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from './process-manager.js';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

function createMockChildProcess(pid: number): ChildProcess {
  const mock = new EventEmitter() as ChildProcess & EventEmitter;
  mock.pid = pid;
  mock.killed = false;
  mock.kill = vi.fn((signal?: string) => {
    mock.killed = true;
    mock.emit('exit', 0, signal);
    return true;
  });
  return mock;
}

describe('ProcessManager', () => {
  beforeEach(() => {
    ProcessManager.resetInstance();
  });

  afterEach(() => {
    ProcessManager.resetInstance();
  });

  describe('getInstance', () => {
    it('returns a singleton instance', () => {
      const instance1 = ProcessManager.getInstance();
      const instance2 = ProcessManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('returns new instance after reset', () => {
      const instance1 = ProcessManager.getInstance();
      ProcessManager.resetInstance();
      const instance2 = ProcessManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('registerChild', () => {
    it('tracks registered child processes', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      expect(manager.getTrackedCount()).toBe(0);
      manager.registerChild(child);
      expect(manager.getTrackedCount()).toBe(1);
    });

    it('ignores null or undefined children', () => {
      const manager = ProcessManager.getInstance();

      manager.registerChild(null as unknown as ChildProcess);
      manager.registerChild(undefined as unknown as ChildProcess);

      expect(manager.getTrackedCount()).toBe(0);
    });

    it('ignores children without pid', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(0);
      child.pid = undefined;

      manager.registerChild(child);
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('removes child from tracking when it exits', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      manager.registerChild(child);
      expect(manager.getTrackedCount()).toBe(1);

      child.emit('exit', 0);
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('removes child from tracking on error', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      manager.registerChild(child);
      expect(manager.getTrackedCount()).toBe(1);

      child.emit('error', new Error('test error'));
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('removes child from tracking on close', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      manager.registerChild(child);
      expect(manager.getTrackedCount()).toBe(1);

      child.emit('close', 0);
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('tracks multiple children uniquely', () => {
      const manager = ProcessManager.getInstance();
      const child1 = createMockChildProcess(1234);
      const child2 = createMockChildProcess(5678);
      const child3 = createMockChildProcess(9012);

      manager.registerChild(child1);
      manager.registerChild(child2);
      manager.registerChild(child3);

      expect(manager.getTrackedCount()).toBe(3);
    });
  });

  describe('killAll', () => {
    it('sends signal to all tracked children', () => {
      const manager = ProcessManager.getInstance();
      const child1 = createMockChildProcess(1234);
      const child2 = createMockChildProcess(5678);

      manager.registerChild(child1);
      manager.registerChild(child2);

      manager.killAll('SIGTERM');

      expect(child1.kill).toHaveBeenCalledWith('SIGTERM');
      expect(child2.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('defaults to SIGTERM signal', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      manager.registerChild(child);
      manager.killAll();

      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('clears tracked children after killing', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      manager.registerChild(child);
      expect(manager.getTrackedCount()).toBe(1);

      manager.killAll();
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('handles already-dead processes gracefully', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);
      child.killed = true;
      child.kill = vi.fn(() => {
        throw new Error('ESRCH');
      });

      manager.registerChild(child);

      expect(() => manager.killAll()).not.toThrow();
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('does nothing when no children are tracked', () => {
      const manager = ProcessManager.getInstance();

      expect(() => manager.killAll()).not.toThrow();
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('is idempotent - safe to call multiple times', () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      manager.registerChild(child);

      manager.killAll();
      manager.killAll();
      manager.killAll();

      expect(manager.getTrackedCount()).toBe(0);
    });
  });

  describe('killAllWithTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends SIGTERM first', async () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      let killCalled = false;
      child.kill = vi.fn((signal?: string) => {
        killCalled = true;
        if (signal === 'SIGTERM') {
          setTimeout(() => {
            child.killed = true;
            child.emit('exit', 0, signal);
          }, 100);
        }
        return true;
      });

      manager.registerChild(child);

      const killPromise = manager.killAllWithTimeout(5000);

      expect(child.kill).toHaveBeenCalledWith('SIGTERM');

      await vi.advanceTimersByTimeAsync(100);
      await killPromise;

      expect(killCalled).toBe(true);
    });

    it('sends SIGKILL after timeout if process does not exit', async () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      const signals: string[] = [];
      child.kill = vi.fn((signal?: string) => {
        signals.push(signal || 'SIGTERM');
        if (signal === 'SIGKILL') {
          child.killed = true;
          child.emit('exit', 0, signal);
        }
        return true;
      });

      manager.registerChild(child);

      const killPromise = manager.killAllWithTimeout(1000);

      expect(signals).toContain('SIGTERM');

      await vi.advanceTimersByTimeAsync(1100);
      await killPromise;

      expect(signals).toContain('SIGKILL');
    });

    it('clears all children after completion', async () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);

      child.kill = vi.fn((signal?: string) => {
        child.killed = true;
        child.emit('exit', 0, signal);
        return true;
      });

      manager.registerChild(child);

      await manager.killAllWithTimeout(1000);

      expect(manager.getTrackedCount()).toBe(0);
    });

    it('handles multiple children', async () => {
      const manager = ProcessManager.getInstance();
      const child1 = createMockChildProcess(1234);
      const child2 = createMockChildProcess(5678);

      child1.kill = vi.fn((signal?: string) => {
        child1.killed = true;
        child1.emit('exit', 0, signal);
        return true;
      });

      child2.kill = vi.fn((signal?: string) => {
        child2.killed = true;
        child2.emit('exit', 0, signal);
        return true;
      });

      manager.registerChild(child1);
      manager.registerChild(child2);

      await manager.killAllWithTimeout(1000);

      expect(child1.kill).toHaveBeenCalled();
      expect(child2.kill).toHaveBeenCalled();
      expect(manager.getTrackedCount()).toBe(0);
    });

    it('does nothing when no children are tracked', async () => {
      const manager = ProcessManager.getInstance();

      await expect(manager.killAllWithTimeout(1000)).resolves.toBeUndefined();
    });

    it('skips already-killed children', async () => {
      const manager = ProcessManager.getInstance();
      const child = createMockChildProcess(1234);
      child.killed = true;

      manager.registerChild(child);

      await manager.killAllWithTimeout(1000);

      expect(child.kill).not.toHaveBeenCalled();
    });
  });
});
