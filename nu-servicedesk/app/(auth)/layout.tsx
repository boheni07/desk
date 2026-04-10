// Design Ref: §I — Auth layout (minimal, unauthenticated pages)
// Server Component — Bootstrap CSS classes only

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="main-content"
      className="d-flex align-items-center justify-content-center min-vh-100"
      style={{ backgroundColor: '#F8F9FA' }}
    >
      <div style={{ width: '100%', maxWidth: 420, padding: '1rem' }}>
        {children}
      </div>
    </div>
  );
}
