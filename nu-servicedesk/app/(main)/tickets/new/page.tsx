'use client';

// Design Ref: §10 — 티켓 등록 페이지
// Plan SC: FR-09 채번, FR-10 티켓 등록
// 고객: 등록방법 자동=온라인, 프로젝트 자동선택(1개) / 선택(2개+)
// 날짜 기본값보다 앞이면 우선순위 자동=긴급 + 긴급사유 필수

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { BsExclamationTriangleFill, BsPaperclip, BsX } from 'react-icons/bs';

interface ProjectOption {
  id: string;
  name: string;
  company: { name: string };
}

interface CategoryOption {
  id: string;
  name: string;
}

interface SessionUser {
  id: string;
  name: string;
  type: string; // admin | support | customer
  companyId: string | null;
}

// today + n 달력일 → YYYY-MM-DD
function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

const DEFAULT_DAYS = 5; // 처리희망일 기본값 (+5일)
const TODAY = new Date().toISOString().split('T')[0];

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: '낮음' },
  { value: 'NORMAL', label: '보통' },
  { value: 'HIGH', label: '높음' },
  { value: 'URGENT', label: '긴급' },
];

// 고객: 온라인(DIRECT) 고정 / 지원담당·관리자: 전화·이메일·기타 중 선택
const STAFF_METHOD_OPTIONS = [
  { value: 'PHONE', label: '전화' },
  { value: 'EMAIL', label: '이메일' },
  { value: 'OTHER', label: '기타' },
];

