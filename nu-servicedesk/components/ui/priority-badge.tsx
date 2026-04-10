'use client';

// Design Ref: §디자인 토큰 -- Priority badge with SCSS custom classes
// Plan SC: FR-10 우선순위 표시

import type { TicketPriority } from '@prisma/client';
import { TICKET_PRIORITY_LABELS } from '@/lib/ticket-constants';

interface PriorityBadgeProps {
  priority: TicketPriority;
}

const PRIORITY_CSS_CLASS: Record<TicketPriority, string> = {
  URGENT: 'badge-priority badge-urgent',
  HIGH: 'badge-priority badge-high',
  NORMAL: 'badge-priority badge-normal',
  LOW: 'badge-priority badge-low',
};

/**
 * Renders a priority badge using the custom SCSS priority classes.
 */
export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={PRIORITY_CSS_CLASS[priority] ?? 'badge-priority badge-normal'}
      aria-label={`우선순위: ${TICKET_PRIORITY_LABELS[priority] ?? priority}`}
    >
      {TICKET_PRIORITY_LABELS[priority] ?? priority}
    </span>
  );
}
