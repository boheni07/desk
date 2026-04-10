// Design Ref: §디자인 토큰 — 상태/우선순위 한국어 레이블 및 색상
// Plan SC: FR-10 티켓 관리, 한국어 UI

import type { TicketStatus, TicketPriority } from '@prisma/client';

/**
 * Ticket event names used by the state machine.
 */
export const TICKET_EVENTS = {
  RECEIVE: 'RECEIVE',
  AUTO_RECEIVE: 'AUTO_RECEIVE',
  CONFIRM: 'CONFIRM',
  DELAY_DETECT: 'DELAY_DETECT',
  REQUEST_EXTEND: 'REQUEST_EXTEND',
  APPROVE_EXTEND: 'APPROVE_EXTEND',
  REJECT_EXTEND: 'REJECT_EXTEND',
  AUTO_APPROVE_EXTEND: 'AUTO_APPROVE_EXTEND',
  REQUEST_COMPLETE: 'REQUEST_COMPLETE',
  APPROVE_COMPLETE: 'APPROVE_COMPLETE',
  REJECT_COMPLETE: 'REJECT_COMPLETE',
  AUTO_COMPLETE: 'AUTO_COMPLETE',
  RATE_SATISFACTION: 'RATE_SATISFACTION',
  AUTO_CLOSE: 'AUTO_CLOSE',
  CANCEL: 'CANCEL',
} as const;

export type TicketEvent = typeof TICKET_EVENTS[keyof typeof TICKET_EVENTS];

/**
 * Korean labels for ticket statuses.
 */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  REGISTERED: '등록',
  RECEIVED: '접수',
  IN_PROGRESS: '처리중',
  DELAYED: '지연',
  EXTEND_REQUESTED: '연기요청',
  COMPLETE_REQUESTED: '완료요청',
  SATISFACTION_PENDING: '만족도대기',
  CLOSED: '종료',
  CANCELLED: '취소',
};

/**
 * Korean labels for ticket priorities.
 */
export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  URGENT: '긴급',
  HIGH: '높음',
  NORMAL: '보통',
  LOW: '낮음',
};

/**
 * Display order for ticket statuses (active states first, terminal states last).
 */
export const TICKET_STATUS_ORDER: TicketStatus[] = [
  'REGISTERED',
  'RECEIVED',
  'IN_PROGRESS',
  'DELAYED',
  'EXTEND_REQUESTED',
  'COMPLETE_REQUESTED',
  'SATISFACTION_PENDING',
  'CLOSED',
  'CANCELLED',
];

/**
 * Bootstrap color variants for status badges.
 */
export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  REGISTERED: 'warning',
  RECEIVED: 'info',
  IN_PROGRESS: 'success',
  DELAYED: 'danger',
  EXTEND_REQUESTED: 'secondary',
  COMPLETE_REQUESTED: 'primary',
  SATISFACTION_PENDING: 'purple',
  CLOSED: 'dark',
  CANCELLED: 'secondary',
};

/**
 * Bootstrap color variants for priority badges.
 */
export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  URGENT: 'danger',
  HIGH: 'warning',
  NORMAL: 'info',
  LOW: 'secondary',
};

/**
 * Terminal statuses that cannot transition further (except admin override).
 */
export const TERMINAL_STATUSES: TicketStatus[] = ['CLOSED', 'CANCELLED'];

/**
 * Statuses that can be cancelled by admin.
 */
export const CANCELLABLE_STATUSES: TicketStatus[] = [
  'REGISTERED',
  'RECEIVED',
  'IN_PROGRESS',
  'DELAYED',
  'EXTEND_REQUESTED',
];
