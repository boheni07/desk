// Design Ref: §3 — 초기 데이터 시드 (샘플 데이터 포함)
import { PrismaClient, TicketStatus, TicketPriority, UserType, ProjectMemberRole, CommentType, ApprovalStatus, NotificationType, RegistrationMethod } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── 유틸리티 ──────────────────────────────────────────
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function hoursAgo(n: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ── 채번 헬퍼 ─────────────────────────────────────────
let ticketCounter = 0;
function nextTicketNumber(): string {
  ticketCounter++;
  const year = new Date().getFullYear();
  return `TK-${year}-${String(ticketCounter).padStart(5, '0')}`;
}

async function main() {
  console.log('🌱 Seeding database...\n');

  const SALT = 12;
  const pw = await bcrypt.hash('Admin@1234', SALT);
  const supportPw = await bcrypt.hash('Support@1234', SALT);
  const customerPw = await bcrypt.hash('Customer@1234', SALT);

  // ════════════════════════════════════════════════════
  // 1. 시스템 설정
  // ════════════════════════════════════════════════════
  console.log('⚙️  시스템 설정 생성...');
  const settings = [
    { key: 'work_start_time', value: '"09:00"' },
    { key: 'work_end_time', value: '"18:00"' },
    { key: 'supervisor_user_ids', value: '[]' },   // admin id로 나중에 업데이트
    { key: 'auto_approve_extend_days', value: '3' },
    { key: 'auto_approve_complete_days', value: '5' },
    { key: 'satisfaction_reminder_days', value: '3' },
    { key: 'stale_ticket_days', value: '7' },
    { key: 'max_login_attempts', value: '5' },
    { key: 'lock_duration_minutes', value: '30' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key }, update: {}, create: s,
    });
  }

  // ════════════════════════════════════════════════════
  // 2. 카테고리
  // ════════════════════════════════════════════════════
  console.log('📂 카테고리 생성...');
  const categoryNames = ['IT지원', '시설관리', '인사', '총무', '보안', '기타'];
  const categories: Record<string, string> = {};
  for (let i = 0; i < categoryNames.length; i++) {
    const c = await prisma.category.upsert({
      where: { name: categoryNames[i] },
      update: {},
      create: { name: categoryNames[i], sortOrder: i, isActive: true },
    });
    categories[categoryNames[i]] = c.id;
  }

  // ════════════════════════════════════════════════════
  // 3. 2026년 공휴일
  // ════════════════════════════════════════════════════
  console.log('📅 공휴일 생성...');
  const holidays2026 = [
    { date: '2026-01-01', name: '신정' },
    { date: '2026-02-16', name: '설날 전날' },
    { date: '2026-02-17', name: '설날' },
    { date: '2026-02-18', name: '설날 다음날' },
    { date: '2026-03-01', name: '삼일절' },
    { date: '2026-05-05', name: '어린이날' },
    { date: '2026-05-24', name: '부처님 오신 날' },
    { date: '2026-06-06', name: '현충일' },
    { date: '2026-08-15', name: '광복절' },
    { date: '2026-09-24', name: '추석 전날' },
    { date: '2026-09-25', name: '추석' },
    { date: '2026-09-26', name: '추석 다음날' },
    { date: '2026-10-03', name: '개천절' },
    { date: '2026-10-09', name: '한글날' },
    { date: '2026-12-25', name: '크리스마스' },
  ];
  for (const h of holidays2026) {
    const d = new Date(h.date);
    await prisma.holiday.upsert({
      where: { date: d },
      update: {},
      create: { date: d, name: h.name, year: 2026 },
    });
  }

  // ════════════════════════════════════════════════════
  // 4. 관리자 계정
  // ════════════════════════════════════════════════════
  console.log('👤 관리자 생성...');
  const admin = await prisma.user.upsert({
    where: { loginId: 'admin' },
    update: {},
    create: {
      loginId: 'admin',
      password: pw,
      name: '시스템 관리자',
      email: 'admin@nu-servicedesk.com',
      type: UserType.admin,
      mustChangePassword: false,
      isActive: true,
    },
  });

  // supervisor 설정 업데이트
  await prisma.systemSetting.update({
    where: { key: 'supervisor_user_ids' },
    data: { value: JSON.stringify([admin.id]) },
  });

  // ════════════════════════════════════════════════════
  // 5. 고객사 3개
  // ════════════════════════════════════════════════════
  console.log('🏢 고객사 생성...');

  const companyAlpha = await prisma.company.upsert({
    where: { businessNumber: '123-45-67890' },
    update: {},
    create: {
      name: '(주)알파테크',
      businessNumber: '123-45-67890',
      address: '서울특별시 강남구 테헤란로 123',
      phone: '02-1234-5678',
      isActive: true,
    },
  });
  const companyBeta = await prisma.company.upsert({
    where: { businessNumber: '234-56-78901' },
    update: {},
    create: {
      name: '베타솔루션즈(주)',
      businessNumber: '234-56-78901',
      address: '경기도 성남시 분당구 판교로 456',
      phone: '031-234-5678',
      isActive: true,
    },
  });
  const companyGamma = await prisma.company.upsert({
    where: { businessNumber: '345-67-89012' },
    update: {},
    create: {
      name: '감마물류(주)',
      businessNumber: '345-67-89012',
      address: '인천광역시 연수구 송도과학로 789',
      phone: '032-345-6789',
      isActive: true,
    },
  });

  // ════════════════════════════════════════════════════
  // 6. 부서
  // ════════════════════════════════════════════════════
  console.log('🏗️  부서 생성...');

  const deptAlphaIT = await prisma.department.upsert({
    where: { companyId_name: { companyId: companyAlpha.id, name: 'IT팀' } },
    update: {},
    create: { companyId: companyAlpha.id, name: 'IT팀', code: 'ALP-IT' },
  });
  const deptAlphaHR = await prisma.department.upsert({
    where: { companyId_name: { companyId: companyAlpha.id, name: '인사팀' } },
    update: {},
    create: { companyId: companyAlpha.id, name: '인사팀', code: 'ALP-HR' },
  });
  const deptAlphaFin = await prisma.department.upsert({
    where: { companyId_name: { companyId: companyAlpha.id, name: '재무팀' } },
    update: {},
    create: { companyId: companyAlpha.id, name: '재무팀', code: 'ALP-FIN' },
  });

  const deptBetaDev = await prisma.department.upsert({
    where: { companyId_name: { companyId: companyBeta.id, name: '개발팀' } },
    update: {},
    create: { companyId: companyBeta.id, name: '개발팀', code: 'BET-DEV' },
  });
  const deptBetaOps = await prisma.department.upsert({
    where: { companyId_name: { companyId: companyBeta.id, name: '운영팀' } },
    update: {},
    create: { companyId: companyBeta.id, name: '운영팀', code: 'BET-OPS' },
  });

  const deptGammaLog = await prisma.department.upsert({
    where: { companyId_name: { companyId: companyGamma.id, name: '물류팀' } },
    update: {},
    create: { companyId: companyGamma.id, name: '물류팀', code: 'GAM-LOG' },
  });
  const deptGammaADM = await prisma.department.upsert({
    where: { companyId_name: { companyId: companyGamma.id, name: '총무팀' } },
    update: {},
    create: { companyId: companyGamma.id, name: '총무팀', code: 'GAM-ADM' },
  });

  // ════════════════════════════════════════════════════
  // 7. 지원담당자 (support) 5명
  // ════════════════════════════════════════════════════
  console.log('👨‍💼 지원담당자 생성...');

  const sup1 = await prisma.user.upsert({
    where: { loginId: 'sup.kim' },
    update: {},
    create: {
      loginId: 'sup.kim',
      password: supportPw,
      name: '김지원',
      email: 'kim.jiwon@nu-servicedesk.com',
      phone: '010-1111-2222',
      type: UserType.support,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const sup2 = await prisma.user.upsert({
    where: { loginId: 'sup.lee' },
    update: {},
    create: {
      loginId: 'sup.lee',
      password: supportPw,
      name: '이수민',
      email: 'lee.sumin@nu-servicedesk.com',
      phone: '010-2222-3333',
      type: UserType.support,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const sup3 = await prisma.user.upsert({
    where: { loginId: 'sup.park' },
    update: {},
    create: {
      loginId: 'sup.park',
      password: supportPw,
      name: '박민준',
      email: 'park.minjun@nu-servicedesk.com',
      phone: '010-3333-4444',
      type: UserType.support,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const sup4 = await prisma.user.upsert({
    where: { loginId: 'sup.choi' },
    update: {},
    create: {
      loginId: 'sup.choi',
      password: supportPw,
      name: '최서연',
      email: 'choi.seoyeon@nu-servicedesk.com',
      phone: '010-4444-5555',
      type: UserType.support,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const sup5 = await prisma.user.upsert({
    where: { loginId: 'sup.jung' },
    update: {},
    create: {
      loginId: 'sup.jung',
      password: supportPw,
      name: '정도윤',
      email: 'jung.doyun@nu-servicedesk.com',
      phone: '010-5555-6666',
      type: UserType.support,
      mustChangePassword: false,
      isActive: true,
    },
  });

  // ════════════════════════════════════════════════════
  // 8. 고객 사용자 (customer) 12명
  // ════════════════════════════════════════════════════
  console.log('👥 고객 사용자 생성...');

  // 알파테크 IT팀 고객
  const cust1 = await prisma.user.upsert({
    where: { loginId: 'alpha.han' },
    update: {},
    create: {
      loginId: 'alpha.han',
      password: customerPw,
      name: '한상우',
      email: 'han.sangwoo@alphatech.com',
      phone: '010-1001-2001',
      type: UserType.customer,
      companyId: companyAlpha.id,
      departmentId: deptAlphaIT.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const cust2 = await prisma.user.upsert({
    where: { loginId: 'alpha.yoon' },
    update: {},
    create: {
      loginId: 'alpha.yoon',
      password: customerPw,
      name: '윤채원',
      email: 'yoon.chaewon@alphatech.com',
      phone: '010-1002-2002',
      type: UserType.customer,
      companyId: companyAlpha.id,
      departmentId: deptAlphaIT.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  // 알파테크 인사팀 고객
  const cust3 = await prisma.user.upsert({
    where: { loginId: 'alpha.oh' },
    update: {},
    create: {
      loginId: 'alpha.oh',
      password: customerPw,
      name: '오지훈',
      email: 'oh.jihoon@alphatech.com',
      phone: '010-1003-2003',
      type: UserType.customer,
      companyId: companyAlpha.id,
      departmentId: deptAlphaHR.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  // 알파테크 재무팀 고객
  const cust4 = await prisma.user.upsert({
    where: { loginId: 'alpha.shin' },
    update: {},
    create: {
      loginId: 'alpha.shin',
      password: customerPw,
      name: '신예린',
      email: 'shin.yerin@alphatech.com',
      phone: '010-1004-2004',
      type: UserType.customer,
      companyId: companyAlpha.id,
      departmentId: deptAlphaFin.id,
      mustChangePassword: false,
      isActive: true,
    },
  });

  // 베타솔루션즈 개발팀 고객
  const cust5 = await prisma.user.upsert({
    where: { loginId: 'beta.kang' },
    update: {},
    create: {
      loginId: 'beta.kang',
      password: customerPw,
      name: '강현우',
      email: 'kang.hyunwoo@beta.com',
      phone: '010-2001-3001',
      type: UserType.customer,
      companyId: companyBeta.id,
      departmentId: deptBetaDev.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const cust6 = await prisma.user.upsert({
    where: { loginId: 'beta.lim' },
    update: {},
    create: {
      loginId: 'beta.lim',
      password: customerPw,
      name: '임지수',
      email: 'lim.jisu@beta.com',
      phone: '010-2002-3002',
      type: UserType.customer,
      companyId: companyBeta.id,
      departmentId: deptBetaDev.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  // 베타솔루션즈 운영팀 고객
  const cust7 = await prisma.user.upsert({
    where: { loginId: 'beta.jeon' },
    update: {},
    create: {
      loginId: 'beta.jeon',
      password: customerPw,
      name: '전민서',
      email: 'jeon.minseo@beta.com',
      phone: '010-2003-3003',
      type: UserType.customer,
      companyId: companyBeta.id,
      departmentId: deptBetaOps.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const cust8 = await prisma.user.upsert({
    where: { loginId: 'beta.kwon' },
    update: {},
    create: {
      loginId: 'beta.kwon',
      password: customerPw,
      name: '권태양',
      email: 'kwon.taeyang@beta.com',
      phone: '010-2004-3004',
      type: UserType.customer,
      companyId: companyBeta.id,
      departmentId: deptBetaOps.id,
      mustChangePassword: false,
      isActive: true,
    },
  });

  // 감마물류 물류팀 고객
  const cust9 = await prisma.user.upsert({
    where: { loginId: 'gamma.nam' },
    update: {},
    create: {
      loginId: 'gamma.nam',
      password: customerPw,
      name: '남도현',
      email: 'nam.dohyun@gamma.com',
      phone: '010-3001-4001',
      type: UserType.customer,
      companyId: companyGamma.id,
      departmentId: deptGammaLog.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const cust10 = await prisma.user.upsert({
    where: { loginId: 'gamma.baek' },
    update: {},
    create: {
      loginId: 'gamma.baek',
      password: customerPw,
      name: '백소현',
      email: 'baek.sohyun@gamma.com',
      phone: '010-3002-4002',
      type: UserType.customer,
      companyId: companyGamma.id,
      departmentId: deptGammaLog.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  // 감마물류 총무팀 고객
  const cust11 = await prisma.user.upsert({
    where: { loginId: 'gamma.song' },
    update: {},
    create: {
      loginId: 'gamma.song',
      password: customerPw,
      name: '송유나',
      email: 'song.yuna@gamma.com',
      phone: '010-3003-4003',
      type: UserType.customer,
      companyId: companyGamma.id,
      departmentId: deptGammaADM.id,
      mustChangePassword: false,
      isActive: true,
    },
  });
  const cust12 = await prisma.user.upsert({
    where: { loginId: 'gamma.moon' },
    update: {},
    create: {
      loginId: 'gamma.moon',
      password: customerPw,
      name: '문준혁',
      email: 'moon.junhyuk@gamma.com',
      phone: '010-3004-4004',
      type: UserType.customer,
      companyId: companyGamma.id,
      departmentId: deptGammaADM.id,
      mustChangePassword: false,
      isActive: true,
    },
  });

  console.log('✅ 사용자 생성 완료');

  // ════════════════════════════════════════════════════
  // 9. 프로젝트 4개
  // ════════════════════════════════════════════════════
  console.log('📋 프로젝트 생성...');

  const projAlpha = await prisma.project.upsert({
    where: { code: 'ALP-2026-001' },
    update: {},
    create: {
      name: '알파테크 IT인프라 지원',
      code: 'ALP-2026-001',
      description: '알파테크 사 IT 인프라 전반 지원 및 장애 대응',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      companyId: companyAlpha.id,
      department: 'IT팀',
    },
  });
  const projAlphaHR = await prisma.project.upsert({
    where: { code: 'ALP-2026-002' },
    update: {},
    create: {
      name: '알파테크 HR시스템 지원',
      code: 'ALP-2026-002',
      description: '알파테크 인사/급여 시스템 운영 지원',
      startDate: new Date('2026-03-01'),
      isActive: true,
      companyId: companyAlpha.id,
      department: '인사팀',
    },
  });
  const projBeta = await prisma.project.upsert({
    where: { code: 'BET-2026-001' },
    update: {},
    create: {
      name: '베타솔루션즈 개발환경 지원',
      code: 'BET-2026-001',
      description: '베타솔루션즈 개발/운영팀 기술 지원',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      companyId: companyBeta.id,
    },
  });
  const projGamma = await prisma.project.upsert({
    where: { code: 'GAM-2026-001' },
    update: {},
    create: {
      name: '감마물류 ERP 운영지원',
      code: 'GAM-2026-001',
      description: '감마물류 ERP 시스템 및 물류 IT 지원',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      companyId: companyGamma.id,
    },
  });

  // ════════════════════════════════════════════════════
  // 10. 프로젝트 멤버
  // ════════════════════════════════════════════════════
  console.log('👥 프로젝트 멤버 배정...');

  const pmEntries = [
    // 알파테크 IT — 주담당: sup1, 보조: sup2, 고객: cust1,cust2
    { projectId: projAlpha.id, userId: sup1.id, role: ProjectMemberRole.main_support },
    { projectId: projAlpha.id, userId: sup2.id, role: ProjectMemberRole.support },
    { projectId: projAlpha.id, userId: cust1.id, role: ProjectMemberRole.customer },
    { projectId: projAlpha.id, userId: cust2.id, role: ProjectMemberRole.customer },
    // 알파테크 HR — 주담당: sup3, 고객: cust3,cust4
    { projectId: projAlphaHR.id, userId: sup3.id, role: ProjectMemberRole.main_support },
    { projectId: projAlphaHR.id, userId: sup1.id, role: ProjectMemberRole.support },
    { projectId: projAlphaHR.id, userId: cust3.id, role: ProjectMemberRole.customer },
    { projectId: projAlphaHR.id, userId: cust4.id, role: ProjectMemberRole.customer },
    // 베타솔루션즈 — 주담당: sup2, 보조: sup4, 고객: cust5~8
    { projectId: projBeta.id, userId: sup2.id, role: ProjectMemberRole.main_support },
    { projectId: projBeta.id, userId: sup4.id, role: ProjectMemberRole.support },
    { projectId: projBeta.id, userId: cust5.id, role: ProjectMemberRole.customer },
    { projectId: projBeta.id, userId: cust6.id, role: ProjectMemberRole.customer },
    { projectId: projBeta.id, userId: cust7.id, role: ProjectMemberRole.customer },
    { projectId: projBeta.id, userId: cust8.id, role: ProjectMemberRole.customer },
    // 감마물류 — 주담당: sup4, 보조: sup5, 고객: cust9~12
    { projectId: projGamma.id, userId: sup4.id, role: ProjectMemberRole.main_support },
    { projectId: projGamma.id, userId: sup5.id, role: ProjectMemberRole.support },
    { projectId: projGamma.id, userId: cust9.id, role: ProjectMemberRole.customer },
    { projectId: projGamma.id, userId: cust10.id, role: ProjectMemberRole.customer },
    { projectId: projGamma.id, userId: cust11.id, role: ProjectMemberRole.customer },
    { projectId: projGamma.id, userId: cust12.id, role: ProjectMemberRole.customer },
  ];
  for (const pm of pmEntries) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: pm.projectId, userId: pm.userId } },
      update: {},
      create: pm,
    });
  }

  // ════════════════════════════════════════════════════
  // 11. 채번 초기화
  // ════════════════════════════════════════════════════
  const year = new Date().getFullYear();
  await prisma.ticketSequence.upsert({
    where: { year },
    update: {},
    create: { year, lastNumber: 0 },
  });

  // ════════════════════════════════════════════════════
  // 12. 티켓 25개 (다양한 상태)
  // ════════════════════════════════════════════════════
  console.log('🎫 티켓 생성...');

  // ── 티켓 생성 헬퍼 ─────────────────────────────────
  async function createTicket(data: {
    projectId: string;
    title: string;
    content: string;
    categoryId: string;
    priority: TicketPriority;
    status: TicketStatus;
    registeredById: string;
    customerUserId?: string;
    desiredDate: Date;
    deadline?: Date;
    receivedAt?: Date;
    expectedCompletionDate?: Date;
    registrationMethod?: RegistrationMethod;
    urgencyReason?: string;
    completeRequestCount?: number;
  }) {
    const num = nextTicketNumber();
    return prisma.ticket.create({
      data: {
        ticketNumber: num,
        ...data,
        registrationMethod: data.registrationMethod ?? RegistrationMethod.DIRECT,
      },
    });
  }

  // ── 알파테크 IT 프로젝트 티켓 ──────────────────────

  // T1: 완료(CLOSED) — 만족도 평가됨
  const t1 = await createTicket({
    projectId: projAlpha.id,
    title: '사무실 프린터 연결 오류',
    content: '3층 프린터가 네트워크에서 인식되지 않습니다. 어제까지는 정상이었는데 오늘 아침부터 연결이 안 됩니다. IP 충돌 가능성이 있는 것 같습니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.CLOSED,
    registeredById: cust1.id,
    customerUserId: cust1.id,
    desiredDate: daysAgo(20),
    deadline: daysAgo(17),
    receivedAt: daysAgo(20),
    expectedCompletionDate: daysAgo(18),
  });

  // T2: 완료(CLOSED) — 자동 종료
  const t2 = await createTicket({
    projectId: projAlpha.id,
    title: 'VPN 접속 불가 — 재택근무 중',
    content: '재택 중 VPN 접속 시도 시 "연결 시간 초과" 오류가 발생합니다. 사내 WiFi에서는 정상 접속되나 가정 인터넷에서 안 됩니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.CLOSED,
    registeredById: cust2.id,
    customerUserId: cust2.id,
    desiredDate: daysAgo(15),
    deadline: daysAgo(13),
    receivedAt: daysAgo(15),
    expectedCompletionDate: daysAgo(14),
  });

  // T3: 만족도 대기(SATISFACTION_PENDING)
  const t3 = await createTicket({
    projectId: projAlpha.id,
    title: '노트북 배터리 급속 방전 문제',
    content: '지급받은 노트북(모델: ThinkPad X1) 배터리가 완충 후 2시간도 안 되어 방전됩니다. 사용 기간 8개월입니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.SATISFACTION_PENDING,
    registeredById: cust1.id,
    customerUserId: cust1.id,
    desiredDate: daysAgo(8),
    deadline: daysAgo(5),
    receivedAt: daysAgo(8),
    expectedCompletionDate: daysAgo(6),
  });

  // T4: 진행중(IN_PROGRESS) — 배정됨
  const t4 = await createTicket({
    projectId: projAlpha.id,
    title: '서버실 에어컨 소음 및 이상 발열',
    content: '서버실 항온항습기에서 비정상적인 소음이 발생하고 있으며, 내부 온도가 평소보다 3~4도 높게 유지되고 있습니다. 서버 장애로 이어질 수 있어 긴급 확인이 필요합니다.',
    categoryId: categories['시설관리'],
    priority: TicketPriority.URGENT,
    status: TicketStatus.IN_PROGRESS,
    registeredById: cust1.id,
    customerUserId: cust1.id,
    desiredDate: daysAgo(3),
    deadline: daysFromNow(1),
    receivedAt: daysAgo(3),
    expectedCompletionDate: daysFromNow(1),
    urgencyReason: '서버 과열로 인한 장애 가능성',
  });

  // T5: 접수됨(RECEIVED)
  const t5 = await createTicket({
    projectId: projAlpha.id,
    title: '신규 입사자 계정 생성 요청',
    content: '2026년 4월 15일 입사 예정인 신규 직원 3명에 대한 사내 시스템 계정 생성 요청드립니다.\n\n- 홍길동 (IT팀, 사원)\n- 김철수 (인사팀, 대리)\n- 이영희 (재무팀, 주임)',
    categoryId: categories['IT지원'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.RECEIVED,
    registeredById: cust2.id,
    customerUserId: cust2.id,
    desiredDate: daysFromNow(5),
    deadline: daysFromNow(5),
    receivedAt: daysAgo(1),
    expectedCompletionDate: daysFromNow(3),
  });

  // T6: 등록됨(REGISTERED) — 미접수
  const t6 = await createTicket({
    projectId: projAlpha.id,
    title: '공유 드라이브 용량 증설 요청',
    content: '부서 공유 드라이브 용량이 95% 가량 사용 중입니다. 추가 100GB 증설 요청드립니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.LOW,
    status: TicketStatus.REGISTERED,
    registeredById: cust2.id,
    customerUserId: cust2.id,
    desiredDate: daysFromNow(14),
    registrationMethod: RegistrationMethod.EMAIL,
  });

  // T7: 지연됨(DELAYED)
  const t7 = await createTicket({
    projectId: projAlpha.id,
    title: '네트워크 스위치 교체 작업',
    content: '4층 네트워크 스위치 노후화로 간헐적 패킷 손실이 발생합니다. 교체 일정 협의 요청드립니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.DELAYED,
    registeredById: cust1.id,
    customerUserId: cust1.id,
    desiredDate: daysAgo(7),
    deadline: daysAgo(2),
    receivedAt: daysAgo(7),
    expectedCompletionDate: daysAgo(2),
  });

  // ── 알파테크 HR 프로젝트 티켓 ──────────────────────

  // T8: 완료(CLOSED)
  const t8 = await createTicket({
    projectId: projAlphaHR.id,
    title: '급여명세서 조회 오류',
    content: '인사 포털에서 2025년 12월 급여명세서 조회 시 "데이터 없음" 오류가 출력됩니다.',
    categoryId: categories['인사'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.CLOSED,
    registeredById: cust3.id,
    customerUserId: cust3.id,
    desiredDate: daysAgo(30),
    deadline: daysAgo(28),
    receivedAt: daysAgo(30),
    expectedCompletionDate: daysAgo(29),
  });

  // T9: 진행중(IN_PROGRESS)
  const t9 = await createTicket({
    projectId: projAlphaHR.id,
    title: '연차 사용 이력 수정 요청',
    content: '3월 14일 연차 사용분이 시스템에 반영되지 않았습니다. ERP 연동 오류로 추정됩니다.',
    categoryId: categories['인사'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.IN_PROGRESS,
    registeredById: cust3.id,
    customerUserId: cust3.id,
    desiredDate: daysAgo(5),
    deadline: daysFromNow(2),
    receivedAt: daysAgo(5),
    expectedCompletionDate: daysFromNow(2),
  });

  // T10: 완료요청(COMPLETE_REQUESTED)
  const t10 = await createTicket({
    projectId: projAlphaHR.id,
    title: '재직증명서 발급 시스템 오류',
    content: '재직증명서 자동 발급 시 직인 이미지가 깨진 상태로 출력됩니다.',
    categoryId: categories['인사'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.COMPLETE_REQUESTED,
    registeredById: cust4.id,
    customerUserId: cust4.id,
    desiredDate: daysAgo(6),
    deadline: daysAgo(3),
    receivedAt: daysAgo(6),
    expectedCompletionDate: daysAgo(4),
    completeRequestCount: 1,
  });

  // ── 베타솔루션즈 프로젝트 티켓 ────────────────────

  // T11: 완료(CLOSED) — 만족도 5점
  const t11 = await createTicket({
    projectId: projBeta.id,
    title: 'GitLab CI/CD 파이프라인 오류',
    content: 'develop 브랜치 푸시 후 CI 파이프라인이 "exit code 1"로 실패합니다. Docker 빌드 단계에서 오류 발생.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.CLOSED,
    registeredById: cust5.id,
    customerUserId: cust5.id,
    desiredDate: daysAgo(25),
    deadline: daysAgo(23),
    receivedAt: daysAgo(25),
    expectedCompletionDate: daysAgo(24),
  });

  // T12: 완료(CLOSED)
  const t12 = await createTicket({
    projectId: projBeta.id,
    title: '개발 서버 SSL 인증서 만료',
    content: 'dev.beta.internal 서버의 SSL 인증서가 만료되었습니다. 브라우저에서 보안 경고가 표시되어 개발 작업에 차질이 있습니다.',
    categoryId: categories['보안'],
    priority: TicketPriority.URGENT,
    status: TicketStatus.CLOSED,
    registeredById: cust6.id,
    customerUserId: cust6.id,
    desiredDate: daysAgo(18),
    deadline: daysAgo(17),
    receivedAt: daysAgo(18),
    expectedCompletionDate: daysAgo(17),
  });

  // T13: 연기요청(EXTEND_REQUESTED)
  const t13 = await createTicket({
    projectId: projBeta.id,
    title: 'Redis 클러스터 구성 지원',
    content: '운영 환경 Redis를 단독 인스턴스에서 클러스터로 전환 작업 지원 요청합니다. 현재 메모리 사용률이 85%를 초과하고 있습니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.EXTEND_REQUESTED,
    registeredById: cust5.id,
    customerUserId: cust5.id,
    desiredDate: daysAgo(10),
    deadline: daysAgo(1),
    receivedAt: daysAgo(10),
    expectedCompletionDate: daysAgo(1),
  });

  // T14: 진행중(IN_PROGRESS)
  const t14 = await createTicket({
    projectId: projBeta.id,
    title: 'Kubernetes 노드 증설 요청',
    content: '월말 트래픽 피크 대비 워커 노드 2대 추가 요청합니다. 현재 CPU 사용률이 평균 75%입니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.IN_PROGRESS,
    registeredById: cust7.id,
    customerUserId: cust7.id,
    desiredDate: daysFromNow(3),
    deadline: daysFromNow(3),
    receivedAt: daysAgo(2),
    expectedCompletionDate: daysFromNow(3),
  });

  // T15: 등록됨(REGISTERED)
  const t15 = await createTicket({
    projectId: projBeta.id,
    title: '사내 WiFi 비밀번호 변경 요청',
    content: '분기별 보안 정책에 따라 사무실 WiFi 비밀번호 변경을 요청합니다.',
    categoryId: categories['보안'],
    priority: TicketPriority.LOW,
    status: TicketStatus.REGISTERED,
    registeredById: cust8.id,
    customerUserId: cust8.id,
    desiredDate: daysFromNow(7),
    registrationMethod: RegistrationMethod.PHONE,
  });

  // T16: 접수됨(RECEIVED)
  const t16 = await createTicket({
    projectId: projBeta.id,
    title: 'Jenkins 빌드 서버 메모리 부족',
    content: 'Jenkins 빌드 시 OOM(Out of Memory) 오류 빈번 발생. 힙 메모리 조정 또는 서버 스펙 업그레이드 요청.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.RECEIVED,
    registeredById: cust6.id,
    customerUserId: cust6.id,
    desiredDate: daysFromNow(2),
    deadline: daysFromNow(2),
    receivedAt: hoursAgo(3),
    expectedCompletionDate: daysFromNow(2),
  });

  // ── 감마물류 프로젝트 티켓 ─────────────────────────

  // T17: 완료(CLOSED)
  const t17 = await createTicket({
    projectId: projGamma.id,
    title: 'ERP 로그인 오류 (다수 사용자)',
    content: 'ERP 시스템 접속 시 "세션 만료" 오류가 반복됩니다. 오전 9시~10시 사이 집중 발생. 약 30명 영향.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.URGENT,
    status: TicketStatus.CLOSED,
    registeredById: cust9.id,
    customerUserId: cust9.id,
    desiredDate: daysAgo(40),
    deadline: daysAgo(39),
    receivedAt: daysAgo(40),
    expectedCompletionDate: daysAgo(39),
  });

  // T18: 완료(CLOSED)
  const t18 = await createTicket({
    projectId: projGamma.id,
    title: '물류 바코드 스캐너 펌웨어 업데이트',
    content: '창고 바코드 스캐너 20대 펌웨어 업데이트 요청. 최신 버전에서 인식률 개선.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.CLOSED,
    registeredById: cust10.id,
    customerUserId: cust10.id,
    desiredDate: daysAgo(22),
    deadline: daysAgo(20),
    receivedAt: daysAgo(22),
    expectedCompletionDate: daysAgo(21),
  });

  // T19: 진행중(IN_PROGRESS) — 긴급
  const t19 = await createTicket({
    projectId: projGamma.id,
    title: '창고관리시스템 DB 동기화 오류',
    content: '오전 배치 실행 후 WMS DB와 ERP DB 재고 수량이 상이합니다. 약 1,200건 불일치 확인. 출고 작업이 중단된 상태입니다.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.URGENT,
    status: TicketStatus.IN_PROGRESS,
    registeredById: cust9.id,
    customerUserId: cust9.id,
    desiredDate: daysAgo(1),
    deadline: daysFromNow(0),
    receivedAt: hoursAgo(6),
    expectedCompletionDate: daysFromNow(0),
    urgencyReason: '출고 중단으로 인한 물류 차질',
  });

  // T20: 만족도 대기(SATISFACTION_PENDING)
  const t20 = await createTicket({
    projectId: projGamma.id,
    title: '사무실 냉난방기 원격 제어 불가',
    content: '총무팀 냉난방 통합 제어 시스템에서 3층 에어컨이 응답하지 않습니다.',
    categoryId: categories['시설관리'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.SATISFACTION_PENDING,
    registeredById: cust11.id,
    customerUserId: cust11.id,
    desiredDate: daysAgo(9),
    deadline: daysAgo(7),
    receivedAt: daysAgo(9),
    expectedCompletionDate: daysAgo(8),
  });

  // T21: 완료요청(COMPLETE_REQUESTED)
  const t21 = await createTicket({
    projectId: projGamma.id,
    title: '전자세금계산서 발급 오류',
    content: '홈택스 연동 전자세금계산서 발급 시 "공인인증서 오류" 메시지 출력.',
    categoryId: categories['총무'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.COMPLETE_REQUESTED,
    registeredById: cust11.id,
    customerUserId: cust11.id,
    desiredDate: daysAgo(7),
    deadline: daysAgo(4),
    receivedAt: daysAgo(7),
    expectedCompletionDate: daysAgo(5),
    completeRequestCount: 1,
  });

  // T22: 지연됨(DELAYED)
  const t22 = await createTicket({
    projectId: projGamma.id,
    title: '구형 PC 교체 요청 (물류팀 5대)',
    content: '물류팀 PC 5대가 10년 이상 사용으로 성능 저하가 심각합니다. 신규 PC 교체 요청합니다.',
    categoryId: categories['총무'],
    priority: TicketPriority.NORMAL,
    status: TicketStatus.DELAYED,
    registeredById: cust10.id,
    customerUserId: cust10.id,
    desiredDate: daysAgo(14),
    deadline: daysAgo(7),
    receivedAt: daysAgo(14),
    expectedCompletionDate: daysAgo(7),
  });

  // T23: 접수됨(RECEIVED)
  const t23 = await createTicket({
    projectId: projGamma.id,
    title: '보안 카메라 녹화 장애',
    content: '3번 창고 CCTV 4대 중 2대가 녹화되지 않습니다. DVR 하드디스크 오류로 추정.',
    categoryId: categories['보안'],
    priority: TicketPriority.HIGH,
    status: TicketStatus.RECEIVED,
    registeredById: cust12.id,
    customerUserId: cust12.id,
    desiredDate: daysFromNow(1),
    deadline: daysFromNow(1),
    receivedAt: hoursAgo(5),
    expectedCompletionDate: daysFromNow(1),
  });

  // T24: 등록됨(REGISTERED) — 전화 접수
  const t24 = await createTicket({
    projectId: projGamma.id,
    title: '복합기 토너 교체 및 청소 요청',
    content: '총무팀 복합기 인쇄 품질 불량. 토너 교체 및 내부 청소 요청.',
    categoryId: categories['총무'],
    priority: TicketPriority.LOW,
    status: TicketStatus.REGISTERED,
    registeredById: admin.id,
    customerUserId: cust12.id,
    desiredDate: daysFromNow(5),
    registrationMethod: RegistrationMethod.PHONE,
  });

  // T25: 취소됨(CANCELLED)
  const t25 = await createTicket({
    projectId: projBeta.id,
    title: '구형 SVN 서버 마이그레이션',
    content: 'SVN → Git 마이그레이션 지원 요청. 내부 일정 변경으로 취소.',
    categoryId: categories['IT지원'],
    priority: TicketPriority.LOW,
    status: TicketStatus.CANCELLED,
    registeredById: cust5.id,
    customerUserId: cust5.id,
    desiredDate: daysAgo(35),
  });

  // 채번 카운터 업데이트
  await prisma.ticketSequence.update({
    where: { year },
    data: { lastNumber: ticketCounter },
  });

  console.log(`✅ 티켓 ${ticketCounter}개 생성 완료`);

  // ════════════════════════════════════════════════════
  // 13. 티켓 배정 (TicketAssignment)
  // ════════════════════════════════════════════════════
  console.log('📌 티켓 배정...');

  const assignments = [
    { ticketId: t4.id, userId: sup1.id },   // 알파 서버실 (긴급) — 주담당
    { ticketId: t4.id, userId: sup2.id },   // 추가 지원
    { ticketId: t9.id, userId: sup3.id },
    { ticketId: t10.id, userId: sup3.id },
    { ticketId: t13.id, userId: sup2.id },
    { ticketId: t14.id, userId: sup2.id },
    { ticketId: t14.id, userId: sup4.id },
    { ticketId: t19.id, userId: sup4.id },
    { ticketId: t19.id, userId: sup5.id },
    { ticketId: t21.id, userId: sup4.id },
    { ticketId: t22.id, userId: sup5.id },
  ];
  for (const a of assignments) {
    await prisma.ticketAssignment.upsert({
      where: { ticketId_userId: { ticketId: a.ticketId, userId: a.userId } },
      update: {},
      create: a,
    });
  }

  // ════════════════════════════════════════════════════
  // 14. 티켓 상태 이력
  // ════════════════════════════════════════════════════
  console.log('📜 상태 이력 생성...');

  const statusHistories = [
    // T1 (CLOSED)
    { ticketId: t1.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.RECEIVED, actorId: sup1.id, createdAt: daysAgo(20) },
    { ticketId: t1.id, previousStatus: TicketStatus.RECEIVED, newStatus: TicketStatus.IN_PROGRESS, actorId: sup1.id, createdAt: daysAgo(19) },
    { ticketId: t1.id, previousStatus: TicketStatus.IN_PROGRESS, newStatus: TicketStatus.COMPLETE_REQUESTED, actorId: sup1.id, createdAt: daysAgo(18) },
    { ticketId: t1.id, previousStatus: TicketStatus.COMPLETE_REQUESTED, newStatus: TicketStatus.SATISFACTION_PENDING, actorId: cust1.id, createdAt: daysAgo(18) },
    { ticketId: t1.id, previousStatus: TicketStatus.SATISFACTION_PENDING, newStatus: TicketStatus.CLOSED, actorId: cust1.id, createdAt: daysAgo(17) },
    // T2 (CLOSED)
    { ticketId: t2.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.RECEIVED, actorId: sup1.id, createdAt: daysAgo(15) },
    { ticketId: t2.id, previousStatus: TicketStatus.RECEIVED, newStatus: TicketStatus.IN_PROGRESS, actorId: sup1.id, createdAt: daysAgo(14) },
    { ticketId: t2.id, previousStatus: TicketStatus.IN_PROGRESS, newStatus: TicketStatus.SATISFACTION_PENDING, actorId: sup1.id, actorType: 'SYSTEM', createdAt: daysAgo(13) },
    { ticketId: t2.id, previousStatus: TicketStatus.SATISFACTION_PENDING, newStatus: TicketStatus.CLOSED, actorId: null, actorType: 'SYSTEM', reason: '자동 종료 (3일 미응답)', createdAt: daysAgo(10) },
    // T4 (IN_PROGRESS)
    { ticketId: t4.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.RECEIVED, actorId: sup1.id, createdAt: daysAgo(3) },
    { ticketId: t4.id, previousStatus: TicketStatus.RECEIVED, newStatus: TicketStatus.IN_PROGRESS, actorId: sup1.id, createdAt: hoursAgo(20) },
    // T7 (DELAYED)
    { ticketId: t7.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.RECEIVED, actorId: sup1.id, createdAt: daysAgo(7) },
    { ticketId: t7.id, previousStatus: TicketStatus.RECEIVED, newStatus: TicketStatus.IN_PROGRESS, actorId: sup1.id, createdAt: daysAgo(6) },
    { ticketId: t7.id, previousStatus: TicketStatus.IN_PROGRESS, newStatus: TicketStatus.DELAYED, actorId: null, actorType: 'SYSTEM', reason: '처리기한 초과', createdAt: daysAgo(2) },
    // T11 (CLOSED)
    { ticketId: t11.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.RECEIVED, actorId: sup2.id, createdAt: daysAgo(25) },
    { ticketId: t11.id, previousStatus: TicketStatus.RECEIVED, newStatus: TicketStatus.IN_PROGRESS, actorId: sup2.id, createdAt: daysAgo(24) },
    { ticketId: t11.id, previousStatus: TicketStatus.IN_PROGRESS, newStatus: TicketStatus.COMPLETE_REQUESTED, actorId: sup2.id, createdAt: daysAgo(23) },
    { ticketId: t11.id, previousStatus: TicketStatus.COMPLETE_REQUESTED, newStatus: TicketStatus.SATISFACTION_PENDING, actorId: cust5.id, createdAt: daysAgo(23) },
    { ticketId: t11.id, previousStatus: TicketStatus.SATISFACTION_PENDING, newStatus: TicketStatus.CLOSED, actorId: cust5.id, createdAt: daysAgo(22) },
    // T13 (EXTEND_REQUESTED)
    { ticketId: t13.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.RECEIVED, actorId: sup2.id, createdAt: daysAgo(10) },
    { ticketId: t13.id, previousStatus: TicketStatus.RECEIVED, newStatus: TicketStatus.IN_PROGRESS, actorId: sup2.id, createdAt: daysAgo(9) },
    { ticketId: t13.id, previousStatus: TicketStatus.IN_PROGRESS, newStatus: TicketStatus.EXTEND_REQUESTED, actorId: sup2.id, createdAt: daysAgo(2) },
    // T17 (CLOSED)
    { ticketId: t17.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.RECEIVED, actorId: sup4.id, createdAt: daysAgo(40) },
    { ticketId: t17.id, previousStatus: TicketStatus.RECEIVED, newStatus: TicketStatus.IN_PROGRESS, actorId: sup4.id, createdAt: daysAgo(40) },
    { ticketId: t17.id, previousStatus: TicketStatus.IN_PROGRESS, newStatus: TicketStatus.SATISFACTION_PENDING, actorId: sup4.id, createdAt: daysAgo(39) },
    { ticketId: t17.id, previousStatus: TicketStatus.SATISFACTION_PENDING, newStatus: TicketStatus.CLOSED, actorId: cust9.id, createdAt: daysAgo(39) },
    // T25 (CANCELLED)
    { ticketId: t25.id, previousStatus: TicketStatus.REGISTERED, newStatus: TicketStatus.CANCELLED, actorId: cust5.id, reason: '내부 일정 변경으로 취소', createdAt: daysAgo(33) },
  ];

  for (const h of statusHistories) {
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: h.ticketId,
        previousStatus: h.previousStatus,
        newStatus: h.newStatus,
        actorId: h.actorId ?? null,
        actorType: h.actorType ?? 'USER',
        reason: h.reason ?? null,
        createdAt: h.createdAt,
      },
    });
  }

  // ════════════════════════════════════════════════════
  // 15. 연기요청 (ExtendRequest)
  // ════════════════════════════════════════════════════
  console.log('⏰ 연기요청 생성...');

  // T13 — 진행 중인 연기요청
  await prisma.extendRequest.upsert({
    where: { ticketId: t13.id },
    update: {},
    create: {
      ticketId: t13.id,
      requesterId: sup2.id,
      newDeadline: daysFromNow(7),
      reason: 'Redis 클러스터 구성 중 네트워크 설정 이슈로 추가 시간 필요합니다.',
      status: ApprovalStatus.PENDING,
    },
  });

  // T7 — 이미 승인된 연기요청 이력 (isDeleted)
  // (T7은 DELAYED 상태이므로 실제 연기요청은 없음, 다른 티켓에 추가)

  // ════════════════════════════════════════════════════
  // 16. 완료요청 (CompleteRequest)
  // ════════════════════════════════════════════════════
  console.log('✅ 완료요청 생성...');

  // T10 — 완료 대기 중
  await prisma.completeRequest.create({
    data: {
      ticketId: t10.id,
      requesterId: sup3.id,
      attemptNumber: 1,
      content: '직인 이미지 깨짐 현상 수정 완료. PDF 렌더링 엔진 라이브러리 버전 업데이트로 해결하였습니다.',
      status: ApprovalStatus.PENDING,
      previousStatus: TicketStatus.IN_PROGRESS,
    },
  });

  // T21 — 완료 대기 중
  await prisma.completeRequest.create({
    data: {
      ticketId: t21.id,
      requesterId: sup4.id,
      attemptNumber: 1,
      content: '공인인증서 갱신 및 홈택스 연동 설정 재구성 완료. 테스트 발급 정상 확인.',
      status: ApprovalStatus.PENDING,
      previousStatus: TicketStatus.IN_PROGRESS,
    },
  });

  // T11 — 과거 승인된 완료요청
  await prisma.completeRequest.create({
    data: {
      ticketId: t11.id,
      requesterId: sup2.id,
      attemptNumber: 1,
      content: 'GitLab Runner 설정 수정 및 Docker daemon 재시작으로 CI/CD 정상화 완료.',
      status: ApprovalStatus.APPROVED,
      previousStatus: TicketStatus.IN_PROGRESS,
      approverId: cust5.id,
      approvedAt: daysAgo(23),
    },
  });

  // ════════════════════════════════════════════════════
  // 17. 만족도 평가 (SatisfactionRating)
  // ════════════════════════════════════════════════════
  console.log('⭐ 만족도 평가 생성...');

  const ratings = [
    { ticketId: t1.id, userId: cust1.id, rating: 5, comment: '빠르게 해결해주셔서 감사합니다. 설명도 친절했습니다.' },
    { ticketId: t2.id, userId: null, rating: null, comment: null, autoCompleted: true },
    { ticketId: t8.id, userId: cust3.id, rating: 4, comment: '문제가 해결되었습니다. 조금 더 빨리 처리됐으면 좋겠습니다.' },
    { ticketId: t11.id, userId: cust5.id, rating: 5, comment: '전문적인 지식으로 신속하게 해결해주셨습니다. 매우 만족스럽습니다!' },
    { ticketId: t12.id, userId: cust6.id, rating: 5, comment: '긴급 상황임에도 즉시 대응해주셨습니다. 감사합니다.' },
    { ticketId: t17.id, userId: cust9.id, rating: 4, comment: '빠른 대응 감사합니다. 재발 방지책도 안내해주시면 좋겠습니다.' },
    { ticketId: t18.id, userId: cust10.id, rating: 3, comment: '처리 결과는 좋으나 일정 공유가 부족했습니다.' },
  ];
  for (const r of ratings) {
    await prisma.satisfactionRating.upsert({
      where: { ticketId: r.ticketId },
      update: {},
      create: {
        ticketId: r.ticketId,
        userId: r.userId ?? null,
        rating: r.rating ?? null,
        comment: r.comment ?? null,
        autoCompleted: r.autoCompleted ?? false,
      },
    });
  }

  // ════════════════════════════════════════════════════
  // 18. 댓글 (Comment)
  // ════════════════════════════════════════════════════
  console.log('💬 댓글 생성...');

  const comments = [
    // T4 — 서버실 긴급 티켓
    { ticketId: t4.id, authorId: sup1.id, type: CommentType.INTERNAL, content: '현장 확인 결과 항온항습기 팬 이상. 제조사 A/S 접수 완료. 임시로 이동식 에어컨 배치.' },
    { ticketId: t4.id, authorId: sup2.id, type: CommentType.INTERNAL, content: '제조사 엔지니어 내일 오전 방문 예정. 서버 온도 모니터링 중 (현재 26°C, 임계 28°C).' },
    { ticketId: t4.id, authorId: sup1.id, type: CommentType.PUBLIC, content: '현재 임시 조치로 이동식 에어컨을 배치하였습니다. 내일 제조사 엔지니어 방문 예정입니다.' },
    { ticketId: t4.id, authorId: cust1.id, type: CommentType.PUBLIC, content: '네, 확인했습니다. 감사합니다. 빠른 해결 부탁드립니다.' },
    // T7 — 지연된 티켓
    { ticketId: t7.id, authorId: sup1.id, type: CommentType.PUBLIC, content: '스위치 발주가 완료되었으나 배송 지연이 있습니다. 예상 도착일은 4월 15일입니다.' },
    { ticketId: t7.id, authorId: cust1.id, type: CommentType.PUBLIC, content: '알겠습니다. 빠른 처리 부탁드립니다.' },
    // T9 — 연차 수정
    { ticketId: t9.id, authorId: sup3.id, type: CommentType.INTERNAL, content: 'ERP 연동 로그 확인 중. 3/14 배치 실행 시 타임아웃 오류 확인.' },
    { ticketId: t9.id, authorId: sup3.id, type: CommentType.PUBLIC, content: '원인 파악 완료. ERP 연동 배치 재실행 후 데이터 보정 작업 예정입니다. 오늘 중으로 처리하겠습니다.' },
    { ticketId: t9.id, authorId: cust3.id, type: CommentType.PUBLIC, content: '감사합니다. 확인 후 알려주세요.' },
    // T13 — Redis 연기요청
    { ticketId: t13.id, authorId: sup2.id, type: CommentType.INTERNAL, content: '클러스터 3노드 구성 시 슬롯 마이그레이션 중 네트워크 패킷 손실 발생. 방화벽 설정 검토 필요.' },
    { ticketId: t13.id, authorId: sup2.id, type: CommentType.PUBLIC, content: 'Redis 클러스터 구성 중 예상치 못한 네트워크 설정 이슈가 발견되어 연기 요청을 드렸습니다. 1주일 내 완료하겠습니다.' },
    { ticketId: t13.id, authorId: cust5.id, type: CommentType.PUBLIC, content: '이해합니다. 빠른 처리 부탁드립니다.' },
    // T19 — DB 동기화 긴급
    { ticketId: t19.id, authorId: sup4.id, type: CommentType.INTERNAL, content: '배치 쿼리 분석 중. WMS → ERP 전송 시 트랜잭션 롤백 미처리로 인한 불일치로 추정.' },
    { ticketId: t19.id, authorId: sup5.id, type: CommentType.INTERNAL, content: '불일치 데이터 1,234건 확인. 수동 보정 스크립트 준비 중.' },
    { ticketId: t19.id, authorId: sup4.id, type: CommentType.PUBLIC, content: '원인 파악 중입니다. 오늘 오후 3시까지 임시 조치 후 출고 재개 가능하도록 하겠습니다.' },
    { ticketId: t19.id, authorId: cust9.id, type: CommentType.PUBLIC, content: '빠른 처리 부탁드립니다. 출고 지연으로 고객 클레임이 발생하고 있습니다.' },
    // T11 — 완료된 티켓
    { ticketId: t11.id, authorId: sup2.id, type: CommentType.PUBLIC, content: 'GitLab Runner 설정 파일(/etc/gitlab-runner/config.toml)에서 Docker socket 권한 문제 확인. 수정 후 파이프라인 정상화되었습니다.' },
    { ticketId: t11.id, authorId: cust5.id, type: CommentType.PUBLIC, content: '완벽하게 해결되었습니다. 감사합니다!' },
  ];

  for (const c of comments) {
    await prisma.comment.create({ data: c });
  }

  // ════════════════════════════════════════════════════
  // 19. 알림 (Notification)
  // ════════════════════════════════════════════════════
  console.log('🔔 알림 생성...');

  const notifications = [
    // 신규 티켓 알림 — 지원담당자
    { userId: sup1.id, ticketId: t5.id, type: NotificationType.TICKET_CREATED, title: '신규 티켓 접수', body: '[알파테크 IT] 신규 입사자 계정 생성 요청', isRead: false },
    { userId: sup1.id, ticketId: t6.id, type: NotificationType.TICKET_CREATED, title: '신규 티켓 접수', body: '[알파테크 IT] 공유 드라이브 용량 증설 요청', isRead: false },
    { userId: sup4.id, ticketId: t23.id, type: NotificationType.TICKET_CREATED, title: '신규 티켓 접수', body: '[감마물류] 보안 카메라 녹화 장애', isRead: false },
    { userId: sup4.id, ticketId: t24.id, type: NotificationType.TICKET_CREATED, title: '신규 티켓 접수', body: '[감마물류] 복합기 토너 교체 및 청소 요청', isRead: true },
    { userId: sup2.id, ticketId: t15.id, type: NotificationType.TICKET_CREATED, title: '신규 티켓 접수', body: '[베타솔루션즈] 사내 WiFi 비밀번호 변경 요청', isRead: true },
    // 완료요청 알림 — 고객
    { userId: cust4.id, ticketId: t10.id, type: NotificationType.COMPLETE_REQUESTED, title: '완료 검토 요청', body: '[재직증명서 발급 오류] 처리 완료 검토를 요청합니다.', isRead: false },
    { userId: cust11.id, ticketId: t21.id, type: NotificationType.COMPLETE_REQUESTED, title: '완료 검토 요청', body: '[전자세금계산서 발급 오류] 처리 완료 검토를 요청합니다.', isRead: false },
    // 연기요청 알림 — 고객
    { userId: cust5.id, ticketId: t13.id, type: NotificationType.EXTEND_REQUESTED, title: '연기 요청 안내', body: '[Redis 클러스터 구성] 처리기한 연장 요청이 접수되었습니다.', isRead: true },
    // 만족도 평가 요청 — 고객
    { userId: cust1.id, ticketId: t3.id, type: NotificationType.SATISFACTION_REMINDER, title: '만족도 평가 요청', body: '[노트북 배터리 급속 방전] 서비스 만족도를 평가해주세요.', isRead: false },
    { userId: cust11.id, ticketId: t20.id, type: NotificationType.SATISFACTION_REMINDER, title: '만족도 평가 요청', body: '[사무실 냉난방기 원격 제어 불가] 서비스 만족도를 평가해주세요.', isRead: false },
    // 접수됨 알림 — 고객
    { userId: cust2.id, ticketId: t5.id, type: NotificationType.TICKET_RECEIVED, title: '티켓 접수 완료', body: '[신규 입사자 계정 생성 요청] 담당자가 배정되었습니다.', isRead: true },
    { userId: cust12.id, ticketId: t23.id, type: NotificationType.TICKET_RECEIVED, title: '티켓 접수 완료', body: '[보안 카메라 녹화 장애] 담당자가 배정되었습니다.', isRead: false },
    // 지연 알림
    { userId: cust1.id, ticketId: t7.id, type: NotificationType.DELAYED_TRANSITION, title: '처리 지연 안내', body: '[네트워크 스위치 교체] 티켓이 지연 상태로 전환되었습니다.', isRead: true },
    { userId: cust10.id, ticketId: t22.id, type: NotificationType.DELAYED_TRANSITION, title: '처리 지연 안내', body: '[구형 PC 교체 요청] 티켓이 지연 상태로 전환되었습니다.', isRead: false },
  ];

  for (const n of notifications) {
    await prisma.notification.create({ data: n });
  }

  // ════════════════════════════════════════════════════
  // 20. 로그인 이력 (LoginHistory)
  // ════════════════════════════════════════════════════
  console.log('🔐 로그인 이력 생성...');

  const loginHistories = [
    // 성공
    { userId: admin.id, loginId: 'admin', success: true, ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', createdAt: hoursAgo(1) },
    { userId: sup1.id, loginId: 'sup.kim', success: true, ipAddress: '192.168.1.10', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', createdAt: hoursAgo(2) },
    { userId: sup2.id, loginId: 'sup.lee', success: true, ipAddress: '192.168.1.11', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', createdAt: hoursAgo(3) },
    { userId: sup4.id, loginId: 'sup.choi', success: true, ipAddress: '192.168.1.13', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', createdAt: hoursAgo(1) },
    { userId: cust1.id, loginId: 'alpha.han', success: true, ipAddress: '10.10.1.101', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', createdAt: hoursAgo(4) },
    { userId: cust5.id, loginId: 'beta.kang', success: true, ipAddress: '10.10.2.201', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', createdAt: hoursAgo(2) },
    { userId: cust9.id, loginId: 'gamma.nam', success: true, ipAddress: '10.10.3.101', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', createdAt: hoursAgo(6) },
    // 실패 (잘못된 비밀번호)
    { userId: null, loginId: 'alpha.han', success: false, ipAddress: '10.10.1.200', failReason: '잘못된 비밀번호', createdAt: daysAgo(1) },
    { userId: null, loginId: 'unknown_user', success: false, ipAddress: '203.0.113.42', failReason: '존재하지 않는 계정', createdAt: daysAgo(2) },
    { userId: null, loginId: 'admin', success: false, ipAddress: '203.0.113.99', failReason: '잘못된 비밀번호', createdAt: daysAgo(1) },
  ];

  for (const h of loginHistories) {
    await prisma.loginHistory.create({ data: h });
  }

  // ════════════════════════════════════════════════════
  // 완료
  // ════════════════════════════════════════════════════
  console.log('\n✅ 시딩 완료!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  고객사:       3개`);
  console.log(`  부서:         7개`);
  console.log(`  사용자:       19명 (admin 1 + 지원 5 + 고객 12 + 관리자 1)`);
  console.log(`  프로젝트:     4개`);
  console.log(`  카테고리:     6개`);
  console.log(`  공휴일:       ${holidays2026.length}건`);
  console.log(`  티켓:         ${ticketCounter}개 (다양한 상태)`);
  console.log(`  댓글:         ${comments.length}개`);
  console.log(`  알림:         ${notifications.length}개`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n계정 정보:');
  console.log('  관리자:       admin / Admin@1234');
  console.log('  지원담당자:   sup.kim ~ sup.jung / Support@1234');
  console.log('  고객:         alpha.han ~ gamma.moon / Customer@1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
