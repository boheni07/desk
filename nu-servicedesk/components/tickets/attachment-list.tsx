'use client';

// Design Ref: §10 -- Attachment list with presigned URL upload flow
// Plan SC: FR-10 첨부파일, Cloudflare R2

import { useState, useEffect, useCallback, useRef } from 'react';
import Card from 'react-bootstrap/Card';
import ListGroup from 'react-bootstrap/ListGroup';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import ProgressBar from 'react-bootstrap/ProgressBar';
import { BsDownload, BsTrash, BsPaperclip, BsFileEarmark, BsFileImage, BsFilePdf, BsFileText, BsFileSpreadsheet } from 'react-icons/bs';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface AttachmentData {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploaderId: string | null;
  uploader: { id: string; name: string } | null;
  uploadedAt: string;
}

interface AttachmentListProps {
  ticketId: string;
  currentUserId: string;
  currentUserRole: string; // admin | support | customer
  readOnly?: boolean; // 다운로드만 — 업로드 UI 숨김
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <BsFileImage className="text-success" />;
  if (mimeType === 'application/pdf') return <BsFilePdf className="text-danger" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <BsFileSpreadsheet className="text-success" />;
  if (mimeType.includes('text') || mimeType.includes('document') || mimeType.includes('word')) return <BsFileText className="text-primary" />;
  return <BsFileEarmark className="text-muted" />;
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function AttachmentList({ ticketId, currentUserId, currentUserRole, readOnly = false }: AttachmentListProps) {
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      const json = await res.json();
      if (json.success) {
        // Ticket detail includes attachments (where commentId is null)
        setAttachments(
          (json.data.attachments || []).map((a: AttachmentData & { uploader?: { id: string; name: string } | null }) => ({
            id: a.id,
            fileName: a.fileName,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
            uploaderId: a.uploaderId,
            uploader: a.uploader || null,
            uploadedAt: a.uploadedAt,
          }))
        );
      }
    } catch {
      // Silently fail -- primary ticket fetch handles errors
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    setUploadProgress(0);
    setError('');

    const totalFiles = files.length;
    let completed = 0;

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      try {
        // Step 1: Get presigned URL
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
          setError(presignJson.error?.message || `${file.name} 업로드 실패`);
          continue;
        }

        // Step 2: Upload to R2 via presigned URL
        await fetch(presignJson.data.presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });

        completed++;
        setUploadProgress(Math.round((completed / totalFiles) * 100));
      } catch {
        setError(`${file.name} 업로드 중 오류가 발생했습니다.`);
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setUploading(false);
    setUploadProgress(0);
    fetchAttachments();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
    }
  };

  const handleDownload = async (attachment: AttachmentData) => {
    setDownloadingId(attachment.id);
    try {
      const res = await fetch(`/api/attachments/${attachment.id}`);
      const json = await res.json();
      if (json.success) {
        // Open download URL in a new tab
        window.open(json.data.downloadUrl, '_blank');
      } else {
        setError(json.error?.message || '다운로드에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!window.confirm('이 첨부파일을 삭제하시겠습니까? 삭제한 뒤에는 되돌릴 수 없습니다.')) return;
    setDeletingId(attachmentId);
    setError('');

    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchAttachments();
      } else {
        setError(json.error?.message || '삭제에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = (attachment: AttachmentData): boolean => {
    return attachment.uploaderId === currentUserId || currentUserRole === 'admin';
  };

  const formatDateTime = (dt: string) => new Date(dt).toLocaleString('ko-KR');

  // ── Render ──

  return (
    <Card className="mb-3">
      <Card.Header className="bg-white d-flex justify-content-between align-items-center">
        <strong><BsPaperclip className="me-1" />첨부파일</strong>
        <span className="text-muted small">{attachments.length}건</span>
      </Card.Header>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')} className="m-3 mb-0">{error}</Alert>}

      {loading ? (
        <Card.Body className="text-center py-3">
          <Spinner animation="border" size="sm" />
        </Card.Body>
      ) : (
        <>
          {attachments.length > 0 && (
            <ListGroup variant="flush">
              {attachments.map((a) => (
                <ListGroup.Item key={a.id} className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                    {getFileIcon(a.mimeType)}
                    <div className="min-w-0">
                      <div className="text-truncate small fw-medium" style={{ maxWidth: '300px' }}>
                        {a.fileName}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                        {formatFileSize(a.fileSize)}
                        {a.uploader && <> &middot; {a.uploader.name}</>}
                        {a.uploadedAt && <> &middot; {formatDateTime(a.uploadedAt)}</>}
                      </div>
                    </div>
                  </div>
                  <div className="d-flex gap-1 flex-shrink-0 ms-2">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => handleDownload(a)}
                      disabled={downloadingId === a.id}
                      title="다운로드"
                    >
                      {downloadingId === a.id ? <Spinner animation="border" size="sm" /> : <BsDownload />}
                    </Button>
                    {canDelete(a) && (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDelete(a.id)}
                        disabled={deletingId === a.id}
                        title="삭제"
                      >
                        {deletingId === a.id ? <Spinner animation="border" size="sm" /> : <BsTrash />}
                      </Button>
                    )}
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          {/* Upload area — readOnly 모드에서는 숨김 */}
          {!readOnly && (
            <Card.Body className={attachments.length > 0 ? 'pt-2' : ''}>
              {uploading && (
                <div className="mb-2">
                  <ProgressBar now={uploadProgress} label={`${uploadProgress}%`} animated striped />
                </div>
              )}
              <div className="d-flex align-items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="form-control form-control-sm"
                  accept={['.jpg','.jpeg','.png','.gif','.webp','.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt'].join(',')}
                />
                {uploading && <Spinner animation="border" size="sm" />}
              </div>
              <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                허용 파일: JPG, PNG, GIF, WebP, PDF, DOC, XLS, PPT, TXT (최대 10MB/건)
              </div>
            </Card.Body>
          )}
          {readOnly && attachments.length === 0 && (
            <Card.Body className="text-muted small py-3">첨부파일이 없습니다.</Card.Body>
          )}
        </>
      )}
    </Card>
  );
}
