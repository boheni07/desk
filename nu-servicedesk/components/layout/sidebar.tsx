'use client';

// Design Ref: §10.1, §10.2 -- Desktop Sidebar Navigation (ITSM V3)

import { usePathname } from 'next/navigation';
import {
  BsSpeedometer2,
  BsTicketDetailedFill,
  BsPlusCircleFill,
  BsBuilding,
  BsPeopleFill,
  BsKanban,
  BsTagsFill,
  BsCalendarEventFill,
  BsGearFill,
  BsPersonFill,
  BsBellFill,
} from 'react-icons/bs';
import { useIsMobile } from '@/hooks/use-media-query';
import type { UserType } from '@/types/auth';

interface SidebarProps {
  userType: UserType;
}

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: UserType[];
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    items: [
      { label: '대시보드', href: '/dashboard', icon: <BsSpeedometer2 />, roles: ['admin', 'support', 'customer'] },
      { label: '티켓 목록', href: '/tickets', icon: <BsTicketDetailedFill />, roles: ['admin', 'support', 'customer'] },
      { label: '티켓 등록', href: '/tickets/new', icon: <BsPlusCircleFill />, roles: ['support', 'customer'] },
    ],
  },
  {
    label: '마스터 관리',
    items: [
      { label: '고객사', href: '/master/companies', icon: <BsBuilding />, roles: ['admin'] },
      { label: '사용자', href: '/master/users', icon: <BsPeopleFill />, roles: ['admin'] },
      { label: '프로젝트', href: '/master/projects', icon: <BsKanban />, roles: ['admin'] },
      { label: '카테고리', href: '/master/categories', icon: <BsTagsFill />, roles: ['admin'] },
      { label: '공휴일', href: '/master/holidays', icon: <BsCalendarEventFill />, roles: ['admin'] },
    ],
  },
  {
    label: '시스템',
    items: [
      { label: '시스템 설정', href: '/system/settings', icon: <BsGearFill />, roles: ['admin'] },
    ],
  },
  {
    items: [
      { label: '알림', href: '/notifications', icon: <BsBellFill />, roles: ['admin', 'support', 'customer'] },
      { label: '내 정보', href: '/profile', icon: <BsPersonFill />, roles: ['admin', 'support', 'customer'] },
    ],
  },
];

export default function Sidebar({ userType }: SidebarProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  if (isMobile) return null;

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

  return (
    <aside className="itsm-sidebar">
      <nav className="py-3">
        {navSections.map((section, si) => {
          const visible = section.items.filter((item) => item.roles.includes(userType));
          if (visible.length === 0) return null;

          return (
            <div key={si}>
              {si > 0 && section.label && (
                <div className="itsm-sidebar-section-label">{section.label}</div>
              )}
              {si > 0 && !section.label && (
                <div className="itsm-sidebar-divider" />
              )}

              {visible.map((item) => {
                const active = isActive(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`itsm-nav-link${active ? ' active' : ''}`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom version tag */}
      <div className="mt-auto px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <small style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          nu-ServiceDesk v3.0
        </small>
      </div>
    </aside>
  );
}
