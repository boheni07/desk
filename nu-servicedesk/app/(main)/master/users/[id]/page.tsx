'use client';

// Design Ref: §10 — 사용자 상세/수정 페이지
// Plan SC: FR-03 사용자 관리

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { BsArrowLeft, BsSave, BsKey, BsPeopleFill, BsClipboard, BsCheckCircle } from 'react-icons/bs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface UserDetail {
  id: string;
  loginId: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  isActive: boolean;
  mustChangePassword: boolean;
  loginAttempts: number;
  lockedUntil: string | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { projectMembers: number };
}

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  support: '지원담당',
  customer: '고객',
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#DC2626',
  support: 'var(--brand-primary)',
  customer: '#2F9E44',
};

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', type: '', isActive: true, companyId: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  // Password result modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalData, setPasswordModalData] = useState<{ title: string; password: string; sessions?: number } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // Reset password confirm dialog
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${id}`);
      const json = await res.json();
      if (json.success) {
        setUser(json.data);
        setFormData({
          name: json.data.name,
          email: json.data.email || '',
          phone: json.data.phone || '',
          type: json.data.type,
          isActive: json.data.isActive,
          companyId: json.data.companyId || '',
        });
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/companies?limit=100');
      const json = await res.json();
      if (json.success) {
        setCompanies(json.data.companies.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUser(); fetchCompanies(); }, [fetchUser, fetchCompanies]);

  const handleSave = async () => {
    setSaving(true);
    setFormErrors({});
    setSaveMsg('');
    try {
      const body: Record<string, unknown> = {
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        type: formData.type,
        isActive: formData.isActive,
        companyId: formData.type === 'customer' ? (formData.companyId || null) : null,
        departmentId: null,
      };
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setSaveMsg('저장되었습니다.');
        fetchUser();
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

  const handleResetPassword = async () => {
    setResetting(true);
    try {
      const res = await fetch(`/api/users/${id}/reset-password`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setShowResetDialog(false);
        setPasswordModalData({ title: '비밀번호 초기화 완료', password: json.data.newPassword, sessions: json.data.sessionsCleared });
        setPasswordCopied(false);
        setShowPasswordModal(true);
        fetchUser();
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

  if (loading) {
    return (
      <Container fluid className="text-center py-5">
        <Spinner animation="border" variant="primary" style={{ width: '1.5rem', height: '1.5rem' }} />
        <div className="mt-2 text-muted small">불러오는 중...</div>
      </Container>
    );
  }

  if (error || !user) {
    return (
      <Container fluid>
        <Alert variant="danger" className="mt-3">{error || '사용자를 찾을 수 없습니다.'}</Alert>
        <Button variant="outline-secondary" size="sm" onClick={() => router.push('/master/users')}>
          <BsArrowLeft size={14} className="me-1" /> 목록으로
        </Button>
      </Container>
    );
  }

  const roleColor = ROLE_COLORS[user.type] || 'var(--text-muted)';
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <Container fluid>
      {/* Page Header */}
      <div className="page-header">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Button
            variant="outline-secondary"
            size="sm"
            className="btn-icon"
            onClick={() => router.push('/master/users')}
            title="목록으로"
          >
            <BsArrowLeft size={14} />
          </Button>
          <BsPeopleFill style={{ color: 'var(--brand-primary)', fontSize: '1.1rem', flexShrink: 0 }} />
          <div>
            <h1 className="page-header-title mb-0" style={{ fontSize: '1.125rem' }}>
              {user.name}
              <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                ({user.loginId})
              </span>
            </h1>
          </div>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 600,
              borderRadius: '50rem', border: '1.5px solid',
              background: `${roleColor}14`,
              borderColor: `${roleColor}33`,
              color: roleColor,
            }}
          >
            {ROLE_LABELS[user.type] || user.type}
          </span>
          <span
            className={`badge ${user.isActive ? 'bg-success' : 'bg-secondary'} bg-opacity-10 border`}
            style={{ color: user.isActive ? 'var(--bs-success)' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}
          >
            {user.isActive ? '● 활성' : '○ 비활성'}
          </span>
        </div>
        <div className="page-header-actions">
          <Button variant="outline-warning" size="sm" onClick={() => setShowResetDialog(true)}>
            <BsKey size={13} className="me-1" />
            비밀번호 초기화
          </Button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="info-grid">
        <div>
          <div className="info-item-label">아이디</div>
          <div className="info-item-value" style={{ fontFamily: 'monospace' }}>{user.loginId}</div>
        </div>
        <div>
          <div className="info-item-label">고객사</div>
          <div className="info-item-value">{user.company?.name || '—'}</div>
        </div>
        <div>
          <div className="info-item-label">프로젝트 배정</div>
          <div className="info-item-value">{user._count.projectMembers}건</div>
        </div>
        <div>
          <div className="info-item-label">로그인 시도</div>
          <div className="info-item-value">{user.loginAttempts}회</div>
        </div>
        <div>
          <div className="info-item-label">비밀번호 변경 필요</div>
          <div className="info-item-value">
            {user.mustChangePassword
              ? <span style={{ color: '#D97706', fontWeight: 600 }}>예</span>
              : <span style={{ color: 'var(--text-muted)' }}>아니오</span>}
          </div>
        </div>
        <div>
          <div className="info-item-label">계정 잠금</div>
          <div className="info-item-value">
            {isLocked
              ? <span style={{ color: '#DC2626', fontWeight: 600 }}>잠금 (~{new Date(user.lockedUntil!).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})</span>
              : <span style={{ color: 'var(--text-muted)' }}>없음</span>}
          </div>
        </div>
        <div>
          <div className="info-item-label">등록일</div>
          <div className="info-item-value">{new Date(user.createdAt).toLocaleDateString('ko-KR')}</div>
        </div>
        <div>
          <div className="info-item-label">최종 수정일</div>
          <div className="info-item-value">{new Date(user.updatedAt).toLocaleDateString('ko-KR')}</div>
        </div>
      </div>

      {/* Edit Form Section */}
      <div className="detail-section">
        <div className="detail-section-header">
          <span className="detail-section-title">정보 수정</span>
        </div>
        <div className="detail-section-body">
          {formErrors._general && <Alert variant="danger" className="mb-3">{formErrors._general.join(', ')}</Alert>}
          {saveMsg && <Alert variant="success" className="mb-3" dismissible onClose={() => setSaveMsg('')}>{saveMsg}</Alert>}
          <Form>
            <Row>
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
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>역할</Form.Label>
                  <Form.Select
                    value={formData.type}
                    onChange={(e) => {
                      const t = e.target.value;
                      setFormData({ ...formData, type: t, companyId: t === 'customer' ? formData.companyId : '' });
                    }}
                  >
                    <option value="admin">관리자</option>
                    <option value="support">지원담당</option>
                    <option value="customer">고객</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>상태</Form.Label>
                  <Form.Select
                    value={String(formData.isActive)}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  >
                    <option value="true">활성</option>
                    <option value="false">비활성</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {formData.type === 'customer' && (
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
            )}

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

            <div className="text-end">
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" animation="border" /> : <><BsSave size={13} className="me-1" />저장</>}
              </Button>
            </div>
          </Form>
        </div>
      </div>

      {/* Reset Password Confirm Dialog */}
      <ConfirmDialog
        show={showResetDialog}
        title="비밀번호 초기화"
        message={(<><strong>{user.loginId}</strong> 사용자의 비밀번호를 초기화하시겠습니까?<br /><small className="text-muted">기존 로그인 세션이 모두 폐기됩니다.</small></>)}
        confirmLabel="초기화"
        variant="warning"
        isLoading={resetting}
        onConfirm={handleResetPassword}
        onCancel={() => setShowResetDialog(false)}
      />

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
          <div className="d-flex align-items-center gap-2 p-3 rounded" style={{ background: '#F8F9FA', border: '1px solid var(--border-subtle)' }}>
            <code className="flex-grow-1 fs-5 user-select-all">{passwordModalData?.password}</code>
            <Button
              variant={passwordCopied ? 'success' : 'outline-secondary'}
              size="sm"
              className="btn-icon"
              onClick={() => {
                if (passwordModalData?.password) {
                  navigator.clipboard.writeText(passwordModalData.password);
                  setPasswordCopied(true);
                  setTimeout(() => setPasswordCopied(false), 2000);
                }
              }}
              title="클립보드에 복사"
            >
              {passwordCopied ? <BsCheckCircle size={14} /> : <BsClipboard size={14} />}
            </Button>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setShowPasswordModal(false)}>확인</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
