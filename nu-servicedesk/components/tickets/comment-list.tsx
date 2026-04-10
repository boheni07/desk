'use client';

// Design Ref: §10 -- Comment list with inline editing, soft-delete, internal memo display
// Plan SC: FR-21 댓글, V2.0 10분 수정 제한, FR-10 파일첨부

import { useState, useEffect, useCallback, useRef } from 'react';
import Card from 'react-bootstrap/Card';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import ProgressBar from 'react-bootstrap/ProgressBar';
import { BsPencil, BsTrash, BsLock, BsChatDots, BsPaperclip, BsX, BsFileEarmark, BsFileImage, BsFilePdf, BsFileSpreadsheet, BsFileText, BsDownload } from 'react-icons/bs';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface CommentAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

interface CommentAuthor {
  id: string;
  name: string;
  type: string;
}

interface CommentData {
  id: string;
  ticketId: string;
  type: string; // PUBLIC | INTERNAL
  content: string;
  isDeleted: boolean;
  isEdited: boolean;
  author: CommentAuthor;
  attachments: CommentAttachment[];
  createdAt: string;
  updatedAt: string;
}

interface CommentListProps {
  ticketId: string;
  currentUserId: string;
  currentUserRole: string; // admin | support | customer
}

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  support: '지원담당자',
  customer: '고객',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'danger',
  support: 'primary',
  customer: 'success',
};

const AVATAR_COLORS: Record<string, string> = {
  admin: '#dc3545',
  support: '#0d6efd',
  customer: '#198754',
};

