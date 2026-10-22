import { Profiler, useEffect, type ProfilerOnRenderCallback, type ReactNode } from "react";

declare const __EPHD_BUILD_KIND__: "production" | "react-profiling";

export type ApplicationProfileSample = {
  readonly phase: "mount" | "update" | "nested-update";
  readonly actualDuration: number;
  readonly baseDuration: number;
  readonly startTime: number;
  readonly commitTime: number;
};

export type LongTaskSample = {
  readonly startTime: number;
  readonly duration: number;
};

export type ApplicationProfileReport = {
  readonly buildKind: "production" | "react-profiling";
  readonly commits: number;
  readonly totalDuration: number;
  readonly maxDuration: number;
  readonly samples: readonly ApplicationProfileSample[];
  readonly longTasks: readonly LongTaskSample[];
  readonly totalLongTaskDuration: number;
  readonly maxLongTaskDuration: number;
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

function emptyReport(): ApplicationProfileReport {
  return {
    buildKind: __EPHD_BUILD_KIND__,
    commits: 0,
    totalDuration: 0,
    maxDuration: 0,
    samples: [],
    longTasks: [],
    totalLongTaskDuration: 0,
    maxLongTaskDuration: 0,
  };
}

function LongTaskObserver() {
  useEffect(() => {
    window.__EPHD_PROFILE__ ??= emptyReport();
    if (!("PerformanceObserver" in window)) return;
    const supported = PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    if (!supported) return;
    const observer = new PerformanceObserver((list) => {
      const current = window.__EPHD_PROFILE__ ?? emptyReport();
      const incoming = list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration,
      }));
      window.__EPHD_PROFILE__ = {
        ...current,
        longTasks: [...current.longTasks, ...incoming].slice(-sampleLimit),
        totalLongTaskDuration:
          current.totalLongTaskDuration + incoming.reduce((sum, task) => sum + task.duration, 0),
        maxLongTaskDuration: Math.max(
          current.maxLongTaskDuration,
          ...incoming.map((task) => task.duration),
        ),
      };
    });
    observer.observe({ type: "longtask", buffered: true });
    return () => observer.disconnect();
  }, []);
  return null;
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
    const current = window.__EPHD_PROFILE__ ?? emptyReport();
    const sample: ApplicationProfileSample = {
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    };
    window.__EPHD_PROFILE__ = {
      ...current,
      commits: current.commits + 1,
      totalDuration: current.totalDuration + actualDuration,
      maxDuration: Math.max(current.maxDuration, actualDuration),
      samples: [...current.samples.slice(-(sampleLimit - 1)), sample],
    };
  };
  return (
    <Profiler id="application" onRender={onRender}>
      <LongTaskObserver />
      {children}
    </Profiler>
  );
}
