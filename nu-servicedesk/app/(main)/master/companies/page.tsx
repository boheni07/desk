'use client';

// Design Ref: §10 — 고객사 관리 목록 페이지
// Plan SC: FR-02 고객사 관리

import { useState, useEffect, useCallback } from 'react';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Pagination from 'react-bootstrap/Pagination';
import InputGroup from 'react-bootstrap/InputGroup';
import { BsSearch, BsPlus, BsPencil, BsXCircle, BsBuilding } from 'react-icons/bs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Company {
  id: string;
  name: string;
  businessNumber: string | null;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; projects: number };
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userType, setUserType] = useState<string>('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', businessNumber: '', address: '', phone: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  // Deactivate confirm dialog
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');

  const limit = 20;

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) {
        setUserType(json.data.type);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);

      const res = await fetch(`/api/companies?${params}`);
      const json = await res.json();
      if (json.success) {
        setCompanies(json.data.companies);
        setTotal(json.data.total);
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  if (userType && userType !== 'admin') {
    return (
      <Container fluid>
        <Alert variant="danger" className="mt-3">
          <Alert.Heading>접근 권한이 없습니다</Alert.Heading>
          <p>관리자만 접근할 수 있는 페이지입니다.</p>
        </Alert>
      </Container>
    );
  }

  const totalPages = Math.ceil(total / limit);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const openCreateModal = () => {
    setEditId(null);
    setFormData({ name: '', businessNumber: '', address: '', phone: '' });
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (c: Company) => {
    setEditId(c.id);
    setFormData({
      name: c.name,
      businessNumber: c.businessNumber || '',
      address: c.address || '',
      phone: c.phone || '',
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormErrors({});
    try {
      const body: Record<string, unknown> = { name: formData.name };
      if (formData.businessNumber) body.businessNumber = formData.businessNumber;
      if (formData.address) body.address = formData.address;
      if (formData.phone) body.phone = formData.phone;

      const url = editId ? `/api/companies/${editId}` : '/api/companies';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        fetchCompanies();
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

  const openDeactivateDialog = (id: string, name: string) => {
    setDeactivateTarget({ id, name });
    setDeactivateError('');
    setShowDeactivateDialog(true);
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    setDeactivateError('');
    try {
      const res = await fetch(`/api/companies/${deactivateTarget.id}/deactivate`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setShowDeactivateDialog(false);
        setDeactivateTarget(null);
        fetchCompanies();
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
            <BsBuilding />
            고객사 관리
          </h1>
          <div className="page-header-subtitle">등록된 고객사 목록 및 관리</div>
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
        <Form onSubmit={handleSearch}>
          <InputGroup style={{ maxWidth: 360 }}>
            <InputGroup.Text style={{ background: '#F8F9FA' }}><BsSearch size={13} /></InputGroup.Text>
            <Form.Control
              placeholder="회사명으로 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ borderLeft: 0 }}
            />
            <Button variant="primary" type="submit" size="sm">검색</Button>
          </InputGroup>
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
        ) : companies.length === 0 ? (
          <div className="empty-state">
            <BsBuilding className="empty-state-icon" />
            <div className="empty-state-title">{search ? '검색 결과가 없습니다' : '등록된 고객사가 없습니다'}</div>
            <div className="empty-state-desc">{search ? '다른 검색어로 시도해 보세요.' : '신규 등록 버튼을 눌러 첫 고객사를 추가하세요.'}</div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="itsm-table">
                <thead>
                  <tr>
                    <th>회사명</th>
                    <th>사업자번호</th>
                    <th className="text-center">사용자</th>
                    <th className="text-center">프로젝트</th>
                    <th className="text-center">상태</th>
                    <th className="text-center" style={{ width: 90 }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <a href={`/master/companies/${c.id}`} className="text-decoration-none fw-semibold" style={{ color: 'var(--text-primary)' }}>
                          {c.name}
                        </a>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{c.businessNumber || '—'}</td>
                      <td className="text-center">
                        <span className="badge bg-light text-secondary border">{c._count.users}</span>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-light text-secondary border">{c._count.projects}</span>
                      </td>
                      <td className="text-center">
                        <span className={`badge ${c.isActive ? 'bg-success' : 'bg-secondary'} bg-opacity-10 border`}
                          style={{ color: c.isActive ? 'var(--bs-success)' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                          {c.isActive ? '● 활성' : '○ 비활성'}
                        </span>
                      </td>
                      <td className="text-center">
                        <Button variant="outline-secondary" size="sm" className="btn-icon me-1" onClick={() => openEditModal(c)} title="수정">
                          <BsPencil size={13} />
                        </Button>
                        {c.isActive && (
                          <Button variant="outline-danger" size="sm" className="btn-icon" onClick={() => openDeactivateDialog(c.id, c.name)} title="비활성화">
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
                    <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>
                      {p}
                    </Pagination.Item>
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

      {/* Create/Edit Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editId ? '고객사 수정' : '고객사 등록'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formErrors._general && (
            <Alert variant="danger">{formErrors._general.join(', ')}</Alert>
          )}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>회사명 <span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                isInvalid={!!formErrors.name}
                placeholder="회사명을 입력해 주세요"
              />
              <Form.Control.Feedback type="invalid">{formErrors.name?.join(', ')}</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>사업자번호</Form.Label>
              <Form.Control
                value={formData.businessNumber}
                onChange={(e) => setFormData({ ...formData, businessNumber: e.target.value })}
                placeholder="000-00-00000"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>주소</Form.Label>
              <Form.Control
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>전화번호</Form.Label>
              <Form.Control
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="02-0000-0000"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" animation="border" /> : editId ? '수정' : '등록'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        show={showDeactivateDialog}
        title="고객사 비활성화"
        message={
          deactivateError
            ? deactivateError
            : (<><strong>{deactivateTarget?.name}</strong> 고객사를 비활성화하시겠습니까?<br /><small className="text-muted">소속 프로젝트 및 고객담당자 계정도 함께 비활성화됩니다.</small></>)
        }
        confirmLabel="비활성화"
        variant="danger"
        isLoading={deactivating}
        onConfirm={handleDeactivate}
        onCancel={() => { setShowDeactivateDialog(false); setDeactivateError(''); }}
      />
    </Container>
  );
}
