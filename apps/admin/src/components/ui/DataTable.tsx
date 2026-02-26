import { type ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { LoadingSpinner } from './LoadingSpinner';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface Pagination {
  page: number;
  totalPages: number;
  total?: number;
  perPage?: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  pagination?: Pagination;
  onPageChange?: (page: number) => void;
  sortKey?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  loading?: boolean;
  emptyIcon?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  selectedKey?: unknown;
}

export function DataTable<T>({
  columns, data, keyField, pagination, onPageChange, sortKey, sortOrder, onSort, loading, emptyIcon, emptyMessage = 'No data found', onRowClick, selectedKey,
}: DataTableProps<T>) {
  if (loading) {
    return <LoadingSpinner fullPage />;
  }

  if (data.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyMessage} />;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-medium text-gray-500 ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''} ${col.className || ''}`}
                  onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <span className="text-blue-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => {
              const key = String(row[keyField]);
              const isSelected = selectedKey !== undefined && row[keyField] === selectedKey;
              return (
                <tr
                  key={key}
                  className={`border-b border-gray-100 ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''} ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(col => (
                    <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            {pagination.total !== undefined ? `${pagination.total} total` : `Page ${pagination.page} of ${pagination.totalPages}`}
          </div>
          <div className="flex gap-1">
            <button
              className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
            >
              Previous
            </button>
            {generatePageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 py-1 text-sm text-gray-400">…</span>
              ) : (
                <button
                  key={p}
                  className={`px-3 py-1 text-sm rounded border ${
                    p === pagination.page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => onPageChange?.(p as number)}
                >
                  {p}
                </button>
              )
            )}
            <button
              className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange?.(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
