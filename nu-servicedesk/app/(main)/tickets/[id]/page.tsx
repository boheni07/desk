'use client';

// Design Ref: §10 -- Ticket detail page (Module 8+9C: comments, attachments, history, extend/complete)
// Plan SC: FR-10~22, SC-08 RBAC

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import {
  BsArrowLeft, BsPersonPlus, BsXCircle, BsStarFill, BsStar,
  BsClockHistory, BsCheckCircle, BsXCircleFill, BsArrowRepeat,
  BsShieldLock, BsPaperclip, BsFileImage, BsDownload,
} from 'react-icons/bs';
import CommentList from '@/components/tickets/comment-list';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriorityBadge } from '@/components/ui/priority-badge';
import {
  TICKET_STATUS_LABELS as STATUS_LABELS,
  TICKET_STATUS_COLORS as STATUS_COLORS,
  TICKET_PRIORITY_LABELS as PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS as PRIORITY_COLORS,
} from '@/lib/ticket-constants';
import type { TicketStatus, TicketPriority } from '@prisma/client';

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const APPROVAL_LABELS: Record<string, string> = {
  PENDING: '대기', APPROVED: '승인', REJECTED: '반려',
};

const APPROVAL_COLORS: Record<string, string> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger',
};

const ADMIN_EDIT_FIELD_LABELS: Record<string, string> = {
  TITLE: '제목', CONTENT: '내용', CATEGORY: '카테고리', PRIORITY: '우선순위',
  ASSIGNEE: '담당자', STATUS: '상태', DEADLINE: '처리기한',
};

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface TicketDetail {
  id: string;
  ticketNumber: string;
  title: string;
  content: string;
  status: string;
  priority: string;
  desiredDate: string;
  deadline: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
    company: { id: string; name: string };
  };
  category: { id: string; name: string };
  registeredBy: { id: string; name: string; type: string };
  customerUser: { id: string; name: string } | null;
  assignments: { id: string; user: { id: string; name: string; type: string } }[];
  statusHistory: {
    id: string;
    previousStatus: string;
    newStatus: string;
    actor: { id: string; name: string } | null;
    actorType: string;
    reason: string | null;
    createdAt: string;
  }[];
  comments: {
    id: string;
    content: string;
    type: string;
    author: { id: string; name: string; type: string };
    createdAt: string;
  }[];
  attachments: { id: string; fileName: string; fileSize: number; mimeType: string; uploaderId: string | null; uploader?: { id: string; name: string } | null; uploadedAt: string }[];
  extendRequests: {
    id: string;
    newDeadline: string;
    reason: string;
    status: string;
    autoApproved: boolean;
    requester: { name: string };
    approver: { name: string } | null;
    createdAt: string;
  }[];
  completeRequests: {
    id: string;
    attemptNumber: number;
    content: string;
    status: string;
    autoApproved: boolean;
    requester: { name: string };
    approver: { name: string } | null;
    rejectReason: string | null;
    createdAt: string;
  }[];
  satisfactionRating: {
    id: string;
    rating: number | null;
    comment: string | null;
    user: { name: string } | null;
  } | null;
  adminEdits?: {
    id: string;
    fieldName: string;
    previousValue: string | null;
    newValue: string | null;
    reason: string | null;
    admin: { name: string };
    createdAt: string;
  }[];
}

interface SessionData {
  userId: string;
  type: string;
}