const EDIT_LIMIT_MINUTES = 10;
const ALLOWED_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <BsFileImage className="text-success" style={{ fontSize: '0.9rem' }} />;
  if (mimeType === 'application/pdf') return <BsFilePdf className="text-danger" style={{ fontSize: '0.9rem' }} />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <BsFileSpreadsheet className="text-success" style={{ fontSize: '0.9rem' }} />;
  if (mimeType.includes('text') || mimeType.includes('document') || mimeType.includes('word')) return <BsFileText className="text-primary" style={{ fontSize: '0.9rem' }} />;
  return <BsFileEarmark className="text-muted" style={{ fontSize: '0.9rem' }} />;
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function CommentList({ ticketId, currentUserId, currentUserRole }: CommentListProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New comment form
  const [newContent, setNewContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // File attachment state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isStaff = currentUserRole === 'admin' || currentUserRole === 'support';

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments`);
      const json = await res.json();
      if (json.success) {
        setComments(Array.isArray(json.data) ? json.data : []);
      } else {
        setError(json.error?.message || '댓글을 불러올 수 없습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const canEdit = (comment: CommentData): boolean => {
    if (comment.isDeleted) return false;
    if (comment.author.id !== currentUserId) return false;
    const diff = (Date.now() - new Date(comment.createdAt).getTime()) / 1000 / 60;
    return diff <= EDIT_LIMIT_MINUTES;
  };

  const canDelete = (comment: CommentData): boolean => {
    if (comment.isDeleted) return false;
    return comment.author.id === currentUserId || currentUserRole === 'admin';
  };

  // ── File handlers ──

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const incoming = Array.from(e.target.files);
    setSelectedFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
    // Reset input so same file can be re-selected if removed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedFile = (name: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  // Upload selected files and return their attachmentIds
  const uploadFiles = async (): Promise<string[]> => {
    if (selectedFiles.length === 0) return [];
    setUploading(true);
    setUploadProgress(0);
    const ids: string[] = [];
    let done = 0;

    for (const file of selectedFiles) {
      try {
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
          setError(`${file.name}: ${presignJson.error?.message || '업로드 실패'}`);
          continue;
        }
        await fetch(presignJson.data.presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        ids.push(presignJson.data.attachmentId);
      } catch {
        setError(`${file.name} 업로드 중 오류가 발생했습니다.`);
      } finally {
        done++;
        setUploadProgress(Math.round((done / selectedFiles.length) * 100));
      }
    }
    setUploading(false);
    setUploadProgress(0);
    return ids;
  };

  // ── Comment handlers ──

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const attachmentIds = await uploadFiles();

      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent, isInternal, attachmentIds }),
      });
      const json = await res.json();
      if (json.success) {
        setNewContent('');
        setIsInternal(false);
        setSelectedFiles([]);
        fetchComments();
      } else {
        setError(json.error?.message || '댓글 작성에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (comment: CommentData) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    setEditSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      const json = await res.json();
      if (json.success) {
        setEditingId(null);
        setEditContent('');
        fetchComments();
      } else {
        setError(json.error?.message || '댓글 수정에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('이 댓글을 삭제하시겠습니까? 삭제한 뒤에는 되돌릴 수 없습니다.')) return;
    setDeletingId(commentId);
    setError('');
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments/${commentId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchComments();
      else setError(json.error?.message || '댓글 삭제에 실패했습니다.');
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    setDownloadingId(attachmentId);
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`);
      const json = await res.json();
      if (json.success) window.open(json.data.downloadUrl, '_blank');
      else setError(json.error?.message || '다운로드에 실패했습니다.');
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Helpers ──

  const formatDateTime = (dt: string) => new Date(dt).toLocaleString('ko-KR');
  const getInitial = (name: string) => name.charAt(0).toUpperCase();
  const getRemainingMinutes = (createdAt: string): number => {
    const diff = EDIT_LIMIT_MINUTES - (Date.now() - new Date(createdAt).getTime()) / 1000 / 60;
    return Math.max(0, Math.ceil(diff));
  };

  const activeCount = comments.filter((c) => !c.isDeleted).length;

  // ── Render ──

  return (
    <Card className="mb-3">
      <Card.Header className="bg-white d-flex justify-content-between align-items-center">
        <strong><BsChatDots className="me-1" />댓글</strong>
        <span className="text-muted small">{activeCount}건</span>
      </Card.Header>

      <Card.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')} className="mb-3">
            {error}
          </Alert>
        )}

        {/* ── 댓글 작성 폼 (상단) ── */}
        <Form onSubmit={handleSubmitComment} className="mb-4">
          <Form.Group className="mb-2">
            <Form.Control
              as="textarea"
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="댓글을 작성해 주세요..."
              maxLength={5000}
              disabled={submitting || uploading}
            />
          </Form.Group>

          {/* 선택된 파일 목록 */}
          {selectedFiles.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-2">
              {selectedFiles.map((f) => (
                <span
                  key={f.name}
                  className="badge bg-secondary d-flex align-items-center gap-1"
                  style={{ fontSize: '0.75rem', fontWeight: 'normal', maxWidth: '220px' }}
                >
                  <BsPaperclip style={{ flexShrink: 0 }} />
                  <span className="text-truncate" style={{ maxWidth: '160px' }}>{f.name}</span>
                  <span className="text-white-50">({formatFileSize(f.size)})</span>
                  <button
                    type="button"
                    className="btn-close btn-close-white ms-1"
                    style={{ fontSize: '0.55rem' }}
                    onClick={() => removeSelectedFile(f.name)}
                    disabled={submitting || uploading}
                  />
                </span>
              ))}
            </div>
          )}

          {/* 업로드 진행 바 */}
          {uploading && (
            <ProgressBar
              now={uploadProgress}
              label={`${uploadProgress}%`}
              animated
              striped
              className="mb-2"
              style={{ height: '6px' }}
            />
          )}

          <div className="d-flex justify-content-between align-items-center gap-2">
            <div className="d-flex align-items-center gap-3">
              {/* 파일 첨부 버튼 */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_ACCEPT}
                  onChange={handleFileChange}
                  disabled={submitting || uploading}
                  className="d-none"
                  id="comment-file-input"
                />
                <label
                  htmlFor="comment-file-input"
                  className={`btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 ${(submitting || uploading) ? 'disabled' : ''}`}
                  style={{ cursor: 'pointer', marginBottom: 0 }}
                  title="파일 첨부 (JPG, PNG, PDF, DOC, XLS, PPT, TXT · 최대 10MB/건)"
                >
                  <BsPaperclip />
                  <span>파일 첨부</span>
                  {selectedFiles.length > 0 && (
                    <Badge bg="primary" pill style={{ fontSize: '0.65rem' }}>{selectedFiles.length}</Badge>
                  )}
                </label>
              </div>

              {/* 내부 메모 토글 (지원담당자/관리자) */}
              {isStaff && (
                <Form.Check
                  type="switch"
                  id="internal-comment-switch"
                  label={<span className="small"><BsLock className="me-1" />내부 메모</span>}
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  disabled={submitting || uploading}
                />
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={submitting || uploading || !newContent.trim()}
            >
              {(submitting || uploading) ? <Spinner animation="border" size="sm" /> : '댓글 작성'}
            </Button>
          </div>

          <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
            허용 파일: JPG, PNG, GIF, WebP, PDF, DOC, XLS, PPT, TXT (최대 10MB/건)
          </div>
        </Form>

        <hr className="my-3" />

        {/* ── 댓글 목록 (최신순) ── */}
        {loading ? (
          <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
        ) : comments.length === 0 ? (
          <p className="text-muted text-center mb-0">등록된 댓글이 없습니다.</p>
        ) : (
          <div className="d-flex flex-column" style={{ gap: 12 }}>
            {comments.map((c) => {
              const internal = c.type === 'INTERNAL';
              const isEditing = editingId === c.id;
              const isMine = c.author.id === currentUserId;
              const accentColor = AVATAR_COLORS[c.author.type] || '#6c757d';

              // ── 삭제된 댓글 ──
              if (c.isDeleted) {
                return (
                  <div key={c.id} className="d-flex align-items-center" style={{ padding: '4px 12px', color: '#adb5bd', fontSize: '0.78rem', fontStyle: 'italic' }}>
                    <BsTrash style={{ fontSize: '0.7rem', marginRight: 6, flexShrink: 0 }} />
                    <span className="text-truncate">{c.content}</span>
                    <span className="ms-2 flex-shrink-0" style={{ fontSize: '0.7rem' }}>{c.author.name} &middot; {formatDateTime(c.createdAt)}</span>
                  </div>
                );
              }

              // ── 내 댓글 (우측) ──
              if (isMine) {
                return (
                  <div key={c.id} className="d-flex justify-content-end" style={{ gap: 8 }}>
                    <div style={{ maxWidth: '75%', minWidth: 0 }}>
                      {/* 말풍선 */}
                      <div
                        className="position-relative comment-feed-item"
                        style={{
                          padding: '10px 14px',
                          background: internal ? '#fffbeb' : '#E8EDFC',
                          border: internal ? '1px solid #ffe066' : '1px solid #C5D0F8',
                          borderRadius: '14px 14px 4px 14px',
                        }}
                        onMouseEnter={(e) => {
                          const a = e.currentTarget.querySelector('.comment-actions') as HTMLElement | null;
                          if (a) a.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          const a = e.currentTarget.querySelector('.comment-actions') as HTMLElement | null;
                          if (a) a.style.opacity = '0';
                        }}
                      >
                        {internal && (
                          <div style={{ marginBottom: 4 }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#fff3bf', color: '#664d03' }}>
                              <BsLock style={{ fontSize: '0.5rem', marginRight: 2 }} />내부 메모
                            </span>
                          </div>
                        )}
                        {isEditing ? (
                          <div>
                            <Form.Control as="textarea" rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} maxLength={5000} className="mb-2" style={{ fontSize: '0.8125rem' }} />
                            <div className="d-flex gap-2">
                              <Button size="sm" variant="primary" onClick={handleSaveEdit} disabled={editSubmitting || !editContent.trim()}>{editSubmitting ? <Spinner animation="border" size="sm" /> : '저장'}</Button>
                              <Button size="sm" variant="outline-secondary" onClick={handleCancelEdit}>취소</Button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem', lineHeight: 1.55, wordBreak: 'break-word', color: internal ? '#664d03' : '#212529' }}>{c.content}</div>
                        )}
                        {c.attachments && c.attachments.length > 0 && (
                          <div className="d-flex flex-wrap gap-1" style={{ marginTop: 6 }}>
                            {c.attachments.map((a) => (
                              <button key={a.id} type="button" className="d-flex align-items-center gap-1" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 4, border: '1px solid #C5D0F8', background: '#f0f3ff', color: '#495057', cursor: 'pointer' }} onClick={() => handleDownloadAttachment(a.id)} disabled={downloadingId === a.id} title={`${a.fileName} (${formatFileSize(a.fileSize)})`}>
                                {downloadingId === a.id ? <Spinner animation="border" size="sm" style={{ width: 10, height: 10 }} /> : getFileIcon(a.mimeType)}
                                <span className="text-truncate" style={{ maxWidth: '120px' }}>{a.fileName}</span>
                                <BsDownload style={{ fontSize: '0.55rem', opacity: 0.6 }} />
                              </button>
                            ))}
                          </div>
                        )}
                        {/* 호버 액션 */}
                        {!isEditing && (canEdit(c) || canDelete(c)) && (
                          <div className="comment-actions position-absolute d-flex" style={{ top: -8, right: 4, gap: 2, opacity: 0, transition: 'opacity 150ms' }}>
                            {canEdit(c) && <button type="button" className="btn btn-sm" style={{ padding: '1px 5px', fontSize: '0.68rem', color: '#868e96', background: '#fff', border: '1px solid #dee2e6', borderRadius: 4 }} title={`수정 (${getRemainingMinutes(c.createdAt)}분)`} onClick={() => handleStartEdit(c)}><BsPencil style={{ fontSize: '0.6rem' }} /></button>}
                            {canDelete(c) && <button type="button" className="btn btn-sm" style={{ padding: '1px 5px', fontSize: '0.68rem', color: '#fa5252', background: '#fff', border: '1px solid #ffc9c9', borderRadius: 4 }} title="삭제" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>{deletingId === c.id ? <Spinner animation="border" size="sm" style={{ width: 10, height: 10 }} /> : <BsTrash style={{ fontSize: '0.6rem' }} />}</button>}
                          </div>
                        )}
                      </div>
                      {/* 시간 */}
                      <div style={{ textAlign: 'right', fontSize: '0.68rem', color: '#adb5bd', marginTop: 2, paddingRight: 4 }}>
                        {formatDateTime(c.createdAt)}
                        {c.isEdited && <span style={{ marginLeft: 3, color: '#ced4da' }}>수정됨</span>}
                      </div>
                    </div>
                    {/* 나 아바타 */}
                    <div className="flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 32, height: 32, borderRadius: '50%', background: '#3B5BDB', color: '#fff', fontSize: '0.72rem', fontWeight: 700, alignSelf: 'flex-start', marginTop: 2 }}>나</div>
                  </div>
                );
              }

              // ── 상대 댓글 (좌측 — 피드 스타일) ──
              return (
                <div key={c.id} className="d-flex" style={{ gap: 8 }}>
                  {/* 아바타 */}
                  <div className="flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 32, height: 32, borderRadius: '50%', background: accentColor, color: '#fff', fontSize: '0.72rem', fontWeight: 700, alignSelf: 'flex-start', marginTop: 2 }}>{getInitial(c.author.name)}</div>
                  <div style={{ maxWidth: '75%', minWidth: 0 }}>
                    {/* 이름 + 역할 */}
                    <div className="d-flex align-items-center gap-1" style={{ marginBottom: 3 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#343a40' }}>{c.author.name}</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: c.author.type === 'admin' ? '#fee2e2' : c.author.type === 'support' ? '#e8edfc' : '#ebfbee', color: c.author.type === 'admin' ? '#dc2626' : c.author.type === 'support' ? '#3b5bdb' : '#2f9e44' }}>{ROLE_LABELS[c.author.type] || c.author.type}</span>
                      {internal && <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: '#fff3bf', color: '#664d03' }}><BsLock style={{ fontSize: '0.5rem', marginRight: 2 }} />내부</span>}
                    </div>
                    {/* 말풍선 */}
                    <div
                      className="position-relative comment-feed-item"
                      style={{
                        padding: '10px 14px',
                        background: internal ? '#fffbeb' : '#f1f3f5',
                        border: internal ? '1px solid #ffe066' : '1px solid #e9ecef',
                        borderRadius: '14px 14px 14px 4px',
                      }}
                      onMouseEnter={(e) => {
                        const a = e.currentTarget.querySelector('.comment-actions') as HTMLElement | null;
                        if (a) a.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        const a = e.currentTarget.querySelector('.comment-actions') as HTMLElement | null;
                        if (a) a.style.opacity = '0';
                      }}
                    >
                      {isEditing ? (
                        <div>
                          <Form.Control as="textarea" rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} maxLength={5000} className="mb-2" style={{ fontSize: '0.8125rem' }} />
                          <div className="d-flex gap-2">
                            <Button size="sm" variant="primary" onClick={handleSaveEdit} disabled={editSubmitting || !editContent.trim()}>{editSubmitting ? <Spinner animation="border" size="sm" /> : '저장'}</Button>
                            <Button size="sm" variant="outline-secondary" onClick={handleCancelEdit}>취소</Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem', lineHeight: 1.55, wordBreak: 'break-word', color: internal ? '#664d03' : '#212529' }}>{c.content}</div>
                      )}
                      {c.attachments && c.attachments.length > 0 && (
                        <div className="d-flex flex-wrap gap-1" style={{ marginTop: 6 }}>
                          {c.attachments.map((a) => (
                            <button key={a.id} type="button" className="d-flex align-items-center gap-1" style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 4, border: '1px solid #dee2e6', background: '#fff', color: '#495057', cursor: 'pointer' }} onClick={() => handleDownloadAttachment(a.id)} disabled={downloadingId === a.id} title={`${a.fileName} (${formatFileSize(a.fileSize)})`}>
                              {downloadingId === a.id ? <Spinner animation="border" size="sm" style={{ width: 10, height: 10 }} /> : getFileIcon(a.mimeType)}
                              <span className="text-truncate" style={{ maxWidth: '120px' }}>{a.fileName}</span>
                              <BsDownload style={{ fontSize: '0.55rem', opacity: 0.6 }} />
                            </button>
                          ))}
                        </div>
                      )}
                      {/* 호버 액션 (지원담당자/관리자가 상대 댓글 삭제 가능) */}
                      {!isEditing && (canEdit(c) || canDelete(c)) && (
                        <div className="comment-actions position-absolute d-flex" style={{ top: -8, right: 4, gap: 2, opacity: 0, transition: 'opacity 150ms' }}>
                          {canEdit(c) && <button type="button" className="btn btn-sm" style={{ padding: '1px 5px', fontSize: '0.68rem', color: '#868e96', background: '#fff', border: '1px solid #dee2e6', borderRadius: 4 }} title={`수정 (${getRemainingMinutes(c.createdAt)}분)`} onClick={() => handleStartEdit(c)}><BsPencil style={{ fontSize: '0.6rem' }} /></button>}
                          {canDelete(c) && <button type="button" className="btn btn-sm" style={{ padding: '1px 5px', fontSize: '0.68rem', color: '#fa5252', background: '#fff', border: '1px solid #ffc9c9', borderRadius: 4 }} title="삭제" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>{deletingId === c.id ? <Spinner animation="border" size="sm" style={{ width: 10, height: 10 }} /> : <BsTrash style={{ fontSize: '0.6rem' }} />}</button>}
                        </div>
                      )}
                    </div>
                    {/* 시간 */}
                    <div style={{ fontSize: '0.68rem', color: '#adb5bd', marginTop: 2, paddingLeft: 4 }}>
                      {formatDateTime(c.createdAt)}
                      {c.isEdited && <span style={{ marginLeft: 3, color: '#ced4da' }}>수정됨</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
