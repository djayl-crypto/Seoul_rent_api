# Seoul_rent_api 배포 준비 계획

후속 상태: 최초 준비를 마친 뒤 사용자가 GitHub 커밋·push만 승인했다. 아래는 최초 준비 시점의 계획 기록이며, Cloudflare 배포·원격 수집은 계속 보류한다.

**Goal:** Assignment02만 독립 Git 저장소로 준비하고 업로드 대상의 비밀값 위험을 점검하며, 공개 배포 전에 사용자가 검토할 Cloudflare Pages 절차를 README에 제공한다.

**Architecture:** 기존 정적 dist + 루트 functions 구조를 유지한다. 운영 R2와 Preview R2를 분리하고, 서울 키는 대시보드의 암호화 Secret으로만 등록한다. Git 전송과 Cloudflare 배포는 수행하지 않는다.

**Constraints:** .env/.dev.vars는 이름·존재·Git 메타데이터만 확인하며 내용은 읽거나 출력하지 않는다. 다른 파일의 의심 값도 출력하지 않는다. GitHub 소유자 후보는 인증된 djayl-crypto, 저장소명 Seoul_rent_api, Pages명 seoul-rent-api. 현재 GitHub 앱 인증됨/CLI 미인증/대상 저장소 앱 조회404. 생성·push·배포·원격 수집은 보류한다.

- [x] 업로드 전 검사 도구와 회귀 테스트: 비밀 파일 경로 차단, 작업 파일/인덱스/이력 검사, 원문 없는 진단, 예제 환경파일의 빈 값만 허용.
- [x] Assignment02 Git main 초기화, origin URL만 준비. ignore를 검증하고 최초 업로드 후보 74개 파일을 검토·스테이징한다. 커밋/push는 하지 않는다.
- [x] Preview R2 분리, Node22 버전 지정, README에 GitHub 수동 인증/저장소 생성, Root·Build·Output·Functions·Secret·R2·자동 배포 보류·운영 데이터 준비·승인 후 배포 절차 명시.
- [x] 검사/테스트/빌드/키 없는 Functions 컴파일 및 최종 독립 검토. 전체 테스트 65개·공개 자산 29개 빌드·컴파일 통과. 검사 지적 0개, 로컬 커밋 0개. 독립 검토의 두 경로 검사 지적은 재현 후 보완했다. 검토 결과와 남은 외부 설정은 `docs/DEPLOYMENT_REVIEW.md`에 기록한다.

기본 저장소 구조는 Assignment02의 **내용이 GitHub 루트**가 되는 구조이다. 따라서 Pages Root directory는 빈 값(/)이며 Assignment02가 아니다. Cloudflare Git 연결의 첫 Save and Deploy와 Preview도 외부 공개가 발생하므로 사용자 검토 전에는 실행하지 않는다.
