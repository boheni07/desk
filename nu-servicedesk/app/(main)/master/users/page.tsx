'use client';

// Design Ref: §10 — 사용자 관리 목록 페이지
// Plan SC: FR-03 사용자 관리

import { useState, useEffect, useCallback } from 'react';
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
import { BsSearch, BsPlus, BsKey, BsXCircle, BsClipboard, BsCheckCircle, BsPeopleFill } from 'react-icons/bs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface User {
  id: string;
  loginId: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  isActive: boolean;
  mustChangePassword: boolean;
  companyId: string | null;
  company: { id: string; name: string } | null;
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  support: '지원담당',
  customer: '고객',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'danger',
  support: 'primary',
  customer: 'info',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    loginId: '', name: '', type: 'support', companyId: '', email: '', phone: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  // Password result modal (initial create + reset)
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalData, setPasswordModalData] = useState<{ title: string; password: string; sessions?: number } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Reset password confirm dialog
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; loginId: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  // Deactivate confirm dialog
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  const limit = 20;

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/companies?limit=100');
      const json = await res.json();
      if (json.success) {
        setCompanies(json.data.companies.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (filterRole) params.set('role', filterRole);
      if (filterCompany) params.set('companyId', filterCompany);
      if (filterActive) params.set('isActive', filterActive);

      const res = await fetch(`/api/users?${params}`);
      const json = await res.json();
      if (json.success) {
        setUsers(json.data.users);
        setTotal(json.data.total);
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterRole, filterCompany, filterActive]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const totalPages = Math.ceil(total / limit);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const openCreateModal = () => {
    setFormData({ loginId: '', name: '', type: 'support', companyId: '', email: '', phone: '' });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormErrors({});
    try {
      const body: Record<string, unknown> = {
        loginId: formData.loginId,
        name: formData.name,
        type: formData.type,
      };
      if (formData.type === 'customer' && formData.companyId) body.companyId = formData.companyId;
      if (formData.email) body.email = formData.email;
      if (formData.phone) body.phone = formData.phone;

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        fetchUsers();
        setPasswordModalData({ title: '사용자 등록 완료', password: json.data.initialPassword });
        setPasswordCopied(false);
        setShowPasswordModal(true);
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

  const openResetDialog = (userId: string, loginId: string) => {
    setResetTarget({ id: userId, loginId });
    setShowResetDialog(true);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/users/${resetTarget.id}/reset-password`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setShowResetDialog(false);
        setResetTarget(null);
        setPasswordModalData({ title: '비밀번호 초기화 완료', password: json.data.newPassword, sessions: json.data.sessionsCleared });
        setPasswordCopied(false);
        setShowPasswordModal(true);
      } else {
        setShowResetDialog(false);
        setError(json.error?.message || '비밀번호 초기화에 실패했습니다.');
      }
    } catch {
      setShowResetDialog(false);
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setResetting(false);
    }
  };

  const openDeactivateDialog = (userId: string, name: string) => {
    setDeactivateTarget({ id: userId, name });
    setDeactivateError('');
    setShowDeactivateDialog(true);
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    setDeactivateError('');
    try {
      const res = await fetch(`/api/users/${deactivateTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setShowDeactivateDialog(false);
        setDeactivateTarget(null);
        fetchUsers();
      } else {
        setDeactivateError(json.error?.message || '비활성화에 실패했습니다.');
      }
    } catch {
      setDeactivateError('서버에 연결할 수 없습니다.');
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <Container fluid>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">
            <BsPeopleFill />
            사용자 관리
          </h1>
          <div className="page-header-subtitle">등록된 사용자 목록 및 계정 관리</div>
        </div>
        <div className="page-header-actions">
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <BsPlus size={16} className="me-1" />
            신규 등록
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar mb-3">
        <Form onSubmit={handleSearch} className="d-flex flex-wrap gap-2 align-items-center">
          <InputGroup style={{ maxWidth: 300 }}>
            <InputGroup.Text style={{ background: '#F8F9FA' }}><BsSearch size={13} /></InputGroup.Text>
            <Form.Control
              placeholder="아이디, 이름 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ borderLeft: 0 }}
            />
            <Button variant="primary" type="submit" size="sm">검색</Button>
          </InputGroup>
          <Form.Select
            value={filterRole}
            onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
            style={{ maxWidth: 130, fontSize: '0.8125rem' }}
          >
            <option value="">전체 역할</option>
            <option value="admin">관리자</option>
            <option value="support">지원담당</option>
            <option value="customer">고객</option>
          </Form.Select>
          <Form.Select
            value={filterCompany}
            onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }}
            style={{ maxWidth: 180, fontSize: '0.8125rem' }}
          >
            <option value="">전체 고객사</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Form.Select>
          <Form.Select
            value={filterActive}
            onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
            style={{ maxWidth: 120, fontSize: '0.8125rem' }}
          >
            <option value="">전체 상태</option>
            <option value="true">활성</option>
            <option value="false">비활성</option>
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
        ) : users.length === 0 ? (
          <div className="empty-state">
            <BsPeopleFill className="empty-state-icon" />
            <div className="empty-state-title">{search || filterRole || filterCompany ? '검색 결과가 없습니다' : '등록된 사용자가 없습니다'}</div>
            <div className="empty-state-desc">{search || filterRole || filterCompany ? '다른 검색어나 필터로 시도해 보세요.' : '신규 등록 버튼을 눌러 첫 사용자를 추가하세요.'}</div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="itsm-table">
                <thead>
                  <tr>
                    <th>아이디</th>
                    <th>이름</th>
                    <th className="text-center">역할</th>
                    <th>고객사</th>
                    <th className="text-center">상태</th>
                    <th className="text-center" style={{ width: 90 }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <a href={`/master/users/${u.id}`} className="text-decoration-none fw-semibold" style={{ color: 'var(--text-primary)' }}>
                          {u.loginId}
                        </a>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{u.name}</td>
                      <td className="text-center">
                        <span
                          className="badge border"
                          style={{
                            fontSize: '0.72rem', fontWeight: 600,
                            background: u.type === 'admin' ? 'rgba(239,68,68,0.08)' : u.type === 'support' ? 'rgba(59,91,219,0.08)' : 'rgba(47,158,68,0.08)',
                            color: u.type === 'admin' ? '#DC2626' : u.type === 'support' ? 'var(--brand-primary)' : '#2F9E44',
                            borderColor: u.type === 'admin' ? 'rgba(239,68,68,0.2)' : u.type === 'support' ? 'rgba(59,91,219,0.2)' : 'rgba(47,158,68,0.2)',
                          }}
                        >
                          {ROLE_LABELS[u.type] || u.type}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{u.company?.name || '—'}</td>
                      <td className="text-center">
                        <span className={`badge ${u.isActive ? 'bg-success' : 'bg-secondary'} bg-opacity-10 border`}
                          style={{ color: u.isActive ? 'var(--bs-success)' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                          {u.isActive ? '● 활성' : '○ 비활성'}
                        </span>
                      </td>
                      <td className="text-center">
                        <Button variant="outline-warning" size="sm" className="btn-icon me-1" title="비밀번호 초기화" onClick={() => openResetDialog(u.id, u.loginId)}>
                          <BsKey size={13} />
                        </Button>
                        {u.isActive && (
                          <Button variant="outline-danger" size="sm" className="btn-icon" title="비활성화" onClick={() => openDeactivateDialog(u.id, u.name)}>
                            <BsXCircle size={13} />
                          </Button>
                        )}
                      </td>
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

      {/* Password Result Modal */}
      <Modal show={showPasswordModal} onHide={() => setShowPasswordModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{passwordModalData?.title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            아래 비밀번호를 사용자에게 안전하게 전달해 주세요. 첫 로그인 시 변경이 필요합니다.
            {passwordModalData?.sessions !== undefined && (
              <> 기존 세션 <strong>{passwordModalData.sessions}개</strong>가 폐기되었습니다.</>
            )}
          </p>
          <div className="d-flex align-items-center gap-2 p-3 bg-light rounded border">
            <code className="flex-grow-1 fs-5 user-select-all">{passwordModalData?.password}</code>
            <Button
              variant={passwordCopied ? 'success' : 'outline-secondary'}
              size="sm"
              onClick={() => {
                if (passwordModalData?.password) {
                  navigator.clipboard.writeText(passwordModalData.password);
                  setPasswordCopied(true);
                  setTimeout(() => setPasswordCopied(false), 2000);
                }
              }}
              title="클립보드에 복사"
            >
              {passwordCopied ? <BsCheckCircle /> : <BsClipboard />}
            </Button>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setShowPasswordModal(false)}>확인</Button>
        </Modal.Footer>
      </Modal>

      {/* Reset Password Confirm Dialog */}
      <ConfirmDialog
        show={showResetDialog}
        title="비밀번호 초기화"
        message={(<><strong>{resetTarget?.loginId}</strong> 사용자의 비밀번호를 초기화하시겠습니까?<br /><small className="text-muted">기존 로그인 세션이 모두 폐기됩니다.</small></>)}
        confirmLabel="초기화"
        variant="warning"
        isLoading={resetting}
        onConfirm={handleResetPassword}
        onCancel={() => setShowResetDialog(false)}
      />

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        show={showDeactivateDialog}
        title="사용자 비활성화"
        message={
          deactivateError
            ? deactivateError
            : (<><strong>{deactivateTarget?.name}</strong> 사용자를 비활성화하시겠습니까?</>)
        }
        confirmLabel="비활성화"
        variant="danger"
        isLoading={deactivating}
        onConfirm={handleDeactivate}
        onCancel={() => { setShowDeactivateDialog(false); setDeactivateError(''); }}
      />

      {/* Create User Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>사용자 등록</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formErrors._general && <Alert variant="danger">{formErrors._general.join(', ')}</Alert>}
          <Alert variant="info" className="small">
            초기 비밀번호는 등록 완료 후 별도 창에서 복사할 수 있습니다. (로그인 시 변경 필수)
          </Alert>
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>아이디 <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    value={formData.loginId}
                    onChange={(e) => setFormData({ ...formData, loginId: e.target.value })}
                    isInvalid={!!formErrors.loginId}
                    placeholder="영문, 숫자 3자 이상"
                  />
                  <Form.Control.Feedback type="invalid">{formErrors.loginId?.join(', ')}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>이름 <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    isInvalid={!!formErrors.name}
                  />
                  <Form.Control.Feedback type="invalid">{formErrors.name?.join(', ')}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={formData.type === 'customer' ? 4 : 6}>
                <Form.Group className="mb-3">
                  <Form.Label>역할 <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    value={formData.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setFormData({ ...formData, type: newType, companyId: '' });
                    }}
                  >
                    <option value="admin">관리자</option>
                    <option value="support">지원담당</option>
                    <option value="customer">고객</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              {formData.type === 'customer' && (
                <Col md={8}>
                  <Form.Group className="mb-3">
                    <Form.Label>고객사 <span className="text-danger">*</span></Form.Label>
                    <Form.Select
                      value={formData.companyId}
                      onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
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
              )}
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>이메일</Form.Label>
                  <Form.Control
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    isInvalid={!!formErrors.email}
                  />
                  <Form.Control.Feedback type="invalid">{formErrors.email?.join(', ')}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>전화번호</Form.Label>
                  <Form.Control
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="010-0000-0000"
                  />
                </Form.Group>
              </Col>
            </Row>
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
