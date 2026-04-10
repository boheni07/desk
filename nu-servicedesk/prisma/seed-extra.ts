// 추가 샘플 데이터: 더 풍부한 티켓, 댓글, 알림, 상태이력
import { PrismaClient, TicketStatus, TicketPriority, CommentType, NotificationType, RegistrationMethod } from '@prisma/client';

const prisma = new PrismaClient();

function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function hoursAgo(n: number): Date { const d = new Date(); d.setHours(d.getHours() - n); return d; }
function daysFromNow(n: number): Date { const d = new Date(); d.setDate(d.getDate() + n); return d; }

let ticketCounter = 25; // 기존 시드 이후부터
function nextTicketNumber(): string {
  ticketCounter++;
  return `TK-${new Date().getFullYear()}-${String(ticketCounter).padStart(5, '0')}`;
}

async function main() {
  console.log('🌱 추가 샘플 데이터 생성 시작...\n');

  // 기존 데이터 로드
  const users = await prisma.user.findMany();
  const projects = await prisma.project.findMany({ include: { members: true } });
  const categories = await prisma.category.findMany();

  const admins = users.filter(u => u.type === 'admin');
  const supports = users.filter(u => u.type === 'support');
  const customers = users.filter(u => u.type === 'customer');

  const catMap: Record<string, string> = {};
  for (const c of categories) catMap[c.name] = c.id;

  // ════════════════════════════════════════════════════
  // 1. 추가 고객사 2개 + 부서 + 사용자
  // ════════════════════════════════════════════════════
  console.log('🏢 추가 고객사 생성...');

  const companyDelta = await prisma.company.create({
    data: {
      name: '델타전자', businessNumber: '567-89-01234', address: '서울 강남구 삼성로 100',
      phone: '02-555-6789', isActive: true,
    },
  });
  const companyEpsilon = await prisma.company.create({
    data: {
      name: '엡실론금융', businessNumber: '678-90-12345', address: '서울 여의도 금융로 200',
      phone: '02-777-8901', isActive: true,
    },
  });

  // 부서
  await prisma.department.createMany({
    data: [
      { companyId: companyDelta.id, name: 'R&D센터' },
      { companyId: companyDelta.id, name: '생산관리팀' },
      { companyId: companyDelta.id, name: '품질관리팀' },
      { companyId: companyEpsilon.id, name: '리스크관리부' },
      { companyId: companyEpsilon.id, name: 'IT운영팀' },
      { companyId: companyEpsilon.id, name: '컴플라이언스팀' },
    ],
  });

  console.log('👥 추가 사용자 생성...');
  const bcrypt = await import('bcryptjs');
  const supportPw = await bcrypt.default.hash('Support@1234', 12);
  const customerPw = await bcrypt.default.hash('Customer@1234', 12);

  // 추가 지원담당자 3명
  const sup6 = await prisma.user.create({ data: { loginId: 'sup.song', name: '송하늘', type: 'support', password: supportPw, isActive: true } });
  const sup7 = await prisma.user.create({ data: { loginId: 'sup.jang', name: '장민호', type: 'support', password: supportPw, isActive: true } });
  const sup8 = await prisma.user.create({ data: { loginId: 'sup.yang', name: '양서진', type: 'support', password: supportPw, isActive: true } });

  // 델타전자 고객 4명
  const custD1 = await prisma.user.create({ data: { loginId: 'delta.park', name: '박준형', type: 'customer', password: customerPw, companyId: companyDelta.id, isActive: true } });
  const custD2 = await prisma.user.create({ data: { loginId: 'delta.lee', name: '이소영', type: 'customer', password: customerPw, companyId: companyDelta.id, isActive: true } });
  const custD3 = await prisma.user.create({ data: { loginId: 'delta.choi', name: '최진우', type: 'customer', password: customerPw, companyId: companyDelta.id, isActive: true } });
  const custD4 = await prisma.user.create({ data: { loginId: 'delta.kim', name: '김하은', type: 'customer', password: customerPw, companyId: companyDelta.id, isActive: true } });

  // 엡실론금융 고객 4명
  const custE1 = await prisma.user.create({ data: { loginId: 'epsilon.na', name: '나현수', type: 'customer', password: customerPw, companyId: companyEpsilon.id, isActive: true } });
  const custE2 = await prisma.user.create({ data: { loginId: 'epsilon.seo', name: '서지민', type: 'customer', password: customerPw, companyId: companyEpsilon.id, isActive: true } });
  const custE3 = await prisma.user.create({ data: { loginId: 'epsilon.yoo', name: '유태경', type: 'customer', password: customerPw, companyId: companyEpsilon.id, isActive: true } });
  const custE4 = await prisma.user.create({ data: { loginId: 'epsilon.han', name: '한소희', type: 'customer', password: customerPw, companyId: companyEpsilon.id, isActive: true } });

  // ════════════════════════════════════════════════════
  // 2. 추가 프로젝트 4개
  // ════════════════════════════════════════════════════
  console.log('📋 추가 프로젝트 생성...');

  const projDelta1 = await prisma.project.create({
    data: { name: '델타전자 MES 시스템 지원', code: 'DEL-2026-001', description: '제조실행시스템(MES) 운영 및 장애 대응', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), isActive: true, companyId: companyDelta.id, department: 'R&D센터' },
  });
  const projDelta2 = await prisma.project.create({
    data: { name: '델타전자 사내 포탈 유지보수', code: 'DEL-2026-002', description: '사내 포탈 및 그룹웨어 유지보수', startDate: new Date('2026-02-01'), isActive: true, companyId: companyDelta.id },
  });
  const projEpsilon1 = await prisma.project.create({
    data: { name: '엡실론금융 보안관제 운영', code: 'EPS-2026-001', description: '금융 보안관제 시스템 운영 및 ISMS 대응', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), isActive: true, companyId: companyEpsilon.id, department: 'IT운영팀' },
  });
  const projEpsilon2 = await prisma.project.create({
    data: { name: '엡실론금융 트레이딩 시스템 지원', code: 'EPS-2026-002', description: '실시간 트레이딩 플랫폼 장애 대응 및 모니터링', startDate: new Date('2026-03-01'), isActive: true, companyId: companyEpsilon.id, department: '리스크관리부' },
  });

  // 멤버 배정
  const pmData = [
    { projectId: projDelta1.id, userId: sup6.id, role: 'main_support' as const },
    { projectId: projDelta1.id, userId: sup7.id, role: 'support' as const },
    { projectId: projDelta1.id, userId: custD1.id, role: 'customer' as const },
    { projectId: projDelta1.id, userId: custD2.id, role: 'customer' as const },
    { projectId: projDelta2.id, userId: sup7.id, role: 'main_support' as const },
    { projectId: projDelta2.id, userId: custD3.id, role: 'customer' as const },
    { projectId: projDelta2.id, userId: custD4.id, role: 'customer' as const },
    { projectId: projEpsilon1.id, userId: sup8.id, role: 'main_support' as const },
    { projectId: projEpsilon1.id, userId: sup6.id, role: 'support' as const },
    { projectId: projEpsilon1.id, userId: custE1.id, role: 'customer' as const },
    { projectId: projEpsilon1.id, userId: custE2.id, role: 'customer' as const },
    { projectId: projEpsilon2.id, userId: sup8.id, role: 'main_support' as const },
    { projectId: projEpsilon2.id, userId: sup7.id, role: 'support' as const },
    { projectId: projEpsilon2.id, userId: custE3.id, role: 'customer' as const },
    { projectId: projEpsilon2.id, userId: custE4.id, role: 'customer' as const },
  ];
  await prisma.projectMember.createMany({ data: pmData });

  // ════════════════════════════════════════════════════
  // 3. 추가 티켓 35개 (다양한 상태 분포)
  // ════════════════════════════════════════════════════
  console.log('🎫 추가 티켓 생성...');

  const year = new Date().getFullYear();

  interface TicketInput {
    projectId: string; title: string; content: string; categoryId: string;
    priority: TicketPriority; status: TicketStatus;
    registeredById: string; customerUserId: string;
    desiredDate: Date; deadline?: Date; receivedAt?: Date;
    expectedCompletionDate?: Date; urgencyReason?: string;
    registrationMethod?: RegistrationMethod;
  }

  async function createTicket(input: TicketInput) {
    return prisma.ticket.create({
      data: {
        ticketNumber: nextTicketNumber(),
        ...input,
        registrationMethod: input.registrationMethod ?? 'DIRECT',
      },
    });
  }

  const extraTickets: TicketInput[] = [
    // 델타전자 MES 티켓 (10개)
    { projectId: projDelta1.id, title: 'MES 생산 라인 #3 데이터 수집 중단', content: '3번 라인 PLC에서 데이터가 올라오지 않습니다. OPC UA 서버 연결 오류로 추정.', categoryId: catMap['IT지원'], priority: 'URGENT', status: 'IN_PROGRESS', registeredById: custD1.id, customerUserId: custD1.id, desiredDate: daysAgo(1), deadline: daysFromNow(0), receivedAt: hoursAgo(8), expectedCompletionDate: daysFromNow(0), urgencyReason: '생산 라인 정지 중' },
    { projectId: projDelta1.id, title: 'MES 리포트 PDF 출력 오류', content: '일간 생산 보고서 PDF 출력 시 차트 영역이 공백으로 표시됩니다.', categoryId: catMap['IT지원'], priority: 'NORMAL', status: 'RECEIVED', registeredById: custD2.id, customerUserId: custD2.id, desiredDate: daysFromNow(3), deadline: daysFromNow(3), receivedAt: hoursAgo(2) },
    { projectId: projDelta1.id, title: '품질 검사 자동화 스크립트 수정', content: 'QC 검사 항목 변경에 따른 자동화 스크립트 업데이트가 필요합니다.', categoryId: catMap['IT지원'], priority: 'NORMAL', status: 'REGISTERED', registeredById: custD1.id, customerUserId: custD1.id, desiredDate: daysFromNow(7) },
    { projectId: projDelta1.id, title: 'MES 서버 디스크 용량 90% 초과 경고', content: 'MES DB 서버 C: 드라이브 용량이 90%를 초과했습니다. 로그 정리 및 디스크 증설이 필요합니다.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'IN_PROGRESS', registeredById: custD2.id, customerUserId: custD2.id, desiredDate: daysAgo(2), deadline: daysFromNow(1), receivedAt: daysAgo(2), expectedCompletionDate: daysFromNow(1) },
    { projectId: projDelta1.id, title: '바코드 프린터 네트워크 연결 불안정', content: '생산 현장 바코드 프린터 3대가 간헐적으로 네트워크 끊김 현상이 발생합니다.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'DELAYED', registeredById: custD1.id, customerUserId: custD1.id, desiredDate: daysAgo(5), deadline: daysAgo(1), receivedAt: daysAgo(5), expectedCompletionDate: daysAgo(1) },
    { projectId: projDelta1.id, title: '생산 계획 동기화 오류', content: 'ERP → MES 생산 계획 전송 시 일부 제품 코드가 누락됩니다. 인터페이스 매핑 테이블 점검 필요.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'COMPLETE_REQUESTED', registeredById: custD1.id, customerUserId: custD1.id, desiredDate: daysAgo(8), deadline: daysAgo(5), receivedAt: daysAgo(8), expectedCompletionDate: daysAgo(6) },
    { projectId: projDelta1.id, title: 'MES 사용자 권한 변경 요청', content: '생산관리팀 이소영 차장의 MES 관리자 권한 추가 요청합니다.', categoryId: catMap['IT지원'], priority: 'LOW', status: 'CLOSED', registeredById: custD2.id, customerUserId: custD2.id, desiredDate: daysAgo(15), deadline: daysAgo(13), receivedAt: daysAgo(15), expectedCompletionDate: daysAgo(14) },
    { projectId: projDelta1.id, title: '설비 가동률 대시보드 신규 개발', content: '실시간 설비 가동률 현황을 확인할 수 있는 대시보드 신규 개발을 요청합니다.', categoryId: catMap['IT지원'], priority: 'NORMAL', status: 'REGISTERED', registeredById: custD1.id, customerUserId: custD1.id, desiredDate: daysFromNow(14) },
    { projectId: projDelta1.id, title: '품질 불량률 월간 리포트 자동화', content: '매월 1일 품질 불량률 월간 리포트를 자동 생성하여 이메일로 발송하는 기능 요청합니다.', categoryId: catMap['IT지원'], priority: 'LOW', status: 'SATISFACTION_PENDING', registeredById: custD2.id, customerUserId: custD2.id, desiredDate: daysAgo(10), deadline: daysAgo(8), receivedAt: daysAgo(10), expectedCompletionDate: daysAgo(9) },
    { projectId: projDelta1.id, title: 'MES 모바일 앱 로그인 오류', content: 'Android 태블릿에서 MES 모바일 앱 로그인 시 세션 만료 오류 반복 발생.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'CLOSED', registeredById: custD1.id, customerUserId: custD1.id, desiredDate: daysAgo(20), deadline: daysAgo(18), receivedAt: daysAgo(20), expectedCompletionDate: daysAgo(19) },

    // 델타전자 사내 포탈 (5개)
    { projectId: projDelta2.id, title: '그룹웨어 전자결재 첨부파일 업로드 오류', content: '10MB 이상 파일 첨부 시 "서버 오류" 메시지가 표시됩니다.', categoryId: catMap['IT지원'], priority: 'NORMAL', status: 'IN_PROGRESS', registeredById: custD3.id, customerUserId: custD3.id, desiredDate: daysAgo(3), deadline: daysFromNow(2), receivedAt: daysAgo(3), expectedCompletionDate: daysFromNow(2) },
    { projectId: projDelta2.id, title: '사내 공지사항 게시판 정렬 오류', content: '공지사항 목록이 최신순이 아닌 오래된 순으로 표시됩니다.', categoryId: catMap['IT지원'], priority: 'LOW', status: 'CLOSED', registeredById: custD4.id, customerUserId: custD4.id, desiredDate: daysAgo(12), deadline: daysAgo(10), receivedAt: daysAgo(12), expectedCompletionDate: daysAgo(11) },
    { projectId: projDelta2.id, title: '식단표 연동 API 오류', content: '포탈 메인 페이지 식단표 위젯이 "데이터 없음"으로 표시됩니다.', categoryId: catMap['IT지원'], priority: 'LOW', status: 'REGISTERED', registeredById: custD3.id, customerUserId: custD3.id, desiredDate: daysFromNow(5), registrationMethod: 'EMAIL' },
    { projectId: projDelta2.id, title: '회의실 예약 시스템 시간 충돌', content: '같은 시간대에 같은 회의실이 중복 예약되는 문제가 발생합니다.', categoryId: catMap['시설관리'], priority: 'HIGH', status: 'RECEIVED', registeredById: custD4.id, customerUserId: custD4.id, desiredDate: daysFromNow(2), deadline: daysFromNow(2), receivedAt: hoursAgo(4) },
    { projectId: projDelta2.id, title: '사원증 출입 기록 조회 기능 요청', content: '인사팀에서 사원증 출입 기록을 조회할 수 있는 기능 추가를 요청합니다.', categoryId: catMap['인사'], priority: 'NORMAL', status: 'REGISTERED', registeredById: custD3.id, customerUserId: custD3.id, desiredDate: daysFromNow(10), registrationMethod: 'PHONE' },

    // 엡실론금융 보안관제 (10개)
    { projectId: projEpsilon1.id, title: '방화벽 룰셋 긴급 변경 요청', content: '신규 트레이딩 서버(10.0.5.0/24) 외부 통신 허용 룰 추가가 필요합니다.', categoryId: catMap['보안'], priority: 'URGENT', status: 'CLOSED', registeredById: custE1.id, customerUserId: custE1.id, desiredDate: daysAgo(3), deadline: daysAgo(2), receivedAt: daysAgo(3), expectedCompletionDate: daysAgo(2) },
    { projectId: projEpsilon1.id, title: 'VPN 접속 불안정 (재택근무)', content: '재택근무 시 VPN 접속이 30분마다 끊기는 현상이 반복됩니다. 약 50명 영향.', categoryId: catMap['보안'], priority: 'HIGH', status: 'IN_PROGRESS', registeredById: custE2.id, customerUserId: custE2.id, desiredDate: daysAgo(2), deadline: daysFromNow(1), receivedAt: daysAgo(2), expectedCompletionDate: daysFromNow(1) },
    { projectId: projEpsilon1.id, title: 'ISMS 인증 사전 점검 지원', content: '6월 ISMS 인증 심사 대비 보안 취약점 사전 점검 및 보완 요청합니다.', categoryId: catMap['보안'], priority: 'HIGH', status: 'RECEIVED', registeredById: custE1.id, customerUserId: custE1.id, desiredDate: daysFromNow(30), deadline: daysFromNow(30), receivedAt: hoursAgo(12) },
    { projectId: projEpsilon1.id, title: 'DLP 솔루션 오탐 패턴 조정', content: 'DLP가 정상 업무 파일을 차단하는 오탐이 하루 평균 20건 발생합니다.', categoryId: catMap['보안'], priority: 'NORMAL', status: 'IN_PROGRESS', registeredById: custE2.id, customerUserId: custE2.id, desiredDate: daysAgo(4), deadline: daysFromNow(3), receivedAt: daysAgo(4), expectedCompletionDate: daysFromNow(3) },
    { projectId: projEpsilon1.id, title: '보안관제 이벤트 로그 저장 용량 부족', content: 'SIEM 로그 저장 공간이 80%를 초과했습니다. 아카이빙 정책 수립 필요.', categoryId: catMap['보안'], priority: 'HIGH', status: 'DELAYED', registeredById: custE1.id, customerUserId: custE1.id, desiredDate: daysAgo(7), deadline: daysAgo(3), receivedAt: daysAgo(7), expectedCompletionDate: daysAgo(3) },
    { projectId: projEpsilon1.id, title: 'SSL 인증서 갱신 (10개 도메인)', content: '6월 만료 예정인 SSL 인증서 10개 갱신 작업 요청합니다.', categoryId: catMap['보안'], priority: 'NORMAL', status: 'REGISTERED', registeredById: custE2.id, customerUserId: custE2.id, desiredDate: daysFromNow(20) },
    { projectId: projEpsilon1.id, title: 'EDR 에이전트 업데이트 배포', content: '전사 PC 800대 대상 EDR 에이전트 최신 버전 배포 요청합니다.', categoryId: catMap['보안'], priority: 'NORMAL', status: 'CLOSED', registeredById: custE1.id, customerUserId: custE1.id, desiredDate: daysAgo(18), deadline: daysAgo(14), receivedAt: daysAgo(18), expectedCompletionDate: daysAgo(15) },
    { projectId: projEpsilon1.id, title: '보안 교육 자료 업데이트', content: '신규 입사자용 보안 교육 자료에 최신 피싱 사례 추가 요청합니다.', categoryId: catMap['보안'], priority: 'LOW', status: 'CLOSED', registeredById: custE2.id, customerUserId: custE2.id, desiredDate: daysAgo(25), deadline: daysAgo(22), receivedAt: daysAgo(25), expectedCompletionDate: daysAgo(23) },
    { projectId: projEpsilon1.id, title: '네트워크 세그먼트 분리 작업', content: '트레이딩 네트워크와 사무 네트워크 물리적 분리 작업 요청합니다.', categoryId: catMap['보안'], priority: 'HIGH', status: 'EXTEND_REQUESTED', registeredById: custE1.id, customerUserId: custE1.id, desiredDate: daysAgo(14), deadline: daysAgo(5), receivedAt: daysAgo(14), expectedCompletionDate: daysAgo(5) },
    { projectId: projEpsilon1.id, title: '보안 취약점 스캐닝 결과 대응', content: '분기 취약점 스캐닝 결과 Critical 3건, High 12건 발견. 조치 요청합니다.', categoryId: catMap['보안'], priority: 'URGENT', status: 'IN_PROGRESS', registeredById: custE1.id, customerUserId: custE1.id, desiredDate: daysAgo(5), deadline: daysFromNow(2), receivedAt: daysAgo(5), expectedCompletionDate: daysFromNow(2), urgencyReason: '감독원 보고 기한 임박' },

    // 엡실론금융 트레이딩 (10개)
    { projectId: projEpsilon2.id, title: '실시간 시세 데이터 지연 발생', content: '오후 2시~3시 사이 실시간 시세 데이터가 5초 이상 지연됩니다. 코스피 200 옵션 거래에 영향.', categoryId: catMap['IT지원'], priority: 'URGENT', status: 'IN_PROGRESS', registeredById: custE3.id, customerUserId: custE3.id, desiredDate: daysAgo(1), deadline: daysFromNow(0), receivedAt: hoursAgo(6), expectedCompletionDate: daysFromNow(0), urgencyReason: '실시간 거래 영향' },
    { projectId: projEpsilon2.id, title: 'FIX 프로토콜 연결 오류', content: 'K증권 FIX 게이트웨이 연결이 장중 간헐적으로 끊깁니다.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'RECEIVED', registeredById: custE3.id, customerUserId: custE3.id, desiredDate: daysFromNow(1), deadline: daysFromNow(1), receivedAt: hoursAgo(3) },
    { projectId: projEpsilon2.id, title: '리스크 관리 리포트 자동 생성 오류', content: '일일 VaR(Value at Risk) 리포트가 자동 생성되지 않습니다.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'CLOSED', registeredById: custE4.id, customerUserId: custE4.id, desiredDate: daysAgo(10), deadline: daysAgo(8), receivedAt: daysAgo(10), expectedCompletionDate: daysAgo(9) },
    { projectId: projEpsilon2.id, title: '트레이딩 서버 메모리 증설', content: '거래량 증가로 트레이딩 서버 메모리 64GB → 128GB 증설 요청합니다.', categoryId: catMap['IT지원'], priority: 'NORMAL', status: 'REGISTERED', registeredById: custE3.id, customerUserId: custE3.id, desiredDate: daysFromNow(7) },
    { projectId: projEpsilon2.id, title: '주문 체결 알림 SMS 미발송', content: '대량 주문 체결 시 알림 SMS가 발송되지 않는 건이 간헐적으로 발생합니다.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'COMPLETE_REQUESTED', registeredById: custE4.id, customerUserId: custE4.id, desiredDate: daysAgo(6), deadline: daysAgo(3), receivedAt: daysAgo(6), expectedCompletionDate: daysAgo(4) },
    { projectId: projEpsilon2.id, title: '백테스팅 환경 구축 요청', content: '퀀트팀에서 과거 5년 시세 데이터 기반 백테스팅 환경 구축을 요청합니다.', categoryId: catMap['IT지원'], priority: 'NORMAL', status: 'IN_PROGRESS', registeredById: custE3.id, customerUserId: custE3.id, desiredDate: daysAgo(7), deadline: daysFromNow(5), receivedAt: daysAgo(7), expectedCompletionDate: daysFromNow(5) },
    { projectId: projEpsilon2.id, title: '거래소 API 버전 업그레이드', content: 'KRX 거래소 API v3.0 업그레이드 일정에 맞춰 시스템 대응 필요합니다.', categoryId: catMap['IT지원'], priority: 'HIGH', status: 'RECEIVED', registeredById: custE4.id, customerUserId: custE4.id, desiredDate: daysFromNow(14), deadline: daysFromNow(14), receivedAt: hoursAgo(1) },
    { projectId: projEpsilon2.id, title: '트레이딩 룸 네트워크 장비 교체', content: '트레이딩 룸 L3 스위치 노후화로 교체 요청합니다. MTBF 초과.', categoryId: catMap['IT지원'], priority: 'NORMAL', status: 'CLOSED', registeredById: custE3.id, customerUserId: custE3.id, desiredDate: daysAgo(30), deadline: daysAgo(25), receivedAt: daysAgo(30), expectedCompletionDate: daysAgo(26) },
    { projectId: projEpsilon2.id, title: '재해복구(DR) 절체 테스트 지원', content: '분기 DR 절체 테스트 일정(4/20) 기술 지원 요청합니다.', categoryId: catMap['보안'], priority: 'NORMAL', status: 'REGISTERED', registeredById: custE4.id, customerUserId: custE4.id, desiredDate: daysFromNow(10), registrationMethod: 'EMAIL' },
    { projectId: projEpsilon2.id, title: '모의투자 서버 초기화 요청', content: '신입 트레이더 교육용 모의투자 서버 데이터 초기화 요청합니다.', categoryId: catMap['IT지원'], priority: 'LOW', status: 'SATISFACTION_PENDING', registeredById: custE3.id, customerUserId: custE3.id, desiredDate: daysAgo(8), deadline: daysAgo(6), receivedAt: daysAgo(8), expectedCompletionDate: daysAgo(7) },
  ];

  const createdTickets = [];
  for (const t of extraTickets) {
    createdTickets.push(await createTicket(t));
  }

  // 채번 카운터 업데이트
  await prisma.ticketSequence.upsert({
    where: { year },
    update: { lastNumber: ticketCounter },
    create: { year, lastNumber: ticketCounter },
  });

  console.log(`✅ 추가 티켓 ${extraTickets.length}개 생성 완료 (총 ${ticketCounter}개)`);

  // ════════════════════════════════════════════════════
  // 4. 추가 티켓 배정
  // ════════════════════════════════════════════════════
  console.log('📌 추가 티켓 배정...');
  const assignable = createdTickets.filter(t => !['REGISTERED', 'CANCELLED'].includes(t.status));
  for (const t of assignable) {
    // 프로젝트의 main_support에게 배정
    const pm = pmData.find(p => p.projectId === t.projectId && p.role === 'main_support');
    if (pm) {
      await prisma.ticketAssignment.create({ data: { ticketId: t.id, userId: pm.userId } }).catch(() => {});
    }
  }

  // ════════════════════════════════════════════════════
  // 5. 추가 댓글 (풍부한 대화)
  // ════════════════════════════════════════════════════
  console.log('💬 추가 댓글 생성...');
  const commentData: { ticketId: string; authorId: string; content: string; type: CommentType; createdAt: Date }[] = [];

  for (const t of createdTickets) {
    if (['REGISTERED', 'CANCELLED'].includes(t.status)) continue;

    // 접수 시 인사 댓글
    const pm = pmData.find(p => p.projectId === t.projectId && p.role === 'main_support');
    if (pm) {
      commentData.push({ ticketId: t.id, authorId: pm.userId, content: '안녕하세요, 해당 건 확인하겠습니다. 추가 정보가 필요하면 말씀 부탁드립니다.', type: 'PUBLIC', createdAt: hoursAgo(Math.floor(Math.random() * 48) + 1) });
    }

    // 진행 중이면 진행 상황 댓글
    if (['IN_PROGRESS', 'DELAYED', 'COMPLETE_REQUESTED', 'SATISFACTION_PENDING', 'CLOSED'].includes(t.status) && pm) {
      commentData.push({ ticketId: t.id, authorId: pm.userId, content: '현재 원인 분석 중입니다. 진행 상황이 있으면 업데이트하겠습니다.', type: 'PUBLIC', createdAt: hoursAgo(Math.floor(Math.random() * 24) + 1) });
    }

    // 완료됨이면 완료 댓글
    if (['CLOSED', 'SATISFACTION_PENDING'].includes(t.status) && pm) {
      commentData.push({ ticketId: t.id, authorId: pm.userId, content: '처리 완료되었습니다. 확인 부탁드립니다. 추가 문의사항이 있으시면 언제든 말씀해 주세요.', type: 'PUBLIC', createdAt: hoursAgo(Math.floor(Math.random() * 12) + 1) });
    }

    // 내부 메모
    if (Math.random() > 0.5 && pm) {
      commentData.push({ ticketId: t.id, authorId: pm.userId, content: '[내부 메모] 해당 건은 벤더 측 확인이 필요합니다. 담당자 연락처: 02-XXX-XXXX', type: 'INTERNAL', createdAt: hoursAgo(Math.floor(Math.random() * 36) + 1) });
    }
  }

  for (const c of commentData) {
    await prisma.comment.create({ data: c });
  }
  console.log(`✅ 추가 댓글 ${commentData.length}개 생성 완료`);

  // ════════════════════════════════════════════════════
  // 6. 추가 알림
  // ════════════════════════════════════════════════════
  console.log('🔔 추가 알림 생성...');
  let notifCount = 0;
  for (const t of createdTickets.slice(0, 15)) {
    const pm = pmData.find(p => p.projectId === t.projectId && p.role === 'main_support');
    if (!pm) continue;

    await prisma.notification.create({
      data: { userId: pm.userId, type: 'TICKET_CREATED', title: '새 티켓이 등록되었습니다', body: `[${t.ticketNumber}] ${t.title}`, ticketId: t.id, createdAt: hoursAgo(Math.floor(Math.random() * 72)) },
    });
    notifCount++;

    // 고객에게도 접수 알림
    await prisma.notification.create({
      data: { userId: t.customerUserId, type: 'TICKET_RECEIVED', title: '티켓이 접수되었습니다', body: `[${t.ticketNumber}] ${t.title} 건이 접수 처리되었습니다.`, ticketId: t.id, isRead: Math.random() > 0.5, createdAt: hoursAgo(Math.floor(Math.random() * 48)) },
    });
    notifCount++;
  }
  console.log(`✅ 추가 알림 ${notifCount}개 생성 완료`);

  // ════════════════════════════════════════════════════
  // 7. 만족도 평가 (CLOSED 티켓)
  // ════════════════════════════════════════════════════
  console.log('⭐ 추가 만족도 평가...');
  const closedTickets = createdTickets.filter(t => t.status === 'CLOSED');
  let rateCount = 0;
  for (const t of closedTickets) {
    const rating = [3, 4, 4, 5, 5, 5][Math.floor(Math.random() * 6)];
    const comments = ['빠른 처리 감사합니다.', '만족합니다.', '잘 해결해 주셨습니다. 감사합니다!', '신속한 대응에 감사드립니다.', ''];
    await prisma.satisfactionRating.create({
      data: { ticketId: t.id, userId: t.customerUserId, rating, comment: comments[Math.floor(Math.random() * comments.length)] || null, createdAt: daysAgo(Math.floor(Math.random() * 5)) },
    });
    rateCount++;
  }
  console.log(`✅ 추가 만족도 평가 ${rateCount}건 완료`);

  // ════════════════════════════════════════════════════
  // 8. 추가 로그인 이력
  // ════════════════════════════════════════════════════
  console.log('🔐 추가 로그인 이력...');
  const allActiveUsers = [...supports, ...customers.slice(0, 6), ...admins, sup6, sup7, sup8, custD1, custD2, custE1, custE2, custE3];
  let loginCount = 0;
  for (const u of allActiveUsers) {
    for (let i = 0; i < 3 + Math.floor(Math.random() * 5); i++) {
      await prisma.loginHistory.create({
        data: { userId: u.id, loginId: u.loginId, success: Math.random() > 0.05, ipAddress: `192.168.1.${10 + Math.floor(Math.random() * 200)}`, failReason: null, createdAt: hoursAgo(Math.floor(Math.random() * 168)) },
      });
      loginCount++;
    }
  }
  console.log(`✅ 추가 로그인 이력 ${loginCount}건 완료`);

  // 완료 출력
  const totalTickets = await prisma.ticket.count();
  const totalComments = await prisma.comment.count();
  const totalNotifications = await prisma.notification.count();
  const totalUsers = await prisma.user.count();
  const totalCompanies = await prisma.company.count();
  const totalProjects = await prisma.project.count();

  console.log(`
✅ 추가 시딩 완료!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  고객사:       ${totalCompanies}개
  사용자:       ${totalUsers}명
  프로젝트:     ${totalProjects}개
  티켓:         ${totalTickets}개
  댓글:         ${totalComments}개
  알림:         ${totalNotifications}개
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

추가 계정 정보:
  지원담당자:   sup.song, sup.jang, sup.yang / Support@1234
  델타전자:     delta.park ~ delta.kim / Customer@1234
  엡실론금융:   epsilon.na ~ epsilon.han / Customer@1234
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
