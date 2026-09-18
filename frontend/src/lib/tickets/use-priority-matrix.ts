import { useEffect, useState } from "react";
import {
  listPriorityMatrix,
  type PriorityMatrixCell,
} from "@/services/priority-matrix-api";

export function usePriorityMatrix() {
  const [cells, setCells] = useState<readonly PriorityMatrixCell[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listPriorityMatrix()
      .then((response) => {
        if (!cancelled) {
          setCells(response.cells);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCells(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return cells;
}
