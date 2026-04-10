# Strategy 전략검증 보고서

> **문서 목적**: nu-ServiceDesk 구현(Match Rate 98.3%) 완료 후, PRD에서 정의한 전략(Value Proposition, Business Model, 경쟁 전략)이 실제 코드베이스에 얼마나 반영되었는지를 검증한다.
>
> **검증일**: 2026-04-11
> **기준 버전**: PRD V2.3 / Plan V2.4 / Design V2.4
> **평가 기준**: 구현 코드 + Gap Analysis + PDCA 보고서 교차 검증

---

## 1. JTBD 6-Part VP 실현도 매트릭스

PRD §2.1에서 정의한 6-Part VP Canvas를 구현 관점에서 평가한다.

### 평가 기준

| 점수 | 기준 |
|:---:|------|
| 5/5 | 전략 의도가 코드/설계에 명확히 반영, 사용자 경험 직접 구현 |
| 4/5 | 핵심 구현 완료, 세부 요소 1~2개 Phase 2 이상으로 연기 |
| 3/5 | 부분 구현 — 인프라/상수 정의는 되었으나 실제 기능 미활성화 |
| 2/5 | 설계 의도는 있으나 구현체 미완성 또는 Stub 수준 |
| 1/5 | 전략 문서에만 존재, 코드 반영 없음 |

### VP 실현도 평가

| Part | PRD 정의 | 구현 반영 요소 | 점수 | 근거 |
|------|----------|--------------|:---:|------|
| **1. Target Customer** | 한국 중소/중견 기업(50-500명) IT 운영팀, 고객지원팀, 총무/시설관리팀 | RBAC 3역할(admin/support/customer), 고객사-프로젝트-멤버 연계 구조, 역할별 대시보드 3종, 모바일 UX(Persona 3 박정호 대응) | **5/5** | 타겟 세그먼트의 3가지 역할(IT관리자·CS매니저·총무)이 각각 코드에 구현됨. 모바일 하단 탭 + 44×44px 터치 타겟은 총무 Persona 직접 반영 |
| **2. Problem** | 글로벌 솔루션의 불완전 한국어 지원 / 카카오톡 미연동 / 한국형 승인 구조 미지원 / 높은 비용 / 데이터 주권 | F1.4 한국어 UI 완료, 계층형 승인 워크플로우(연기/완료 승인 6개 API), Data Residency: AWS Seoul Region 명시(PRD §5.2), FREE_PLAN_LIMITS.KAKAO_ENABLED=false(Phase 2 플래그) | **4/5** | 5개 Problem 중 한국어·승인·데이터주권·비용 4개는 구현 완료. 카카오톡 연동은 Phase 2 상수 준비 수준(KAKAO_ENABLED flag 존재), 실기능 미구현으로 1점 감점 |
| **3. Promise** | 한국 기업 최적화 / 합리적 가격 / 규정 준수 서비스데스크 | 온보딩 마법사 4단계, Beta 50팀 준비 완료(다중 테넌트 구조), 개인정보보호법 준수(로그인 이력 1년 보존 상수화, HTTPS/HSTS/CSP 헤더), Free Plan 상수 정의 | **4/5** | 기술적 Promise는 충실히 구현. 단 가격 체계(Pro $12 / Business $25)가 DB 모델/결제 연동 없이 상수 정의 수준에 그침 |
| **4. Proof** | Beta SLA 준수율 95%+ / 카카오톡 응답률 2x / PIPC 준수 | 배치 잡 10개로 SLA 자동 관리 인프라 구축, 만족도 평가(5점 별점) + 자동 종료로 CSAT 수집 가능, 로그인 이력 1년 보존(PIPC), Rate Limiting 4정책, HSTS/CSP 적용 | **3/5** | Proof 생성 인프라는 구축됨. 그러나 Proof는 정의상 운영 후 데이터가 필요하며 Beta 미출시 상태이므로 실측치 부재. SC-12(30일 활성화율 60%), SC-13(온보딩 완료율 70%)은 운영 후 추적으로 표시됨 |
| **5. Power (Moat)** | 한국어 네이티브 UX + 카카오톡 생태계 연동 + 국내 데이터 레지던시 + 한국형 워크플로우 | 한국어 UI 완전 구현(F1.4), 9상태·17이벤트 State Machine(한국형 워크플로우 핵심), AWS Seoul Region 데이터 레지던시(PRD §5.2), 비즈니스 상수 24개 상수화(lib/constants.ts), KAKAO_ENABLED 플래그 | **4/5** | Moat 4개 요소 중 3개(한국어UX·데이터레지던시·한국형워크플로우)는 코드 수준 구현 완료. 카카오톡 생태계 연동은 상수 준비(KAKAO_ENABLED=false)만 완료, Phase 2 연기로 현재 Moat 완성도에 1점 갭 |
| **6. Profit Model** | SaaS 구독(agent당 월과금) + 프리미엄 티어(자동화/AI) + Enterprise(온프레미스) | FREE_PLAN_LIMITS 상수(MAX_USERS:3, SLA_ENABLED:false, KAKAO_ENABLED:false), 업그레이드 프롬프트 5조건(F1.12 완료), SystemSetting 모델, 온보딩 완료 후 업그레이드 프롬프트 | **3/5** | 과금 트리거 로직(업그레이드 프롬프트 5조건)과 플랜별 제한 상수는 구현됨. 그러나 실제 결제 게이트웨이 연동, 구독 관리 DB 모델, Pro/Business 기능 활성화 로직은 미구현. 수익 발생 경로가 현재 코드상 미완 |

