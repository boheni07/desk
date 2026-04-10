'use client';

// Design Ref: §10.2 — Header Component (ITSM V3)

import Dropdown from 'react-bootstrap/Dropdown';
import { useRouter } from 'next/navigation';
import { BsBoxArrowRight, BsPersonGear } from 'react-icons/bs';
import NotificationBell from '@/components/layout/notification-bell';
import type { UserType } from '@/types/auth';

interface HeaderProps {
  user: {
    id: string;
    name: string;
    type: UserType;
    companyId: string | null;
  };
}

const typeLabels: Record<UserType, string> = {
  admin: '관리자',
  support: '지원담당자',
  customer: '고객담당자',
};

const typeBadgeColor: Record<UserType, string> = {
  admin:    '#EF4444',
  support:  '#3B5BDB',
  customer: '#2F9E44',
};

export default function Header({ user }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } finally {
      router.push('/login');
    }
  }

  return (
    <header className="itsm-header">
      {/* Brand */}
      <a href="/dashboard" className="itsm-brand me-auto">
        nu-ServiceDesk
      </a>

      {/* Actions */}
      <div className="d-flex align-items-center" style={{ gap: '1.25rem' }}>
        {/* Notification bell */}
        <NotificationBell />

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border-subtle)' }} />

        {/* User menu */}
        <Dropdown align="end">
          <Dropdown.Toggle
            id="user-menu"
            className="btn border-0 bg-transparent p-0 d-flex align-items-center"
            aria-label="사용자 메뉴"
          >
            <div
              className="d-flex align-items-center gap-2 px-2 py-1 rounded"
              style={{
                border: '1px solid var(--border-subtle)',
                background: '#F8F9FA',
                transition: 'all 150ms ease',
                minWidth: 0,
                height: 36,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--brand-primary-lt)';
                (e.currentTarget as HTMLElement).style.borderColor = '#C5D0F8';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#F8F9FA';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
              }}
            >
              <div
                style={{
                  width: 30, height: 30,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--brand-primary), #7C3AED)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '0.8rem', fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {user.name.trim().charAt(0) || '?'}
              </div>
              <div className="d-none d-sm-block" style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user.name}
                </div>
                <div style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: typeBadgeColor[user.type],
                      display: 'inline-block', flexShrink: 0,
                    }}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>{typeLabels[user.type]}</span>
                </div>
              </div>
            </div>
          </Dropdown.Toggle>

          <Dropdown.Menu style={{ minWidth: 200 }}>
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{user.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{typeLabels[user.type]}</div>
            </div>
            <Dropdown.Item href="/profile">
              <BsPersonGear className="me-2" size={14} />
              내 정보 수정
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item onClick={handleLogout} className="text-danger">
              <BsBoxArrowRight className="me-2" size={14} />
              로그아웃
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </header>
  );
}
