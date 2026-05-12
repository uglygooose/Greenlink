// Path: frontend/src/components/ui/Table.tsx — Phase 7 primitive.
// Finance-grade table: tabular figures on .num cells, sortable headers via
// aria-sort, row hover. Density follows the --gl-row-h token from the
// surrounding wrapper. Generic over the row type.
import type { CSSProperties, ReactNode, MouseEvent } from "react";

export type SortDirection = "ascending" | "descending" | "none";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, rowIndex: number) => ReactNode;
  numeric?: boolean;
  width?: number | string;
  sortable?: boolean;
  ariaSort?: SortDirection;
  onSort?: () => void;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  getRowKey: (row: T, index: number) => string;
  caption?: ReactNode;
  empty?: ReactNode;
  onRowClick?: (row: T, index: number, event: MouseEvent<HTMLTableRowElement>) => void;
  className?: string;
  style?: CSSProperties;
}

export function Table<T>({
  columns,
  data,
  getRowKey,
  caption,
  empty,
  onRowClick,
  className,
  style,
}: TableProps<T>): JSX.Element {
  return (
    <table className={`gl-table${className ? ` ${className}` : ""}`} style={style}>
      {caption ? <caption style={{ textAlign: "left", padding: "0 0 8px", fontSize: 12 }}>{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={col.numeric ? "num" : undefined}
              style={col.width !== undefined ? { width: col.width } : undefined}
              aria-sort={col.sortable ? col.ariaSort ?? "none" : undefined}
              onClick={col.sortable ? col.onSort : undefined}
              tabIndex={col.sortable ? 0 : undefined}
              onKeyDown={
                col.sortable && col.onSort
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        col.onSort?.();
                      }
                    }
                  : undefined
              }
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 && empty ? (
          <tr>
            <td colSpan={columns.length} style={{ padding: 28, textAlign: "center", color: "var(--gl-text-secondary)" }}>
              {empty}
            </td>
          </tr>
        ) : (
          data.map((row, idx) => (
            <tr
              key={getRowKey(row, idx)}
              onClick={onRowClick ? (event) => onRowClick(row, idx, event) : undefined}
              style={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.numeric ? "num gl-tabular" : undefined}
                  style={col.width !== undefined ? { width: col.width } : undefined}
                >
                  {col.cell(row, idx)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