**종합 VP 실현도**: **23/30점 (76.7%)**

**VP 요약 Statement 실현도**: "한국 기업을 위해 설계된, 합리적 가격의, 규정을 준수하는 서비스데스크" — 설계 의도는 코드에 충실히 반영되었으나, 카카오톡 연동(Moat의 핵심 차별화)과 실제 과금 인프라(Profit Model) 두 영역이 Phase 2 이상으로 연기된 상태다.

---

## 2. Lean Canvas 실현도 체크리스트

PRD §2.2에서 정의한 9섹션 Lean Canvas를 검증한다.

| 섹션 | PRD 정의 | 구현 상태 | 반영도 | 비고 |
|------|----------|----------|:-----:|------|
| **Problem** | ①불완전 한국어 ②높은 비용(Zendesk $55-169) ③PIPC 준수 어려움 | F1.4 한국어 UI, FREE_PLAN_LIMITS(비용 해소 설계), 로그인이력 1년 보존 + HSTS/CSP | **완료** | 3가지 Problem 모두 코드 수준 해소 |
| **Solution** | 한국어 네이티브 + SLA 관리 + 카카오톡 알림 + 계층형 승인 + 국내 데이터 저장 | 한국어 UI / 9상태 State Machine / 계층형 승인 6 API / AWS Seoul 명시 / 카카오톡은 KAKAO_ENABLED 상수 준비 | **부분** | 카카오톡 알림(핵심 Solution 중 하나)이 Phase 2로 연기됨 |
| **UVP** | "한국 기업을 위해 설계된 유일한 서비스데스크 — 완전한 한국어, 카카오톡 알림, 합리적 가격" | 한국어 UI + 승인워크플로우 구현 완료, 카카오톡 미완, 가격 상수 준비 | **부분** | UVP 3요소 중 "카카오톡 알림"이 현재 Phase 1 미포함으로 마케팅 메시지와 제품 실상 간 갭 존재 |
| **Unfair Advantage** | 한국 시장 심층 이해 + 현지 규정 준수 내재 + 한국어 AI 특화 + 국내 메신저 네이티브 연동 | 규정 준수 코드화(PIPC·OWASP·HSTS), business-hours.ts KST 엔진(77 테스트), lib/constants.ts 한국형 비즈니스 규칙 상수화 | **부분** | 한국어 AI는 Phase 3(F3.1), 메신저 네이티브는 Phase 2. 현재 실질 Advantage는 규정준수·워크플로우 정교함에 집중 |
| **Customer Segments** | Primary: 한국 중소/중견 IT 운영팀(50-500명), Secondary: 고객지원팀, Tertiary: 총무/시설관리 | 3역할 RBAC 완전 구현, 모바일 UX(Tertiary Persona), Beta 50팀 다중 테넌트 준비 | **완료** | 3개 세그먼트 모두 코드 반영 |
| **Channels** | 콘텐츠 마케팅 / 파트너(SI,MSP) / IT 커뮤니티(KISA) / 프리미엄 전환 | 온보딩 마법사(PLG 채널), 업그레이드 프롬프트 5조건(프리미엄 전환 채널), 랜딩페이지 미구현 | **부분** | 제품 내 전환 채널(온보딩+업그레이드 프롬프트)은 구현. 외부 마케팅 채널(랜딩페이지, SEO 블로그)은 제품 범위 외 — GTM 실행 과제 |
| **Revenue Streams** | Free($0/3agents) / Pro($12/agent/mo) / Business($25/agent/mo) / Enterprise(협의) | FREE_PLAN_LIMITS 상수(MAX_USERS:3, SLA_ENABLED:false, KAKAO_ENABLED:false), 업그레이드 프롬프트 5조건 구현, SystemSetting 모델 | **부분** | 플랜 제한 로직과 업셀 트리거는 구현됨. 실제 결제 처리(PG 연동, 구독 DB 모델, 기능 게이팅 API)는 미구현 |
| **Cost Structure** | 클라우드 인프라(AWS Seoul) + 개발팀 + 카카오 API + 마케팅 + 고객지원 | PostgreSQL/Redis Docker 구성, Cloudflare R2, BullMQ, 로컬 fallback 지원 | **완료** | 인프라 비용 구조는 설계대로 구현. 운영 비용 최소화(R2 비용효율, Redis SCAN) 설계 반영 |
| **Key Metrics** | MRR / Agent 수 / 티켓 처리량 / SLA 준수율 / CSAT / Churn Rate / NPS | 대시보드 API(byStatus/byPriority 집계), SatisfactionRating 모델, 만족도 자동 수집, OnboardingState 완료율 추적, SC-12/SC-13 추적 예정 | **부분** | 메트릭 수집 인프라 구축됨. 그러나 MRR·Churn Rate 등 비즈니스 메트릭을 측정할 구독 관리 테이블이 미구현 — 운영 메트릭(티켓처리량·CSAT)은 측정 가능, 재무 메트릭(MRR)은 불가 |

