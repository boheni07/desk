'use client';

// Design Ref: §10.2 -- Notification Bell (dropdown + push toggle)
// Plan SC: FR-23 알림 벨, 30초 폴링, 최근 5건 표시

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Dropdown from 'react-bootstrap/Dropdown';
import Badge from 'react-bootstrap/Badge';
import Spinner from 'react-bootstrap/Spinner';
import { BsBellFill, BsBellSlashFill, BsCheckAll } from 'react-icons/bs';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import { NOTIFICATION_TYPE_LABELS } from '@/lib/notification-icons';
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

const POLL_INTERVAL = 30_000; // 30 seconds
const MAX_DROPDOWN_ITEMS = 5;

export default function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { isSupported, isSubscribed, subscribe, unsubscribe, isLoading: pushLoading } = usePushSubscription();

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count');
      if (res.ok) {
        const json = await res.json();
        setUnreadCount(json.data?.count ?? json.count ?? 0);
      }
    } catch {
      // Silently ignore polling errors
    }
  }, []);

  // Fetch recent unread notifications for dropdown
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?limit=${MAX_DROPDOWN_ITEMS}&isRead=false`);
      if (res.ok) {
        const data = await res.json();
        setRecentNotifications(data.data ?? []);
      }
    } catch {
      // Silently ignore
    }
  }, []);

  // Start polling on mount
  useEffect(() => {
    fetchUnreadCount();

    pollTimerRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchUnreadCount]);

  // Fetch recent when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchRecent();
    }
  }, [isOpen, fetchRecent]);

  // Mark all as read
  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        setUnreadCount(0);
        setRecentNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Click a notification item
  const handleItemClick = async (notification: NotificationItem) => {
    // Mark as read
    if (!notification.isRead) {
      await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' });
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    setIsOpen(false);

    // Navigate to target
    const url = notification.linkUrl || (notification.ticket ? `/tickets/${notification.ticket.id}` : null);
    if (url) {
      router.push(url);
    }
  };

  // Push toggle
  const handlePushToggle = async () => {
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        await subscribe();
      }
    } catch {
      // User denied or error
    }
  };

  // Format relative time
  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;
    return `${Math.floor(days / 30)}개월 전`;
  };

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Dropdown show={isOpen} onToggle={setIsOpen} align="end">
      <Dropdown.Toggle
        variant="link"
        className="position-relative p-1 text-dark border-0 d-flex align-items-center justify-content-center"
        style={{ width: 36, height: 36 }}
        id="notification-bell"
        aria-label="알림"
      >
        <BsBellFill size={18} />
        {unreadCount > 0 && (
          <Badge
            bg="danger"
            pill
            className="position-absolute top-0 start-100 translate-middle"
            style={{ fontSize: '0.6rem', minWidth: '1.2rem' }}
          >
            {displayCount}
            <span className="visually-hidden">미읽음 알림 {unreadCount}개</span>
          </Badge>
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu style={{ width: 'min(360px, calc(100vw - 1rem))', maxHeight: '420px', overflow: 'auto' }}>
        {/* Header */}
        <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
          <strong>알림</strong>
          <div className="d-flex gap-2 align-items-center">
            {/* Mark all read */}
            <button
              className="btn btn-sm btn-outline-secondary border-0"
              onClick={handleMarkAllRead}
              disabled={isMarkingAll || unreadCount === 0}
              title="모두 읽음"
            >
              {isMarkingAll ? (
                <Spinner animation="border" size="sm" />
              ) : (
                <BsCheckAll size={16} />
              )}
            </button>

            {/* Push toggle */}
            {isSupported && (
              <button
                className="btn btn-sm btn-outline-secondary border-0"
                onClick={handlePushToggle}
                disabled={pushLoading}
                title={isSubscribed ? '푸시 알림 끄기' : '푸시 알림 켜기'}
              >
                {pushLoading ? (
                  <Spinner animation="border" size="sm" />
                ) : isSubscribed ? (
                  <BsBellFill size={14} className="text-primary" />
                ) : (
                  <BsBellSlashFill size={14} className="text-muted" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Notification items */}
        {recentNotifications.length === 0 ? (
          <div className="text-center text-muted py-4">
            <small>새 알림이 없습니다.</small>
          </div>
        ) : (
          recentNotifications.map((n) => (
            <Dropdown.Item
              key={n.id}
              onClick={() => handleItemClick(n)}
              className={`px-3 py-2 border-bottom ${!n.isRead ? 'bg-light' : ''}`}
              style={{ whiteSpace: 'normal' }}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div className="flex-grow-1 me-2" style={{ minWidth: 0 }}>
                  <div className="fw-semibold text-truncate" style={{ fontSize: '0.85rem' }}>
                    {n.title}
                  </div>
                  <div className="text-muted text-truncate" style={{ fontSize: '0.8rem' }}>
                    {n.body}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                    {NOTIFICATION_TYPE_LABELS[n.type] || n.type} &middot; {timeAgo(n.createdAt)}
                  </div>
                </div>
                {!n.isRead && (
                  <span
                    className="rounded-circle bg-primary flex-shrink-0 mt-1"
                    style={{ width: '8px', height: '8px' }}
                  />
                )}
              </div>
            </Dropdown.Item>
          ))
        )}

        {/* Footer */}
        <Dropdown.Item
          href="/notifications"
          className="text-center text-primary fw-semibold py-2"
        >
          전체 보기
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
