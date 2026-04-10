'use client';

// Design Ref: §10 — 카테고리 관리 페이지 (인라인 편집)
// Plan SC: FR-05 카테고리 관리

import { useState, useEffect, useCallback } from 'react';
import Container from 'react-bootstrap/Container';
import Table from 'react-bootstrap/Table';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Badge from 'react-bootstrap/Badge';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import InputGroup from 'react-bootstrap/InputGroup';
import { BsPlus, BsCheck, BsX, BsPencil, BsTrash } from 'react-icons/bs';

interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  _count: { tickets: number };
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userType, setUserType] = useState('');

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', sortOrder: 0, isActive: true });

  // New category
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json.success) setUserType(json.data.type);
    } catch { /* ignore */ }
  }, []);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/categories');
      const json = await res.json();
      if (json.success) {
        setCategories(json.data);
      } else {
        setError(json.error?.message || '데이터를 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

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

  const startEdit = (c: Category) => {
    setEditId(c.id);
    setEditData({ name: c.name, sortOrder: c.sortOrder, isActive: c.isActive });
  };

  const cancelEdit = () => {
    setEditId(null);
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      const json = await res.json();
      if (json.success) {
        setEditId(null);
        fetchCategories();
      } else {
        alert(json.error?.message || '저장에 실패했습니다.');
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setNewName('');
        setShowNew(false);
        fetchCategories();
      } else {
        alert(json.error?.message || '생성에 실패했습니다.');
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 카테고리를 비활성화하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchCategories();
      } else {
        alert(json.error?.message || '삭제에 실패했습니다.');
      }
    } catch {
      alert('서버에 연결할 수 없습니다.');
    }
  };

  return (
    <Container fluid>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 fw-bold mb-0">카테고리 관리</h1>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)} disabled={showNew}>
          <BsPlus size={18} className="me-1" />
          카테고리 추가
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : (
        <div className="table-responsive">
          <Table hover className="align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ width: 80 }}>정렬</th>
                <th>카테고리명</th>
                <th className="text-center" style={{ width: 100 }}>티켓 수</th>
                <th className="text-center" style={{ width: 100 }}>상태</th>
                <th className="text-center" style={{ width: 140 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {/* New category row */}
              {showNew && (
                <tr className="table-warning">
                  <td></td>
                  <td>
                    <InputGroup size="sm">
                      <Form.Control
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="새 카테고리명 입력"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        autoFocus
                      />
                    </InputGroup>
                  </td>
                  <td></td>
                  <td></td>
                  <td className="text-center">
                    <Button variant="success" size="sm" className="me-1" onClick={handleCreate} disabled={saving}>
                      <BsCheck size={16} />
                    </Button>
                    <Button variant="outline-secondary" size="sm" onClick={() => { setShowNew(false); setNewName(''); }}>
                      <BsX size={16} />
                    </Button>
                  </td>
                </tr>
              )}
              {categories.map((c) => (
                <tr key={c.id} className={!c.isActive ? 'text-muted' : undefined}>
                  <td>
                    {editId === c.id ? (
                      <Form.Control
                        type="number"
                        size="sm"
                        value={editData.sortOrder}
                        onChange={(e) => setEditData({ ...editData, sortOrder: parseInt(e.target.value) || 0 })}
                        style={{ width: 60 }}
                      />
                    ) : (
                      c.sortOrder
                    )}
                  </td>
                  <td>
                    {editId === c.id ? (
                      <Form.Control
                        size="sm"
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                      />
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="text-center">{c._count.tickets}</td>
                  <td className="text-center">
                    {editId === c.id ? (
                      <Form.Check
                        type="switch"
                        checked={editData.isActive}
                        onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
                      />
                    ) : (
                      <Badge bg={c.isActive ? 'success' : 'secondary'}>
                        {c.isActive ? '활성' : '비활성'}
                      </Badge>
                    )}
                  </td>
                  <td className="text-center">
                    {editId === c.id ? (
                      <>
                        <Button variant="success" size="sm" className="me-1" onClick={handleSaveEdit} disabled={saving}>
                          <BsCheck size={16} />
                        </Button>
                        <Button variant="outline-secondary" size="sm" onClick={cancelEdit}>
                          <BsX size={16} />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline-primary" size="sm" className="me-1" onClick={() => startEdit(c)}>
                          <BsPencil />
                        </Button>
                        {c.isActive && (
                          <Button variant="outline-danger" size="sm" onClick={() => handleDelete(c.id, c.name)}>
                            <BsTrash />
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {categories.length === 0 && !showNew && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">등록된 카테고리가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      )}
    </Container>
  );
}