**Lean Canvas 종합**: 9섹션 중 완료 3 / 부분 6 / 미구현 0

핵심 발견: Lean Canvas의 미완 영역은 대부분 Phase 2 이상의 외부 연동(카카오톡, PG 결제)이며, Phase 1 핵심 가설(Problem-Solution Fit)은 코드 수준에서 검증 준비 완료 상태다.

---

## 3. SWOT 전략 실행 매트릭스

PRD §2.3에서 정의한 4개 전략의 구현 실행도를 평가한다.

### SO 전략 (강점-기회 활용)

> "한국 SaaS 시장 성장기에 한국 특화 가치를 앞세워 선점. 정부 SaaS 지원 사업에 참여하여 초기 고객 확보"

| 실행 요소 | 구현 상태 | 증거 |
|----------|----------|------|
| 한국 특화 가치 코드화 | **구현 완료** | lib/constants.ts 비즈니스 규칙 24개, business-hours.ts KST 엔진, 한국어 UI F1.4 |
| Beta 50팀 선점 준비 | **구현 완료** | 다중 테넌트 구조, 온보딩 마법사 4단계, SC-11 Pass |
| PLG(무료 가입→전환) 경로 | **구현 완료** | 온보딩 완료 후 업그레이드 프롬프트, FREE_PLAN_LIMITS 게이팅 |
| 정부/커뮤니티 채널 | **미구현** | 제품 외부 GTM 과제 — 랜딩페이지, 블로그 미포함 |

**SO 전략 실현도**: 3/4 요소 구현 (75%)

### WO 전략 (약점-기회 전환)

> "시장 성장기를 활용하여 프리미엄 모델로 빠른 사용자 기반 확보. 정부 지원으로 마케팅 비용 절감"

| 실행 요소 | 구현 상태 | 증거 |
|----------|----------|------|
| Free Tier로 진입 장벽 제거 | **구현 완료** | FREE_PLAN_LIMITS(3agents), 업그레이드 5조건 트리거 |
| 브랜드 인지도 부재 보완 | **부분 구현** | 제품 내 신뢰 지표(SatisfactionRating, 처리 이력) 구현. 외부 마케팅 채널 미착수 |
| 초기 기능 범위 제한 보완 | **설계 완료** | Tier 시스템(Phase 1/2/3)으로 로드맵 명확화, 소규모팀이 집중할 핵심 기능 명시 |

**WO 전략 실현도**: 2/3 요소 구현 (67%)

### ST 전략 (강점-위협 방어)

> "한국 특화 기능(카카오, 승인구조)으로 글로벌 솔루션과 차별화. 가격 경쟁력으로 전환 장벽 낮춤"

| 실행 요소 | 구현 상태 | 증거 |
|----------|----------|------|
| 계층형 승인 차별화 | **구현 완료** | 연기/완료 승인 6 API, 3회 자동승인, lib/ticket-workflow.ts |
| 가격 차별화 인프라 | **부분 구현** | FREE_PLAN_LIMITS 상수, 업그레이드 프롬프트. 실제 과금 미구현 |
| 글로벌 솔루션 현지화 대응 | **구현 완료** | 한국형 워크플로우(처리기한·근무시간·에스컬레이션)는 코드 복잡도로 복제 어려움 |
| 카카오톡 연동 차별화 | **미구현** | Phase 2 — KAKAO_ENABLED 상수 준비만 완료 |

**ST 전략 실현도**: 2.5/4 요소 구현 (63%)

### WT 전략 (약점-위협 최소화)

> "핵심 기능에 집중하여 리소스 효율화. 니치 마켓(중소기업 IT팀)에서 레퍼런스 구축 후 확장"

| 실행 요소 | 구현 상태 | 증거 |
|----------|----------|------|
| 핵심 기능 집중(Tier 1 완료) | **구현 완료** | Phase 1 12개 기능 100% 완료(F1.1~F1.12), Phase 2/3 명확히 분리 |
| 니치 마켓(IT/SaaS 스타트업) 집중 | **설계 반영** | Beachhead: IT/SaaS 스타트업(50-200명), Beta 50팀 목표 |
| 리소스 효율화 아키텍처 | **구현 완료** | Option C(Pragmatic Balance), Presigned URL 직접업로드(서버 메모리 0), R2 비용효율 |

