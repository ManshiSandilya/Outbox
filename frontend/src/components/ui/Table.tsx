import type { ReactNode } from 'react';

export type TableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
};

type TableProps<Row> = {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row, index: number) => string;
};

export function Table<Row>({ columns, rows, getRowKey }: TableProps<Row>) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200 text-left text-sm"><thead className="bg-slate-50"><tr>{columns.map((column) => <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{column.header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={getRowKey(row, index)} className="hover:bg-slate-50">{columns.map((column) => <td key={column.key} className="whitespace-nowrap px-4 py-3 text-slate-700">{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}

export function TableSkeleton({ columnCount = 4, rowCount = 4 }: { columnCount?: number; rowCount?: number }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Loading emails" role="status"><div className="space-y-4 p-4">{Array.from({ length: rowCount }, (_, row) => <div key={row} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>{Array.from({ length: columnCount }, (_, column) => <div key={column} className="h-4 animate-pulse rounded bg-slate-200" />)}</div>)}</div></div>;
}