// ─────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError] = useState('');

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [supportUsers, setSupportUsers] = useState<{ id: string; name: string }[]>([]);

  // Rate modal
  const [showRateModal, setShowRateModal] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  // Extend approve/reject
  const [extendActionId, setExtendActionId] = useState<string | null>(null);
  const [extendRejectReason, setExtendRejectReason] = useState('');
  const [showExtendRejectModal, setShowExtendRejectModal] = useState(false);

  // Complete approve/reject (고객이 완료 승인/반려)
  const [completeActionId, setCompleteActionId] = useState<string | null>(null);
  const [completeRejectReason, setCompleteRejectReason] = useState('');
  const [showCompleteRejectModal, setShowCompleteRejectModal] = useState(false);

  // Complete request (지원담당자가 완료 요청)
  const [showCompleteRequestModal, setShowCompleteRequestModal] = useState(false);
  const [completeRequestContent, setCompleteRequestContent] = useState('');

  // Extend request (지원담당자가 연기 요청)
  const [showExtendRequestModal, setShowExtendRequestModal] = useState(false);
  const [extendRequestDays, setExtendRequestDays] = useState(5);
  const [extendRequestReason, setExtendRequestReason] = useState('');

  const fetchTicket = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      const json = await res.json();
      if (json.success) {
        setTicket(json.data);
      } else {
        setError(json.error?.message || '티켓을 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) {
        setSession({ userId: json.data.id, type: json.data.type });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSession();
    fetchTicket();
  }, [fetchSession, fetchTicket]);

  // ── Action handlers ──

  const handleReceive = async () => {
    setActionLoading('receive');
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/receive`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        fetchTicket();
      } else {
        setActionError(json.error?.message || '접수에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  const handleConfirm = async () => {
    setActionLoading('confirm');
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/confirm`, { method: 'POST' });
      if (res.status === 204) {
        fetchTicket();
        return;
      }
      const json = await res.json();
      if (json.success) {
        fetchTicket();
      } else {
        setActionError(json.error?.message || '처리 시작에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setActionLoading('cancel');
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCancelModal(false);
        setCancelReason('');
        fetchTicket();
      } else {
        setActionError(json.error?.message || '취소에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  const handleAssign = async () => {
    if (!assignUserId) return;
    setActionLoading('assign');
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: assignUserId }),
      });
      const json = await res.json();
      if (json.success) {
        setShowAssignModal(false);
        setAssignUserId('');
        fetchTicket();
      } else {
        setActionError(json.error?.message || '배정에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  const handleRate = async () => {
    if (ratingValue < 1) return;
    setActionLoading('rate');
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: ratingValue, comment: ratingComment || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setShowRateModal(false);
        fetchTicket();
      } else {
        setActionError(json.error?.message || '평가에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  const openAssignModal = async () => {
    try {
      const res = await fetch('/api/users?limit=100&type=support');
      const json = await res.json();
      if (json.success) {
        setSupportUsers(json.data.users.filter((u: any) => u.isActive).map((u: any) => ({ id: u.id, name: u.name })));
      }
    } catch { /* ignore */ }
    setShowAssignModal(true);
  };

  // Extend request approve/reject
  const handleExtendApprove = async (extendId: string) => {
    setActionLoading(`extend-approve-${extendId}`);
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/extend/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extendRequestId: extendId }),
      });
      const json = await res.json();
      if (json.success) {
        fetchTicket();
      } else {
        setActionError(json.error?.message || '연기 승인에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  const handleExtendReject = async () => {
    if (!extendActionId) return;
    setActionLoading(`extend-reject-${extendActionId}`);
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/extend/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extendRequestId: extendActionId, reason: extendRejectReason }),
      });
      const json = await res.json();
      if (json.success) {
        setShowExtendRejectModal(false);
        setExtendActionId(null);
        setExtendRejectReason('');
        fetchTicket();
      } else {
        setActionError(json.error?.message || '연기 반려에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  // Submit complete request (지원담당자)
  const handleRequestComplete = async () => {
    setActionLoading('request-complete');
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: completeRequestContent.trim() || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCompleteRequestModal(false);
        setCompleteRequestContent('');
        fetchTicket();
      } else {
        setActionError(json.error?.message || '완료요청에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  // Submit extend request (지원담당자)
  const handleRequestExtend = async () => {
    setActionLoading('request-extend');
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedDays: extendRequestDays, reason: extendRequestReason }),
      });
      const json = await res.json();
      if (json.success) {
        setShowExtendRequestModal(false);
        setExtendRequestDays(5);
        setExtendRequestReason('');
        fetchTicket();
      } else {
        setActionError(json.error?.message || '연기요청에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  // Complete request approve/reject (고객)
  const handleCompleteApprove = async (completeId: string) => {
    setActionLoading(`complete-approve-${completeId}`);
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/complete/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completeRequestId: completeId }),
      });
      const json = await res.json();
      if (json.success) {
        fetchTicket();
      } else {
        setActionError(json.error?.message || '완료 승인에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  const handleCompleteReject = async () => {
    if (!completeActionId || !completeRejectReason.trim()) return;
    setActionLoading(`complete-reject-${completeActionId}`);
    setActionError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/complete/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completeRequestId: completeActionId, reason: completeRejectReason }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCompleteRejectModal(false);
        setCompleteActionId(null);
        setCompleteRejectReason('');
        fetchTicket();
      } else {
        setActionError(json.error?.message || '완료 반려에 실패했습니다.');
      }
    } catch {
      setActionError('서버에 연결할 수 없습니다.');
    } finally {
      setActionLoading('');
    }
  };

  // ── Render ──

  if (loading) {
    return (
      <Container fluid className="text-center py-5">
        <Spinner animation="border" variant="primary" style={{ width: '1.5rem', height: '1.5rem' }} />
        <div className="mt-2 text-muted small">불러오는 중...</div>
      </Container>
    );
  }

  if (error || !ticket) {
    return (
      <Container fluid>
        <Alert variant="danger" className="mt-3">{error || '티켓을 찾을 수 없습니다.'}</Alert>
        <Button variant="outline-secondary" size="sm" onClick={() => router.push('/tickets')}>
          <BsArrowLeft size={14} className="me-1" />목록으로
        </Button>
      </Container>
    );
  }

  const formatDateTime = (dt: string) => new Date(dt).toLocaleString('ko-KR');
  const formatDate = (dt: string) => new Date(dt).toLocaleDateString('ko-KR');

  const isSupport = session?.type === 'support';
  const isAdmin = session?.type === 'admin';
  const isCustomer = session?.type === 'customer';
  const isStaff = isSupport || isAdmin;

  // Check if user can approve/reject extend/complete (customer who is the registrant, or admin)
  const canApproveExtend = isCustomer || isAdmin;
  const canApproveComplete = isCustomer || isAdmin;

  return (
    <Container fluid>
      {/* Page Header */}
      <div className="page-header">
        <div className="d-flex align-items-start gap-2 flex-wrap">
          <Button
            variant="outline-secondary"
            size="sm"
            className="btn-icon flex-shrink-0"
            onClick={() => router.push('/tickets')}
            title="목록으로"
            style={{ marginTop: 2 }}
          >
            <BsArrowLeft size={14} />
          </Button>
          <div>
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <span className="ticket-number">{ticket.ticketNumber}</span>
              <StatusBadge status={ticket.status as TicketStatus} />
              <PriorityBadge priority={ticket.priority as TicketPriority} />
            </div>
            <h1 className="page-header-title mb-0" style={{ fontSize: '1.125rem', fontWeight: 700 }}>{ticket.title}</h1>
          </div>
        </div>
      </div>

      {actionError && <Alert variant="danger" dismissible onClose={() => setActionError('')}>{actionError}</Alert>}

      <Row>
        {/* Left Column: Content + Attachments + Comments */}
        <Col lg={8}>
          {/* Content + Attachments inline */}
          <div className="detail-section">
            <div className="detail-section-header">
              <span className="detail-section-title">내용</span>
            </div>
            <div className="detail-section-body">
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>{ticket.content}</div>

              {/* 첨부파일: 내용 바로 아래 인라인 표시 */}
              {ticket.attachments && ticket.attachments.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="d-flex align-items-center gap-1 mb-2">
                    <BsPaperclip style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>첨부파일 {ticket.attachments.length}건</span>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {ticket.attachments.map((a: { id: string; fileName: string; fileSize: number; mimeType: string; uploader?: { name: string } | null }) => (
                      <button
                        key={a.id}
                        type="button"
                        className="d-flex align-items-center gap-2"
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #dee2e6',
                          background: '#f8f9fa',
                          color: '#495057',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          transition: 'background 100ms ease',
                        }}
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/attachments/${a.id}`);
                            const json = await res.json();
                            if (json.success) window.open(json.data.downloadUrl, '_blank');
                          } catch { /* ignore */ }
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#e9ecef'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8f9fa'; }}
                      >
                        {a.mimeType?.startsWith('image/') ? <BsFileImage style={{ color: '#2F9E44', flexShrink: 0 }} /> : <BsPaperclip style={{ color: '#868e96', flexShrink: 0 }} />}
                        <span className="text-truncate" style={{ maxWidth: 180 }}>{a.fileName}</span>
                        <span style={{ fontSize: '0.68rem', color: '#adb5bd' }}>{a.fileSize < 1024 * 1024 ? `${(a.fileSize / 1024).toFixed(0)}KB` : `${(a.fileSize / 1024 / 1024).toFixed(1)}MB`}</span>
                        <BsDownload style={{ fontSize: '0.7rem', color: '#868e96', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Comments (Module 8) */}
          {session && (
            <CommentList
              ticketId={ticketId}
              currentUserId={session.userId}
              currentUserRole={session.type}
            />
          )}
        </Col>

        {/* Right Column: Meta, Actions, History, Extend, Complete, Admin Edits */}
        <Col lg={4}>
          {/* Meta Info */}
          <div className="detail-section mb-3">
            <div className="detail-section-header">
              <span className="detail-section-title">상세 정보</span>
            </div>
            <div className="detail-section-body p-0">
              {([
                { label: '회사', value: ticket.project.company.name },
                { label: '프로젝트', value: ticket.project.name },
                { label: '카테고리', value: ticket.category.name },
                { label: '등록자', value: ticket.registeredBy.name },
                { label: '담당자', value: ticket.assignments.length > 0 ? ticket.assignments.map((a) => a.user.name).join(', ') : '-' },
                { label: '처리희망일', value: ticket.desiredDate ? formatDate(ticket.desiredDate) : '-' },
                ...(ticket.deadline ? [{ label: '처리기한', value: formatDateTime(ticket.deadline), danger: true }] : []),
                ...(ticket.receivedAt ? [{ label: '접수일시', value: formatDateTime(ticket.receivedAt) }] : []),
                { label: '등록일시', value: formatDateTime(ticket.createdAt) },
              ] as { label: string; value: string; danger?: boolean }[]).map(({ label, value, danger }, i, arr) => (
                <div
                  key={label}
                  className="d-flex justify-content-between align-items-start px-3 py-2"
                  style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : undefined, fontSize: '0.875rem' }}
                >
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.8rem', flexShrink: 0, marginRight: '0.75rem' }}>{label}</span>
                  <span style={{ color: danger ? 'var(--bs-danger)' : 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 작업 + 상태 이력 통합 섹션 ── */}
          <div className="detail-section mb-3">
            <div className="detail-section-header">
              <span className="detail-section-title"><BsClockHistory className="me-1" size={13} />작업 · 상태 이력</span>
              <StatusBadge status={ticket.status as TicketStatus} size="sm" />
            </div>
            <div className="detail-section-body">
              {/* ── 현재 상태에서 가능한 작업 버튼 ── */}
              {(() => {
                const actions: { key: string; label: string; icon: React.ReactNode; variant: string; onClick: () => void; show: boolean }[] = [
                  // 접수 (REGISTERED → RECEIVED)
                  { key: 'receive', label: '접수', icon: null, variant: 'primary',
                    onClick: handleReceive,
                    show: isStaff && ticket.status === 'REGISTERED' },
                  // 처리 시작 (RECEIVED/DELAYED → IN_PROGRESS)
                  { key: 'confirm', label: '처리 시작', icon: null, variant: 'success',
                    onClick: handleConfirm,
                    show: isStaff && (ticket.status === 'RECEIVED' || ticket.status === 'DELAYED') },
                  // 연기 요청 (IN_PROGRESS/DELAYED → EXTEND_REQUESTED)
                  { key: 'extend', label: '연기 요청', icon: null, variant: 'outline-warning',
                    onClick: () => setShowExtendRequestModal(true),
                    show: isSupport && (ticket.status === 'IN_PROGRESS' || ticket.status === 'DELAYED') },
                  // 완료 요청 (IN_PROGRESS/DELAYED → COMPLETE_REQUESTED)
                  { key: 'complete', label: '완료 요청', icon: null, variant: 'outline-primary',
                    onClick: () => setShowCompleteRequestModal(true),
                    show: isStaff && (ticket.status === 'IN_PROGRESS' || ticket.status === 'DELAYED') },
                  // 담당자 배정
                  { key: 'assign', label: '담당자 배정', icon: <BsPersonPlus className="me-1" size={13} />, variant: 'outline-secondary',
                    onClick: openAssignModal,
                    show: isAdmin && !['CLOSED', 'CANCELLED'].includes(ticket.status) },
                  // 취소
                  { key: 'cancel', label: '취소', icon: <BsXCircle className="me-1" size={13} />, variant: 'outline-danger',
                    onClick: () => setShowCancelModal(true),
                    show: isAdmin && ['REGISTERED', 'RECEIVED', 'IN_PROGRESS', 'DELAYED', 'EXTEND_REQUESTED'].includes(ticket.status) },
                  // 만족도 평가
                  { key: 'rate', label: '만족도 평가', icon: <BsStarFill className="me-1" size={13} />, variant: 'warning',
                    onClick: () => setShowRateModal(true),
                    show: isCustomer && ticket.status === 'SATISFACTION_PENDING' && !ticket.satisfactionRating?.rating },
                ];

                const visibleActions = actions.filter(a => a.show);

                if (visibleActions.length === 0 && !['CLOSED', 'CANCELLED'].includes(ticket.status) && !ticket.satisfactionRating?.rating) {
                  return null; // 연기/완료 승인 등은 아래 섹션에서 별도 처리
                }

                return (
                  <>
                    {visibleActions.length > 0 && (
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        {visibleActions.map((a) => (
                          <Button
                            key={a.key}
                            variant={a.variant}
                            size="sm"
                            onClick={a.onClick}
                            disabled={!!actionLoading}
                          >
                            {actionLoading === a.key
                              ? <Spinner size="sm" animation="border" />
                              : <>{a.icon}{a.label}</>}
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* 만족도 표시 */}
                    {ticket.satisfactionRating?.rating !== null && ticket.satisfactionRating?.rating !== undefined && (
                      <div className="d-flex align-items-center gap-2 mb-3 px-2 py-2 rounded-2" style={{ background: 'rgba(255,193,7,0.08)' }}>
                        <div>
                          {[1, 2, 3, 4, 5].map((star) => (
                            star <= (ticket.satisfactionRating?.rating ?? 0)
                              ? <BsStarFill key={star} className="text-warning" size={14} />
                              : <BsStar key={star} className="text-muted" size={14} />
                          ))}
                        </div>
                        <small className="text-muted">
                          {ticket.satisfactionRating?.rating}점
                          {ticket.satisfactionRating?.comment && ` — ${ticket.satisfactionRating.comment}`}
                        </small>
                      </div>
                    )}

                    {ticket.status === 'CLOSED' && !ticket.satisfactionRating?.rating && (
                      <div className="text-muted small mb-3 px-2">종료됨 (자동종료)</div>
                    )}
                    {ticket.status === 'CANCELLED' && (
                      <div className="text-muted small mb-3 px-2">취소됨</div>
                    )}
                  </>
                );
              })()}

              {/* ── 상태 이력 타임라인 ── */}
              {ticket.statusHistory.length === 0 ? (
                <p className="text-muted text-center py-2 mb-0 small">상태 이력이 없습니다.</p>
              ) : (
                <div className="position-relative ps-4 pe-2" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                  {/* Vertical timeline line */}
                  <div
                    className="position-absolute"
                    style={{ left: '1.5rem', top: '0.75rem', bottom: '0', width: '2px', background: 'var(--border-subtle)' }}
                  />
                  {ticket.statusHistory.map((h, idx) => (
                    <div key={h.id} className={`d-flex gap-2 ${idx > 0 ? 'mt-2' : ''}`}>
                      {/* Timeline dot */}
                      <div className="position-relative flex-shrink-0" style={{ width: 0 }}>
                        <div
                          className={`position-absolute rounded-circle bg-${STATUS_COLORS[h.newStatus as TicketStatus] || 'secondary'}`}
                          style={{
                            left: '-0.85rem',
                            top: '0.15rem',
                            width: '10px',
                            height: '10px',
                            border: '2px solid white',
                          }}
                        />
                      </div>
                      <div className="flex-grow-1 ms-2">
                        <div className="d-flex align-items-center gap-1">
                          <span className={`badge bg-${STATUS_COLORS[h.previousStatus as TicketStatus] || 'secondary'}`} style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                            {STATUS_LABELS[h.previousStatus as TicketStatus] || h.previousStatus}
                          </span>
                          <span className="text-muted" style={{ fontSize: '0.65rem' }}>→</span>
                          <span className={`badge bg-${STATUS_COLORS[h.newStatus as TicketStatus] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                            {STATUS_LABELS[h.newStatus as TicketStatus] || h.newStatus}
                          </span>
                          <span className="text-muted" style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>
                            {formatDateTime(h.createdAt)}
                          </span>
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                          {h.actorType === 'SYSTEM' ? '시스템' : h.actor?.name || '-'}
                          {h.reason && <> — {h.reason}</>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Module 9C: Extend Requests with approve/reject ── */}
          {ticket.extendRequests.length > 0 && (
            <div className="detail-section mb-3">
              <div className="detail-section-header">
                <span className="detail-section-title"><BsArrowRepeat className="me-1" size={13} />연기요청</span>
              </div>
              <div className="detail-section-body p-0">
                {ticket.extendRequests.map((er, idx, arr) => (
                  <div
                    key={er.id}
                    className="px-3 py-2"
                    style={{ borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : undefined }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-medium small">{er.requester.name}</span>
                      <span className={`badge bg-${APPROVAL_COLORS[er.status] || 'secondary'}`} style={{ fontSize: '0.72rem' }}>
                        {APPROVAL_LABELS[er.status] || er.status}
                        {er.autoApproved && ' (자동)'}
                      </span>
                    </div>
                    <div className="small text-muted mt-1">희망기한: {formatDate(er.newDeadline)}</div>
                    <div className="small mt-1">{er.reason}</div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                      {formatDateTime(er.createdAt)}
                      {er.approver && <> &middot; 처리: {er.approver.name}</>}
                    </div>
                    {er.status === 'PENDING' && canApproveExtend && (
                      <div className="d-flex gap-2 mt-2">
                        <Button size="sm" variant="success" onClick={() => handleExtendApprove(er.id)} disabled={!!actionLoading}>
                          {actionLoading === `extend-approve-${er.id}` ? <Spinner size="sm" animation="border" /> : <><BsCheckCircle className="me-1" />승인</>}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => { setExtendActionId(er.id); setShowExtendRejectModal(true); }} disabled={!!actionLoading}>
                          <BsXCircleFill className="me-1" />반려
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Module 9C: Complete Requests with approve/reject ── */}
          {ticket.completeRequests.length > 0 && (
            <div className="detail-section mb-3">
              <div className="detail-section-header">
                <span className="detail-section-title"><BsCheckCircle className="me-1" size={13} />완료요청</span>
              </div>
              <div className="detail-section-body p-0">
                {ticket.completeRequests.map((cr, idx, arr) => (
                  <div
                    key={cr.id}
                    className="px-3 py-2"
                    style={{ borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : undefined }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-medium small">{cr.attemptNumber}차 — {cr.requester.name}</span>
                      <span className={`badge bg-${APPROVAL_COLORS[cr.status] || 'secondary'}`} style={{ fontSize: '0.72rem' }}>
                        {APPROVAL_LABELS[cr.status] || cr.status}
                        {cr.autoApproved && ' (자동)'}
                      </span>
                    </div>
                    <div className="small mt-1">{cr.content}</div>
                    {cr.rejectReason && (
                      <div className="small text-danger mt-1">반려 사유: {cr.rejectReason}</div>
                    )}
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                      {formatDateTime(cr.createdAt)}
                      {cr.approver && <> &middot; 처리: {cr.approver.name}</>}
                    </div>
                    {cr.status === 'PENDING' && canApproveComplete && (
                      <div className="d-flex gap-2 mt-2">
                        <Button size="sm" variant="success" onClick={() => handleCompleteApprove(cr.id)} disabled={!!actionLoading}>
                          {actionLoading === `complete-approve-${cr.id}` ? <Spinner size="sm" animation="border" /> : <><BsCheckCircle className="me-1" />승인</>}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => { setCompleteActionId(cr.id); setShowCompleteRejectModal(true); }} disabled={!!actionLoading}>
                          <BsXCircleFill className="me-1" />반려
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Module 9C: Admin Edit Log (admin only) ── */}
          {isAdmin && ticket.adminEdits && ticket.adminEdits.length > 0 && (
            <div className="detail-section mb-3">
              <div className="detail-section-header">
                <span className="detail-section-title"><BsShieldLock className="me-1" size={13} />관리자 수정 이력</span>
              </div>
              <div className="detail-section-body p-0">
                {ticket.adminEdits.map((edit, idx, arr) => (
                  <div
                    key={edit.id}
                    className="px-3 py-2 small"
                    style={{ borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : undefined }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
                        {ADMIN_EDIT_FIELD_LABELS[edit.fieldName] || edit.fieldName}
                      </span>
                      <span className="text-muted" style={{ fontSize: '0.7rem' }}>{formatDateTime(edit.createdAt)}</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-muted text-decoration-line-through">{edit.previousValue || '(없음)'}</span>
                      {' → '}
                      <span className="fw-medium">{edit.newValue || '(없음)'}</span>
                    </div>
                    {edit.reason && <div className="text-muted mt-1">사유: {edit.reason}</div>}
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>수정자: {edit.admin.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Col>
      </Row>

      {/* Cancel Modal */}
      <Modal show={showCancelModal} onHide={() => { setShowCancelModal(false); setCancelReason(''); }} centered>
        <Modal.Header closeButton>
          <Modal.Title>티켓 취소</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>이 티켓을 취소하시겠습니까? 취소한 뒤에는 되돌릴 수 없습니다.</p>
          <Form.Group>
            <Form.Label>취소 사유 <span className="text-danger">*</span></Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="취소 사유를 입력해 주세요"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowCancelModal(false); setCancelReason(''); }}>닫기</Button>
          <Button
            variant="danger"
            onClick={handleCancel}
            disabled={!cancelReason.trim() || actionLoading === 'cancel'}
          >
            {actionLoading === 'cancel' ? <Spinner size="sm" animation="border" /> : '취소 확인'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Assign Modal */}
      <Modal show={showAssignModal} onHide={() => setShowAssignModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>담당자 배정</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>지원담당자 선택</Form.Label>
            <Form.Select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
              <option value="">선택해 주세요</option>
              {supportUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAssignModal(false)}>닫기</Button>
          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!assignUserId || actionLoading === 'assign'}
          >
            {actionLoading === 'assign' ? <Spinner size="sm" animation="border" /> : '배정'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Rate Modal */}
      <Modal show={showRateModal} onHide={() => setShowRateModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>만족도 평가</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center mb-3">
            <p className="text-muted">이 티켓의 처리에 얼마나 만족하셨나요?</p>
            <div className="d-flex justify-content-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Button
                  key={star}
                  variant="link"
                  className="p-0"
                  onClick={() => setRatingValue(star)}
                  style={{ fontSize: '2rem' }}
                >
                  {star <= ratingValue
                    ? <BsStarFill className="text-warning" />
                    : <BsStar className="text-muted" />}
                </Button>
              ))}
            </div>
            <small className="text-muted">{ratingValue > 0 ? `${ratingValue}점` : '점수를 선택해 주세요'}</small>
          </div>
          <Form.Group>
            <Form.Label>코멘트 (선택)</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="의견을 남겨 주세요 (선택)"
              maxLength={500}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRateModal(false)}>닫기</Button>
          <Button
            variant="warning"
            onClick={handleRate}
            disabled={ratingValue < 1 || actionLoading === 'rate'}
          >
            {actionLoading === 'rate' ? <Spinner size="sm" animation="border" /> : '평가 제출'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Extend Reject Modal */}
      <Modal show={showExtendRejectModal} onHide={() => { setShowExtendRejectModal(false); setExtendActionId(null); setExtendRejectReason(''); }} centered>
        <Modal.Header closeButton>
          <Modal.Title>연기요청 반려</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>반려 사유</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={extendRejectReason}
              onChange={(e) => setExtendRejectReason(e.target.value)}
              placeholder="반려 사유를 입력해 주세요"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowExtendRejectModal(false); setExtendActionId(null); }}>닫기</Button>
          <Button
            variant="danger"
            onClick={handleExtendReject}
            disabled={!!actionLoading}
          >
            {actionLoading?.startsWith('extend-reject') ? <Spinner size="sm" animation="border" /> : '반려 확인'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Complete Request Modal — 지원담당자가 완료 요청 제출 */}
      <Modal show={showCompleteRequestModal} onHide={() => setShowCompleteRequestModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>완료 요청</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">처리 완료 내용을 입력하면 고객담당자에게 승인을 요청합니다.</p>
          <Form.Group>
            <Form.Label>처리 내용 <span className="text-muted small">(선택)</span></Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={completeRequestContent}
              onChange={(e) => setCompleteRequestContent(e.target.value)}
              placeholder="처리한 내용을 간략히 입력해 주세요"
              maxLength={2000}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCompleteRequestModal(false)}>닫기</Button>
          <Button
            variant="primary"
            onClick={handleRequestComplete}
            disabled={actionLoading === 'request-complete'}
          >
            {actionLoading === 'request-complete' ? <Spinner size="sm" animation="border" /> : '완료 요청'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Extend Request Modal — 지원담당자가 연기 요청 제출 */}
      <Modal show={showExtendRequestModal} onHide={() => setShowExtendRequestModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>연기 요청</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>연기 일수 <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={30}
              value={extendRequestDays}
              onChange={(e) => setExtendRequestDays(Number(e.target.value))}
            />
            <Form.Text className="text-muted">최대 30일까지 연기 가능</Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Label>연기 사유 <span className="text-danger">*</span></Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={extendRequestReason}
              onChange={(e) => setExtendRequestReason(e.target.value)}
              placeholder="연기 사유를 입력해 주세요"
              maxLength={500}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowExtendRequestModal(false)}>닫기</Button>
          <Button
            variant="warning"
            onClick={handleRequestExtend}
            disabled={!extendRequestReason.trim() || actionLoading === 'request-extend'}
          >
            {actionLoading === 'request-extend' ? <Spinner size="sm" animation="border" /> : '연기 요청'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Complete Reject Modal */}
      <Modal show={showCompleteRejectModal} onHide={() => { setShowCompleteRejectModal(false); setCompleteActionId(null); setCompleteRejectReason(''); }} centered>
        <Modal.Header closeButton>
          <Modal.Title>완료요청 반려</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>반려 사유 <span className="text-danger">*</span></Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={completeRejectReason}
              onChange={(e) => setCompleteRejectReason(e.target.value)}
              placeholder="반려 사유를 입력해 주세요"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowCompleteRejectModal(false); setCompleteActionId(null); }}>닫기</Button>
          <Button
            variant="danger"
            onClick={handleCompleteReject}
            disabled={!completeRejectReason.trim() || !!actionLoading}
          >
            {actionLoading?.startsWith('complete-reject') ? <Spinner size="sm" animation="border" /> : '반려 확인'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