**WT 전략 실현도**: 3/3 요소 구현 (100%)

### SWOT 전략 실행 종합

| 전략 | 실현도 | 미실현 원인 |
|------|:------:|-----------|
| SO (강점-기회) | 75% | 외부 GTM 채널 미포함 (제품 범위 외) |
| WO (약점-기회) | 67% | 외부 마케팅 채널 미착수 |
| ST (강점-위협) | 63% | 카카오톡 Phase 2 연기, 과금 시스템 미구현 |
| WT (약점-위협) | 100% | 완전 구현 |
| **종합** | **76%** | |

---

## 4. Porter's Five Forces 대응 평가

PRD §2.4에서 정의한 5개 Force별 대응 전략의 구현 상태를 평가한다.

### Force 1: 기존 경쟁자 대응 (수준: 높음)

PRD 전략: "한국 특화 영역은 미개척" — 차별화로 경쟁 회피

| 대응 요소 | 구현 여부 | 코드 근거 |
|----------|:--------:|---------|
| 한국어 완전 구현 (Zendesk 대비) | **완료** | F1.4 한국어 UI, Pretendard 폰트, 한국어 에러 메시지 |
| 한국형 워크플로우 (복제 어려운 복잡도) | **완료** | 9상태·17이벤트 State Machine, 24개 비즈니스 상수, KST 근무시간 엔진(77 테스트) |
| 가격 차별화 포지셔닝 | **부분** | Free Plan 상수 정의, 업그레이드 UX 구현. 실제 과금 미구현 |
| 경쟁사 Battlecard 기능 (한국어AI, 카카오) | **미완** | AI 분류 Phase 3, 카카오톡 Phase 2 |

**평가**: 현재 구현된 차별화 무기(한국어UX + 워크플로우 복잡도)는 글로벌 솔루션 대비 방어 가능하나, 핵심 차별점인 카카오톡이 Phase 2로 연기되어 경쟁 우위가 부분적

### Force 2: 신규 진입자 위협 대응 (수준: 중간)

PRD 전략: "도메인 전문성과 생태계 연동이 차별화"

| 대응 요소 | 구현 여부 | 코드 근거 |
|----------|:--------:|---------|
| 도메인 전문성 코드화 | **완료** | lib/business-hours.ts(KST 특화 엔진), lib/ticket-workflow.ts(한국형 승인 로직), 24개 비즈니스 상수 |
| 기술 진입 장벽 | **완료** | $executeRaw RETURNING * 낙관적 락, DLQ, exponential backoff — 쉽게 복제 불가 |
| 데이터 네트워크 효과 시작 | **완료** | 히스토리 자산 축적 구조(TicketStatusHistory, TicketDeadlineHistory, SatisfactionRating 모델) |

**평가**: 기술적 복잡도와 한국 도메인 전문성으로 신규 진입자 대비 1-2년 선점 우위 확보

### Force 3: 대체재 위협 대응 (수준: 중간)

PRD 전략: "이메일/스프레드시트/그룹웨어 대체 — 전환 편의성 제공"

| 대응 요소 | 구현 여부 | 코드 근거 |
|----------|:--------:|---------|
| 마이그레이션 도구 | **미완** | CSV 가져오기(F2.9)는 Phase 2 계획. 현재 시드 데이터(seed.ts)만 존재 |
| 낮은 도입 마찰 (온보딩 마법사) | **완료** | 4단계 온보딩 마법사(SC-10 완료), 온보딩 완료율 70% 목표 |
| 대체 불가 가치 축적 | **완료** | 처리기한 변경 이력, 상태 전환 이력, 만족도 추이 — 이탈 비용 자동 증가 설계 |

**평가**: 도입 편의성은 확보. 대체재(이메일·스프레드시트)로부터의 데이터 이관 도구가 Phase 2 연기로 초기 전환 마찰 존재

### Force 4: 공급자 교섭력 대응 (수준: 낮음)

PRD 전략: "클라우드 인프라 다양화 + 오픈소스 활용"

| 대응 요소 | 구현 여부 | 코드 근거 |
|----------|:--------:|---------|
| 클라우드 벤더 락인 방지 | **완료** | R2 로컬 fallback(R2 미설정 시 로컬 저장), PostgreSQL 표준 SQL, Redis 표준 |
| 오픈소스 의존성 | **완료** | Next.js, Prisma, BullMQ, bcrypt — 상용 SDK 의존도 0 (카카오 API 미연동 상태) |

**평가**: 공급자 교섭력 위협이 낮은 이유 그대로 구현됨. 클라우드 이식성 확보

### Force 5: 구매자 교섭력 대응 (수준: 높음)

PRD 전략: "SMB 고객의 높은 전환 비용 — 무료 Tier + Lock-in 전략"

