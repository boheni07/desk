// Design Ref: §3.2 — Redis 세션 + 사용자 타입

export type UserType = 'admin' | 'support' | 'customer';

export interface RedisSession {
  userId: string;
  loginId: string;
  name: string;
  type: UserType;
  companyId: string | null;
  createdAt: string;      // ISO 8601
  lastAccessAt: string;   // ISO 8601
}

export interface SessionUser {
  id: string;
  loginId: string;
  name: string;
  type: UserType;
  companyId: string | null;
  mustChangePassword: boolean;
}
