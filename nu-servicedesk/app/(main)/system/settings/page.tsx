'use client';

// Design Ref: §10 — 시스템 설정 페이지 (감독자 설정)
// Plan SC: 시스템 설정 관리

import { useState, useEffect, useCallback } from 'react';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Badge from 'react-bootstrap/Badge';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Table from 'react-bootstrap/Table';
import { BsSave, BsX } from 'react-icons/bs';

interface User {
  id: string;
  loginId: string;
  name: string;
  type: string;
}

export default function SystemSettingsPage() {
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const [supervisorUsers, setSupervisorUsers] = useState<User[]>([]);
  const [candidateUsers, setCandidateUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [userType, setUserType] = useState('');

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) setUserType(json.data.type);
    } catch { /* ignore */ }
  }, []);

  const fetchSupervisors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings/supervisor');
      const json = await res.json();
      if (json.success) {
        setSupervisorIds(json.data.userIds);
        setSupervisorUsers(json.data.users);
      } else {
        setError(json.error?.message || '설정을 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch('/api/users?role=admin,support&isActive=true&limit=100');
      const json = await res.json();
      if (json.success) {
        setCandidateUsers(json.data.users.map((u: User) => ({ id: u.id, loginId: u.loginId, name: u.name, type: u.type })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { fetchSupervisors(); fetchCandidates(); }, [fetchSupervisors, fetchCandidates]);

  if (!userType) {
    return (
      <Container fluid className="text-center py-5">
        <Spinner animation="border" variant="primary" style={{ width: '1.5rem', height: '1.5rem' }} />
      </Container>
    );
  }

  if (userType !== 'admin') {
    return (
      <Container fluid>
        <Alert variant="danger" className="mt-3">
          <Alert.Heading>접근 권한이 없습니다</Alert.Heading>
          <p>관리자만 접근할 수 있는 페이지입니다.</p>
        </Alert>
      </Container>
    );
  }

  const addSupervisor = () => {
    if (!selectedUserId || supervisorIds.includes(selectedUserId)) return;
    setSupervisorIds([...supervisorIds, selectedUserId]);
    const user = candidateUsers.find((u) => u.id === selectedUserId);
    if (user) setSupervisorUsers([...supervisorUsers, user]);
    setSelectedUserId('');
  };

  const removeSupervisor = (userId: string) => {
    setSupervisorIds(supervisorIds.filter((id) => id !== userId));
    setSupervisorUsers(supervisorUsers.filter((u) => u.id !== userId));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaveMsg('');
    try {
      const res = await fetch('/api/settings/supervisor', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: supervisorIds }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveMsg('감독자 설정이 저장되었습니다.');
      } else {
        setError(json.error?.message || '저장에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  };

  const ROLE_LABELS: Record<string, string> = { admin: '관리자', support: '지원담당' };

  // Filter out already-selected users from candidates
  const availableCandidates = candidateUsers.filter((u) => !supervisorIds.includes(u.id));

  return (
    <Container fluid>
      <h1 className="h4 fw-bold mb-4">시스템 설정</h1>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : (
        <Card className="shadow-sm">
          <Card.Header className="bg-white">
            <h5 className="mb-0">감독자 설정</h5>
            <small className="text-muted">
              연기요청 자동승인, 에스컬레이션 알림 등의 수신자를 설정합니다.
            </small>
          </Card.Header>
          <Card.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            {saveMsg && <Alert variant="success">{saveMsg}</Alert>}

            {/* Add supervisor */}
            <div className="d-flex gap-2 mb-3">
              <Form.Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ maxWidth: 400 }}
              >
                <option value="">사용자 선택...</option>
                {availableCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.loginId}) - {ROLE_LABELS[u.type] || u.type}
                  </option>
                ))}
              </Form.Select>
              <Button variant="outline-primary" onClick={addSupervisor} disabled={!selectedUserId}>
                추가
              </Button>
            </div>

            {/* Supervisor list */}
            {supervisorUsers.length === 0 ? (
              <div className="text-muted py-3">설정된 감독자가 없습니다.</div>
            ) : (
              <Table hover className="align-middle mb-3">
                <thead className="table-light">
                  <tr>
                    <th>이름</th>
                    <th>아이디</th>
                    <th className="text-center">역할</th>
                    <th className="text-center" style={{ width: 80 }}>제거</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisorUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="fw-semibold">{u.name}</td>
                      <td className="text-muted">{u.loginId}</td>
                      <td className="text-center">
                        <Badge bg={u.type === 'admin' ? 'danger' : 'primary'}>
                          {ROLE_LABELS[u.type] || u.type}
                        </Badge>
                      </td>
                      <td className="text-center">
                        <Button variant="outline-danger" size="sm" onClick={() => removeSupervisor(u.id)}>
                          <BsX size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            <div className="text-end">
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" animation="border" /> : <><BsSave className="me-1" /> 저장</>}
              </Button>
            </div>
          </Card.Body>
        </Card>
      )}
    </Container>
  );
}