| 대응 요소 | 구현 여부 | 코드 근거 |
|----------|:--------:|---------|
| 무료 Tier로 진입 유도 | **완료** | FREE_PLAN_LIMITS(MAX_USERS:3, MAX_STORAGE_GB:5) 상수, 업그레이드 프롬프트 5조건 |
| 히스토리 Lock-in | **완료** | TicketStatusHistory, TicketDeadlineHistory, SatisfactionRating 모델 축적 |
| 워크플로우 커스텀 Lock-in | **완료** | 카테고리 관리, 공휴일 설정, 근무시간 커스텀, 승인 체계 설정 |
| 데이터 내보내기 (신뢰 역설) | **미완** | CSV 내보내기(Phase 2) — 현재 Lock-in 전략 중 유일한 "신뢰 구축" 요소 미구현 |
| 팀 습관 형성 | **준비** | Web Push 21종 알림으로 업무 루틴 형성 기반 구축. 카카오톡 연동 Phase 2 |

**평가**: Lock-in 핵심 4전략 중 3개(히스토리·워크플로우·알림) 구현 완료. 데이터 내보내기 보장(신뢰 역설 전략)은 Phase 2 연기로 "갇힌 느낌" 해소가 현재 시점에 미완

---

## 5. Lock-in 전략 구현도

PRD §2.5에서 정의한 4개 Lock-in 전략의 코드 수준 반영도를 평가한다.

### Lock-in 전략 1: 히스토리 자산 (Phase 1)

> "티켓 처리 이력 + 만족도 추이 + 고객사별 SLA 트렌드가 누적될수록 대체 불가"

| 구현 요소 | 상태 | DB 모델/코드 근거 |
|----------|:---:|----------------|
| 티켓 처리 전 구간 이력 | **완료** | TicketStatusHistory 모델, 17개 이벤트 전환 기록 |
| 처리기한 변경 이력 | **완료** | TicketDeadlineHistory 모델, 처리희망일→완료예정일→연기요청일 추적 |
| 만족도 누적 | **완료** | SatisfactionRating 모델(userId, score, comment, ratedAt), 만족도 자동 수집 |
| 고객사별 SLA 추이 대시보드 | **부분** | 대시보드 API에 byStatus/byPriority 집계 구현. SLA 시계열 추이 쿼리는 미구현 |
| Admin 수정 이력 감사 | **완료** | AuditLog 모델, TicketAdminEdit 모델 |

**히스토리 자산 Lock-in 실현도**: 4.5/5 — 핵심 이력 DB 구조 완비. SLA 추이 시각화 일부 미완

### Lock-in 전략 2: 워크플로우 커스텀 (Phase 1)

> "승인 체계/카테고리/SLA 정책이 조직에 맞춰 최적화될수록 전환 비용 증가"

| 구현 요소 | 상태 | 코드 근거 |
|----------|:---:|---------|
| 카테고리 커스텀 | **완료** | Category CRUD API, 회사별 카테고리 관리 UI |
| 공휴일 커스텀 | **완료** | Holiday 모델 + API, 회사별 공휴일 설정 |
| 근무시간 커스텀 | **완료** | BusinessHours 모델, 설정 저장 + KST 엔진 적용 |
| 승인 체계 설정 | **완료** | 연기/완료 승인 흐름, 에스컬레이션 상수화(lib/constants.ts) |
| 프로젝트별 담당자 배정 | **완료** | ProjectMember, Main담당자/Sub담당자 역할 |

**워크플로우 커스텀 Lock-in 실현도**: 5/5 — 완전 구현

### Lock-in 전략 3: 데이터 내보내기 보장 (Phase 2)

> "언제든 전체 데이터 CSV 내보내기를 보장 → 갇힌 느낌 방지 → 신뢰 구축"

| 구현 요소 | 상태 | 코드 근거 |
|----------|:---:|---------|
| CSV 내보내기 UI/API | **미구현** | F2.9(CSV 가져오기)와 함께 Phase 2 계획 |
| 데이터 보존 정책 명시 | **완료** | PRD §5.2 보존 정책 명시, constants.ts NOTIFICATION_RETAIN_DAYS/LOGIN_HISTORY_RETAIN_YEARS |
| 개인정보 처리 고지 | **설계 완료** | PRD에 "개인정보처리방침/서비스 약관 명시 필요" 명기됨 |

**데이터 내보내기 Lock-in 실현도**: 1/3 — Phase 2 연기 전략이므로 의도적 미구현. 그러나 "신뢰 역설" 효과는 Phase 2 전까지 발생 불가

### Lock-in 전략 4: 팀 습관 형성 (Phase 2)

> "카카오톡 알림 기반 업무 루틴이 형성되면 이탈 비용이 높아짐"

| 구현 요소 | 상태 | 코드 근거 |
|----------|:---:|---------|
| Web Push 알림 기반 습관 형성 | **완료** | 21종 NotificationType, VAPID 구현, ServiceWorker, 실시간 Push |
| 카카오톡 알림톡 연동 | **미구현** | FREE_PLAN_LIMITS.KAKAO_ENABLED=false, Phase 2 계획 |
| 알림 기반 업무 루틴 트리거 | **완료** | auto-receive(4근무시간), delay-detect(1분 주기), stale-escalation(3근무일) — 자동 업무 알림 트리거 |

