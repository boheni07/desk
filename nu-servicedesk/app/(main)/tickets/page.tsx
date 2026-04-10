'use client';

// Design Ref: §10 -- Ticket list page (Module 9B: advanced filters, sorting, URL state)
// Plan SC: FR-22 티켓 목록 고급 필터, 정렬, URL 상태 동기화

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Pagination from 'react-bootstrap/Pagination';
import InputGroup from 'react-bootstrap/InputGroup';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Collapse from 'react-bootstrap/Collapse';
import { BsSearch, BsPlus, BsFunnel, BsArrowUp, BsArrowDown, BsXCircle, BsCheck, BsTicketDetailedFill } from 'react-icons/bs';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriorityBadge } from '@/components/ui/priority-badge';
import type { TicketStatus, TicketPriority } from '@prisma/client';

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'warning',
  RECEIVED: 'info',
  IN_PROGRESS: 'success',
  DELAYED: 'danger',
  EXTEND_REQUESTED: 'secondary',
  COMPLETE_REQUESTED: 'primary',
  SATISFACTION_PENDING: 'dark',
  CLOSED: 'dark',
  CANCELLED: 'secondary',
};

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: '긴급',
  HIGH: '높음',
  NORMAL: '보통',
  LOW: '낮음',
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'danger',
  HIGH: 'warning',
  NORMAL: 'info',
  LOW: 'secondary',
};

const SORT_OPTIONS = [
  { value: 'createdAt', label: '등록일' },
  { value: 'deadline', label: '처리기한' },
  { value: 'priority', label: '우선순위' },
];

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface TicketListItem {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  createdAt: string;
  project: { id: string; name: string; company: { id: string; name: string } };
  category: { id: string; name: string };
  assignments: { user: { id: string; name: string } }[];
  registeredBy: { id: string; name: string };
}

interface ProjectOption {
  id: string;
  name: string;
}

interface SupportUser {
  id: string;
  name: string;
}

// ─────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────

