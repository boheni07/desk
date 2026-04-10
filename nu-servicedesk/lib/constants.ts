// Design Ref: §비즈니스 규칙 상수 — Plan V2.1 기준
// Plan SC: 모든 스케줄러 및 워크플로우 로직은 이 상수를 기준으로 동작

export const BUSINESS_RULES = {
  AUTO_RECEIVE_HOURS: 4,              // 자동접수 근무시간
  DELAY_DETECT_INTERVAL_MS: 60_000,   // 지연감지 배치 주기 (1분)
  EXTEND_AUTO_APPROVE_HOURS: 4,       // 연기 자동승인 근무시간
  EXTEND_AUTO_APPROVE_WARN_HOURS: 3,  // 연기 자동승인 사전 경고 (1시간 전)
  EXTEND_DEADLINE_BUFFER_HOURS: 8,    // 연기신청 마감 (처리기한 8근무시간 전)
  COMPLETE_MAX_ATTEMPTS: 3,           // 완료요청 최대 회차 (3회차 자동승인)
  SATISFACTION_AUTO_CLOSE_DAYS: 5,    // 만족도 자동종료 근무일
  SATISFACTION_REMINDER_DAYS: 4,      // 만족도 리마인더 근무일
  STALE_ESCALATION_DAYS: 3,           // 장기체류 에스컬레이션 근무일
  STALE_ESCALATION_CHECK_HOURS: 24,   // 장기체류 재에스컬레이션 억제 시간 (24시간)
  WORK_HOURS_PER_DAY: 9,              // 일 근무시간 (9시-18시)
  DESIRED_DATE_DEFAULT_DAYS: 5,       // 처리희망일 기본값 (+5근무일)
  EXPECTED_DATE_RANGE_DAYS: 5,        // 완료예정일 범위 (±5근무일)
  COMMENT_EDIT_LIMIT_MINUTES: 10,     // 댓글 수정 제한 (10분)
  PUSH_SUBSCRIPTION_EXPIRE_DAYS: 90,  // Push 구독 만료 (90일)
  NOTIFICATION_RETAIN_DAYS: 90,       // 알림 보존 (90일)
  LOGIN_HISTORY_RETAIN_YEARS: 1,      // 로그인 이력 보존 (1년)
  SESSION_TTL_SECONDS: 28_800,        // 세션 TTL (8시간)
  LOGIN_MAX_ATTEMPTS: 5,              // 로그인 최대 시도
  LOGIN_LOCK_SECONDS: 900,            // 로그인 잠금 (15분)
  PAGE_SIZE_DEFAULT: 20,              // 페이지 기본 크기
  PAGE_SIZE_MAX: 100,                 // 페이지 최대 크기
} as const;

// Free Plan 제한 상수
export const FREE_PLAN_LIMITS = {
  MAX_USERS: 3,
  MAX_STORAGE_GB: 5,
  DATA_RETENTION_YEARS: 1,
  SLA_ENABLED: false,
  KAKAO_ENABLED: false,
} as const;

// 파일 업로드 제한
export const FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,       // 10MB per file
  MAX_TICKET_TOTAL: 50 * 1024 * 1024,    // 50MB per ticket
  MAX_COMMENT_TOTAL: 30 * 1024 * 1024,   // 30MB per comment
  PRESIGN_UPLOAD_TTL: 5 * 60,            // 업로드 URL 만료 5분
  PRESIGN_DOWNLOAD_TTL: 60 * 60,         // 다운로드 URL 만료 1시간
  ALLOWED_EXTENSIONS: ['jpg','jpeg','png','gif','webp','pdf','doc','docx','xls','xlsx','ppt','pptx','txt'],
  BLOCKED_EXTENSIONS: ['exe','sh','bat','cmd','msi','zip','rar','7z','tar','gz'],
} as const;
