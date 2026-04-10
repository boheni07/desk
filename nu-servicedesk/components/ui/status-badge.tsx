'use client';

// Design Ref: §디자인 토큰 -- Status badge with SCSS custom classes
// Plan SC: FR-10 티켓 상태 표시

import type { TicketStatus } from '@prisma/client';
import { TICKET_STATUS_LABELS } from '@/lib/ticket-constants';

interface StatusBadgeProps {
  status: TicketStatus;
  size?: 'sm' | 'md';
}

const STATUS_CSS_CLASS: Record<TicketStatus, string> = {
  REGISTERED: 'badge-registered',
  RECEIVED: 'badge-received',
  IN_PROGRESS: 'badge-inprogress',
  DELAYED: 'badge-delayed',
  EXTEND_REQUESTED: 'badge-extend',
  COMPLETE_REQUESTED: 'badge-complete-req',
  SATISFACTION_PENDING: 'badge-satisfaction',
  CLOSED: 'badge-closed',
  CANCELLED: 'badge-cancelled',
};

// Design §K: 색상+텍스트+아이콘 3중 표현 (color-blind accessibility)
const STATUS_ICON: Record<TicketStatus, string> = {
  REGISTERED: '○',
  RECEIVED: '◷',
  IN_PROGRESS: '▶',
  DELAYED: '⚠',
  EXTEND_REQUESTED: '⊕',
  COMPLETE_REQUESTED: '⚑',
  SATISFACTION_PENDING: '★',
  CLOSED: '✓',
  CANCELLED: '✕',
};

/**
 * Renders a status badge using the custom SCSS status-colors classes.
 * DELAYED status includes a pulse animation.
 * Uses 3-way representation: color + icon + text (WCAG 2.1 AA, Design §K).
 */
export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const sizeStyle = size === 'sm' ? { fontSize: '0.65rem', padding: '0.2em 0.5em' } : {};
  const label = TICKET_STATUS_LABELS[status];

  return (
    <span
      className={`badge-status ${STATUS_CSS_CLASS[status]}`}
      style={sizeStyle}
      aria-label={`상태: ${label}`}
    >
      <span aria-hidden="true">{STATUS_ICON[status]} </span>
      {label}
    </span>
  );
}
