// Design Ref: §10 -- Notification type icons and labels (21 types)
// Plan SC: FR-23 알림 UI 구성요소

import type { NotificationType } from '@prisma/client';

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  TICKET_CREATED: 'bi-plus-circle',
  TICKET_RECEIVED: 'bi-inbox',
  EXTEND_REQUESTED: 'bi-calendar-plus',
  EXTEND_AUTO_APPROVE_SOON: 'bi-clock-history',
  EXTEND_APPROVED: 'bi-calendar-check',
  EXTEND_REJECTED: 'bi-calendar-x',
  EXTEND_AUTO_APPROVED: 'bi-calendar2-check',
  COMPLETE_REQUESTED: 'bi-flag',
  COMPLETE_APPROVED: 'bi-check2-all',
  COMPLETE_REJECTED: 'bi-arrow-counterclockwise',
  COMPLETE_2ND_REJECTED: 'bi-alarm',
  COMPLETE_AUTO_APPROVED: 'bi-check2-all',
  COMMENT_CREATED: 'bi-chat',
  IN_PROGRESS_TRANSITION: 'bi-play-circle',
  SATISFACTION_REMINDER: 'bi-star',
  DELAYED_TRANSITION: 'bi-exclamation-triangle',
  STALE_ESCALATION: 'bi-fire',
  PROJECT_DEACTIVATED: 'bi-building-x',
  CUSTOMER_ZERO_WARNING: 'bi-person-x',
  PROXY_APPROVAL_COMPLETED: 'bi-person-check',
  BATCH_JOB_FAILED: 'bi-bug',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  TICKET_CREATED: '티켓 등록',
  TICKET_RECEIVED: '티켓 접수',
  EXTEND_REQUESTED: '연기 요청',
  EXTEND_AUTO_APPROVE_SOON: '연기 자동승인 예정',
  EXTEND_APPROVED: '연기 승인',
  EXTEND_REJECTED: '연기 반려',
  EXTEND_AUTO_APPROVED: '연기 자동승인',
  COMPLETE_REQUESTED: '완료 요청',
  COMPLETE_APPROVED: '완료 승인',
  COMPLETE_REJECTED: '완료 반려',
  COMPLETE_2ND_REJECTED: '완료 2차 반려',
  COMPLETE_AUTO_APPROVED: '완료 자동승인',
  COMMENT_CREATED: '댓글 등록',
  IN_PROGRESS_TRANSITION: '처리 진행',
  SATISFACTION_REMINDER: '만족도 평가 요청',
  DELAYED_TRANSITION: '처리 지연',
  STALE_ESCALATION: '장기체류 에스컬레이션',
  PROJECT_DEACTIVATED: '프로젝트 비활성화',
  CUSTOMER_ZERO_WARNING: '고객 미배정 경고',
  PROXY_APPROVAL_COMPLETED: '대리 승인 완료',
  BATCH_JOB_FAILED: '배치 작업 실패',
};

/** Categorize notification types for filter tabs */
export type NotificationCategory = 'all' | 'unread' | 'ticket' | 'system';

const TICKET_TYPES: Set<NotificationType> = new Set([
  'TICKET_CREATED',
  'TICKET_RECEIVED',
  'EXTEND_REQUESTED',
  'EXTEND_AUTO_APPROVE_SOON',
  'EXTEND_APPROVED',
  'EXTEND_REJECTED',
  'EXTEND_AUTO_APPROVED',
  'COMPLETE_REQUESTED',
  'COMPLETE_APPROVED',
  'COMPLETE_REJECTED',
  'COMPLETE_2ND_REJECTED',
  'COMPLETE_AUTO_APPROVED',
  'COMMENT_CREATED',
  'IN_PROGRESS_TRANSITION',
  'SATISFACTION_REMINDER',
  'DELAYED_TRANSITION',
  'STALE_ESCALATION',
]);

const SYSTEM_TYPES: Set<NotificationType> = new Set([
  'PROJECT_DEACTIVATED',
  'CUSTOMER_ZERO_WARNING',
  'PROXY_APPROVAL_COMPLETED',
  'BATCH_JOB_FAILED',
]);

export function getNotificationCategory(type: NotificationType): 'ticket' | 'system' {
  if (SYSTEM_TYPES.has(type)) return 'system';
  return 'ticket';
}
