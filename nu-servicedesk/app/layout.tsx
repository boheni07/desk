// Design Ref: §1 — Root Layout (Bootstrap 5 + Pretendard)
import type { Metadata, Viewport } from 'next';
import '@/styles/bootstrap-custom.scss';
import './globals.css';

export const metadata: Metadata = {
  title: { template: '%s | nu-ServiceDesk', default: 'nu-ServiceDesk' },
  description: '한국 기업을 위한 서비스데스크 플랫폼',
};

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
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
