'use client';

// Design Ref: §10 -- Role-based Dashboard (admin / support / customer)
// Plan SC: FR-22 Dashboard, SC-08 RBAC

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import { useRouter } from 'next/navigation';
import {
  BsTicketDetailedFill,
  BsExclamationTriangleFill,
  BsClockFill,
  BsPlusCircle,
  BsArrowRight,
  BsPlayFill,
  BsArrowRepeat,
} from 'react-icons/bs';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriorityBadge } from '@/components/ui/priority-badge';
import { SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';
import OnboardingChecklist from '@/components/layout/onboarding-checklist';
import { TICKET_STATUS_LABELS } from '@/lib/ticket-constants';
import type { UserType } from '@/types/auth';
import type { TicketStatus, TicketPriority } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; code: string } | null;
  assignments: { user: { id: string; name: string } }[];
  category: { id: string; name: string } | null;
}

interface AdminData {
  stats: {
    ticketsTotal: number;
    ticketsOpen: number;
    ticketsDelayed: number;
    ticketsToday: number;
    avgResponseTimeHours: number;
  };
  byStatus: { status: TicketStatus; count: number }[];
  byPriority: { priority: TicketPriority; count: number }[];
  recentTickets: TicketRow[];
  delayedTickets: TicketRow[];
  secondRejectionTickets: {
    requestId: string;
    attemptNumber: number;
    rejectReason: string | null;
    ticket: TicketRow;
  }[];
  batchJobStatus: { queueName: string; waiting: number; active: number; failed: number }[];
}

interface SupportData {
  myTickets: { open: number; inProgress: number; delayed: number };
  assignedTickets: TicketRow[];
  recentActivity: TicketRow[];
}

interface CustomerData {
  myTickets: { open: number; completed: number; pendingRating: number };
  recentTickets: TicketRow[];
  projects: { id: string; name: string; code: string }[];
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<AdminData | SupportData | CustomerData | null>(null);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          setUserType(json.userType);
        } else {
          setError(json.error?.message ?? '데이터를 불러올 수 없습니다.');
        }
      } catch {
        setError('서버 연결에 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <Container fluid>
        <div className="page-header">
          <h1 className="page-header-title"><BsTicketDetailedFill />대시보드</h1>
        </div>
        <Row className="g-3 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <Col key={i} xs={6} lg={3}>
              <SkeletonCard />
            </Col>
          ))}
        </Row>
        <SkeletonTable rows={5} cols={5} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container fluid>
        <div className="page-header">
          <h1 className="page-header-title"><BsTicketDetailedFill />대시보드</h1>
        </div>
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <div className="page-header">
        <div>
          <h1 className="page-header-title"><BsTicketDetailedFill />대시보드</h1>
          <div className="page-header-subtitle">서비스 지원 현황 및 주요 지표</div>
        </div>
      </div>

      {userType === 'admin' && <OnboardingChecklist />}

      {userType === 'admin' && data && <AdminDashboard data={data as AdminData} />}
      {userType === 'support' && data && <SupportDashboard data={data as SupportData} />}
      {userType === 'customer' && data && <CustomerDashboard data={data as CustomerData} />}
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

const VARIANT_COLORS: Record<string, string> = {
  primary: 'var(--brand-primary)',
  success: '#2F9E44',
  danger: '#DC2626',
  warning: '#D97706',
  info: '#0EA5E9',
  secondary: 'var(--text-muted)',
};

