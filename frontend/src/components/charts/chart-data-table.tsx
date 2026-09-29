import { Table2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { tableHeadClassName } from "@/components/ui/control";

export interface ChartTableColumn {
  readonly key: string;
  readonly label: string;
  readonly values: readonly (number | null)[];
  readonly format?: (value: number) => string;
}

interface ChartDataTableProperties {
  readonly caption: string;
  readonly bucketHeader?: string;
  readonly bucketLabels: readonly string[];
  readonly columns: readonly ChartTableColumn[];
}

/**
 * "Show as table" (2.8 §3.6): the same data as a real <table>, for screen
 * readers and for anyone who needs exact numbers.
 */
export function ChartDataTable({ caption, bucketHeader, bucketLabels, columns }: ChartDataTableProperties) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tableId = `chart-table-${useId().replace(/:/g, "")}`;

  return (
    <div className="mt-2 print:hidden">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-link hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((current) => !current)}
        data-testid="chart-table-toggle"
      >
        <Table2 size={12.5} aria-hidden="true" />
        {open ? t("a11y.chart.hideTable") : t("a11y.chart.showTable")}
      </button>
      {open ? (
        <div id={tableId} className="mt-2 max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">{caption}</caption>
            <thead className={tableHeadClassName}>
              <tr className="border-b border-border/70 bg-elevated/60">
                <th scope="col" className="px-3 py-1.5 font-medium">
                  {bucketHeader ?? t("a11y.chart.period")}
                </th>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="px-3 py-1.5 text-right font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bucketLabels.map((label, index) => (
                <tr key={`${label}-${index}`} className="border-b border-border/50 last:border-0">
                  <th scope="row" className="px-3 py-1.5 font-normal text-foreground">
                    {label}
                  </th>
                  {columns.map((column) => {
                    const value = column.values[index] ?? null;
                    return (
                      <td key={column.key} className="tnum px-3 py-1.5 text-right text-foreground/90">
                        {value === null ? "—" : (column.format ?? String)(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
