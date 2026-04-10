// Design Ref: §4.1 — 공통 오류 응답 + 비즈니스 오류 코드 (Plan V2.1 기준 17종)

export class BusinessError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'BusinessError';
  }

  toResponse() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        fieldErrors: this.fieldErrors ?? null,
      },
    };
  }
}

// 비즈니스 오류 코드 (Plan V2.1 — 17종)
export const ERRORS = {
  ACCOUNT_LOCKED:           (msg = '5회 연속 실패로 계정이 잠겼습니다. 15분 후 재시도하세요.') => new BusinessError('ACCOUNT_LOCKED', 423, msg),
  ACCOUNT_INACTIVE:         (msg = '비활성 계정입니다.') => new BusinessError('ACCOUNT_INACTIVE', 403, msg),
  MUST_CHANGE_PASSWORD:     (msg = '비밀번호 변경이 필요합니다.') => new BusinessError('MUST_CHANGE_PASSWORD', 403, msg),
  INVALID_CREDENTIALS:      (msg = '아이디 또는 비밀번호가 올바르지 않습니다.') => new BusinessError('INVALID_CREDENTIALS', 401, msg),
  TICKET_ALREADY_RECEIVED:  (msg = '이미 접수된 티켓입니다.') => new BusinessError('TICKET_ALREADY_RECEIVED', 409, msg),
  TICKET_ALREADY_DELAYED:   (msg = '이미 지연 상태로 전환된 티켓입니다.') => new BusinessError('TICKET_ALREADY_DELAYED', 409, msg),
  EXTEND_ALREADY_USED:      (msg = '연기요청을 이미 사용했습니다.') => new BusinessError('EXTEND_ALREADY_USED', 422, msg),
  EXTEND_DEADLINE_PASSED:   (msg = '연기 마감 시간이 지났습니다. (처리기한 8근무시간 전까지)') => new BusinessError('EXTEND_DEADLINE_PASSED', 422, msg),
  EXTEND_ALREADY_PROCESSED: (msg = '이미 처리된 연기요청입니다.') => new BusinessError('EXTEND_ALREADY_PROCESSED', 409, msg),
  COMPLETE_MAX_REACHED:     (msg = '완료요청 최대 횟수를 초과했습니다.') => new BusinessError('COMPLETE_MAX_REACHED', 422, msg),
  MAIN_SUPPORT_ACTIVE:      (msg = 'Main 담당자로 배정된 프로젝트가 있어 비활성화할 수 없습니다.') => new BusinessError('MAIN_SUPPORT_ACTIVE', 422, msg),
  NO_CUSTOMER_ASSIGNED:     (msg = '프로젝트에 고객담당자를 먼저 배정해 주세요.') => new BusinessError('NO_CUSTOMER_ASSIGNED', 422, msg),
  PROJECT_INACTIVE:         (msg = '비활성 프로젝트에는 티켓을 등록할 수 없습니다.') => new BusinessError('PROJECT_INACTIVE', 422, msg),
  COMMENT_EDIT_EXPIRED:     (msg = '댓글 수정 가능 시간(10분)이 경과했습니다.') => new BusinessError('COMMENT_EDIT_EXPIRED', 422, msg),
  PROJECT_ACCESS_DENIED:    (msg = '해당 프로젝트에 접근 권한이 없습니다.') => new BusinessError('PROJECT_ACCESS_DENIED', 403, msg),
  FILE_TOO_LARGE:           (msg = '파일 크기가 제한을 초과했습니다.') => new BusinessError('FILE_TOO_LARGE', 413, msg),
  TICKET_CANCEL_NOT_ALLOWED:(msg = '현재 상태에서는 취소할 수 없습니다.') => new BusinessError('TICKET_CANCEL_NOT_ALLOWED', 422, msg),
} as const;