function StatCard({
  title,
  value,
  variant,
  icon,
  suffix,
}: {
  title: string;
  value: number | string;
  variant: string;
  icon: React.ReactNode;
  suffix?: string;
}) {
  const color = VARIANT_COLORS[variant] || 'var(--brand-primary)';
  return (
    <div className="kpi-card h-100" style={{ borderLeft: `4px solid ${color}` }}>
      <div
        style={{
          width: 44, height: 44, borderRadius: 10,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: '1.25rem', flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {value}
          {suffix && <small style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginLeft: 4 }}>{suffix}</small>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket Table Row
// ---------------------------------------------------------------------------

function TicketTableRow({ ticket, showAssignee }: { ticket: TicketRow; showAssignee?: boolean }) {
  const assignee = ticket.assignments?.[0]?.user?.name ?? '—';
  const deadline = ticket.deadline ? new Date(ticket.deadline) : null;
  const now = new Date();
  const isOverdue = deadline && deadline < now;
  const isSoon = deadline && !isOverdue && (deadline.getTime() - now.getTime()) < 3 * 86400000;

  return (
    <tr>
      <td>
        <span className="ticket-number">{ticket.ticketNumber}</span>
      </td>
      <td className="text-truncate" style={{ maxWidth: 200 }}>
        <Link href={`/tickets/${ticket.id}`} className="text-decoration-none fw-semibold" style={{ color: 'var(--text-primary)' }}>
          {ticket.title}
        </Link>
      </td>
      <td><StatusBadge status={ticket.status} size="sm" /></td>
      <td><PriorityBadge priority={ticket.priority} /></td>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{ticket.project?.name ?? '—'}</td>
      {showAssignee && <td style={{ fontSize: '0.8125rem' }}>{assignee}</td>}
      <td style={{ fontSize: '0.8125rem' }}>
        {deadline
          ? <span className={isOverdue ? 'deadline-overdue' : isSoon ? 'deadline-soon' : 'deadline-normal'}>
              {deadline.toLocaleDateString('ko-KR')}
            </span>
          : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Status color map (CSS variable key → Bootstrap-compatible label for stat cards)
// ---------------------------------------------------------------------------

const STATUS_STAT_COLOR: Record<string, string> = {
  REGISTERED:         'var(--status-registered-color)',
  RECEIVED:           'var(--status-received-color)',
  IN_PROGRESS:        'var(--status-inprogress-color)',
  DELAYED:            'var(--status-delayed-color)',
  EXTEND_REQUESTED:   'var(--status-extend-color)',
  COMPLETE_REQUESTED: 'var(--status-complete-req-color)',
  SATISFACTION_PENDING: 'var(--status-satisfaction-color)',
  CLOSED:             'var(--status-closed-color)',
};

// Status display order for 8-card grid (exclude CANCELLED from stat grid)
const STATUS_GRID_ORDER: TicketStatus[] = [
  'REGISTERED', 'RECEIVED', 'IN_PROGRESS', 'DELAYED',
  'EXTEND_REQUESTED', 'COMPLETE_REQUESTED', 'SATISFACTION_PENDING', 'CLOSED',
];

// ---------------------------------------------------------------------------
// Admin Dashboard
// ---------------------------------------------------------------------------

function AdminDashboard({ data }: { data: AdminData }) {
  const { stats, byStatus, recentTickets, delayedTickets, secondRejectionTickets, batchJobStatus } = data;

  const statusCountMap = Object.fromEntries(byStatus.map((s) => [s.status, s.count]));

  return (
    <>
      {/* 8-status stat cards — matching mockup design */}
      <Row className="g-3 mb-4">
        {STATUS_GRID_ORDER.map((status) => {
          const count = statusCountMap[status] ?? 0;
          return (
            <Col key={status} xs={6} lg={3}>
              <Card
                className="border-0 shadow-sm h-100 stat-card"
                as="a"
                href={`/tickets?status=${status}`}
                style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <Card.Body className="text-center py-3">
                  <div
                    className="stat-number"
                    style={{ color: STATUS_STAT_COLOR[status] ?? 'inherit' }}
                  >
                    {count}
                  </div>
                  <div className="stat-label">{TICKET_STATUS_LABELS[status]}</div>
                </Card.Body>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Summary KPIs row */}
      <Row className="g-3 mb-4">
        <Col md={3} xs={6}>
          <StatCard title="전체 티켓" value={stats.ticketsTotal} variant="primary" icon={<BsTicketDetailedFill />} />
        </Col>
        <Col md={3} xs={6}>
          <StatCard title="오늘 등록" value={stats.ticketsToday} variant="info" icon={<BsPlusCircle />} />
        </Col>
        <Col md={3} xs={6}>
          <StatCard title="진행중 (미종료)" value={stats.ticketsOpen} variant="success" icon={<BsPlayFill />} />
        </Col>
        <Col md={3} xs={6}>
          <StatCard title="평균 접수시간 (30일)" value={stats.avgResponseTimeHours} variant="secondary" icon={<BsClockFill />} suffix="h" />
        </Col>
      </Row>

      {/* Delayed + 2nd-rejection alerts — 2-column */}
      {(delayedTickets.length > 0 || secondRejectionTickets.length > 0) && (
        <Row className="g-3 mb-4">
          {/* Delayed tickets */}
          {delayedTickets.length > 0 && (
            <Col lg={secondRejectionTickets.length > 0 ? 6 : 12}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Header className="bg-white d-flex justify-content-between align-items-center">
                  <span className="fw-semibold d-flex align-items-center gap-2">
                    <BsExclamationTriangleFill className="text-danger" />
                    지연중 티켓
                  </span>
                  <span className="badge bg-danger">{delayedTickets.length}</span>
                </Card.Header>
                <Card.Body className="p-0">
                  <div className="list-group list-group-flush">
                    {delayedTickets.slice(0, 5).map((t) => {
                      const overdueMs = t.deadline ? Date.now() - new Date(t.deadline).getTime() : 0;
                      const overdayDays = Math.floor(overdueMs / 86_400_000);
                      const overdueHours = Math.floor((overdueMs % 86_400_000) / 3_600_000);
                      const overdueLabel = overdayDays > 0
                        ? `${overdayDays}일 초과`
                        : overdueHours > 0 ? `${overdueHours}시간 초과` : '기한 초과';
                      return (
                        <Link
                          key={t.id}
                          href={`/tickets/${t.id}`}
                          className="list-group-item list-group-item-action py-3"
                          style={{ textDecoration: 'none' }}
                        >
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <StatusBadge status={t.status as TicketStatus} size="sm" />
                              {' '}
                              <PriorityBadge priority={t.priority as TicketPriority} />
                              {' '}
                              <strong style={{ fontSize: '0.875rem' }}>{t.ticketNumber}</strong>
                              <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                                {t.title}
                                {t.project && ` — ${t.project.name}`}
                              </div>
                            </div>
                            <small className="text-danger fw-semibold text-nowrap ms-2">{overdueLabel}</small>
                          </div>
                        </Link>
                      );
                    })}
                    {delayedTickets.length > 5 && (
                      <Link href="/tickets?status=DELAYED" className="list-group-item list-group-item-action text-center text-primary py-2 small">
                        +{delayedTickets.length - 5}건 더 보기
                      </Link>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          )}

          {/* 2nd rejection — admin attention needed */}
          {secondRejectionTickets.length > 0 && (
            <Col lg={delayedTickets.length > 0 ? 6 : 12}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Header className="bg-white d-flex justify-content-between align-items-center">
                  <span className="fw-semibold d-flex align-items-center gap-2">
                    <BsArrowRepeat className="text-warning" />
                    완료요청 반려 (관리자 주의)
                  </span>
                  <span className="badge bg-warning text-dark">{secondRejectionTickets.length}</span>
                </Card.Header>
                <Card.Body className="p-0">
                  <div className="list-group list-group-flush">
                    {secondRejectionTickets.slice(0, 5).map((item) => (
                      <Link
                        key={item.requestId}
                        href={`/tickets/${item.ticket.id}`}
                        className="list-group-item list-group-item-action py-3"
                        style={{ textDecoration: 'none' }}
                      >
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <StatusBadge status={item.ticket.status as TicketStatus} size="sm" />
                            {' '}
                            <strong style={{ fontSize: '0.875rem' }}>{item.ticket.ticketNumber}</strong>
                            {' '}
                            <span className="badge bg-warning text-dark" style={{ fontSize: '0.65rem' }}>
                              {item.attemptNumber}회차 반려
                            </span>
                            <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                              {item.ticket.title}
                            </div>
                            {item.rejectReason && (
                              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                반려사유: &quot;{item.rejectReason}&quot;
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          )}
        </Row>
      )}

      {/* Recent tickets */}
      <div className="table-card mb-4">
        <div className="d-flex justify-content-between align-items-center px-1 mb-2" style={{ padding: '0.75rem 1.25rem 0' }}>
          <span className="fw-semibold" style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>최근 등록 티켓</span>
          <Link href="/tickets" className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" style={{ fontSize: '0.8125rem' }}>
            전체 보기 <BsArrowRight size={12} />
          </Link>
        </div>
        <div className="table-responsive">
          <table className="itsm-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>번호</th>
                <th>제목</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>프로젝트</th>
                <th>담당자</th>
                <th>처리기한</th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">등록된 티켓이 없습니다.</td></tr>
              ) : (
                recentTickets.map((t) => <TicketTableRow key={t.id} ticket={t} showAssignee />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch job status */}
      {batchJobStatus.length > 0 && (
        <div className="table-card mb-4" style={{ padding: '1rem 1.25rem' }}>
          <div className="fw-semibold mb-2" style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>배치 작업 현황</div>
          <div className="d-flex flex-wrap gap-3">
            {batchJobStatus.map((q) => (
              <div key={q.queueName} className="d-flex align-items-center gap-2">
                <span style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{q.queueName}</span>
                <span className="badge bg-warning text-dark">대기 {q.waiting}</span>
                <span className="badge bg-primary">실행중 {q.active}</span>
                <span className={`badge ${q.failed > 0 ? 'bg-danger' : 'bg-secondary'}`}>실패 {q.failed}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Support Dashboard
// ---------------------------------------------------------------------------

function SupportDashboard({ data }: { data: SupportData }) {
  const { myTickets, assignedTickets, recentActivity } = data;
  const router = useRouter();

  function handleStartProgress(ticketId: string) {
    router.push(`/tickets/${ticketId}`);
  }

  return (
    <>
      {/* My stats */}
      <Row className="g-3 mb-4">
        <Col xs={6} md={4}>
          <StatCard
            title="담당 티켓"
            value={myTickets.open + myTickets.inProgress + myTickets.delayed}
            variant="primary"
            icon={<BsTicketDetailedFill />}
          />
        </Col>
        <Col xs={6} md={4}>
          <StatCard
            title="처리중"
            value={myTickets.inProgress}
            variant="success"
            icon={<BsPlayFill />}
          />
        </Col>
        <Col xs={12} md={4}>
          <StatCard
            title="지연"
            value={myTickets.delayed}
            variant="danger"
            icon={<BsExclamationTriangleFill />}
          />
        </Col>
      </Row>

      {/* Assigned tickets */}
      <div className="table-card mb-4">
        <div className="fw-semibold px-1 mb-2" style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', padding: '0.75rem 1.25rem 0' }}>내 담당 티켓</div>
        <div className="table-responsive">
          <table className="itsm-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>번호</th>
                <th>제목</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>프로젝트</th>
                <th>처리기한</th>
                <th style={{ width: 100 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {assignedTickets.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">담당 티켓이 없습니다.</td></tr>
              ) : (
                assignedTickets.map((t) => {
                  const deadline = t.deadline ? new Date(t.deadline) : null;
                  const isOverdue = deadline && deadline < new Date();
                  const isSoon = deadline && !isOverdue && (deadline.getTime() - Date.now()) < 3 * 86400000;
                  return (
                    <tr key={t.id}>
                      <td><span className="ticket-number">{t.ticketNumber}</span></td>
                      <td className="text-truncate" style={{ maxWidth: 200 }}>
                        <Link href={`/tickets/${t.id}`} className="text-decoration-none fw-semibold" style={{ color: 'var(--text-primary)' }}>{t.title}</Link>
                      </td>
                      <td><StatusBadge status={t.status} size="sm" /></td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{t.project?.name ?? '—'}</td>
                      <td style={{ fontSize: '0.8125rem' }}>
                        {deadline
                          ? <span className={isOverdue ? 'deadline-overdue' : isSoon ? 'deadline-soon' : 'deadline-normal'}>{deadline.toLocaleDateString('ko-KR')}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {(t.status === 'REGISTERED' || t.status === 'RECEIVED') && (
                          <Button variant="outline-success" size="sm" className="btn-icon" onClick={() => handleStartProgress(t.id)}>
                            <BsPlayFill size={13} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent activity */}
      <div className="table-card mb-4">
        <div className="d-flex justify-content-between align-items-center px-1 mb-2" style={{ padding: '0.75rem 1.25rem 0' }}>
          <span className="fw-semibold" style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>최근 활동</span>
          <Link href="/tickets" className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" style={{ fontSize: '0.8125rem' }}>
            전체 보기 <BsArrowRight size={12} />
          </Link>
        </div>
        <div className="table-responsive">
          <table className="itsm-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>번호</th>
                <th>제목</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>프로젝트</th>
                <th>처리기한</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted py-4">최근 활동이 없습니다.</td></tr>
              ) : (
                recentActivity.map((t) => <TicketTableRow key={t.id} ticket={t} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Customer Dashboard
// ---------------------------------------------------------------------------

function CustomerDashboard({ data }: { data: CustomerData }) {
  const { myTickets, recentTickets, projects } = data;

  return (
    <>
      {/* My stats */}
      <Row className="g-3 mb-4">
        <Col xs={6} md={4}>
          <StatCard
            title="진행중 티켓"
            value={myTickets.open}
            variant="primary"
            icon={<BsTicketDetailedFill />}
          />
        </Col>
        <Col xs={6} md={4}>
          <StatCard
            title="완료됨"
            value={myTickets.completed}
            variant="success"
            icon={<BsPlayFill />}
          />
        </Col>
        <Col xs={12} md={4}>
          <StatCard
            title="평가 대기"
            value={myTickets.pendingRating}
            variant="warning"
            icon={<BsClockFill />}
          />
        </Col>
      </Row>

      {/* Recent tickets */}
      <div className="table-card mb-4">
        <div className="d-flex justify-content-between align-items-center px-1 mb-2" style={{ padding: '0.75rem 1.25rem 0' }}>
          <span className="fw-semibold" style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>최근 티켓</span>
          <Link href="/tickets" className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" style={{ fontSize: '0.8125rem' }}>
            전체 보기 <BsArrowRight size={12} />
          </Link>
        </div>
        <div className="table-responsive">
          <table className="itsm-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>번호</th>
                <th>제목</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>프로젝트</th>
                <th>처리기한</th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted py-4">등록된 티켓이 없습니다.</td></tr>
              ) : (
                recentTickets.map((t) => <TicketTableRow key={t.id} ticket={t} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active projects */}
      {projects.length > 0 && (
        <div className="table-card mb-4">
          <div className="fw-semibold" style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', padding: '0.75rem 1.25rem 0.5rem' }}>활성 프로젝트</div>
          <div>
            {projects.map((p, i) => (
              <Link
                key={p.id}
                href={`/tickets?projectId=${p.id}`}
                className="d-flex justify-content-between align-items-center text-decoration-none"
                style={{
                  padding: '0.75rem 1.25rem',
                  borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                  color: 'var(--text-primary)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-primary-lt)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <span className="fw-semibold" style={{ fontSize: '0.875rem' }}>{p.name}</span>
                  <span className="ticket-number ms-2" style={{ fontSize: '0.75rem' }}>{p.code}</span>
                </div>
                <BsArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
