import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { AudioAnalysis } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PendingTask {
  resolve: (result: AudioAnalysis) => void;
  reject: (error: Error) => void;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
  ready: boolean;
}

export class AudioWorkerPool {
  private workers: WorkerState[] = [];
  private taskQueue: Array<{ flacPath: string; task: PendingTask }> = [];
  private taskIdCounter = 0;
  private pendingTasks: Map<number, PendingTask> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private poolSize: number = 4) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    const workerPath = path.join(__dirname, 'audio-worker.js');

    const workerPromises = Array.from({ length: this.poolSize }, (_, i) => {
      return new Promise<WorkerState>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: { workerId: i },
        });

        const state: WorkerState = { worker, busy: false, ready: false };

        worker.on('message', (message) => {
          if (message.type === 'ready') {
            state.ready = true;
            resolve(state);
            return;
          }

          // Handle analysis response
          const task = this.pendingTasks.get(message.id);
          if (task) {
            this.pendingTasks.delete(message.id);
            state.busy = false;

            if (message.success) {
              task.resolve(message.result);
            } else {
              task.reject(new Error(message.error || 'Analysis failed'));
            }

            // Process next task in queue
            this.processQueue();
          }
        });

        worker.on('error', (error) => {
          if (!state.ready) {
            reject(error);
          } else {
            console.error('Worker error:', error);
          }
        });

        worker.on('exit', (code) => {
          if (code !== 0 && !state.ready) {
            reject(new Error(`Worker exited with code ${code}`));
          }
        });
      });
    });

    this.workers = await Promise.all(workerPromises);
    this.initialized = true;
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const availableWorker = this.workers.find((w) => w.ready && !w.busy);
    if (!availableWorker) return;

    const queuedTask = this.taskQueue.shift();
    if (!queuedTask) return;

    this.executeOnWorker(availableWorker, queuedTask.flacPath, queuedTask.task);
  }

  private executeOnWorker(
    workerState: WorkerState,
    flacPath: string,
    task: PendingTask
  ): void {
    const taskId = this.taskIdCounter++;
    this.pendingTasks.set(taskId, task);
    workerState.busy = true;

    workerState.worker.postMessage({
      id: taskId,
      type: 'analyze',
      flacPath,
    });
  }

  async analyze(flacPath: string): Promise<AudioAnalysis> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const task: PendingTask = { resolve, reject };

      const availableWorker = this.workers.find((w) => w.ready && !w.busy);

      if (availableWorker) {
        this.executeOnWorker(availableWorker, flacPath, task);
      } else {
        this.taskQueue.push({ flacPath, task });
      }
    });
  }

  async terminate(): Promise<void> {
    await Promise.all(
      this.workers.map((w) => w.worker.terminate())
    );
    this.workers = [];
    this.initialized = false;
    this.initPromise = null;
  }

  get size(): number {
    return this.poolSize;
  }
}

// Singleton pool instance
let globalPool: AudioWorkerPool | null = null;

export function getWorkerPool(size?: number): AudioWorkerPool {
  if (!globalPool) {
    globalPool = new AudioWorkerPool(size || 4);
  }
  return globalPool;
}

export async function terminateWorkerPool(): Promise<void> {
  if (globalPool) {
    await globalPool.terminate();
    globalPool = null;
  }
}