**팀 습관 형성 Lock-in 실현도**: 2/3 — Web Push 기반 루틴은 구축. 카카오톡 기반 루틴은 Phase 2

### Lock-in 전략 종합

| 전략 | Phase | 실현도 | 상태 |
|------|:-----:|:------:|:----:|
| 히스토리 자산 | 1 | 4.5/5 | 거의 완료 |
| 워크플로우 커스텀 | 1 | 5/5 | 완전 구현 |
| 데이터 내보내기 보장 | 2 | 1/3 | 의도적 Phase 2 연기 |
| 팀 습관 형성 | 2 | 2/3 | Web Push 기반 부분 완료 |

**Lock-in 종합 평가**: Phase 1 목표 전략(히스토리·워크플로우)은 95% 구현 완료. Phase 2 전략(데이터내보내기·카카오톡루틴)은 상수 준비 수준으로 로드맵 관리 필요

---

## 6. 가격 모델 & Revenue 구현 상태

PRD §4.3 Pricing Strategy에서 정의한 Free/Pro/Business/Enterprise 체계의 코드 반영도를 평가한다.

### 플랜별 구현 상태

| 플랜 | 가격 | 핵심 기능 | 구현 상태 | 코드 근거 |
|------|:----:|----------|:--------:|---------|
| **Free** | $0 / 3 agents | 티켓 CRUD, 기본 대시보드, Web Push, 5GB | **인프라 완료** | FREE_PLAN_LIMITS: MAX_USERS=3, MAX_STORAGE_GB=5, SLA_ENABLED=false, KAKAO_ENABLED=false |
| **Pro** | $12/agent/mo | + 카카오톡, SLA, 지식베이스, CSAT | **상수 준비** | KAKAO_ENABLED=false(Phase 2), SLA_ENABLED=false 플래그 존재 |
| **Business** | $25/agent/mo | + 자동화, AI 분류, 승인 체계, API | **설계 계획** | F2.3 자동화(Phase 2), F3.1 AI 분류(Phase 3) — 현재 코드 미존재 |
| **Enterprise** | 협의 | + 온프레미스, SSO/SAML, 전용 지원 | **설계 계획** | F3.5(Phase 3) — 현재 미존재 |

### 업셀 트리거(업그레이드 프롬프트) 구현 상태

| 조건 | 구현 여부 | 비고 |
|------|:--------:|------|
| 4번째 사용자 초대 시도 | **완료** | F1.12 완료, FREE_PLAN_LIMITS.MAX_USERS=3 가드 |
| 저장 용량 4GB 초과 | **완료** | FREE_PLAN_LIMITS.MAX_STORAGE_GB=5 기준 |
| 카카오톡 기능 진입 시도 | **완료** | KAKAO_ENABLED=false → 업그레이드 안내 |
| SLA 관리 기능 진입 시도 | **완료** | SLA_ENABLED=false → 업그레이드 안내 |
| 데이터 보존 1년 만료 30일 전 | **완료** | DATA_RETENTION_YEARS=1, 리마인더 배치 설계 |

### Revenue 측정 인프라 상태

| 메트릭 | 측정 가능 여부 | 이유 |
|--------|:------------:|------|
| 티켓 처리량 | **가능** | 대시보드 API byStatus/byPriority 집계 |
| CSAT | **가능** | SatisfactionRating 모델, 만족도 자동 수집 |
| SLA 준수율 | **가능** | 처리기한 vs 완료일 비교 쿼리 가능 |
| Active Agent 수 | **가능** | User.isActive, type='support' 필터 |
| MRR | **불가** | 구독 관리 DB 테이블 미존재 |
| Churn Rate | **불가** | 구독 이력 DB 미존재 |
| 업그레이드 전환율 | **불가** | 업그레이드 프롬프트 클릭 이벤트 추적 미구현 |

**Revenue 구현 종합**: 플랜 제한 인프라와 업셀 UX 트리거(5조건)는 완성도 높게 구현됨. 그러나 실제 과금 처리(결제 게이트웨이), 구독 상태 관리(DB 모델), 비즈니스 메트릭(MRR·Churn) 측정 인프라는 미구현 상태. 제품이 수익을 "보여줄" 준비는 됐으나 수익을 "처리할" 준비는 미완

---

## 7. 전략-구현 갭 분석 요약

### 갭 분류 기준

- **Critical Gap**: 전략 핵심 요소가 구현 미완 → 비즈니스 가설 검증 자체가 불가
- **Strategic Gap**: 차별화 요소 구현 지연 → 경쟁 포지셔닝에 영향
- **Operational Gap**: 운영/수익화 인프라 미완 → 스케일업 시 병목

### 갭 목록

