'use client';

// Design Ref: §10.2 -- Mobile bottom tab navigation (ITSM V3)

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BsSpeedometer2,
  BsTicketDetailedFill,
  BsBellFill,
  BsPersonFill,
  BsGearFill,
} from 'react-icons/bs';
import { useUnreadCount } from '@/hooks/use-unread-count';
import type { UserType } from '@/types/auth';

interface MobileBottomNavProps {
  userType: UserType;
}

interface TabItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

function buildTabs(userType: UserType): TabItem[] {
  return [
    { label: '대시보드', href: '/dashboard',     icon: <BsSpeedometer2 /> },
    { label: '티켓',    href: '/tickets',         icon: <BsTicketDetailedFill /> },
    { label: '알림',    href: '/notifications',   icon: <BsBellFill /> },
    userType === 'admin'
      ? { label: '설정', href: '/system/settings', icon: <BsGearFill /> }
      : { label: '내정보', href: '/profile',       icon: <BsPersonFill /> },
  ];
}

export default function MobileBottomNav({ userType }: MobileBottomNavProps) {
  const pathname    = usePathname();
  const { unreadCount: unread } = useUnreadCount();
  const tabs = buildTabs(userType);

  // Visibility controlled by CSS d-md-none (no JS conditional to avoid hydration mismatch)
  return (
    <nav
      className="itsm-bottom-nav d-md-none"
      role="navigation"
      aria-label="모바일 내비게이션"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`itsm-bottom-nav-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span style={{ position: 'relative' }}>
              {tab.icon}
              {tab.href === '/notifications' && unread > 0 && (
                <span className="notif-badge" style={{ top: -6, right: -8 }}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
