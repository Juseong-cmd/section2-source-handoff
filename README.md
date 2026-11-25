# SECTION2 근태관리 소스 전달본

캘린더, 근태와 잔업, 공통 일정, Bay, 피드백, 라운지와 드로잉을 구현한 Next.js 앱입니다. 회사 환경에서 기능을 검토하고 이관하기 위한 소스입니다. 상세 동작과 인수 테스트는 [사내 재구현 가이드](docs/section2-internal-rebuild-guide.md)를 참고하세요.

## 로컬 실행

Node.js 22 이상과 pnpm 11을 사용합니다.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

브라우저에서 http://localhost:3000 을 열어 화면을 확인합니다. 공유 저장소 연결 및 API 검증은 아래 DB 설정 후 진행합니다.

## 가상 데이터로 서버 기능 확인

1. 독립된 개발용 Supabase 환경 또는 사내 승인 PostgREST 환경에서 [테이블 스키마](db/schema.sql)를 적용합니다. 이 스키마의 역할 이름은 Supabase 기본값을 따릅니다.
2. 서버 첫 실행 전에 [가상 팀원 데이터](db/demo-seed.sql)를 같은 개발 DB에 적용합니다. 예시는 `APP_STATE_KEY=section2_dev`를 사용합니다.
3. `.env.local`의 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 해당 개발 환경의 값으로 채웁니다. 서비스 키는 서버 환경에만 둡니다.
4. 서버를 다시 시작하고 `GET /api/state?view=calendar`가 성공하는지 확인한 뒤 캘린더와 라운지를 점검합니다.

```bash
pnpm build
pnpm start
```

원본 화면의 사용자 선택은 인증 기능과 별개입니다. 운영 데이터를 연결하기 전에 사내 SSO와 사용자별 서버 권한 검증을 적용하고, 배포 시점에 지원되는 Next.js 버전으로 이관하세요. 운영 백업과 투표 정산은 사내 스케줄러에서 설정합니다. 기존 배포 환경과 통합 키는 이 전달본에서 분리돼 있습니다.

## 검증

```bash
node --test app/date-utils.test.mjs
node scripts/test-visible-polling.mjs
pnpm build
node scripts/test-bay-integration.mjs
pnpm exec playwright install chromium
node scripts/test-drawing-catalog.mjs
```

Bay 통합 테스트는 별도의 가상 DB 응답을 사용합니다. 드로잉 테스트를 기본 로컬 실행 모드로 구동할 때는 개발 환경의 공유 저장소 설정을 비운 상태에서 실행합니다.
