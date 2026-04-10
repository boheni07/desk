// Design Ref: §1 — Root Layout (Bootstrap 5 + Pretendard)
import type { Metadata } from 'next';
import '@/styles/bootstrap-custom.scss';
import './globals.css';

export const metadata: Metadata = {
  title: 'nu-ServiceDesk',
  description: '한국 기업을 위한 서비스데스크 플랫폼',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {/* Skip Link (WCAG 2.1 AA) */}
        <a
          href="#main-content"
          className="visually-hidden-focusable position-absolute top-0 start-0 p-2 bg-primary text-white"
          style={{ zIndex: 9999 }}
        >
          본문으로 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
