'use client';

// Design Ref: §I — Login Page (Bootstrap 5 + React-Bootstrap)
// Plan SC: SC-08 RBAC

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const passwordChanged = searchParams.get('passwordChanged') === '1';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error?.message || '로그인에 실패했습니다.');
        if (result.error?.fieldErrors) {
          setFieldErrors(result.error.fieldErrors);
        }
        return;
      }

      // Check if password change is required
      if (result.data?.mustChangePassword) {
        router.replace('/change-password');
        return;
      }

      // Successful login — redirect to dashboard (replace to prevent back-to-login)
      router.replace('/dashboard');
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="text-center mb-4">
        <h1 className="h3 fw-bold text-primary">nu-ServiceDesk</h1>
        <p className="text-muted">서비스데스크에 로그인하세요</p>
      </div>

      <Card className="shadow-sm border-0">
        <Card.Body className="p-4">
          {passwordChanged && (
            <Alert variant="success">
              비밀번호가 성공적으로 변경되었습니다. 새 비밀번호로 로그인해 주세요.
            </Alert>
          )}

          {error && (
            <Alert variant="danger" dismissible onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit} noValidate>
            <Form.Group className="mb-3" controlId="loginId">
              <Form.Label>아이디</Form.Label>
              <Form.Control
                type="text"
                placeholder="아이디를 입력하세요"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                isInvalid={!!fieldErrors.loginId}
                autoComplete="username"
                autoFocus
                required
              />
              {fieldErrors.loginId?.map((msg, i) => (
                <Form.Control.Feedback key={i} type="invalid">
                  {msg}
                </Form.Control.Feedback>
              ))}
            </Form.Group>

            <Form.Group className="mb-4" controlId="password">
              <Form.Label>비밀번호</Form.Label>
              <Form.Control
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                isInvalid={!!fieldErrors.password}
                autoComplete="current-password"
                required
              />
              {fieldErrors.password?.map((msg, i) => (
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
                disabled={isLoading || !loginId || !password}
                style={{ minWidth: 120 }}
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
                    로그인 중...
                  </>
                ) : (
                  '로그인'
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      <p className="text-center text-muted mt-3 small">
        계정 관련 문의는 관리자에게 연락해 주세요.
      </p>
    </>
  );
}
