'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, Inbox } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
  value?: (row: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyTitle?: string;
  emptyHint?: string;
  loading?: boolean;
  toolbar?: React.ReactNode;
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({
  data,
  columns,
  searchable = true,
  searchPlaceholder = 'Pesquisar…',
  pageSize = 10,
  emptyTitle = 'Nenhum registro encontrado',
  emptyHint = 'Os dados cadastrados aparecerão aqui.',
  loading,
  toolbar,
  rowKey,
  rowClassName,
}: DataTableProps<T>) {
  const [search, setSearch] = React.useState('');
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [page, setPage] = React.useState(1);

  const filtered = React.useMemo(() => {
    let rows = data;
    if (search) {
      const needle = search.toLowerCase();
      rows = rows.filter((row) =>
        columns.some((column) => {
          const value = column.value?.(row) ?? '';
          return String(value ?? '').toLowerCase().includes(needle);
        }),
      );
    }
    if (sortKey) {
      const column = columns.find((item) => item.key === sortKey);
      if (column?.value) {
        rows = [...rows].sort((a, b) => {
          const va = column.value!(a);
          const vb = column.value!(b);
          const na = Number(va);
          const nb = Number(vb);
          const result =
            Number.isFinite(na) && Number.isFinite(nb) && va !== '' && vb !== ''
              ? na - nb
              : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR');
          return sortDir === 'asc' ? result : -result;
        });
      }
    }
    return rows;
  }, [columns, data, search, sortDir, sortKey]);

  React.useEffect(() => setPage(1), [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col gap-3">
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {searchable && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.className,
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-navy-700',
                        sortKey === column.key && 'text-navy-800',
                      )}
                      onClick={() => {
                        if (sortKey === column.key) {
                          setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortKey(column.key);
                          setSortDir('asc');
                        }
                      }}
                    >
                      {column.header}
                      {sortKey === column.key ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={index}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <Inbox className="h-8 w-8 text-slate-300" />
                    <p className="font-semibold text-navy-900">{emptyTitle}</p>
                    <p className="max-w-sm text-body-sm text-slate-500">{emptyHint}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow key={rowKey(row)} className={rowClassName?.(row)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.align === 'right' && 'text-right tabular',
                        column.align === 'center' && 'text-center',
                      )}
                    >
                      {column.render ? column.render(row) : (column.value?.(row) ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between px-1 text-body-sm text-slate-500">
          <span>
            {filtered.length} registro(s) — página {currentPage} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