export default function NewTicketPage() {
  const router = useRouter();

  // ── 세션 & 참조 데이터 ──────────────────────
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  // ── 폼 상태 ──────────────────────────────────
  const defaultDate = addDays(DEFAULT_DAYS);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [desiredDate, setDesiredDate] = useState(defaultDate);
  const [urgencyReason, setUrgencyReason] = useState('');
  // 고객: DIRECT 고정, 지원담당·관리자: PHONE 기본
  const [registrationMethod, setRegistrationMethod] = useState('PHONE');

  // 날짜 기반 자동 긴급 여부 (날짜 변경으로 강제된 경우)
  const wasAutoUrgent = useRef(false);

  // 첨부파일
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');

  const isCustomer = sessionUser?.type === 'customer';

  // 기본값보다 이른 날짜면 긴급 자동 설정
  const isEarlyDate = !!desiredDate && desiredDate < defaultDate;

  // ── 초기 데이터 로드 ──────────────────────────
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) setSessionUser(json.data);
      else setError('세션을 불러올 수 없습니다.');
    } catch {
      setError('서버에 연결할 수 없습니다.');
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?limit=100&isActive=true&myProjects=true');
      const json = await res.json();
      if (json.success) setProjects(json.data.projects);
    } catch {
      setError('프로젝트를 불러올 수 없습니다.');
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories?limit=100');
      const json = await res.json();
      if (json.success) {
        const list = Array.isArray(json.data) ? json.data : (json.data.categories ?? []);
        setCategories(
          list.filter((c: CategoryOption & { isActive: boolean }) => c.isActive),
        );
      }
    } catch {
      setError('카테고리를 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchSession(), fetchProjects(), fetchCategories()]).finally(() =>
      setLoading(false),
    );
  }, [fetchSession, fetchProjects, fetchCategories]);

  // 프로젝트 1개면 자동 선택 (역할 무관)
  useEffect(() => {
    if (projects.length === 1 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  // 고객: 등록방법 항상 DIRECT(온라인)
  useEffect(() => {
    if (isCustomer) setRegistrationMethod('DIRECT');
  }, [isCustomer]);

  // 날짜 변경 → 긴급 자동 전환
  useEffect(() => {
    if (!desiredDate) return;
    if (desiredDate < defaultDate) {
      // 기본값보다 이른 날짜 → 긴급 강제
      wasAutoUrgent.current = true;
      setPriority('URGENT');
    } else if (wasAutoUrgent.current) {
      // 날짜를 다시 기본값 이후로 바꾸면 보통으로 복원
      wasAutoUrgent.current = false;
      setPriority('NORMAL');
      setUrgencyReason('');
    }
  }, [desiredDate, defaultDate]);

  // ── 파일 선택 핸들러 ───────────────────────────
  const ALLOWED_EXT = ['jpg','jpeg','png','gif','webp','pdf','doc','docx','xls','xlsx','ppt','pptx','txt'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_EXT.includes(ext)) {
        errors.push(`${file.name}: 허용되지 않는 파일 형식입니다.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: 파일 크기가 10MB를 초과합니다.`);
        continue;
      }
      valid.push(file);
    }

    if (errors.length > 0) setError(errors.join('\n'));
    setAttachments((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── 제출 ──────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setError('');

    // 클라이언트 검증: 긴급 사유
    if (isEarlyDate && !urgencyReason.trim()) {
      setFormErrors({ urgencyReason: ['기본 처리 기한보다 이른 날짜를 선택한 경우 긴급 사유를 입력해 주세요.'] });
      return;
    }

    setSaving(true);
    setUploadProgress('');
    try {
      // 1단계: 티켓 생성
      const body: Record<string, unknown> = {
        title,
        content,
        projectId,
        categoryId,
        priority,
        registrationMethod,
      };
      if (desiredDate) body.desiredDate = desiredDate;
      if (isEarlyDate && urgencyReason.trim()) body.urgencyReason = urgencyReason.trim();

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!json.success) {
        if (json.error?.fieldErrors) setFormErrors(json.error.fieldErrors);
        else setError(json.error?.message || '티켓 등록에 실패했습니다.');
        return;
      }

      const ticketId: string = json.data.id;

      // 2단계: 첨부파일 업로드
      if (attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          const file = attachments[i];
          setUploadProgress(`파일 업로드 중... (${i + 1}/${attachments.length})`);

          // Presign URL 요청
          const presignRes = await fetch('/api/attachments/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId,
              filename: file.name,
              contentType: file.type || 'application/octet-stream',
              fileSize: file.size,
            }),
          });
          const presignJson = await presignRes.json();
          if (!presignJson.success) {
            setError(`"${file.name}" 업로드 준비 실패: ${presignJson.error?.message || '알 수 없는 오류'}`);
            router.push(`/tickets/${ticketId}`);
            return;
          }

          // R2에 직접 PUT 업로드
          const uploadRes = await fetch(presignJson.data.presignedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          if (!uploadRes.ok) {
            setError(`"${file.name}" 업로드 실패`);
            router.push(`/tickets/${ticketId}`);
            return;
          }
        }
      }

      router.push(`/tickets/${ticketId}`);
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  // ── 로딩 ──────────────────────────────────────
  if (loading) {
    return (
      <Container fluid>
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      </Container>
    );
  }

  // ── 렌더 ──────────────────────────────────────
  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 fw-bold mb-0">티켓 등록</h1>
        <Button variant="outline-secondary" size="sm" onClick={() => router.push('/tickets')}>
          목록으로
        </Button>
      </div>

      <Card>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={handleSubmit}>

            {/* ── 행 1: 프로젝트 / 카테고리 / 등록방법 ── */}
            <Row>
              {/* 프로젝트 */}
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    프로젝트 <span className="text-danger">*</span>
                  </Form.Label>
                  {isCustomer && projects.length === 1 ? (
                    <div className="form-control bg-light text-muted">
                      {projects[0].name}
                      <span className="ms-2 text-muted small">({projects[0].company.name})</span>
                    </div>
                  ) : (
                    <Form.Select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      isInvalid={!!formErrors.projectId}
                    >
                      <option value="">프로젝트를 선택해 주세요</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.company.name})
                        </option>
                      ))}
                    </Form.Select>
                  )}
                  <Form.Control.Feedback type="invalid">
                    {formErrors.projectId?.join(', ')}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>

              {/* 카테고리 */}
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    카테고리 <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    isInvalid={!!formErrors.categoryId}
                  >
                    <option value="">카테고리 선택</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">
                    {formErrors.categoryId?.join(', ')}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>

              {/* 등록방법 */}
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>등록방법</Form.Label>
                  {isCustomer ? (
                    <div className="form-control bg-light text-muted">온라인</div>
                  ) : (
                    <Form.Select
                      value={registrationMethod}
                      onChange={(e) => setRegistrationMethod(e.target.value)}
                    >
                      {STAFF_METHOD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Form.Select>
                  )}
                </Form.Group>
              </Col>
            </Row>

            {/* ── 제목 ── */}
            <Form.Group className="mb-3">
              <Form.Label>제목 <span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                isInvalid={!!formErrors.title}
                placeholder="티켓 제목을 입력해 주세요"
                maxLength={200}
              />
              <Form.Control.Feedback type="invalid">
                {formErrors.title?.join(', ')}
              </Form.Control.Feedback>
            </Form.Group>

            {/* ── 내용 ── */}
            <Form.Group className="mb-3">
              <Form.Label>내용 <span className="text-danger">*</span></Form.Label>
              <Form.Control
                as="textarea"
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                isInvalid={!!formErrors.content}
                placeholder="문제 상황이나 요청 내용을 상세히 입력해 주세요"
              />
              <Form.Control.Feedback type="invalid">
                {formErrors.content?.join(', ')}
              </Form.Control.Feedback>
            </Form.Group>

            {/* ── 파일 첨부 ── */}
            <Form.Group className="mb-3">
              <Form.Label>파일 첨부</Form.Label>
              <div>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="me-2"
                >
                  <BsPaperclip className="me-1" />파일 선택
                </Button>
                <span className="text-muted small">
                  최대 10MB · 허용: jpg, png, pdf, doc, xls, ppt, txt 등
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
              {attachments.length > 0 && (
                <ul className="list-unstyled mt-2 mb-0">
                  {attachments.map((file, idx) => (
                    <li key={idx} className="d-flex align-items-center gap-2 py-1 border-bottom">
                      <BsPaperclip className="text-muted flex-shrink-0" />
                      <span className="small text-truncate flex-grow-1">{file.name}</span>
                      <span className="small text-muted text-nowrap">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        className="text-danger p-0 flex-shrink-0"
                        onClick={() => removeAttachment(idx)}
                      >
                        <BsX size={18} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Form.Group>

            {/* ── 행 3: 우선순위 / 처리희망일 / 긴급사유 ── */}
            <Row className="align-items-start">
              {/* 우선순위 */}
              <Col md={2}>
                <Form.Group className="mb-3">
                  <Form.Label>우선순위</Form.Label>
                  <Form.Select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    disabled={isEarlyDate}
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Form.Select>
                  {isEarlyDate && (
                    <Form.Text className="text-danger">
                      <BsExclamationTriangleFill className="me-1" />긴급 자동 설정
                    </Form.Text>
                  )}
                </Form.Group>
              </Col>

              {/* 처리희망일 */}
              <Col md={2}>
                <Form.Group className="mb-3">
                  <Form.Label>처리희망일</Form.Label>
                  <Form.Control
                    type="date"
                    value={desiredDate}
                    onChange={(e) => setDesiredDate(e.target.value)}
                    min={TODAY}
                    className={isEarlyDate ? 'border-danger' : ''}
                  />
                  {!isEarlyDate && (
                    <Form.Text className="text-muted">미선택 시 오늘 +5일 자동 적용</Form.Text>
                  )}
                </Form.Group>
              </Col>

              {/* 긴급 사유 (날짜가 기본값보다 이른 경우에만 표시) */}
              {isEarlyDate && (
                <Col md={8}>
                  <Form.Group className="mb-3">
                    <Form.Label>
                      긴급 사유 <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      value={urgencyReason}
                      onChange={(e) => setUrgencyReason(e.target.value)}
                      isInvalid={!!formErrors.urgencyReason}
                      placeholder="기본 처리 기한보다 이른 날짜를 요청하는 이유를 입력해 주세요"
                      maxLength={500}
                    />
                    <Form.Control.Feedback type="invalid">
                      {formErrors.urgencyReason?.join(', ')}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
              )}
            </Row>

            {/* ── 버튼 ── */}
            <div className="d-flex justify-content-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => router.push('/tickets')}>
                취소
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Spinner size="sm" animation="border" className="me-1" />
                    {uploadProgress || '등록 중...'}
                  </>
                ) : (
                  '티켓 등록'
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}
