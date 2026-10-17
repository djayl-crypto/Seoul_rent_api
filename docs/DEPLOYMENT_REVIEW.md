# 최초 업로드·배포 준비 검토

검토일: 2026-10-17 (한국시간). 대상: 작업 폴더 `Assignment02`, GitHub `Seoul_rent_api`, Cloudflare Pages `seoul-rent-api`.

이 문서는 최초 업로드 전 검토 기록이다. 후속 요청으로 GitHub 커밋·push가 승인되었고, 사용자 환경의 기존 `gh` CLI도 `djayl-crypto` 계정으로 인증됨을 확인했다. 아래 커밋 수·원격 미실행 상태는 최초 준비 완료 시점의 기록이며, Cloudflare 배포·원격 수집 보류는 계속 유효하다.

## 외부 작업 상태

- 로컬 Git `main`과 origin URL `https://github.com/djayl-crypto/Seoul_rent_api.git`만 준비했다.
- GitHub 연결 앱은 `djayl-crypto` 계정으로 인증됨. 로컬 `gh` CLI는 미인증.
- 대상 원격 저장소는 GitHub 앱 조회404. 실제 미생성과 앱 권한 부족을 구분할 수 없어 원격 생성·변경을 하지 않았다.
- 프로젝트의 로컬 커밋0개. GitHub push, Cloudflare 프로젝트 생성/배포/Secret 등록, 원격 데이터 전송은 하지 않았다.

## 업로드 범위

| 포함 | 제외 |
| --- | --- |
| `.gitignore`, 빈 `.env.example`, `.node-version` | 실제 `.env`, 환경별 환경파일, `.dev.vars*` |
| `README.md`, `package.json`, `package-lock.json`, `wrangler.jsonc` | 다른 실습 폴더 및 해당 환경파일 |
| `public/`: 화면·공개 자치구 경계·폰트/라이선스 | `dist/`, `node_modules/`, 도구 캐시 |
| `functions/`, `src/`, `scripts/`, `tests/` | `data/`, `.generated/`, `.wrangler/` 비공개 입력·집계 |
| 이 검토 문서·설계·공개 응답 계약 문서 | `docs/collection-report-*.json`, 로그·검증 임시 출력 |

원격 저장소의 루트는 Assignment02의 **내용**이다. 이 구조에서 Cloudflare Root directory는 빈 값(/), Functions는 루트 `functions/`, 출력은 `dist/`이다.

## 비밀값 검사

`npm.cmd run check:upload`는 파일 경로를 먼저 검사하고, 작업 사본·인덱스·모든 로컬 ref의 이력을 대상으로 진단한다. 환경파일이 추적되거나 이력에 있으면 내용 읽기 전에 중단한다. 실제 `.env`는 존재 여부만 확인했고 내용·값·원문을 읽거나 출력하지 않았다. `.env.example`은 빈 값만 허용한다. 의심 값은 파일명·줄 번호·규칙으로만 보고한다.

독립 검토에서 발견한 상위 폴더 junction 우회와 Git 인덱스의 심볼릭 링크 모드 누락을 보완했다. 모든 경로의 상위 폴더·실제 해석 경로와 인덱스·이력 파일 모드를 내용 읽기 전에 확인한다. 합성 임시 저장소의 재현 테스트가 수정 전 실패하고 수정 후 통과하는 것을 확인했다.

최초 작업 파일 검사에서 수집 실행 보고서의 비공개 저장 식별값과 합성 테스트 문자열이 잡혔다. 보고서는 업로드에 불필요해 파일을 보존한 채 ignore에 추가했다. 테스트 문자열은 실제 서울 키 형식이 아닌 명시적 합성 값임을 값 출력 없이 확인하고 `synthetic-` 표시로 통일했다. 실제 키 또는 토큰 노출을 확인한 것은 아니며 원격 업로드는 계속 보류했다.

검사는 알려진 토큰·리터럴 대입·인증키 URL·긴 문자열에 대한 검사이다. `.env`를 읽지 않으므로 실제 값과의 직접 대조는 하지 않는다. 공개 WOFF2 폰트는 형식을 확인한다. 이 결과를 임의 형식의 비밀값까지 완전히 검증했다는 의미로 해석하지 않는다. 이후 내용을 바꾸거나 커밋하기 전에도 재검사해야 한다.

## 배포 전 남은 외부 설정

1. 원격 저장소 존재·접근권한을 직접 확인하고 GitHub CLI 인증. 최초 커밋·업로드는 검토 후 실행.
2. Cloudflare의 Production/Preview 각각 `SEOUL_API_KEY`를 암호화 Secret으로 등록. 원격 수집 시 별도 `ADMIN_TOKEN`. `LOCAL_ADMIN` 등록 금지.
3. 비공개 R2 `seoul-rent-api-data` / `seoul-rent-api-preview-data` 생성. 환경별 `RENT_DATA` 바인딩은 Wrangler 설정 기준.
4. 로컬 데이터는 Git·정적 배포로 운영 R2에 복사되지 않는다. 승인 후 원격 수집으로25개 구의 같은 기간 완료 자료 준비.
5. 첫 Save and Deploy, 공개 Preview, Production 배포·자동 배포 활성화는 사용자가 결과를 확인한 뒤 진행.

## 최종 로컬 검증

- 전체 테스트: 65개 통과, 실패·건너뜀 0개.
- 정적 빌드: 허용된 공개 자산 29개 생성.
- Pages Functions: 실제 키를 읽지 않는 컴파일 통과.
- 업로드 후보: 74개 파일. 실제 `.env` 추적 없음, 커밋 이력 0개, 검사 지적 0개.
- Production/Preview의 `RENT_DATA` 버킷 분리, Node 22 지정, 평문 런타임 키 설정 없음.
- 커밋·push·배포·원격 수집은 수행하지 않음.

세부 설정과 직접 실행 절차는 README의 배포 준비 절을 따른다. 파일 변경 후에는 업로드 검사를 다시 실행한다.
