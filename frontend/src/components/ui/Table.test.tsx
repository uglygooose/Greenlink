import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Table, type TableColumn } from "./Table";

interface Row {
  id: string;
  date: string;
  amount: string;
}

const columns: TableColumn<Row>[] = [
  { key: "date", header: "Date", cell: (row) => row.date },
  { key: "amount", header: "Amount", cell: (row) => row.amount, numeric: true },
];

describe("Table", () => {
  test("renders headers and rows with gl-table class", () => {
    const data: Row[] = [
      { id: "1", date: "12 May", amount: "R 540.00" },
      { id: "2", date: "13 May", amount: "R 280.00" },
    ];
    const { container } = render(
      <Table columns={columns} data={data} getRowKey={(r) => r.id} />,
    );
    expect(container.querySelector(".gl-table")).toBeTruthy();
    expect(screen.getByText("Date")).toBeTruthy();
    expect(screen.getByText("R 540.00")).toBeTruthy();
    expect(container.querySelectorAll("tbody tr").length).toBe(2);
  });

  test("renders empty state when data is empty and empty prop provided", () => {
    render(
      <Table columns={columns} data={[]} getRowKey={(r) => r.id} empty="No transactions yet." />,
    );
    expect(screen.getByText("No transactions yet.")).toBeTruthy();
  });

  test("sortable header triggers onSort when clicked", () => {
    const onSort = vi.fn();
    const sortableCols: TableColumn<Row>[] = [
      { key: "date", header: "Date", cell: (row) => row.date, sortable: true, onSort, ariaSort: "ascending" },
    ];
    render(<Table columns={sortableCols} data={[{ id: "1", date: "12 May", amount: "0" }]} getRowKey={(r) => r.id} />);
    const header = screen.getByText("Date").closest("th");
    expect(header?.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(header!);
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  test("numeric columns receive num + gl-tabular classes", () => {
    const { container } = render(
      <Table
        columns={columns}
        data={[{ id: "1", date: "12 May", amount: "R 540.00" }]}
        getRowKey={(r) => r.id}
      />,
    );
    const amountCell = container.querySelectorAll("tbody td")[1];
    expect(amountCell.className).toContain("num");
    expect(amountCell.className).toContain("gl-tabular");
  });
});