| # | 갭 영역 | 유형 | 설명 | Phase 계획 | 우선순위 |
|---|--------|:----:|------|:----------:|:-------:|
| G1 | **카카오톡 알림 연동** | Strategic | UVP의 핵심 차별화 문구("카카오톡 알림")가 현재 미구현. KAKAO_ENABLED 상수만 존재. 경쟁사 대비 Battlecard에서 가장 강조되는 기능 | Phase 2 | **High** |
| G2 | **결제 게이트웨이 & 구독 관리** | Critical | Pro $12 / Business $25 가격 체계가 코드에 없음. 수익 발생 불가. MRR 측정 불가 | Phase 2 | **Critical** |
| G3 | **CSV 데이터 내보내기** | Strategic | Lock-in 전략의 "신뢰 역설" 요소 — 데이터 이출 보장으로 오히려 신뢰 구축하는 전략. Phase 2 연기로 현재 "갇힌 느낌" 해소 불가 | Phase 2 | **Medium** |
| G4 | **SLA 대시보드 추이 분석** | Operational | 대시보드 API에 현재 시점 집계만 존재. 주간/월간 SLA 준수율 추이가 없어 Proof 생성에 한계 | Phase 2 | **Medium** |
| G5 | **업그레이드 전환율 추적** | Operational | 5조건 업그레이드 프롬프트는 구현됐으나 클릭/전환 이벤트 추적 미구현. PLG 퍼널 최적화 불가 | Phase 2 | **Medium** |
| G6 | **랜딩페이지 & GTM 채널** | Operational | 제품 외부 채널(SEO 블로그, 랜딩페이지, 사전등록)이 제품 범위 외로 미착수. GTM 실행의 전제 조건 | Phase 1 완료 후 | **High** |
| G7 | **AI 한국어 자동 분류** | Strategic | PRD에서 Moat 요소로 언급. 실제로는 Phase 3(F3.1). 경쟁사(Freshdesk Freddy AI) 대비 자동화 열위 | Phase 3 | **Low** |
| G8 | **Beta 가정 미검증** | Critical | PRD §1.2의 A1~A7 핵심 가정 7개 모두 "미검증" 상태. 제품 완성도와 무관하게 전략 가설 검증 미착수 | Beta 출시 후 | **Critical** |

---

## 8. 종합 평가 및 권고사항

### 8.1 전략이 잘 반영된 영역

**1. 한국형 워크플로우 — 전략 의도 완전 구현**
9상태·17이벤트 State Machine, 24개 비즈니스 규칙 상수(lib/constants.ts), KST 근무시간 엔진(business-hours.ts, 77 테스트), 계층형 승인 워크플로우(연기/완료 승인 6 API) — PRD에서 "글로벌 솔루션이 쉽게 복제할 수 없는 조합"으로 정의한 Moat 중 워크플로우 부분이 코드 수준에서 가장 충실히 구현됨. 경쟁사가 단기간에 따라오기 어려운 기술적 깊이가 확보됨.

**2. Lock-in 인프라 (Phase 1 목표) — 설계 의도 95% 구현**
히스토리 자산(TicketStatusHistory, TicketDeadlineHistory, SatisfactionRating), 워크플로우 커스텀(카테고리·공휴일·근무시간·프로젝트별 배정)이 DB 모델과 API 수준에서 완비됨. 사용자가 시스템에 의존하면 할수록 이탈 비용이 자연스럽게 증가하는 구조 완성.

**3. PLG 전환 경로 — 5조건 업그레이드 트리거 완성**
FREE_PLAN_LIMITS 상수 기반 제한 게이팅 + 온보딩 마법사 4단계 + 업그레이드 프롬프트 5조건이 일관된 PLG 퍼널로 연결됨. 사용자가 가치를 체험하다 자연스럽게 유료 전환을 유도받는 경로가 구현된 상태.

**4. 규정 준수 내재화 — PIPC·OWASP 코드 수준 구현**
로그인 이력 1년 보존(개인정보보호법 접속기록 의무), HSTS/CSP 헤더, HMAC role_hint, 비밀번호 변경 시 전체 세션 폐기(OWASP), Rate Limiting 4정책 — PRD에서 "기본 준수를 무료로 제공"한다는 약속이 코드에 그대로 반영됨.

**5. 타겟 세그먼트 3개 — 역할별 구현 완비**
IT 운영관리자(admin 대시보드·전사 현황), CS 매니저(support 대시보드·티켓 큐), 총무/시설관리(모바일 UX·44px 터치 타겟·하단 탭) — Persona 3개가 각각 코드로 구체화됨.

### 8.2 보완이 필요한 영역

**[Critical] G2 — 결제 시스템 없이는 SaaS가 아니다**
현재 제품은 우수한 서비스데스크 플랫폼이지만, Revenue 발생 경로가 없는 상태다. Pro $12 / Business $25 가격 체계가 PRD에 명시되어 있으나 DB 모델·결제 게이트웨이·기능 게이팅 API가 모두 미구현이다. Beta 50팀 온보딩 이후 첫 유료 전환을 위한 결제 인프라가 Phase 2의 최우선 과제다.

