'use client';

// Design Ref: §10 -- Loading skeleton using Bootstrap placeholder utilities
// Plan SC: UX loading states

interface SkeletonLineProps {
  width?: string;
}

/**
 * Single-line loading placeholder.
 */
export function SkeletonLine({ width = '100%' }: SkeletonLineProps) {
  return (
    <p className="placeholder-glow mb-2">
      <span className="placeholder rounded" style={{ width, display: 'inline-block' }} />
    </p>
  );
}

/**
 * Card-shaped loading placeholder.
 */
export function SkeletonCard() {
  return (
    <div className="card border-0 shadow-sm" aria-hidden="true">
      <div className="card-body">
        <h5 className="card-title placeholder-glow">
          <span className="placeholder col-6 rounded" />
        </h5>
        <p className="card-text placeholder-glow">
          <span className="placeholder col-7 rounded" />
          <span className="placeholder col-4 rounded ms-2" />
          <span className="placeholder col-4 rounded" />
        </p>
      </div>
    </div>
  );
}

interface SkeletonTableProps {
  rows: number;
  cols: number;
}

/**
 * Table-shaped loading placeholder.
 */
export function SkeletonTable({ rows, cols }: SkeletonTableProps) {
  return (
    <div className="table-responsive" aria-hidden="true">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, ci) => (
              <th key={ci} className="placeholder-glow">
                <span className="placeholder col-8 rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, ri) => (
            <tr key={ri}>
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci} className="placeholder-glow">
                  <span
                    className="placeholder rounded"
                    style={{ width: `${50 + ((ri + ci) % 4) * 12}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