export default function TicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial state from URL
  const initialStatuses = searchParams.get('status')?.split(',').filter(Boolean) || [];
  const initialPriorities = searchParams.get('priority')?.split(',').filter(Boolean) || [];
  const initialProject = searchParams.get('projectId') || '';
  const initialAssignee = searchParams.get('assigneeId') || '';
  const initialSearch = searchParams.get('search') || '';
  const initialSortBy = searchParams.get('sortBy') || 'createdAt';
  const initialSortOrder = searchParams.get('sortOrder') || 'desc';
  const initialCreatedFrom = searchParams.get('createdFrom') || '';
  const initialCreatedTo = searchParams.get('createdTo') || '';
  const initialPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [filterStatuses, setFilterStatuses] = useState<string[]>(initialStatuses);
  const [filterPriorities, setFilterPriorities] = useState<string[]>(initialPriorities);
  const [filterProject, setFilterProject] = useState(initialProject);
  const [filterAssignee, setFilterAssignee] = useState(initialAssignee);
  const [createdFrom, setCreatedFrom] = useState(initialCreatedFrom);
  const [createdTo, setCreatedTo] = useState(initialCreatedTo);
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [supportUsers, setSupportUsers] = useState<SupportUser[]>([]);
  const [userType, setUserType] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    !!(initialAssignee || initialCreatedFrom || initialCreatedTo || initialStatuses.length > 0 || initialPriorities.length > 0)
  );

  const limit = 20;

  // Sync filter state to URL
  const updateUrl = useCallback((overrides?: Record<string, string | number>) => {
    const params = new URLSearchParams();
    const state = {
      page: overrides?.page ?? page,
      search: overrides?.search ?? search,
      status: overrides?.status ?? filterStatuses.join(','),
      priority: overrides?.priority ?? filterPriorities.join(','),
      projectId: overrides?.projectId ?? filterProject,
      assigneeId: overrides?.assigneeId ?? filterAssignee,
      createdFrom: overrides?.createdFrom ?? createdFrom,
      createdTo: overrides?.createdTo ?? createdTo,
      sortBy: overrides?.sortBy ?? sortBy,
      sortOrder: overrides?.sortOrder ?? sortOrder,
    };

    Object.entries(state).forEach(([key, value]) => {
      if (value && String(value) !== '' && !(key === 'page' && value === 1) && !(key === 'sortBy' && value === 'createdAt') && !(key === 'sortOrder' && value === 'desc')) {
        params.set(key, String(value));
      }
    });

    const qs = params.toString();
    router.replace(qs ? `/tickets?${qs}` : '/tickets', { scroll: false });
  }, [page, search, filterStatuses, filterPriorities, filterProject, filterAssignee, createdFrom, createdTo, sortBy, sortOrder, router]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) setUserType(json.data.type);
    } catch { /* ignore */ }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?limit=100');
      const json = await res.json();
      if (json.success) {
        setProjects(json.data.projects.map((p: ProjectOption) => ({ id: p.id, name: p.name })));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchSupportUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users?limit=100&type=support');
      const json = await res.json();
      if (json.success) {
        setSupportUsers(json.data.users.filter((u: any) => u.isActive).map((u: any) => ({ id: u.id, name: u.name })));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (filterStatuses.length > 0) params.set('status', filterStatuses.join(','));
      if (filterPriorities.length > 0) params.set('priority', filterPriorities.join(','));
      if (filterProject) params.set('projectId', filterProject);
      if (filterAssignee) params.set('assigneeId', filterAssignee);
      if (createdFrom) params.set('createdFrom', createdFrom);
      if (createdTo) params.set('createdTo', createdTo);
      if (sortBy !== 'createdAt') params.set('sortBy', sortBy);
      if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);

      const res = await fetch(`/api/tickets?${params}`);
      const json = await res.json();
      if (json.success) {
        setTickets(json.data.tickets);
        setTotal(json.data.total);
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatuses, filterPriorities, filterProject, filterAssignee, createdFrom, createdTo, sortBy, sortOrder]);

  useEffect(() => { fetchSession(); fetchProjects(); fetchSupportUsers(); }, [fetchSession, fetchProjects, fetchSupportUsers]);
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Sync URL when filters change
  useEffect(() => {
    updateUrl();
  }, [page, search, filterStatuses, filterPriorities, filterProject, filterAssignee, createdFrom, createdTo, sortBy, sortOrder]);

  const totalPages = Math.ceil(total / limit);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleStatusToggle = (status: string) => {
    setPage(1);
    setFilterStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handlePriorityToggle = (priority: string) => {
    setPage(1);
    setFilterPriorities((prev) =>
      prev.includes(priority) ? prev.filter((p) => p !== priority) : [...prev, priority]
    );
  };

  const handleResetFilters = () => {
    setPage(1);
    setSearch('');
    setSearchInput('');
    setFilterStatuses([]);
    setFilterPriorities([]);
    setFilterProject('');
    setFilterAssignee('');
    setCreatedFrom('');
    setCreatedTo('');
    setSortBy('createdAt');
    setSortOrder('desc');
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'deadline' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    return search || filterStatuses.length > 0 || filterPriorities.length > 0 || filterProject || filterAssignee || createdFrom || createdTo;
  }, [search, filterStatuses, filterPriorities, filterProject, filterAssignee, createdFrom, createdTo]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ko-KR');

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? <BsArrowUp className="ms-1" /> : <BsArrowDown className="ms-1" />;
  };

  const getDeadlineClass = (deadline: string | null) => {
    if (!deadline) return '';
    const now = new Date();
    const due = new Date(deadline);
    const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'deadline-overdue';
    if (diffDays < 3) return 'deadline-soon';
    return 'deadline-normal';
  };

  return (
    <Container fluid>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">
            <BsTicketDetailedFill />
            티켓 관리
          </h1>
          <div className="page-header-subtitle">전체 서비스 요청 티켓 목록 및 처리 현황</div>
        </div>
        <div className="page-header-actions">
          {userType !== '' && (
            <Button variant="primary" size="sm" onClick={() => router.push('/tickets/new')}>
              <BsPlus size={16} className="me-1" />
              티켓 등록
            </Button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar mb-2">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <Form onSubmit={handleSearch} className="d-flex" style={{ gap: 0 }}>
            <InputGroup style={{ maxWidth: 320 }}>
              <InputGroup.Text style={{ background: '#F8F9FA' }}><BsSearch size={13} /></InputGroup.Text>
              <Form.Control
                placeholder="티켓번호, 제목 검색..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ borderLeft: 0 }}
              />
              <Button variant="primary" type="submit" size="sm">검색</Button>
            </InputGroup>
          </Form>
          <Form.Select
            value={filterProject}
            onChange={(e) => { setFilterProject(e.target.value); setPage(1); }}
            style={{ maxWidth: 200, fontSize: '0.8125rem' }}
          >
            <option value="">전체 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Form.Select>
          <Form.Select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split(':');
              setSortBy(field);
              setSortOrder(order);
              setPage(1);
            }}
            style={{ maxWidth: 170, fontSize: '0.8125rem' }}
          >
            <option value="createdAt:desc">등록일 (최신순)</option>
            <option value="createdAt:asc">등록일 (오래된순)</option>
            <option value="deadline:asc">처리기한 (임박순)</option>
            <option value="deadline:desc">처리기한 (여유순)</option>
            <option value="priority:asc">우선순위 (높은순)</option>
            <option value="priority:desc">우선순위 (낮은순)</option>
          </Form.Select>
          <div className="d-flex gap-1 ms-auto">
            <Button
              variant={showAdvancedFilters ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <BsFunnel size={13} />
              고급 필터
              {hasActiveFilters && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', display: 'inline-block', marginLeft: 2 }} />
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="outline-danger" size="sm" onClick={handleResetFilters} title="필터 초기화" className="btn-icon">
                <BsXCircle size={13} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <Collapse in={showAdvancedFilters}>
        <div>
          <div className="filter-bar mb-2" style={{ borderColor: 'rgba(59,91,219,0.25)', background: '#FAFBFF' }}>
            <Row className="g-3">
              {/* Status multi-select */}
              <Col xs={12} md={6}>
                <div className="small fw-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>상태 필터</div>
                <div className="d-flex flex-wrap gap-1">
                  {Object.entries(STATUS_LABELS).map(([key, label]) => {
                    const active = filterStatuses.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        onClick={() => handleStatusToggle(key)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '0.2rem 0.55rem', fontSize: '0.75rem', fontWeight: 600,
                          borderRadius: '50rem', border: '1.5px solid',
                          cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
                          background: active ? 'var(--brand-primary)' : 'white',
                          borderColor: active ? 'var(--brand-primary)' : 'var(--border-default)',
                          color: active ? 'white' : 'var(--text-secondary)',
                        }}
                      >
                        {active && <BsCheck size={11} />}{label}
                      </button>
                    );
                  })}
                </div>
              </Col>

              {/* Priority multi-select */}
              <Col xs={12} md={6}>
                <div className="small fw-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>우선순위 필터</div>
                <div className="d-flex flex-wrap gap-1">
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => {
                    const active = filterPriorities.includes(key);
                    const color = key === 'URGENT' ? '#DC2626' : key === 'HIGH' ? '#D97706' : key === 'NORMAL' ? 'var(--brand-primary)' : 'var(--text-muted)';
                    return (
                      <button
                        key={key}
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        onClick={() => handlePriorityToggle(key)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '0.2rem 0.55rem', fontSize: '0.75rem', fontWeight: 600,
                          borderRadius: '50rem', border: '1.5px solid',
                          cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
                          background: active ? color : 'white',
                          borderColor: active ? color : 'var(--border-default)',
                          color: active ? 'white' : 'var(--text-secondary)',
                        }}
                      >
                        {active && <BsCheck size={11} />}{label}
                      </button>
                    );
                  })}
                </div>
              </Col>

              {/* Assignee */}
              {(userType === 'admin' || userType === 'support') && (
                <Col xs={12} md={4}>
                  <Form.Label className="small fw-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>담당자</Form.Label>
                  <Form.Select
                    size="sm"
                    value={filterAssignee}
                    onChange={(e) => { setFilterAssignee(e.target.value); setPage(1); }}
                  >
                    <option value="">전체</option>
                    {supportUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Form.Select>
                </Col>
              )}

              {/* Date range */}
              <Col xs={6} md={4}>
                <Form.Label className="small fw-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>등록일 (시작)</Form.Label>
                <Form.Control
                  type="date" size="sm" value={createdFrom}
                  max={createdTo || undefined}
                  onChange={(e) => { setCreatedFrom(e.target.value); setPage(1); }}
                />
              </Col>
              <Col xs={6} md={4}>
                <Form.Label className="small fw-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>등록일 (종료)</Form.Label>
                <Form.Control
                  type="date" size="sm" value={createdTo}
                  min={createdFrom || undefined}
                  onChange={(e) => { setCreatedTo(e.target.value); setPage(1); }}
                />
              </Col>
            </Row>
            <div className="mt-3 text-end">
              <Button variant="outline-secondary" size="sm" onClick={handleResetFilters}>
                <BsXCircle size={12} className="me-1" />필터 초기화
              </Button>
            </div>
          </div>
        </div>
      </Collapse>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Table Card */}
      <div className="table-card">
        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" style={{ width: '1.5rem', height: '1.5rem' }} />
            <div className="mt-2 text-muted small">불러오는 중...</div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <BsTicketDetailedFill className="empty-state-icon" />
            <div className="empty-state-title">{hasActiveFilters ? '검색 결과가 없습니다' : '등록된 티켓이 없습니다'}</div>
            <div className="empty-state-desc">{hasActiveFilters ? '다른 검색어나 필터로 시도해 보세요.' : '티켓 등록 버튼을 눌러 첫 티켓을 작성하세요.'}</div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="itsm-table">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>번호</th>
                    <th>제목</th>
                    <th className="text-center" style={{ width: 90 }}>상태</th>
                    <th
                      className="text-center"
                      style={{ width: 100, cursor: 'pointer' }}
                      onClick={() => handleSort('priority')}
                    >
                      우선순위{getSortIcon('priority')}
                    </th>
                    <th style={{ width: 150 }}>프로젝트</th>
                    <th style={{ width: 100 }}>담당자</th>
                    <th
                      style={{ width: 110, cursor: 'pointer' }}
                      onClick={() => handleSort('deadline')}
                    >
                      처리기한{getSortIcon('deadline')}
                    </th>
                    <th
                      style={{ width: 100, cursor: 'pointer' }}
                      onClick={() => handleSort('createdAt')}
                    >
                      등록일{getSortIcon('createdAt')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <span className="ticket-number">{t.ticketNumber}</span>
                      </td>
                      <td>
                        <a href={`/tickets/${t.id}`} className="text-decoration-none fw-semibold" style={{ color: 'var(--text-primary)' }}>
                          {t.title}
                        </a>
                      </td>
                      <td className="text-center">
                        <StatusBadge status={t.status as TicketStatus} size="sm" />
                      </td>
                      <td className="text-center">
                        <PriorityBadge priority={t.priority as TicketPriority} />
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{t.project?.name ?? '—'}</td>
                      <td style={{ fontSize: '0.8125rem' }}>
                        {t.assignments.length > 0
                          ? t.assignments.map((a) => a.user.name).join(', ')
                          : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>
                        {t.deadline
                          ? <span className={getDeadlineClass(t.deadline)}>{formatDate(t.deadline)}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="d-flex align-items-center justify-content-between px-1">
              <span className="text-muted small">{total === 0 ? '결과 없음' : `총 ${total}건 중 ${(page - 1) * limit + 1}–${Math.min(page * limit, total)}건`}</span>
              {totalPages > 1 && (
                <Pagination size="sm" className="mb-0">
                  <Pagination.First disabled={page === 1} onClick={() => setPage(1)} />
                  <Pagination.Prev disabled={page === 1} onClick={() => setPage(page - 1)} />
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = startPage + i;
                    if (p > totalPages) return null;
                    return (
                      <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>{p}</Pagination.Item>
                    );
                  })}
                  <Pagination.Next disabled={page === totalPages} onClick={() => setPage(page + 1)} />
                  <Pagination.Last disabled={page === totalPages} onClick={() => setPage(totalPages)} />
                </Pagination>
              )}
            </div>
          </>
        )}
      </div>
    </Container>
  );
}