권고: Phase 2 시작 즉시 Subscription 모델(planType, billingCycleStart, agentCount, stripeCustomerId) DB 추가 → 토스페이먼츠/아임포트 연동 → 플랜별 기능 게이팅 미들웨어 구현 순서로 착수할 것.

**[Critical] G8 — 7개 핵심 가정 미검증**
PRD §1.2에서 명시한 A1(한국어 전환 의사)~A7(국산 솔루션 선호도) 7개 가정이 모두 "미검증" 상태다. 98.3% 구현 완료라는 숫자는 설계-구현 일치도이지, 전략 가설 검증이 아니다. "한국 기업이 이 제품을 위해 실제로 전환하는가"는 아직 불확실하다.

권고: Beta 출시와 동시에 A1(랜딩페이지 사전등록 100건/월), A4(Van Westendorp 가격 설문 N=200) 두 실험을 즉시 착수. 8주 이내 최소 2개 가정 검증 완료 목표.

**[Strategic] G1 — 카카오톡 Phase 2 연기의 포지셔닝 리스크**
UVP 문구("완전한 한국어, 카카오톡 알림, 합리적 가격")와 현재 제품 상태 간 메시지 갭이 존재한다. Beta 고객이 카카오톡 알림을 기대하고 가입했다가 미지원을 발견하면 신뢰 훼손이 발생할 수 있다.

권고: Beta 기간 동안의 마케팅 메시지를 "Web Push 기반 실시간 알림 (카카오톡 연동 Phase 2 예정)"으로 명확히 조정. 카카오톡 로드맵을 가입 단계에서 투명하게 공개하여 기대치 관리.

**[Medium] G3 — 데이터 내보내기 보장이 없으면 Lock-in 전략이 "갇힌 느낌"으로 역전**
PRD §2.5에서 데이터 내보내기를 "갇힌 느낌 방지 → 오히려 신뢰 구축"의 차별화 포인트로 명시했으나, 현재 Phase 2로 연기된 상태다. 히스토리 축적이 많아질수록 내보내기 미제공이 오히려 잠금 장치로 인식될 리스크가 증가한다.

권고: 티켓 목록 CSV 다운로드(기본 Export)를 Phase 2 초기 과제로 선행 구현. 전체 데이터 Export보다 훨씬 간단하게 구현 가능하며, "투명성" 메시지를 Beta 기간부터 전달할 수 있다.

### 8.3 전략-구현 종합 스코어카드

| 전략 영역 | 목표 | 실현도 | 등급 |
|----------|:----:|:------:|:---:|
| JTBD 6-Part VP | 30점 | 23점 (76.7%) | B |
| Lean Canvas 9섹션 | 9섹션 | 완료 3 / 부분 6 | B |
| SWOT 4전략 | 100% | 76% | B+ |
| Porter's 5Forces 대응 | 5 Forces | 3.5/5 완비 | B |
| Lock-in 4전략 | Phase 1: 2전략 | Phase 1 97% | A |
| Revenue 인프라 | 과금 가능 | 업셀UX만 완료 | C |
| 핵심 가정 검증 | 7개 가정 | 0/7 검증 | F |

**종합 판단**: nu-ServiceDesk는 "전략-설계-구현" 연결 고리가 탄탄한 제품이다. Phase 1 범위 내에서는 전략 의도의 76-95%가 코드로 구체화되었으며, 미실현 요소의 대부분은 의도적 Phase 구분에 의한 것이다.

그러나 "98.3% 구현 완료"는 설계 대비 구현 일치도이며, 전략 목표(Beta 50팀, MRR 발생, 핵심 가정 검증)는 아직 시작 전이다. 제품 완성도와 비즈니스 검증은 별개의 진행 상태임을 인식하고, Beta 출시-가정 검증-결제 인프라 구축을 동시 진행하는 것이 다음 단계의 핵심 과제다.

---

## 참조 문서

| 문서 | 경로 | 버전 |
|------|------|------|
| PRD | `docs/00-pm/nu-servicedesk.prd.md` | V2.3 |
| Plan | `docs/01-plan/features/nu-servicedesk.plan.md` | V2.4 |
| Design | `docs/02-design/features/nu-servicedesk.design.md` | V2.4 |
| Gap Analysis | `docs/03-analysis/nu-servicedesk.analysis.md` | V2.2 기준 98.3% |
| PDCA 보고서 | `docs/04-report/nu-servicedesk.report.md` | V2.3 |
| 비즈니스 상수 | `lib/constants.ts` | — |
| State Machine | `lib/ticket-state-machine.ts` | 9상태 17이벤트 |

---

*Based on PM Strategy frameworks: JTBD 6-Part (Pawel Huryn & Aatir Abdul Rauf), Lean Canvas (Ash Maurya), SWOT (Albert Humphrey), Porter's Five Forces (Michael Porter)*
