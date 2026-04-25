# Playwright E2E

출시 전 스모크/회귀를 위한 Playwright 스위트입니다.

## 목적

- 공개 사용자 핵심 여정 스모크
- 공유 흐름 공개 페이지 검증
- 관리자 주요 페이지 로드 스모크
- 역할별 staging 계정 또는 storage state 기반 실행

## 준비

1. `cp e2e/.env.example .env.e2e`
2. 아래 중 하나를 준비합니다.
   - `E2E_REVIEW_CODE`
   - 역할별 `E2E_*_ACCESS_TOKEN`
   - 역할별 `E2E_*_STORAGE_STATE`
3. `E2E_BASE_URL`을 staging 또는 로컬 프런트 URL로 맞춥니다.

`frontend/playwright.config.ts`가 `frontend/.env.e2e`를 자동으로 읽습니다. 셸 환경변수에 같은 키가 있으면 셸 값을 우선 사용합니다.

권장 역할 매핑:

- `new_user`: 무료 분석/저장/공유 스모크
- `returning_user`: 저장 프로필/기존 데이터 스모크
- `paid_user`: 유료 기능 회귀
- `admin`: 관리자 스모크

## 실행

```bash
cd frontend
npm run e2e
```

헤디드 실행:

```bash
cd frontend
npm run e2e:headed
```

브라우저 설치:

```bash
cd frontend
npm run e2e:install
```

## 현재 자동화 범위

- `auth.spec.ts`
  - 온보딩/로그인 진입 스모크
  - review-login 기반 홈 진입
- `reading-share.spec.ts`
  - 분석 입력
  - 결과 탭 스모크
  - 저장
  - 공유 링크 생성 및 공개 페이지 검증
  - 마이페이지 재조회
- `admin.spec.ts`
  - 대시보드
  - 사용자
  - 결제
  - 설정
  - 활동
  - 피드백
  - 감사 로그

## 운영 규칙

- 실제 Kakao/Naver OAuth, Toss hosted page, 실결제 취소는 수동 QA로 유지합니다.
- `E2E_AUTH_MODE=dual`이 아니고 storage state에 localStorage 토큰도 없는 경우 토큰 주입 방식은 동작하지 않습니다.
- 산출물은 `frontend/output/playwright/` 아래에 저장됩니다.
