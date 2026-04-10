'use client';

// Design Ref: §10 — 고객사 상세 페이지
// Plan SC: FR-02 고객사 관리

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import { BsArrowLeft, BsBuilding, BsXCircle } from 'react-icons/bs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Company {
  id: string;
  name: string;
  businessNumber: string | null;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { users: number; projects: number };
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Deactivate dialog
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateResult, setDeactivateResult] = useState('');
  const [deactivateError, setDeactivateError] = useState('');

  const fetchCompany = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/companies/${id}`);
      const json = await res.json();
      if (json.success) {
        setCompany(json.data);
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCompany(); }, [fetchCompany]);

  const handleDeactivate = async () => {
    if (!company) return;
    setDeactivating(true);
    setDeactivateError('');
    try {
      const res = await fetch(`/api/companies/${id}/deactivate`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setShowDeactivateDialog(false);
        setDeactivateResult(`고객사가 비활성화되었습니다. (사용자 ${json.data.usersDeactivated}명 비활성화)`);
        fetchCompany();
      } else {
        setDeactivateError(json.error?.message || '비활성화에 실패했습니다.');
      }
    } catch {
      setDeactivateError('서버에 연결할 수 없습니다.');
    } finally {
      setDeactivating(false);
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

  if (error || !company) {
    return (
      <Container fluid>
        <Alert variant="danger" className="mt-3">{error || '고객사를 찾을 수 없습니다.'}</Alert>
        <Button variant="outline-secondary" size="sm" onClick={() => router.push('/master/companies')}>
          <BsArrowLeft className="me-1" size={14} /> 목록으로
        </Button>
      </Container>
    );
  }

  return (
    <Container fluid>
      {/* Page Header */}
      <div className="page-header">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Button
            variant="outline-secondary"
            size="sm"
            className="btn-icon"
            onClick={() => router.push('/master/companies')}
            title="목록으로"
          >
            <BsArrowLeft size={14} />
          </Button>
          <BsBuilding style={{ color: 'var(--brand-primary)', fontSize: '1.1rem', flexShrink: 0 }} />
          <h1 className="page-header-title mb-0" style={{ fontSize: '1.125rem' }}>
            {company.name}
          </h1>
          <span
            className={`badge ${company.isActive ? 'bg-success' : 'bg-secondary'} bg-opacity-10 border`}
            style={{ color: company.isActive ? 'var(--bs-success)' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}
          >
            {company.isActive ? '● 활성' : '○ 비활성'}
          </span>
        </div>
        {company.isActive && (
          <div className="page-header-actions">
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => { setDeactivateError(''); setShowDeactivateDialog(true); }}
            >
              <BsXCircle size={13} className="me-1" />
              비활성화
            </Button>
          </div>
        )}
      </div>

      {deactivateResult && (
        <Alert variant="success" dismissible onClose={() => setDeactivateResult('')}>{deactivateResult}</Alert>
      )}

      {/* Info Grid */}
      <div className="info-grid">
        <div>
          <div className="info-item-label">사업자번호</div>
          <div className="info-item-value">{company.businessNumber || '—'}</div>
        </div>
        <div>
          <div className="info-item-label">전화번호</div>
          <div className="info-item-value">{company.phone || '—'}</div>
        </div>
        <div>
          <div className="info-item-label">주소</div>
          <div className="info-item-value">{company.address || '—'}</div>
        </div>
        <div>
          <div className="info-item-label">사용자 수</div>
          <div className="info-item-value">{company._count.users}명</div>
        </div>
        <div>
          <div className="info-item-label">프로젝트 수</div>
          <div className="info-item-value">{company._count.projects}건</div>
        </div>
        <div>
          <div className="info-item-label">등록일</div>
          <div className="info-item-value">{new Date(company.createdAt).toLocaleDateString('ko-KR')}</div>
        </div>
        <div>
          <div className="info-item-label">최종 수정일</div>
          <div className="info-item-value">{new Date(company.updatedAt).toLocaleDateString('ko-KR')}</div>
        </div>
      </div>

      {/* Deactivate note */}
      {!company.isActive && (
        <div className="detail-section">
          <div className="detail-section-body">
            <p className="text-muted small mb-0">
              이 고객사는 현재 비활성화 상태입니다. 소속 사용자 및 프로젝트도 비활성화되어 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        show={showDeactivateDialog}
        title="고객사 비활성화"
        message={
          deactivateError
            ? deactivateError
            : (
              <>
                <strong>{company.name}</strong> 고객사와 소속 사용자를 모두 비활성화하시겠습니까?
                <br />
                <small className="text-muted">소속 프로젝트 및 고객담당자 계정도 함께 비활성화됩니다.</small>
              </>
            )
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
