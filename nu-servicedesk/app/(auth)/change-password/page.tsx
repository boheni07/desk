'use client';

// Design Ref: §I — Change Password Page (forced initial password change)
// Plan SC: OWASP 비밀번호 변경 + 전체 세션 폐기

import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Spinner from 'react-bootstrap/Spinner';

// Password strength calculation
function getPasswordStrength(password: string): {
  score: number;
  label: string;
  variant: string;
} {
  let score = 0;
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 10;
  if (/[A-Z]/.test(password)) score += 20;
  if (/[a-z]/.test(password)) score += 20;
  if (/[0-9]/.test(password)) score += 15;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) score += 15;

  if (score < 40) return { score, label: '약함', variant: 'danger' };
  if (score < 60) return { score, label: '보통', variant: 'warning' };
  if (score < 80) return { score, label: '강함', variant: 'info' };
  return { score, label: '매우 강함', variant: 'success' };
}

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  // Fetch from session: true = initial forced change, false = voluntary change
  const [isInitialChange, setIsInitialChange] = useState<boolean | null>(null);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  // Determine if this is a forced initial password change
  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setIsInitialChange(result.data.mustChangePassword === true);
        } else {
          // Not authenticated — redirect to login
          router.replace('/login');
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation
    if (newPassword !== confirmPassword) {
      setFieldErrors({
        confirmPassword: ['새 비밀번호와 확인 비밀번호가 일치하지 않습니다.'],
      });
      return;
    }

    setIsLoading(true);

    try {
      const body: Record<string, string> = {
        newPassword,
        confirmPassword,
      };

      if (!isInitialChange && currentPassword) {
        body.currentPassword = currentPassword;
      }

      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error?.message || '비밀번호 변경에 실패했습니다.');
        if (result.error?.fieldErrors) {
          setFieldErrors(result.error.fieldErrors);
        }
        return;
      }

      // Password changed successfully — all sessions deleted, must re-login
      if (result.data?.requireRelogin) {
        router.push('/login?passwordChanged=1');
      }
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }

  // Loading state while fetching session
  if (isInitialChange === null) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 200 }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">로딩 중...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-4">
        <h1 className="h3 fw-bold text-primary">nu-ServiceDesk</h1>
        <p className="text-muted">
          {isInitialChange
            ? '초기 비밀번호를 변경해야 합니다.'
            : '비밀번호를 변경합니다.'}
        </p>
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-4">
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {isInitialChange && (
            <Alert variant="info" className="small">
              보안을 위해 초기 비밀번호를 변경해 주세요.
              대문자, 소문자, 숫자, 특수문자를 포함한 8자 이상이어야 합니다.
            </Alert>
          )}

          <Form onSubmit={handleSubmit} noValidate>
            {!isInitialChange && (
              <Form.Group className="mb-3" controlId="currentPassword">
                <Form.Label>현재 비밀번호</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="현재 비밀번호를 입력하세요"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  isInvalid={!!fieldErrors.currentPassword}
                  autoComplete="current-password"
                  required
                />
                {fieldErrors.currentPassword?.map((msg, i) => (
                  <Form.Control.Feedback key={i} type="invalid">
                    {msg}
                  </Form.Control.Feedback>
                ))}
              </Form.Group>
            )}

            <Form.Group className="mb-3" controlId="newPassword">
              <Form.Label>새 비밀번호</Form.Label>
              <Form.Control
                type="password"
                placeholder="새 비밀번호를 입력하세요"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                isInvalid={!!fieldErrors.newPassword}
                autoComplete="new-password"
                required
              />
              {fieldErrors.newPassword?.map((msg, i) => (
                <Form.Control.Feedback key={i} type="invalid">
                  {msg}
                </Form.Control.Feedback>
              ))}
              {newPassword && (
                <div className="mt-2">
                  <ProgressBar
                    now={strength.score}
                    variant={strength.variant}
                    aria-valuenow={strength.score}
                    aria-valuetext={strength.label}
                    aria-label="비밀번호 강도"
                    style={{ height: '6px' }}
                  />
                  <small className={`text-${strength.variant} mt-1 d-block`}>
                    비밀번호 강도: {strength.label}
                  </small>
                </div>
              )}
            </Form.Group>

            <Form.Group className="mb-4" controlId="confirmPassword">
              <Form.Label>비밀번호 확인</Form.Label>
              <Form.Control
                type="password"
                placeholder="새 비밀번호를 다시 입력하세요"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                isInvalid={!!fieldErrors.confirmPassword}
                autoComplete="new-password"
                required
              />
              {fieldErrors.confirmPassword?.map((msg, i) => (
                <Form.Control.Feedback key={i} type="invalid">
                  {msg}
                </Form.Control.Feedback>
              ))}
            </Form.Group>

            <div className="d-grid">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isLoading || !newPassword || !confirmPassword || (!isInitialChange && !currentPassword)}
              >
                {isLoading ? (
                  <>
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      aria-hidden="true"
                      className="me-2"
                    />
                    변경 중...
                  </>
                ) : (
                  '비밀번호 변경'
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </>
  );
}
