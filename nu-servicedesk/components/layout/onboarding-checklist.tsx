'use client';

// Design Ref: §10 -- Onboarding checklist for admin first use
// Plan SC: FR-22 Dashboard, admin onboarding UX

import { useState, useEffect, useCallback } from 'react';
import Card from 'react-bootstrap/Card';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Button from 'react-bootstrap/Button';
import Collapse from 'react-bootstrap/Collapse';
import { BsCheckCircleFill, BsCircle, BsChevronDown, BsChevronUp, BsXLg } from 'react-icons/bs';
import { usePushSubscription } from '@/hooks/use-push-subscription';

const STORAGE_KEY = 'onboarding_dismissed';

interface CheckItem {
  id: string;
  label: string;
  link: string;
  linkLabel: string;
}

const ONBOARDING_ITEMS: CheckItem[] = [
  { id: 'company', label: '고객사 등록', link: '/master/companies', linkLabel: '고객사 관리' },
  { id: 'user', label: '사용자 등록', link: '/master/users', linkLabel: '사용자 관리' },
  { id: 'project', label: '프로젝트 생성', link: '/master/projects', linkLabel: '프로젝트 관리' },
  { id: 'category', label: '카테고리 설정', link: '/master/categories', linkLabel: '카테고리 관리' },
  { id: 'holiday', label: '공휴일 설정', link: '/master/holidays', linkLabel: '공휴일 관리' },
  { id: 'push', label: 'Push 알림 활성화', link: '#', linkLabel: '아래에서 활성화' },
];

/**
 * Admin onboarding checklist displayed as a collapsible card on the dashboard.
 * Checks each setup step via API and shows progress.
 * Dismissible via localStorage.
 */
export default function OnboardingChecklist() {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [open, setOpen] = useState(true);
  const { isSubscribed } = usePushSubscription();

  const checkItems = useCallback(async () => {
    // Check localStorage dismiss
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(STORAGE_KEY) === 'true') {
        setDismissed(true);
        setLoading(false);
        return;
      }
      setDismissed(false);
    }

    const results: Record<string, boolean> = {};
    const year = new Date().getFullYear();

    const checks: { id: string; url: string; test: (data: { total?: number }) => boolean }[] = [
      { id: 'company', url: '/api/companies?limit=1', test: (d) => (d.total ?? 0) > 0 },
      { id: 'user', url: '/api/users?limit=1', test: (d) => (d.total ?? 0) > 1 },
      { id: 'project', url: '/api/projects?limit=1', test: (d) => (d.total ?? 0) > 0 },
      { id: 'category', url: '/api/categories?limit=1', test: (d) => (d.total ?? 0) > 0 },
      { id: 'holiday', url: `/api/holidays?year=${year}`, test: (d) => (d.total ?? 0) > 0 },
    ];

    await Promise.all(
      checks.map(async (check) => {
        try {
          const res = await fetch(check.url);
          if (res.ok) {
            const json = await res.json();
            results[check.id] = check.test(json.data ?? json);
          } else {
            results[check.id] = false;
          }
        } catch {
          results[check.id] = false;
        }
      }),
    );

    // Push subscription check is client-side
    results.push = isSubscribed;

    setCompleted(results);
    setLoading(false);
  }, [isSubscribed]);

  useEffect(() => {
    checkItems();
  }, [checkItems]);

  // Update push status when it changes
  useEffect(() => {
    setCompleted((prev) => ({ ...prev, push: isSubscribed }));
  }, [isSubscribed]);

  if (dismissed || loading) return null;

  const doneCount = ONBOARDING_ITEMS.filter((item) => completed[item.id]).length;
  const totalCount = ONBOARDING_ITEMS.length;
  const percent = Math.round((doneCount / totalCount) * 100);

  // If all done, don't show
  if (percent >= 100) return null;

  function handleDismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    setDismissed(true);
  }

  return (
    <Card className="border-primary border-opacity-25 shadow-sm mb-4">
      <Card.Header
        className="bg-primary bg-opacity-10 d-flex align-items-center justify-content-between cursor-pointer"
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer' }}
      >
        <div className="d-flex align-items-center gap-2">
          <strong>시작 가이드</strong>
          <span className="text-muted small">{doneCount}/{totalCount} 완료</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button
            variant="link"
            size="sm"
            className="text-muted p-0"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            title="닫기"
          >
            <BsXLg />
          </Button>
          {open ? <BsChevronUp /> : <BsChevronDown />}
        </div>
      </Card.Header>

      <Collapse in={open}>
        <div>
          <Card.Body>
            <ProgressBar
              now={percent}
              label={`${percent}%`}
              variant="primary"
              className="mb-3"
              style={{ height: 8 }}
            />

            <div className="list-group list-group-flush">
              {ONBOARDING_ITEMS.map((item) => {
                const done = completed[item.id] ?? false;
                return (
                  <div
                    key={item.id}
                    className="list-group-item d-flex align-items-center justify-content-between border-0 px-0 py-2"
                  >
                    <div className="d-flex align-items-center gap-2">
                      {done ? (
                        <BsCheckCircleFill className="text-success" />
                      ) : (
                        <BsCircle className="text-muted" />
                      )}
                      <span className={done ? 'text-muted text-decoration-line-through' : ''}>
                        {item.label}
                      </span>
                    </div>
                    {!done && item.link !== '#' && (
                      <a href={item.link} className="btn btn-sm btn-outline-primary">
                        {item.linkLabel}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  );
}
