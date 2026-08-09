import { create } from 'zustand';
import type { Job, JobPart, JobStats } from '../generators/job.ts';
import type { RawMesh } from '../geometry/mesh.ts';
import { defaultJob, validateJob } from '../generators/job.ts';
import type { BaseParams } from '../params/types.ts';
import type { ValidationIssue } from '../params/validate.ts';
import { registerLocalFont } from '../geometry/lettering/font.ts';
import { GeometryClient } from '../worker/workerClient.ts';

export interface AppState {
  job: Job;
  issues: ValidationIssue[];
  parts: JobPart[] | null;
  stats: JobStats | null;
  overhangOverlay: RawMesh | null;
  showOverhangs: boolean;
  busy: boolean;
  buildError: string | null;
  setJob: (update: (job: Job) => Job) => void;
  replaceJob: (job: Job) => void;
  toggleOverhangs: () => void;
}

let client: GeometryClient | null = null;

function geometryClient(): GeometryClient {
  if (client === null) {
    client = new GeometryClient((result, error) => {
      if (result !== null) {
        useAppStore.setState({
          parts: result.parts,
          stats: result.stats,
          overhangOverlay: result.overhangOverlay,
          busy: false,
          buildError: null,
        });
      } else {
        useAppStore.setState({ busy: false, buildError: error });
      }
    });
  }
  return client;
}

function applyJob(job: Job): Partial<AppState> {
  const issues = validateJob(job);
  if (issues.length === 0) {
    geometryClient().requestBuild(job);
    return { job, issues, busy: true, buildError: null };
  }
  return { job, issues, busy: false };
}

export const useAppStore = create<AppState>((set, get) => ({
  job: defaultJob(),
  issues: [],
  parts: null,
  stats: null,
  overhangOverlay: null,
  showOverhangs: false,
  busy: false,
  buildError: null,
  setJob: (update) => {
    set(applyJob(update(get().job)));
  },
  replaceJob: (job) => {
    set(applyJob(job));
  },
  toggleOverhangs: () => {
    set({ showOverhangs: !get().showOverhangs });
  },
}));

/** Kicks off the initial build for the default job. */
export function bootstrapGeometry(): void {
  const { job } = useAppStore.getState();
  useAppStore.setState(applyJob(job));
}

/**
 * Convenience selectors for the base generator's panels. The base panels
 * are only mounted while the active job is a base job, so the parameter
 * accessor may assume that shape.
 */
export function useBaseParams(): BaseParams {
  return useAppStore((state) => {
    if (state.job.generator !== 'base') {
      throw new Error('The base parameter panels require an active base job.');
    }
    return state.job.params;
  });
}

export function setBaseParams(update: (params: BaseParams) => BaseParams): void {
  useAppStore.getState().setJob((job) => {
    if (job.generator !== 'base') {
      return job;
    }
    return { ...job, params: update(job.params) };
  });
}

/** Sets the chord tolerance on whatever job is active. */
export function setJobQuality(chordTolMm: number): void {
  useAppStore
    .getState()
    .setJob((job) => ({ ...job, params: { ...job.params, quality: { chordTolMm } } }) as Job);
}

export function exportStl(job: Job): Promise<ArrayBuffer> {
  return geometryClient().exportStl(job);
}

export function exportThreeMf(job: Job): Promise<Uint8Array> {
  return geometryClient().exportThreeMf(job);
}

export function exportStep(job: Job): Promise<ArrayBuffer> {
  return geometryClient().exportStep(job);
}

export function exportThreeMfExploded(job: Job): Promise<Uint8Array> {
  return geometryClient().exportThreeMfExploded(job);
}

/**
 * Registers a system font for lettering in this session: parsed on the
 * main thread for STEP export and transferred to the geometry worker for
 * mesh builds, then triggers a rebuild of the current job.
 */
export async function registerLetteringFont(family: string, buffer: ArrayBuffer): Promise<void> {
  registerLocalFont(family, buffer);
  await geometryClient().registerFont(family, buffer.slice(0));
  requestRebuild();
}

/** Rebuilds the current job, e.g. after out-of-band changes like new fonts. */
export function requestRebuild(): void {
  geometryClient().requestBuild(useAppStore.getState().job);
}
