import { ChildProcess } from 'child_process';

export class ProcessManager {
  private static instance: ProcessManager | null = null;
  private children: Set<ChildProcess> = new Set();
  private isCleaningUp: boolean = false;

  private constructor() {}

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  static resetInstance(): void {
    if (ProcessManager.instance) {
      ProcessManager.instance.children.clear();
      ProcessManager.instance.isCleaningUp = false;
    }
    ProcessManager.instance = null;
  }

  registerChild(child: ChildProcess): void {
    if (!child || !child.pid) return;

    this.children.add(child);

    const cleanup = () => {
      this.children.delete(child);
    };

    child.once('exit', cleanup);
    child.once('error', cleanup);
    child.once('close', cleanup);
  }

  getTrackedCount(): number {
    return this.children.size;
  }

  killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.children.size === 0) return;

    const childrenToKill = Array.from(this.children);

    for (const child of childrenToKill) {
      if (child.pid && !child.killed) {
        try {
          child.kill(signal);
        } catch {
          // Process may have already exited - ignore ESRCH errors
        }
      }
      this.children.delete(child);
    }
  }

  async killAllWithTimeout(gracefulTimeoutMs: number = 5000): Promise<void> {
    if (this.children.size === 0) return;
    if (this.isCleaningUp) return;

    this.isCleaningUp = true;

    try {
      const childrenToKill = Array.from(this.children);

      const killPromises = childrenToKill.map((child) => {
        return new Promise<void>((resolve) => {
          if (!child.pid || child.killed) {
            this.children.delete(child);
            resolve();
            return;
          }

          let resolved = false;

          const onExit = () => {
            if (!resolved) {
              resolved = true;
              this.children.delete(child);
              resolve();
            }
          };

          child.once('exit', onExit);
          child.once('close', onExit);

          try {
            child.kill('SIGTERM');
          } catch {
            // Ignore errors
          }

          setTimeout(() => {
            if (!resolved) {
              try {
                child.kill('SIGKILL');
              } catch {
                // Ignore errors
              }
              resolved = true;
              this.children.delete(child);
              resolve();
            }
          }, gracefulTimeoutMs);
        });
      });

      await Promise.all(killPromises);
    } finally {
      this.isCleaningUp = false;
    }
  }
}

export function setupGlobalCleanupHandlers(): void {
  const processManager = ProcessManager.getInstance();

  process.on('exit', () => {
    processManager.killAll('SIGKILL');
  });

  process.on('SIGTERM', () => {
    processManager.killAll('SIGTERM');
    setTimeout(() => {
      processManager.killAll('SIGKILL');
      process.exit(0);
    }, 5000);
  });

  process.on('SIGINT', () => {
    processManager.killAll('SIGTERM');
    setTimeout(() => {
      processManager.killAll('SIGKILL');
      process.exit(0);
    }, 5000);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    processManager.killAll('SIGKILL');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    processManager.killAll('SIGKILL');
    process.exit(1);
  });
}
