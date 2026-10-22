import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

export type ApplicationProfileSample = {
  readonly phase: "mount" | "update" | "nested-update";
  readonly actualDuration: number;
  readonly baseDuration: number;
  readonly startTime: number;
  readonly commitTime: number;
};

export type ApplicationProfileReport = {
  readonly commits: number;
  readonly totalDuration: number;
  readonly maxDuration: number;
  readonly samples: readonly ApplicationProfileSample[];
};

declare global {
  interface Window {
    __EPHD_PROFILE__?: ApplicationProfileReport;
  }
}

const sampleLimit = 500;

export function profilingRequested(location: Pick<Location, "search"> = window.location): boolean {
  return new URLSearchParams(location.search).get("profile") === "1";
}

export function ApplicationProfiler({ children }: { readonly children: ReactNode }) {
  if (!profilingRequested()) return children;
  const onRender: ProfilerOnRenderCallback = (
    _id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    const current = window.__EPHD_PROFILE__ ?? {
      commits: 0,
      totalDuration: 0,
      maxDuration: 0,
      samples: [],
    };
    const sample: ApplicationProfileSample = {
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    };
    window.__EPHD_PROFILE__ = {
      commits: current.commits + 1,
      totalDuration: current.totalDuration + actualDuration,
      maxDuration: Math.max(current.maxDuration, actualDuration),
      samples: [...current.samples.slice(-(sampleLimit - 1)), sample],
    };
  };
  return (
    <Profiler id="application" onRender={onRender}>
      {children}
    </Profiler>
  );
}
