'use client';

// Design Ref: §10 — 공휴일 관리 페이지
// Plan SC: FR-04 공휴일 관리

import { useState, useEffect, useCallback } from 'react';
import Container from 'react-bootstrap/Container';
import Table from 'react-bootstrap/Table';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { BsPlus, BsTrash, BsUpload, BsChevronLeft, BsChevronRight } from 'react-icons/bs';

interface Holiday {
  id: string;
  date: string;
  name: string;
  year: number;
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userType, setUserType] = useState('');

  // Add holiday modal
  const [showModal, setShowModal] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);

  // Bulk import modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState<{ totalCreated: number; totalSkipped: number; skipped: { date: string; reason: string }[] } | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) setUserType(json.data.type);
    } catch { /* ignore */ }
  }, []);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/holidays?year=${year}`);
      const json = await res.json();
      if (json.success) {
        setHolidays(json.data);
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

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

  const handleAdd = async () => {
    if (!formDate || !formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: formDate, name: formName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormDate('');
        setFormName('');
        fetchHolidays();
      } else {
        alert(json.error?.message || '추가에 실패했습니다.');
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string, date: string) => {
    if (!confirm(`${date} "${name}" 공휴일을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchHolidays();
      } else {
        alert(json.error?.message || '삭제에 실패했습니다.');
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setBulkSaving(true);
    setBulkResult(null);
    try {
      // Parse multi-line text: "YYYY-MM-DD 명칭"
      const lines = bulkText.trim().split('\n').filter(Boolean);
      const holidays = lines.map((line) => {
        const parts = line.trim().split(/\s+/);
        const date = parts[0];
        const name = parts.slice(1).join(' ');
        return { date, name };
      }).filter((h) => h.date && h.name);

      if (holidays.length === 0) {
        alert('올바른 형식으로 입력해 주세요.\n형식: YYYY-MM-DD 공휴일명');
        setBulkSaving(false);
        return;
      }

      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidays }),
      });
      const json = await res.json();
      if (json.success) {
        setBulkResult(json.data);
        fetchHolidays();
      } else {
        alert(json.error?.message || '��괄 등록에 실패했습니다.');
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    } finally {
      setBulkSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 fw-bold mb-0">공휴일 관리</h1>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" size="sm" onClick={() => setShowBulkModal(true)}>
            <BsUpload className="me-1" />
            일괄 등록
          </Button>
          <Button variant="primary" size="sm" onClick={() => { setFormDate(''); setFormName(''); setShowModal(true); }}>
            <BsPlus size={18} className="me-1" />
            공휴일 추가
          </Button>
        </div>
      </div>

      {/* Year Selector */}
      <div className="d-flex align-items-center gap-3 mb-3">
        <Button variant="outline-secondary" size="sm" onClick={() => setYear(year - 1)}>
          <BsChevronLeft />
        </Button>
        <h5 className="mb-0">{year}년</h5>
        <Button variant="outline-secondary" size="sm" onClick={() => setYear(year + 1)}>
          <BsChevronRight />
        </Button>
        <span className="text-muted ms-2">(총 {holidays.length}일)</span>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : holidays.length === 0 ? (
        <div className="text-center py-5 text-muted">{year}년에 등록된 공휴일이 없습니다.</div>
      ) : (
        <div className="table-responsive">
          <Table hover className="align-middle">
            <thead className="table-light">
              <tr>
                <th>날짜</th>
                <th>공휴일명</th>
                <th className="text-center" style={{ width: 80 }}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(h.date)}</td>
                  <td>{h.name}</td>
                  <td className="text-center">
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDelete(h.id, h.name, formatDate(h.date))}
                    >
                      <BsTrash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Add Holiday Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>공휴일 추가</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>날짜 <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>공휴일명 <span className="text-danger">*</span></Form.Label>
              <Form.Control
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: 설날"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>취소</Button>
          <Button variant="primary" onClick={handleAdd} disabled={saving}>
            {saving ? <Spinner size="sm" animation="border" /> : '추가'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal show={showBulkModal} onHide={() => { setShowBulkModal(false); setBulkResult(null); }} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>공휴일 일괄 등록</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="small">
            한 줄에 하나씩 <code>YYYY-MM-DD 공휴일명</code> 형식으로 입력해 주세요.
          </Alert>
          <Form.Control
            as="textarea"
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`2026-01-01 ��정\n2026-01-28 설날 연휴\n2026-01-29 설날\n2026-01-30 ��날 연휴\n2026-03-01 삼일절\n2026-05-05 어린이날`}
            className="font-monospace"
          />
          {bulkResult && (
            <Alert variant={bulkResult.totalCreated > 0 ? 'success' : 'warning'} className="mt-3 mb-0">
              <Row>
                <Col>등록: <strong>{bulkResult.totalCreated}건</strong></Col>
                <Col>건너뜀: <strong>{bulkResult.totalSkipped}건</strong></Col>
              </Row>
              {bulkResult.skipped.length > 0 && (
                <div className="mt-2 small">
                  {bulkResult.skipped.map((s, i) => (
                    <div key={i}>{s.date}: {s.reason}</div>
                  ))}
                </div>
              )}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowBulkModal(false); setBulkResult(null); }}>닫기</Button>
          <Button variant="primary" onClick={handleBulkImport} disabled={bulkSaving}>
            {bulkSaving ? <Spinner size="sm" animation="border" /> : '일괄 등록'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}
