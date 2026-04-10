'use client';

// Design Ref: §10 — 프로젝트 관리 목록 페이지
// Plan SC: FR-06 프로젝트 관리

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Pagination from 'react-bootstrap/Pagination';
import InputGroup from 'react-bootstrap/InputGroup';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { BsSearch, BsPlus, BsPencil, BsKanban } from 'react-icons/bs';

interface Project {
  id: string;
  name: string;
  code: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  company: { id: string; name: string };
  _count: { members: number; tickets: number };
}

interface Company {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  name: string;
  loginId: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [userType, setUserType] = useState('');

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '', companyId: '', department: '', startDate: '', endDate: '', description: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  // Member selection state
  const [customerUsers, setCustomerUsers] = useState<UserItem[]>([]);
  const [supportUsers, setSupportUsers] = useState<UserItem[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedSupports, setSelectedSupports] = useState<string[]>([]); // 순서 중요: [0] = Main 담당자
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingSupports, setLoadingSupports] = useState(false);

  const limit = 20;

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) setUserType(json.data.type);
    } catch { /* ignore */ }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/companies?limit=100&isActive=true');
      const json = await res.json();
      if (json.success) {
        setCompanies(json.data.companies.map((c: Company) => ({ id: c.id, name: c.name })));
      }
    } catch { /* ignore */ }
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (filterCompany) params.set('companyId', filterCompany);

      const res = await fetch(`/api/projects?${params}`);
      const json = await res.json();
      if (json.success) {
        setProjects(json.data.projects);
        setTotal(json.data.total);
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterCompany]);

  useEffect(() => { fetchSession(); fetchCompanies(); }, [fetchSession, fetchCompanies]);
  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const fetchCustomerUsers = async (companyId: string) => {
    if (!companyId) { setCustomerUsers([]); setSelectedCustomers([]); return; }
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/users?role=customer&companyId=${companyId}&isActive=true&limit=100`);
      const json = await res.json();
      if (json.success) {
        const users: UserItem[] = json.data.users.map((u: UserItem) => ({ id: u.id, name: u.name, loginId: u.loginId }));
        setCustomerUsers(users);
        // 1명이면 자동 선택
        setSelectedCustomers(users.length === 1 ? [users[0].id] : []);
      }
    } catch {
      setCustomerUsers([]);
      setSelectedCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const fetchSupportUsers = async () => {
    setLoadingSupports(true);
    try {
      const res = await fetch('/api/users?role=support&isActive=true&limit=100');
      const json = await res.json();
      if (json.success) {
        setSupportUsers(json.data.users.map((u: UserItem) => ({ id: u.id, name: u.name, loginId: u.loginId })));
      }
    } catch {
      setSupportUsers([]);
    } finally {
      setLoadingSupports(false);
    }
  };

  const toggleCustomer = (userId: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const toggleSupport = (userId: string) => {
    setSelectedSupports((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      return [...prev, userId]; // 먼저 선택한 순서 유지 → [0] = Main 담당자
    });
  };

  const totalPages = Math.ceil(total / limit);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const openCreateModal = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormData({ name: '', companyId: '', department: '', startDate: today, endDate: '', description: '' });
    setFormErrors({});
    setCustomerUsers([]);
    setSupportUsers([]);
    setSelectedCustomers([]);
    setSelectedSupports([]);
    fetchSupportUsers();
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormErrors({});

    // Client-side validation
    if (formData.endDate && formData.endDate < formData.startDate) {
      setFormErrors({ endDate: ['종료일은 시작일보다 같거나 이후여야 합니다.'] });
      return;
    }
    if (selectedSupports.length === 0) {
      setFormErrors({ _general: ['지원담당자를 1명 이상 선택해 주세요.'] });
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formData.name,
        companyId: formData.companyId,
        startDate: formData.startDate,
        customerIds: selectedCustomers,
        supportIds: selectedSupports,
      };
      if (formData.department) body.departmentName = formData.department;
      if (formData.endDate) body.endDate = formData.endDate;
      if (formData.description) body.description = formData.description;

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        fetchProjects();
      } else {
        if (json.error?.fieldErrors) {
          setFormErrors(json.error.fieldErrors);
        } else {
          setFormErrors({ _general: [json.error?.message || '저장에 실패했습니다.'] });
        }
      }
    } catch {
      setFormErrors({ _general: ['서버에 연결할 수 없습니다.'] });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR');
  };

  return (
    <Container fluid>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">
            <BsKanban />
            프로젝트 관리
          </h1>
          <div className="page-header-subtitle">고객사별 프로젝트 목록 및 담당자 관리</div>
        </div>
        {userType === 'admin' && (
          <div className="page-header-actions">
            <Button variant="primary" size="sm" onClick={openCreateModal}>
              <BsPlus size={16} className="me-1" />
              신규 등록
            </Button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="filter-bar mb-3">
        <Form onSubmit={handleSearch} className="d-flex flex-wrap gap-2 align-items-center">
          <InputGroup style={{ maxWidth: 340 }}>
            <InputGroup.Text style={{ background: '#F8F9FA' }}><BsSearch size={13} /></InputGroup.Text>
            <Form.Control
              placeholder="프로젝트명, 코드 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ borderLeft: 0 }}
            />
            <Button variant="primary" type="submit" size="sm">검색</Button>
          </InputGroup>
          <Form.Select
            value={filterCompany}
            onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }}
            style={{ maxWidth: 200, fontSize: '0.8125rem' }}
          >
            <option value="">전체 고객사</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Form.Select>
        </Form>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Table Card */}
      <div className="table-card">
        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" style={{ width: '1.5rem', height: '1.5rem' }} />
            <div className="mt-2 text-muted small">불러오는 중...</div>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <BsKanban className="empty-state-icon" />
            <div className="empty-state-title">{search || filterCompany ? '검색 결과가 없습니다' : '등록된 프로젝트가 없습니다'}</div>
            <div className="empty-state-desc">{search || filterCompany ? '다른 검색어나 필터로 시도해 보세요.' : '신규 등록 버튼을 눌러 첫 프로젝트를 추가하세요.'}</div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="itsm-table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>코드</th>
                    <th>프로젝트명</th>
                    <th>고객사</th>
                    <th>기간</th>
                    <th className="text-center">멤버</th>
                    <th className="text-center">티켓</th>
                    <th className="text-center">상태</th>
                    {userType === 'admin' && <th className="text-center" style={{ width: 70 }}>작업</th>}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="ticket-number">{p.code}</span>
                      </td>
                      <td>
                        <a href={`/master/projects/${p.id}`} className="text-decoration-none fw-semibold" style={{ color: 'var(--text-primary)' }}>
                          {p.name}
                        </a>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{p.company.name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                        {formatDate(p.startDate)}{p.endDate ? ` ~ ${formatDate(p.endDate)}` : ' ~'}
                      </td>
                      <td className="text-center">
                        <span className="badge bg-light text-secondary border">{p._count.members}</span>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-light text-secondary border">{p._count.tickets}</span>
                      </td>
                      <td className="text-center">
                        <span className={`badge ${p.isActive ? 'bg-success' : 'bg-secondary'} bg-opacity-10 border`}
                          style={{ color: p.isActive ? 'var(--bs-success)' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                          {p.isActive ? '● 활성' : '○ 비활성'}
                        </span>
                      </td>
                      {userType === 'admin' && (
                        <td className="text-center">
                          <Button variant="outline-secondary" size="sm" className="btn-icon" title="수정" onClick={() => router.push(`/master/projects/${p.id}`)}>
                            <BsPencil size={13} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="d-flex justify-content-center">
                <Pagination size="sm">
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Project Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>프로젝트 등록</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formErrors._general && <Alert variant="danger">{formErrors._general.join(', ')}</Alert>}
          <Form>
            {/* 프로젝트명 */}
            <Form.Group className="mb-3">
              <Form.Label>프로젝트명 <span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                isInvalid={!!formErrors.name}
                placeholder="프로젝트명을 입력해 주세요"
              />
              <Form.Control.Feedback type="invalid">{formErrors.name?.join(', ')}</Form.Control.Feedback>
              <Form.Text className="text-muted">프로젝트 코드는 시스템이 자동으로 부여합니다.</Form.Text>
            </Form.Group>

            {/* 고객사 + 부서 */}
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>고객사 <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    value={formData.companyId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setFormData({ ...formData, companyId: cid, department: '' });
                      fetchCustomerUsers(cid);
                    }}
                    isInvalid={!!formErrors.companyId}
                  >
                    <option value="">고객사를 선택해 주세요</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">{formErrors.companyId?.join(', ')}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>부서</Form.Label>
                  <Form.Control
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    disabled={!formData.companyId}
                    placeholder="부서명 입력"
                  />
                </Form.Group>
              </Col>
            </Row>

            {/* 기간 */}
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>시작일 <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    isInvalid={!!formErrors.startDate}
                  />
                  <Form.Control.Feedback type="invalid">{formErrors.startDate?.join(', ')}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>종료일</Form.Label>
                  <Form.Control
                    type="date"
                    value={formData.endDate}
                    min={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    isInvalid={!!formErrors.endDate}
                  />
                  <Form.Control.Feedback type="invalid">{formErrors.endDate?.join(', ')}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            {/* 설명 */}
            <Form.Group className="mb-3">
              <Form.Label>설명</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="프로젝트 설명 (선택)"
              />
            </Form.Group>

            <hr className="my-3" />

            {/* 고객담당자 선택 */}
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold d-flex align-items-center gap-2">
                고객담당자
                {selectedCustomers.length > 0 && (
                  <span className="badge" style={{ background: 'rgba(59,91,219,0.1)', color: 'var(--brand-primary)', fontSize: '0.72rem', fontWeight: 600 }}>
                    {selectedCustomers.length}명 선택
                  </span>
                )}
              </Form.Label>
              {!formData.companyId ? (
                <div className="text-muted small py-2">고객사를 먼저 선택해 주세요.</div>
              ) : loadingCustomers ? (
                <div className="text-muted small py-2"><Spinner size="sm" animation="border" className="me-1" />불러오는 중...</div>
              ) : customerUsers.length === 0 ? (
                <div className="text-muted small py-2">해당 고객사에 등록된 고객담당자가 없습니다.</div>
              ) : (
                <div className="d-flex flex-wrap gap-2 member-toggle">
                  {customerUsers.map((u) => {
                    const selected = selectedCustomers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`member-toggle-btn${selected ? ' selected' : ''}`}
                        onClick={() => toggleCustomer(u.id)}
                      >
                        {u.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <Form.Text className="text-muted">여러 명 선택 가능합니다.</Form.Text>
            </Form.Group>

            {/* 지원담당자 선택 */}
            <Form.Group className="mb-1">
              <Form.Label className="fw-semibold d-flex align-items-center gap-2">
                지원담당자 <span className="text-danger">*</span>
                {selectedSupports.length > 0 && (
                  <span className="badge" style={{ background: 'rgba(47,158,68,0.1)', color: '#2F9E44', fontSize: '0.72rem', fontWeight: 600 }}>
                    {selectedSupports.length}명 선택
                  </span>
                )}
              </Form.Label>
              {loadingSupports ? (
                <div className="text-muted small py-2"><Spinner size="sm" animation="border" className="me-1" />불러오는 중...</div>
              ) : supportUsers.length === 0 ? (
                <div className="text-muted small py-2">등록된 지원담당자가 없습니다.</div>
              ) : (
                <div className="d-flex flex-wrap gap-2 member-toggle">
                  {supportUsers.map((u) => {
                    const selected = selectedSupports.includes(u.id);
                    const isMain = selectedSupports[0] === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`member-toggle-btn${selected ? (isMain ? ' main-selected' : ' selected') : ''}`}
                        onClick={() => toggleSupport(u.id)}
                      >
                        {u.name}
                        {isMain && <span className="ms-1" style={{ fontSize: '0.65rem', opacity: 0.85 }}>Main</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <Form.Text className="text-muted">처음 선택한 담당자가 Main 담당자로 지정됩니다.</Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" animation="border" /> : '등록'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
