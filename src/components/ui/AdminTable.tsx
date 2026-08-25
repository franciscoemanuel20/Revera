import type { ReactNode } from "react";

export interface AdminTableColumn {
  key: string;
  label: string;
}

export interface AdminTableProps {
  columns: AdminTableColumn[];
  rows: Array<Record<string, ReactNode>>;
  emptyMessage?: string;
}

// Genérico de propósito — serve para qualquer listagem do /admin (pedidos,
// leads de profissional, pedidos de garantia). Sem paginação nem ordenação
// ainda: isso só faz sentido depois que existir dado de verdade para medir
// se é necessário.
export function AdminTable({ columns, rows, emptyMessage = "Nenhum registro." }: AdminTableProps) {
  return (
    <table className="w-full border-collapse text-left text-sm text-ink">
      <thead>
        <tr className="border-b border-sand">
          {columns.map((column) => (
            <th key={column.key} className="px-3 py-2 font-medium text-ink/70">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-3 py-6 text-center text-ink/60">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr key={index} className="border-b border-sand/60">
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2">
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
