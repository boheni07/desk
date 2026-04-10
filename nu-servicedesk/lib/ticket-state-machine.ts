// Design Ref: §5 — State Machine Design (V2.1, 9 statuses)
// Plan SC: FR-13~14 티켓 상태 워크플로우 전 구간

import type { TicketStatus } from '@prisma/client';
import type { UserType } from '@/types/auth';
import { TICKET_EVENTS, type TicketEvent } from './ticket-constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

interface TransitionRule {
  from: TicketStatus;
  event: TicketEvent;
  to: TicketStatus;
  /** Roles allowed to trigger this event. Empty = system/batch only. */
  allowedRoles: UserType[];
  /** If true, only batch jobs can trigger (no human actor). */
  batchOnly?: boolean;
  /** Guard function for additional checks. */
  guard?: (context?: TransitionContext) => TransitionResult;
}

export interface TransitionContext {
  attemptNumber?: number;
  previousStatus?: TicketStatus;
}

// ---------------------------------------------------------------------------
// Transition Table
// ---------------------------------------------------------------------------

const transitionRules: TransitionRule[] = [
  // REGISTERED -> RECEIVED (manual receive by support/admin)
  {
    from: 'REGISTERED',
    event: TICKET_EVENTS.RECEIVE,
    to: 'RECEIVED',
    allowedRoles: ['support', 'admin'],
  },
  // REGISTERED -> RECEIVED (auto-receive by batch after 4 business hours)
  {
    from: 'REGISTERED',
    event: TICKET_EVENTS.AUTO_RECEIVE,
    to: 'RECEIVED',
    allowedRoles: [],
    batchOnly: true,
  },

  // RECEIVED -> IN_PROGRESS (support confirms and starts working)
  {
    from: 'RECEIVED',
    event: TICKET_EVENTS.CONFIRM,
    to: 'IN_PROGRESS',
    allowedRoles: ['support', 'admin'],
  },
  // RECEIVED -> DELAYED (batch detects deadline passed without confirm)
  {
    from: 'RECEIVED',
    event: TICKET_EVENTS.DELAY_DETECT,
    to: 'DELAYED',
    allowedRoles: [],
    batchOnly: true,
  },

  // IN_PROGRESS -> DELAYED (batch detects deadline exceeded)
  {
    from: 'IN_PROGRESS',
    event: TICKET_EVENTS.DELAY_DETECT,
    to: 'DELAYED',
    allowedRoles: [],
    batchOnly: true,
  },
  // IN_PROGRESS -> EXTEND_REQUESTED (support requests extension)
  {
    from: 'IN_PROGRESS',
    event: TICKET_EVENTS.REQUEST_EXTEND,
    to: 'EXTEND_REQUESTED',
    allowedRoles: ['support'],
  },
  // IN_PROGRESS -> COMPLETE_REQUESTED (support requests completion)
  {
    from: 'IN_PROGRESS',
    event: TICKET_EVENTS.REQUEST_COMPLETE,
    to: 'COMPLETE_REQUESTED',
    allowedRoles: ['support', 'admin'],
  },

  // DELAYED -> IN_PROGRESS (support confirms, resumes work)
  {
    from: 'DELAYED',
    event: TICKET_EVENTS.CONFIRM,
    to: 'IN_PROGRESS',
    allowedRoles: ['support', 'admin'],
  },
  // DELAYED -> EXTEND_REQUESTED (support requests extension while delayed)
  {
    from: 'DELAYED',
    event: TICKET_EVENTS.REQUEST_EXTEND,
    to: 'EXTEND_REQUESTED',
    allowedRoles: ['support'],
  },
  // DELAYED -> COMPLETE_REQUESTED (support requests completion while delayed)
  {
    from: 'DELAYED',
    event: TICKET_EVENTS.REQUEST_COMPLETE,
    to: 'COMPLETE_REQUESTED',
    allowedRoles: ['support', 'admin'],
  },

  // EXTEND_REQUESTED -> IN_PROGRESS (customer/admin approves extension)
  {
    from: 'EXTEND_REQUESTED',
    event: TICKET_EVENTS.APPROVE_EXTEND,
    to: 'IN_PROGRESS',
    allowedRoles: ['customer', 'admin'],
  },
  // EXTEND_REQUESTED -> IN_PROGRESS (auto-approve after 4 business hours)
  {
    from: 'EXTEND_REQUESTED',
    event: TICKET_EVENTS.AUTO_APPROVE_EXTEND,
    to: 'IN_PROGRESS',
    allowedRoles: [],
    batchOnly: true,
  },
  // EXTEND_REQUESTED -> previous status (customer/admin rejects extension)
  // Note: rejection returns to the status before EXTEND_REQUESTED.
  // In practice, the caller must provide context.previousStatus.
  {
    from: 'EXTEND_REQUESTED',
    event: TICKET_EVENTS.REJECT_EXTEND,
    to: 'IN_PROGRESS', // default; actual target depends on previousStatus
    allowedRoles: ['customer', 'admin'],
  },

  // COMPLETE_REQUESTED -> SATISFACTION_PENDING (customer/admin approves)
  {
    from: 'COMPLETE_REQUESTED',
    event: TICKET_EVENTS.APPROVE_COMPLETE,
    to: 'SATISFACTION_PENDING',
    allowedRoles: ['customer', 'admin'],
  },
  // COMPLETE_REQUESTED -> previousStatus (customer rejects, attempt <= 2)
  {
    from: 'COMPLETE_REQUESTED',
    event: TICKET_EVENTS.REJECT_COMPLETE,
    to: 'IN_PROGRESS', // default; actual target = CompleteRequest.previousStatus
    allowedRoles: ['customer', 'admin'],
    guard: (ctx) => {
      if (ctx?.attemptNumber !== undefined && ctx.attemptNumber > 2) {
        return { allowed: false, reason: '완료요청 최대 반려 횟수(2회)를 초과했습니다.' };
      }
      return { allowed: true };
    },
  },
  // COMPLETE_REQUESTED -> SATISFACTION_PENDING (auto-complete after 5 business days)
  {
    from: 'COMPLETE_REQUESTED',
    event: TICKET_EVENTS.AUTO_COMPLETE,
    to: 'SATISFACTION_PENDING',
    allowedRoles: [],
    batchOnly: true,
  },

  // SATISFACTION_PENDING -> CLOSED (customer rates)
  {
    from: 'SATISFACTION_PENDING',
    event: TICKET_EVENTS.RATE_SATISFACTION,
    to: 'CLOSED',
    allowedRoles: ['customer', 'admin'],
  },
  // SATISFACTION_PENDING -> CLOSED (auto-close after 5 business days)
  {
    from: 'SATISFACTION_PENDING',
    event: TICKET_EVENTS.AUTO_CLOSE,
    to: 'CLOSED',
    allowedRoles: [],
    batchOnly: true,
  },

  // CANCEL: multiple source states -> CANCELLED (admin only)
  ...(['REGISTERED', 'RECEIVED', 'IN_PROGRESS', 'DELAYED', 'EXTEND_REQUESTED'] as TicketStatus[]).map(
    (from): TransitionRule => ({
      from,
      event: TICKET_EVENTS.CANCEL,
      to: 'CANCELLED',
      allowedRoles: ['admin'],
    }),
  ),
];

