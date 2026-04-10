'use client';

// Design Ref: §H -- Reusable confirmation Modal (Client Component)

import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';

interface ConfirmDialogProps {
  show: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable Bootstrap Modal confirmation dialog.
 * Usage:
 *   <ConfirmDialog
 *     show={showDelete}
 *     title="삭제 확인"
 *     message="정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
 *     variant="danger"
 *     confirmLabel="삭제"
 *     onConfirm={handleDelete}
 *     onCancel={() => setShowDelete(false)}
 *   />
 */
export function ConfirmDialog({
  show,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal show={show} onHide={isLoading ? undefined : onCancel} backdrop={isLoading ? 'static' : true} centered aria-labelledby="confirm-dialog-title">
      <Modal.Header closeButton>
        <Modal.Title id="confirm-dialog-title">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{message}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} disabled={isLoading}>
          {isLoading ? (
            <>
              <Spinner as="span" size="sm" animation="border" role="status" aria-hidden="true" />{' '}
              처리 중...
            </>
          ) : (
            confirmLabel
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
