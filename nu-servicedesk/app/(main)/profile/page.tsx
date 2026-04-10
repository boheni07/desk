'use client';

// Design Ref: §4 — 내 정보 페이지 (Profile + Change Password link)
// Plan SC: FR-30 프로필 관리

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Badge from 'react-bootstrap/Badge';
import {
  BsPersonCircle,
  BsShieldLock,
  BsCheckCircleFill,
} from 'react-icons/bs';

const TYPE_LABELS: Record<string, string> = {
  admin: '관리자',
  support: '지원담당자',
  customer: '고객담당자',
};

const TYPE_VARIANTS: Record<string, string> = {
  admin: 'danger',
  support: 'primary',
  customer: 'success',
};

interface ProfileData {
  id: string;
  loginId: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  companyId: string | null;
  company: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  createdAt: string;
}

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/profile');
        const json = await res.json();
        if (json.success) {
          setProfile(json.data);
          setName(json.data.name ?? '');
          setEmail(json.data.email ?? '');
          setPhone(json.data.phone ?? '');
        } else {
          if (res.status === 401) {
            router.replace('/login');
          } else {
            setError(json.error?.message ?? '프로필을 불러올 수 없습니다.');
          }
        }
      } catch {
        setError('서버에 연결할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');
    setFieldErrors({});

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          email: email || null,
          phone: phone || null,
        }),
      });
      const json = await res.json();

      if (json.success) {
        setProfile((prev) => prev ? { ...prev, ...json.data } : prev);
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 3000);
      } else {
        if (json.error?.fieldErrors) {
          setFieldErrors(json.error.fieldErrors);
        } else {
          setSaveError(json.error?.message ?? '저장에 실패했습니다.');
        }
      }
    } catch {
      setSaveError('서버에 연결할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Container fluid>
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container fluid>
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  if (!profile) return null;

  return (
    <Container fluid>
      <div className="d-flex align-items-center mb-4 gap-3">
        <BsPersonCircle size={36} className="text-primary" />
        <div>
          <h1 className="h4 fw-bold mb-0">내 정보</h1>
          <p className="text-muted mb-0 small">프로필 정보를 확인하고 수정할 수 있습니다.</p>
        </div>
      </div>

      <Row className="g-4">
        {/* Profile form */}
        <Col lg={8}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom">
              <h6 className="mb-0 fw-semibold">기본 정보</h6>
            </Card.Header>
            <Card.Body className="p-4">
              {saveError && (
                <Alert variant="danger" dismissible onClose={() => setSaveError('')}>
                  {saveError}
                </Alert>
              )}
              {saved && (
                <Alert variant="success" className="d-flex align-items-center gap-2">
                  <BsCheckCircleFill />
                  프로필이 저장되었습니다.
                </Alert>
              )}

              <Form onSubmit={handleSave}>
                <Row className="g-3">
                  {/* Read-only fields */}
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="text-muted small">아이디</Form.Label>
                      <Form.Control
                        type="text"
                        value={profile.loginId}
                        readOnly
                        className="bg-light"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="text-muted small">권한</Form.Label>
                      <div className="form-control bg-light d-flex align-items-center">
                        <Badge bg={TYPE_VARIANTS[profile.type] ?? 'secondary'}>
                          {TYPE_LABELS[profile.type] ?? profile.type}
                        </Badge>
                      </div>
                    </Form.Group>
                  </Col>

                  {profile.company && (
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="text-muted small">소속 고객사</Form.Label>
                        <Form.Control
                          type="text"
                          value={profile.company.name}
                          readOnly
                          className="bg-light"
                        />
                      </Form.Group>
                    </Col>
                  )}
                  {profile.department && (
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="text-muted small">부서</Form.Label>
                        <Form.Control
                          type="text"
                          value={profile.department.name}
                          readOnly
                          className="bg-light"
                        />
                      </Form.Group>
                    </Col>
                  )}

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="text-muted small">가입일</Form.Label>
                      <Form.Control
                        type="text"
                        value={new Date(profile.createdAt).toLocaleDateString('ko-KR')}
                        readOnly
                        className="bg-light"
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12}><hr className="my-1" /></Col>

                  {/* Editable fields */}
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>
                        이름 <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        isInvalid={!!fieldErrors.name}
                        placeholder="이름을 입력해 주세요"
                        maxLength={50}
                      />
                      <Form.Control.Feedback type="invalid">
                        {fieldErrors.name?.join(', ')}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>이메일</Form.Label>
                      <Form.Control
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        isInvalid={!!fieldErrors.email}
                        placeholder="이메일 주소 (선택)"
                      />
                      <Form.Control.Feedback type="invalid">
                        {fieldErrors.email?.join(', ')}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>전화번호</Form.Label>
                      <Form.Control
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        isInvalid={!!fieldErrors.phone}
                        placeholder="전화번호 (선택)"
                      />
                      <Form.Control.Feedback type="invalid">
                        {fieldErrors.phone?.join(', ')}
                      </Form.Control.Feedback>
                      <Form.Text className="text-muted">예: 010-1234-5678</Form.Text>
                    </Form.Group>
                  </Col>
                </Row>

                <div className="d-flex justify-content-end mt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={saving}
                    style={{ minWidth: 100 }}
                  >
                    {saving ? (
                      <><Spinner size="sm" animation="border" className="me-1" />저장 중...</>
                    ) : (
                      '저장'
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* Side panel: security */}
        <Col lg={4}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white border-bottom">
              <h6 className="mb-0 fw-semibold">보안 설정</h6>
            </Card.Header>
            <Card.Body className="p-4">
              <div className="d-flex align-items-start gap-3">
                <BsShieldLock size={28} className="text-warning mt-1 flex-shrink-0" />
                <div>
                  <div className="fw-semibold mb-1">비밀번호 변경</div>
                  <p className="text-muted small mb-3">
                    정기적으로 비밀번호를 변경하면 계정 보안을 강화할 수 있습니다.
                  </p>
                  <Button
                    variant="outline-warning"
                    size="sm"
                    onClick={() => router.push('/change-password')}
                  >
                    비밀번호 변경
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
