'use client';

// Design Ref: §10 -- Notification Center (/notifications)
// Plan SC: FR-23 알림 센터 페이지

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
import Nav from 'react-bootstrap/Nav';
import Pagination from 'react-bootstrap/Pagination';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import {
  BsTrash,
  BsCheckAll,
  BsCircleFill,
} from 'react-icons/bs';
import { NOTIFICATION_TYPE_ICONS, NOTIFICATION_TYPE_LABELS } from '@/lib/notification-icons';
import type { NotificationType } from '@prisma/client';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
  ticket?: { id: string; ticketNumber: string; title: string } | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type TabKey = 'all' | 'unread' | 'ticket' | 'system';

const TAB_LABELS: Record<TabKey, string> = {
  all: '전체',
  unread: '안읽음',
  ticket: '티켓',
  system: '시스템',
};

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const fetchNotifications = useCallback(
    async (page: number, tab: TabKey) => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(PAGE_SIZE));

        if (tab === 'unread') {
          params.set('isRead', 'false');
        } else if (tab === 'ticket') {
          params.set('category', 'ticket');
        } else if (tab === 'system') {
          params.set('category', 'system');
        }

        const res = await fetch(`/api/notifications?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.data ?? []);
          setPagination(data.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
        } else {
          setFetchError('알림을 불러오는데 실패했습니다.');
        }
      } catch {
        setFetchError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchNotifications(1, activeTab);
  }, [activeTab, fetchNotifications]);

  // Tab change
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
  };

  // Page change
  const handlePageChange = (page: number) => {
    fetchNotifications(page, activeTab);
  };

  // Mark all read
  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Click a notification row
  const handleRowClick = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      );
    }

    const url =
      notification.linkUrl || (notification.ticket ? `/tickets/${notification.ticket.id}` : null);
    if (url) {
      router.push(url);
    }
  };

  // Delete notification
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingIds.has(id)) return;
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Relative time
  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;
    return new Date(dateStr).toLocaleDateString('ko-KR');
  };

  // Build pagination items
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    const items: React.ReactNode[] = [];
    const { page, totalPages } = pagination;

    items.push(
      <Pagination.First key="first" disabled={page === 1} onClick={() => handlePageChange(1)} />,
    );
    items.push(
      <Pagination.Prev
        key="prev"
        disabled={page === 1}
        onClick={() => handlePageChange(page - 1)}
      />,
    );

    // Show max 5 page numbers centered on current
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, startPage + 4);

    for (let p = startPage; p <= endPage; p++) {
      items.push(
        <Pagination.Item key={p} active={p === page} onClick={() => handlePageChange(p)}>
          {p}
        </Pagination.Item>,
      );
    }

    items.push(
      <Pagination.Next
        key="next"
        disabled={page === totalPages}
        onClick={() => handlePageChange(page + 1)}
      />,
    );
    items.push(
      <Pagination.Last
        key="last"
        disabled={page === totalPages}
        onClick={() => handlePageChange(totalPages)}
      />,
    );

    return (
      <Pagination className="justify-content-center mb-0 mt-3" size="sm">
        {items}
      </Pagination>
    );
  };

  return (
    <Container fluid className="py-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">알림 센터</h4>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={isMarkingAll}
        >
          {isMarkingAll ? (
            <Spinner animation="border" size="sm" className="me-1" />
          ) : (
            <BsCheckAll className="me-1" />
          )}
          모두 읽음 처리
        </Button>
      </div>

      {/* Filter tabs */}
      <Nav variant="tabs" className="mb-3">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <Nav.Item key={tab}>
            <Nav.Link
              active={activeTab === tab}
              onClick={() => handleTabChange(tab)}
              className="cursor-pointer"
            >
              {TAB_LABELS[tab]}
            </Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {/* Error state */}
      {fetchError && (
        <Alert variant="danger" dismissible onClose={() => setFetchError(null)}>
          {fetchError}
        </Alert>
      )}

      {/* Notification list */}
      {isLoading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      ) : notifications.length === 0 && !fetchError ? (
        <Card body className="text-center text-muted py-5">
          알림이 없습니다.
        </Card>
      ) : (
        <Card>
          <div className="list-group list-group-flush">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`list-group-item list-group-item-action d-flex align-items-start gap-3 py-3 ${
                  !n.isRead ? 'bg-light' : ''
                }`}
                role="button"
                onClick={() => handleRowClick(n)}
              >
                {/* Type icon */}
                <div className="flex-shrink-0 pt-1">
                  <i
                    className={`bi ${NOTIFICATION_TYPE_ICONS[n.type] || 'bi-bell'}`}
                    style={{ fontSize: '1.2rem' }}
                  />
                </div>

                {/* Content */}
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    {!n.isRead && (
                      <BsCircleFill size={8} className="text-primary flex-shrink-0" />
                    )}
                    <span className="fw-semibold text-truncate" style={{ fontSize: '0.9rem' }}>
                      {n.title}
                    </span>
                    <Badge bg="secondary" pill className="flex-shrink-0" style={{ fontSize: '0.65rem' }}>
                      {NOTIFICATION_TYPE_LABELS[n.type] || n.type}
                    </Badge>
                  </div>
                  <div
                    className="text-muted text-truncate mb-1"
                    style={{ fontSize: '0.85rem' }}
                  >
                    {n.body}
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <small className="text-muted">{timeAgo(n.createdAt)}</small>
                    {n.ticket && (
                      <small className="text-muted">
                        {n.ticket.ticketNumber}
                      </small>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <div className="flex-shrink-0">
                  <button
                    className="btn btn-sm btn-outline-danger border-0 p-1"
                    onClick={(e) => handleDelete(e, n.id)}
                    disabled={deletingIds.has(n.id)}
                    title="삭제"
                  >
                    {deletingIds.has(n.id) ? (
                      <Spinner animation="border" size="sm" style={{ width: 14, height: 14 }} />
                    ) : (
                      <BsTrash size={14} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pagination */}
      {renderPagination()}

      {/* Total count */}
      {!isLoading && pagination.total > 0 && (
        <div className="text-center text-muted mt-2" style={{ fontSize: '0.8rem' }}>
          총 {pagination.total}건
        </div>
      )}
    </Container>
  );
}
