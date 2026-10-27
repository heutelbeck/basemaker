import { proxy, transfer, wrap } from 'comlink';
import type { Remote } from 'comlink';
import type { PartsDownload } from '../export/partsDownload.ts';
import type { BuildProgress, Job, ProgressListener } from '../generators/job.ts';
import type { BuildOutput, GeometryWorkerApi } from './geometryWorker.ts';

export type BuildListener = (result: BuildOutput | null, error: string | null) => void;

const DEBOUNCE_MS = 100;

/**
 * Client for the geometry worker: debounces rebuild requests, keeps at most
 * one request in flight, coalesces bursts to the latest parameters, and
 * drops stale results so the preview never goes backwards.
 */
export class GeometryClient {
  private readonly api: Remote<GeometryWorkerApi>;
  private readonly listener: BuildListener;
  private readonly progressListener: ProgressListener;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingJob: Job | null = null;
  private inFlight = false;
  private latestRequestId = 0;

  constructor(listener: BuildListener, progressListener: ProgressListener = () => {}) {
    this.api = wrap<GeometryWorkerApi>(
      new Worker(new URL('./geometryWorker.ts', import.meta.url), { type: 'module' }),
    );
    this.listener = listener;
    this.progressListener = progressListener;
  }

  /** Schedules a rebuild for the given parameters after a short debounce. */
  requestBuild(job: Job): void {
    this.pendingJob = job;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.launchIfIdle();
    }, DEBOUNCE_MS);
  }

  registerFont(family: string, buffer: ArrayBuffer): Promise<void> {
    return this.api.registerFont(family, transfer(buffer, [buffer]));
  }

  exportStl(job: Job): Promise<ArrayBuffer> {
    return this.api.exportStl(job);
  }

  exportThreeMf(job: Job): Promise<Uint8Array> {
    return this.api.exportThreeMf(job);
  }

  exportStep(job: Job): Promise<ArrayBuffer> {
    return this.api.exportStep(job);
  }

  exportPartStls(job: Job): Promise<PartsDownload> {
    return this.api.exportPartStls(job);
  }

  exportThreeMfExploded(job: Job): Promise<Uint8Array> {
    return this.api.exportThreeMfExploded(job);
  }

  private launchIfIdle(): void {
    if (this.inFlight || this.pendingJob === null) {
      return;
    }
    const job = this.pendingJob;
    this.pendingJob = null;
    this.inFlight = true;
    const requestId = ++this.latestRequestId;
    const onProgress = proxy((progress: BuildProgress) => {
      if (requestId === this.latestRequestId) {
        this.progressListener(progress);
      }
    });
    this.api
      .build(job, onProgress)
      .then((result) => {
        if (requestId === this.latestRequestId) {
          this.listener(result, null);
        }
      })
      .catch((error: unknown) => {
        if (requestId === this.latestRequestId) {
          this.listener(null, error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        this.inFlight = false;
        this.launchIfIdle();
      });
  }
}
