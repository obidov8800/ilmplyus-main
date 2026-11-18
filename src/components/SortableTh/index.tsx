import type { CSSProperties, ElementType, KeyboardEvent, ReactNode } from 'react';
import type { TableSort } from '@/hooks/useTableSort';
import './SortableTh.css';

interface SortableThProps<T> {
  /** `useTableSort` accessor'laridagi kalit */
  sortKey: string;
  sort: Pick<TableSort<T>, 'activeKey' | 'direction' | 'toggle'>;
  children: ReactNode;
  className?: string;
  colSpan?: number;
  style?: CSSProperties;
  /** Mantine jadvallari uchun `Table.Th` uzatiladi; default — oddiy `th`. */
  as?: ElementType;
}

export function SortableTh<T>({
  sortKey,
  sort,
  children,
  className = '',
  colSpan,
  style,
  as: Cell = 'th',
}: SortableThProps<T>) {
  const active = sort.activeKey === sortKey;
  const icon = active ? (sort.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';

  return (
    <Cell
      scope="col"
      className={`sortable-th${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      colSpan={colSpan}
      style={style}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      tabIndex={0}
      onClick={() => sort.toggle(sortKey)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sort.toggle(sortKey);
        }
      }}
    >
      <span className="sortable-th__inner">
        {children}
        <i className={`sortable-th__icon fa-solid ${icon}`} aria-hidden="true" />
      </span>
    </Cell>
  );
}

export default SortableTh;
