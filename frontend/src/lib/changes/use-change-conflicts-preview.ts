import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { changeExtraKeys, previewChangeConflicts } from "@/services/changes-api";
import type { ChangeConflictPreviewInput } from "@/services/changes-api";

/**
 * The conflict preview of an unsaved window, debounced by 400 ms so typing in
 * the window fields does not fire a request per keystroke (BA-changes-04/12).
 * Lifted out of the sheet (W7.76) so the sheet holds JSX instead of a timer.
 */
export function useChangeConflictsPreview(preview: ChangeConflictPreviewInput | null) {
  const key = preview === null ? "" : JSON.stringify(preview);
  const [debounced, setDebounced] = useState<ChangeConflictPreviewInput | null>(null);
  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebounced(key === "" ? null : (JSON.parse(key) as ChangeConflictPreviewInput)),
      400,
    );
    return () => window.clearTimeout(handle);
  }, [key]);
  const query = useQuery({
    queryKey: changeExtraKeys.preview(
      debounced ?? { type: "NORMAL", plannedStart: "", plannedEnd: "" },
    ),
    queryFn: () => previewChangeConflicts(debounced as ChangeConflictPreviewInput),
    enabled: debounced !== null,
    retry: false,
  });
  /** Whether the preview on screen belongs to the current window. */
  return { query, hasPreview: debounced !== null };
}
