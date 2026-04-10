// Design Ref: §10.2 -- Main Layout (ITSM V3)
// Server Component -- checks session, renders shell

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Header from '@/components/layout/header';
import Sidebar from '@/components/layout/sidebar';
import MobileBottomNav from '@/components/layout/mobile-bottom-nav';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = {
    id: session.userId,
    name: session.name,
    type: session.type,
    companyId: session.companyId,
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-base)' }}>
      <Header user={user} />

      <div
        className="d-flex"
        style={{ marginTop: 'var(--header-height)', minHeight: 'calc(100vh - var(--header-height))' }}
      >
        {/* Desktop sidebar */}
        <div className="d-none d-md-flex flex-shrink-0">
          <Sidebar userType={user.type} />
        </div>

        {/* Main content */}
        <main
          id="main-content"
          className="flex-grow-1 overflow-auto itsm-content"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav userType={user.type} />
    </div>
  );
}
