# nu-ServiceDesk 개발 산출물

> 최종 업데이트: 2026-04-10

## 폴더 구조

| 폴더 | 내용 | 상태 |
|------|------|------|
| `00-pm/` | PRD (Product Requirements Document) | ✅ FINAL |
| `01-plan/features/` | 기능 계획서 | ✅ FINAL |
| `02-design/features/` | 설계 문서 (아키텍처, DB, API) | ✅ FINAL |
| `03-analysis/` | Gap 분석 보고서 (Check 단계) | ✅ 완료 |
| `04-report/` | PDCA 완료 보고서, QA 검수 | ✅ 완료 |
| `mockups/` | HTML/CSS 프로토타입 목업 | ✅ 4개 화면 |
| `archive/versions/` | 구버전 문서 (V1.1, V2.0, V2.1) | 📦 보관 |

## 문서 목록

### 기획 (PM)
- [PRD](00-pm/nu-servicedesk.prd.md) — 제품 요구사항 정의서

### 계획 (Plan)
- [Plan](01-plan/features/nu-servicedesk.plan.md) — 기능 계획서 (요구사항, 성공 지표)

### 설계 (Design)
- [Design](02-design/features/nu-servicedesk.design.md) — 아키텍처, DB 스키마, API 설계

### 분석/보고 (Check/Report)
- [Gap 분석](03-analysis/nu-servicedesk.analysis.md) — 설계 vs 구현 일치율 100% (V2.2 기준) — V2.3 재측정 필요
- [완료 보고서](04-report/nu-servicedesk.report.md) — PDCA 최종 보고서
- [QA 검수](04-report/qa-inspection.report.md) — QA 검수 보고서

### 목업
- [로그인](mockups/01-login.html)
- [대시보드 (관리자)](mockups/02-dashboard-admin.html)
- [티켓 목록](mockups/03-ticket-list.html)
- [티켓 상세](mockups/04-ticket-detail.html)
