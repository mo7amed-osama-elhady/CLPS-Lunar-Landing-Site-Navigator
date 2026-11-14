import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPICE_SCRIPT_PATH = path.resolve(__dirname, 'spice_engine.py');
const DEFAULT_KERNELS_DIR = path.resolve(__dirname, '..', '..', 'kernels');

export interface SpiceKernelInfo {
  filename: string;
  type: string;
  role: string;
  size_bytes: number;
  coverage?: string;
}

export interface SpiceHealthInfo {
  available: boolean;
  toolkit: string | null;
  spiceypy_version: string | null;
  kernels_dir: string;
  loaded_kernels: SpiceKernelInfo[];
  missing_kernels: string[];
  coverage_start_utc: string | null;
  coverage_end_utc: string | null;
  moon_radii_km?: number[];
  sun_radius_km?: number;
  frame: string;
  abcorr: string;
  error: string | null;
}

export interface SpiceEphemerisSeries {
  timesIso: string[];
  azimuthDeg: number[];
  elevationDeg: number[];
  distanceKm: number[];
}

export interface SpiceComputeResponse {
  timesIso: string[];
  sun: {
    azimuthDeg: number[];
    elevationDeg: number[];
    distanceKm: number[];
  };
  earth: {
    azimuthDeg: number[];
    elevationDeg: number[];
    distanceKm: number[];
  };
  metadata: {
    toolkit: string;
    spiceypy_version: string;
    frame: string;
    abcorr: string;
    ephemeris: string;
    kernels: string[];
  };
}

export class SpiceBackendError extends Error {
  readonly code: string;
  constructor(message: string, code = 'SPICE_ERROR') {
    super(message);
    this.name = 'SpiceBackendError';
    this.code = code;
  }
}

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

class SpiceWorkerClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRpc>();
  private queue: Promise<void> = Promise.resolve();
  private cachedHealth: SpiceHealthInfo | null = null;

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      return this.proc;
    }

    const pythonBin = process.env.SPICE_PYTHON_BIN || 'python3';
    const kernelsDir = process.env.SPICE_KERNELS_DIR || DEFAULT_KERNELS_DIR;
    const child = spawn(pythonBin, [SPICE_SCRIPT_PATH, '--daemon'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SPICE_KERNELS_DIR: kernelsDir,
      },
    });

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      let msg: { id?: number; ok?: boolean; result?: unknown; error?: string; code?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof msg.id !== 'number') return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve(msg.result);
      } else {
        entry.reject(new SpiceBackendError(msg.error || 'SPICE computation failed.', msg.code || 'SPICE_ERROR'));
      }
    });

    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
      stderrBuf += String(chunk);
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });

    child.on('exit', (code, signal) => {
      const errMsg = stderrBuf.trim() || `SPICE worker exited (code=${code}, signal=${signal})`;
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new SpiceBackendError(errMsg, 'WORKER_EXIT'));
        this.pending.delete(id);
      }
      rl.close();
      if (this.proc === child) {
        this.proc = null;
        this.rl = null;
      }
    });

    child.on('error', (err) => {
      for (const [id, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new SpiceBackendError(`Failed to spawn Python SPICE engine: ${err.message}`, 'SPAWN_ERROR'));
        this.pending.delete(id);
      }
      rl.close();
      if (this.proc === child) {
        this.proc = null;
        this.rl = null;
      }
    });

    this.proc = child;
    this.rl = rl;
    return child;
  }

  private call<T>(action: 'health' | 'compute', payload?: unknown, timeoutMs = 20_000): Promise<T> {
    const task = this.queue.then(
      () =>
        new Promise<T>((resolve, reject) => {
          let proc: ChildProcessWithoutNullStreams;
          try {
            proc = this.ensureProcess();
          } catch (err) {
            reject(
              new SpiceBackendError(
                err instanceof Error ? err.message : 'Unable to start SPICE worker.',
                'SPAWN_ERROR',
              ),
            );
            return;
          }

          const id = this.nextId++;
          const timer = setTimeout(() => {
            this.pending.delete(id);
            reject(new SpiceBackendError(`SPICE worker timed out after ${timeoutMs} ms`, 'TIMEOUT'));
          }, timeoutMs);

          this.pending.set(id, {
            resolve: resolve as (val: unknown) => void,
            reject,
            timer,
          });

          const line = JSON.stringify({ id, action, payload }) + '\n';
          proc.stdin.write(line, (writeErr) => {
            if (writeErr) {
              clearTimeout(timer);
              this.pending.delete(id);
              reject(new SpiceBackendError(`Failed writing to SPICE worker: ${writeErr.message}`, 'IPC_ERROR'));
            }
          });
        }),
    );

    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async getHealth(forceRefresh = false): Promise<SpiceHealthInfo> {
    if (this.cachedHealth && this.cachedHealth.available && !forceRefresh) {
      return this.cachedHealth;
    }
    try {
      const info = await this.call<SpiceHealthInfo>('health', undefined, 15_000);
      this.cachedHealth = info;
      return info;
    } catch (err) {
      const kdir = process.env.SPICE_KERNELS_DIR || DEFAULT_KERNELS_DIR;
      const fallback: SpiceHealthInfo = {
        available: false,
        toolkit: null,
        spiceypy_version: null,
        kernels_dir: kdir,
        loaded_kernels: [],
        missing_kernels: [],
        coverage_start_utc: null,
        coverage_end_utc: null,
        frame: 'MOON_ME',
        abcorr: 'LT+S',
        error: err instanceof Error ? err.message : 'SPICE backend unreachable.',
      };
      this.cachedHealth = fallback;
      return fallback;
    }
  }

  async computeEphemeris(params: {
    latitudeDeg: number;
    longitudeDeg: number;
    observerHeightM: number;
    startIso: string;
    endIso: string;
    stepMinutes: number;
    maxSamples?: number;
  }): Promise<SpiceComputeResponse> {
    return this.call<SpiceComputeResponse>('compute', {
      latitude_deg: params.latitudeDeg,
      longitude_deg: params.longitudeDeg,
      observer_height_m: params.observerHeightM,
      start_iso: params.startIso,
      end_iso: params.endIso,
      step_minutes: params.stepMinutes,
      max_samples: params.maxSamples ?? 2000,
    });
  }

  shutdown(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.proc && !this.proc.killed) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }
}

export const spiceClient = new SpiceWorkerClient();

process.once('SIGTERM', () => spiceClient.shutdown());
process.once('SIGINT', () => spiceClient.shutdown());