// ---------------------------------------------------------------------------
// Lookup Indices
// ---------------------------------------------------------------------------

/** Map: "FROM|EVENT" -> TransitionRule */
const ruleIndex = new Map<string, TransitionRule>();
for (const rule of transitionRules) {
  const key = `${rule.from}|${rule.event}`;
  // First-match wins; CANCEL entries are per-state so unique keys.
  if (!ruleIndex.has(key)) {
    ruleIndex.set(key, rule);
  }
}

/** Map: TicketStatus -> TicketEvent[] (valid events from each state) */
export const VALID_TRANSITIONS: Map<TicketStatus, TicketEvent[]> = new Map();
for (const rule of transitionRules) {
  const existing = VALID_TRANSITIONS.get(rule.from) ?? [];
  if (!existing.includes(rule.event)) {
    existing.push(rule.event);
  }
  VALID_TRANSITIONS.set(rule.from, existing);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a transition is allowed for the given actor and context.
 */
export function canTransition(
  currentStatus: TicketStatus,
  event: TicketEvent,
  actorRole: UserType | 'SYSTEM',
  context?: TransitionContext,
): TransitionResult {
  const key = `${currentStatus}|${event}`;
  const rule = ruleIndex.get(key);

  if (!rule) {
    return {
      allowed: false,
      reason: `상태 '${currentStatus}'에서 이벤트 '${event}'은(는) 허용되지 않습니다.`,
    };
  }

  // Batch-only events can only be triggered by SYSTEM
  if (rule.batchOnly && actorRole !== 'SYSTEM') {
    return {
      allowed: false,
      reason: `이벤트 '${event}'은(는) 시스템(배치)만 실행할 수 있습니다.`,
    };
  }

  // Role check (SYSTEM bypasses role check)
  if (actorRole !== 'SYSTEM' && rule.allowedRoles.length > 0) {
    if (!rule.allowedRoles.includes(actorRole as UserType)) {
      return {
        allowed: false,
        reason: `역할 '${actorRole}'은(는) 이벤트 '${event}'을(를) 실행할 수 없습니다.`,
      };
    }
  }

  // Guard check
  if (rule.guard) {
    return rule.guard(context);
  }

  return { allowed: true };
}

/**
 * Get the target status for a given transition.
 * Returns null if the transition is not defined.
 */
export function getNextStatus(
  currentStatus: TicketStatus,
  event: TicketEvent,
): TicketStatus | null {
  const key = `${currentStatus}|${event}`;
  const rule = ruleIndex.get(key);
  return rule?.to ?? null;
}

/**
 * Get all events that are valid from the given status.
 */
export function getValidEvents(status: TicketStatus): TicketEvent[] {
  return VALID_TRANSITIONS.get(status) ?? [];
}

/**
 * Get events available for a specific role from the given status.
 * Filters out batch-only events and events not allowed for the role.
 */
export function getAvailableEvents(
  status: TicketStatus,
  role: UserType,
): TicketEvent[] {
  const allEvents = VALID_TRANSITIONS.get(status) ?? [];
  return allEvents.filter((event) => {
    const key = `${status}|${event}`;
    const rule = ruleIndex.get(key);
    if (!rule) return false;
    if (rule.batchOnly) return false;
    if (rule.allowedRoles.length > 0 && !rule.allowedRoles.includes(role)) return false;
    return true;
  });
}
