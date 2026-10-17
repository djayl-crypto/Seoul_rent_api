# Seoul_rent_api

서울시 전세 거래를 법정동·주택유형별로 비교합니다. **2022·2023년 공식 CSV + 접수연도 2024·2025·2026년 서울시 API**를 Pages Function에서 합산하고, 브라우저에는 검증된 요약만 반환합니다.

## 실행과 수집

Node.js 22 이상. PowerShell에서는 `npm.cmd`를 사용합니다.

```powershell
cd Assignment02
npm.cmd ci --ignore-scripts --no-audit --no-fund --cache .npm-cache
npm.cmd run prepare:data
npm.cmd run dev
```

별도 터미널에서 자치구 하나를 수집합니다.

```powershell
cd Assignment02
npm.cmd run sync -- --gu 11110
```

화면은 `http://127.0.0.1:8788`입니다. 수집 시에는 기존 `Assignment02/.env`를 **Wrangler가 로컬 Function 런타임으로만** 읽습니다. Node 수집 실행 도구는 이 파일과 서울 API 키를 읽지 않고 로컬 Function만 호출합니다.

- 모든 자치구: `npm.cmd run sync`
- 중단 후 재개: 같은 명령을 다시 실행. 동일 cutoff·파일 지문의 완료 자치구는 재수집하지 않습니다.
- 명시적 새 수집: `npm.cmd run sync -- --gu 11110 --restart`
- 키 없는 화면 확인: `npm.cmd run dev:keyless` (수집 API는 키 미설정 오류, 완료 요약 조회는 가능)

실행 중인 서버가 다른 포트라면 `SYNC_BASE_URL`을 해당 로컬 주소로 설정합니다. 서울 API 주소나 키를 여기에 넣지 마세요. 원격 관리에는 HTTPS 주소와 별도 `SYNC_ADMIN_TOKEN` 환경변수를 사용하며, 토큰을 명령행 인자에 넣지 않습니다.

**전체 수집은 약 수천 번의 서울 API 호출을 사용합니다.** 실제 계정 한도를 확인하고 먼저 자치구 하나로 검증하세요. 실행 도구는 동시 요청 1개, 단계 간 최소 550ms 간격을 사용합니다. 실패하면 이미 게시한 완료본을 유지합니다. 종료일은 수집 시작 시 고정되며, 다음 날 새 기간으로 수집하려면 `prepare:data`를 다시 실행하고 진행 중인 이전 작업에는 `--restart`를 사용합니다. `publishing` 단계에서는 재시작이 차단됩니다. 먼저 `sync`로 게시를 마친 후 재시작하세요.

## 파일의 의미와 중복 범위

입력 파일은 변경하지 않습니다.

| 파일 | 인코딩 | 원본 행 수 | 확인한 특징 |
| --- | --- | ---: | --- |
| `data/서울특별시_전월세가_2022.csv` | CP949 | 560,665 | 계약연도 2022, 접수연도 2021·2022·2023 혼합 |
| `data/서울특별시_전월세가_2023.csv` | UTF-8 BOM | 545,813 | 2022 계약 15,831건, 2023 계약 529,877건, 2024 계약 105건 |

단순히 두 파일을 합치면 중복 가능성이 있습니다. **2022 계약은 2022 파일을 우선** 사용하고, 2023 파일의 2022 계약은 `archiveOverlap`으로 제외합니다. 2023 파일의 나머지 계약은 보존합니다. 여기에 접수연도 2024~2026 API 자료를 추가합니다. 따라서 API에서 뒤늦게 접수된 2022·2023 계약도 계약일 기준으로 해당 연도에 포함됩니다. 같은 금액·면적·날짜라는 이유만으로 거래를 중복 제거하지 않습니다.

이 규칙은 거래 고유 ID가 없는 자료의 중복 범위를 명시적으로 나눈 것입니다. 파일 간 추출 시점·정정 차이와 누락까지 복원했다고 주장하지 않습니다. 원본 파일별 SHA-256, 행 수, 접수연도 범위와 제외 건수를 내부 출처에 기록합니다.

`prepare:data`는 CSV를 스트리밍으로 읽어 한글 열 이름·날짜·코드를 정규화합니다. 인용부호·줄바꿈·행 너비·원본 범위를 검증하고 집계만 `.generated/archives/`에 저장합니다. `.env`를 읽지 않으며, 원본 CSV와 생성한 비공개 집계는 Git과 정적 빌드에서 제외됩니다. 입력 파일 내용이 달라졌으면 반드시 다시 준비해야 합니다.

## 화면 사용

화면은 **필터 → 서울 전세 지도 → 선택 지역 지표·연도별 비교 → 월별·자치구 상세 분석** 순서입니다. 데스크톱에서는 넓은 지도 옆에 범례·건수·집계 기준을 모으고, 모바일에서는 지도 아래로 배치합니다. 상세 표와 긴 설명은 펼쳐서 확인할 수 있습니다. 포인트는 블루 `#2563EB`이며, 주택유형은 사용자가 제공한 팔레트의 순서에 따라 아파트 `#FF00FF`·단독다가구 `#00FFFF`·연립다세대 `#CCFF00`·오피스텔 `#191970`을 월별·자치구 그래프와 유형 표시에서 함께 사용합니다. 밝은 유형색에는 얇은 네이비 윤곽을 더합니다. A/B 월별 비교는 같은 유형 색의 실선·점선으로 구분하며, 연도별 A/B 막대는 지도 테두리·지역 배지와 같은 블루·네이비입니다. 지도는 보증금의 크기를 나타내는 기존 노랑 → 주황 → 빨강 범례를 사용합니다.

화면·입력 요소·지도 팝업·Plotly 그래프는 **Pretendard**를 사용합니다. [공식 Pretendard 1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9)의 가변 WOFF2 파일을 수정 없이 같은 출처에서 제공하며, 외부 폰트 CDN이나 추가 키가 필요하지 않습니다. 폰트를 미리 불러오고 사용 가능한 상태가 된 뒤 차트를 그립니다. SIL Open Font License 1.1과 저작권 표시는 `/Pretendard-LICENSE.txt`에 포함합니다.

밝은 배경과 블루 포인트의 화면에서 자치구·법정동·주택유형을 선택하면 자동 조회합니다. 기본 자치구는 **서울 전체**로, 25개 구의 내부 합계와 건수를 합쳐 계산하고 동 선택은 비활성화합니다. 자치구를 바꾸면 동은 전체 동으로 초기화됩니다. 상단 카드는 **선택 조건의 전체 조회 기간** 평균 전세 보증금(만원)과 거래 건수(건)입니다. 아래 차트와 5행 표는 **각 연도 동일 월·일까지** 비교합니다. 실제 수집 종료일을 화면에 표시하며, 10건 미만은 평균 대신 표본 부족을 안내합니다.

**두 동네 비교하기**를 켜면 A/B의 자치구·법정동을 독립적으로 선택할 수 있습니다. 같은 구의 두 동, 서로 다른 구의 동, 서울 전체와 특정 지역을 비교할 수 있습니다. 주택유형은 공통이며, 같은 조회 기간이어야 비교합니다. A/B 평균·건수·평균 차이와 연도별 표·Plotly 월별 추이를 각각 표시합니다. 범위가 겹치거나 동일한 경우에도 두 건수를 합산하지 않습니다. 한쪽이 0건이면 해당 평균은 거래 없음, 평균 차이는 계산하지 않습니다. 한쪽 오류·미준비·기간 불일치는 이전 비교 결과를 숨기고 안내합니다.

로딩·결과 없음·자료 준비 중·API 오류를 구분하고 오류 시 다시 시도할 수 있습니다. 로딩이나 실패 시 이전 결과는 숨깁니다. 브라우저는 같은 출처의 Pages Functions `/api/meta`, `/api/summary`, `/api/comparison`만 호출합니다.

**자치구 전세 지도**는 키 없는 OpenStreetMap 배경 위에 25개 구의 평균 보증금을 노랑 → 주황 → 빨강으로 표시합니다. CARTO 키는 사용하지 않습니다. 지도 주택유형은 상단 선택과 동기화하며, 4종 그래프 비교 중에도 지도에는 선택한 한 유형만 표시합니다. 기존 `/api/comparison` 결과를 재사용하므로 지도 때문에 서울시 API 수집이나 R2 요약 조회를 추가하지 않습니다. 기간·거래 건수·만원 단위 최솟값/중간값/최댓값 범례·자치구별 표를 함께 제공합니다. 색 기준은 유형별 유효 평균의 최솟값~최댓값 선형 범위이며 유형 변경 시 다시 계산합니다. 평균이 모두 같으면 주황 단색입니다.

자치구를 클릭하거나 키보드로 선택하면 평균·건수·기간을 볼 수 있습니다. 10건 미만·거래 없음·자료 없음은 회색이며 상세 표에서 구분하고, 10~29건은 참고용이라고 표시합니다. A는 블루 실선, B는 네이비 점선 테두리입니다. 법정동을 골라도 지도 색은 **자치구 전체 동의 평균**이며 동의 가격을 나타내지 않습니다. 배경 타일만 실패하면 경계·요약을 유지하고 재시도를 안내합니다. 경계·요약 검증 실패나 조회 기간 불일치 때는 이전 색을 숨깁니다. 선택 조건을 바꾸면 새 지역 응답의 기간을 검증할 때까지 지도와 자치구 비교를 숨기며, 재시도는 현재 지역과 자치구 요약을 함께 갱신합니다.

Leaflet 1.9.4와 라이선스는 정적 빌드에 포함합니다. 배경 이미지만 `https://tile.openstreetmap.org`에 직접 요청하며, 분석 자료는 계속 같은 출처의 Function으로 조회합니다. 배경 타일 레이어에만 CSS 흑백·낮은 대비 필터를 적용해 밝게 표시하고, 자치구 색상·이름·컨트롤은 별도 레이어로 유지합니다. CARTO 키나 추가 지도 서비스는 사용하지 않습니다. OSM 출처를 표시하고 기본 브라우저 캐시를 사용하며 대량 다운로드·미리 받기를 제공하지 않습니다. 타일 이미지에만 `strict-origin-when-cross-origin`을 지정해 출처의 origin을 보내고, 다른 요청의 기존 `no-referrer` 정책을 유지합니다. CSP는 이 이미지 호스트만 추가로 허용하며 스크립트·스타일·API 연결은 같은 출처로 제한합니다. [OSM 타일 정책](https://operations.osmfoundation.org/policies/tiles/), [Leaflet 문서](https://leafletjs.com/reference.html)를 따릅니다.

지도 경계는 실습 폴더의 통계청 SGIS 2025년 2분기 시군구 Shapefile(기준일 2025-06-30)에서 서울만 골라 EPSG:5179 → EPSG:4326으로 변환했습니다. 원본은 수정하지 않고, 서울 구 이름을 API의 5자리 코드에 대응시켜 공개 경계 25개만 `public/seoul-districts.geojson`에 저장합니다. SGIS 코드와 API 코드는 서로 다르므로 그대로 결합하지 않습니다. 변환 도구는 코드·이름·좌표 범위·닫힌 링·원본 지문을 검증하며 기본 빌드는 준비된 경계를 사용합니다. 같은 실습 입력이 있으면 `npm.cmd run prepare:map`으로 재생성할 수 있습니다. 입력 경로를 바꿀 때는 `npm.cmd run prepare:map -- "경계 파일이 있는 폴더"`를 사용합니다. 경계 기준일은 분석 거래 기간과 별도로 표시합니다.

추가 Plotly 그래프는 **월별 평균 전세 보증금 추이**와 **자치구별 평균 비교**입니다. 월별 추이는 선택한 한두 지역을, 자치구 비교는 서울 25개 구의 전체 동을 사용합니다. 주택유형 선택은 두 그래프에 적용되며, ‘주택유형별로 함께 비교’를 켜면 4개 유형을 함께 표시합니다. A/B 비교에서는 실선·점선으로 지역을 구분하고, 각 지역의 유형별 건수도 별도로 표시합니다. 각 그래프에 실제 기간·산술평균 정의·집계 거래 건수를 표시하고 상세 표에도 만원·건 단위를 붙입니다. 범례에서 유형을 숨겨도 집계 건수와 설명은 선택한 유형 전체 기준입니다.

월별 빈 구간·10건 미만은 평균 null로 두어 선을 연결하지 않습니다. 마지막 부분월은 별도 표시하며, 자동 관찰 문구는 완결월·30건 이상인 월만 비교합니다. 자치구의 최고·최저 관찰 역시 30건 이상인 구만 사용합니다. 관찰은 현재 요약값에서 계산하며, 거래 구성 차이가 반영될 가능성과 인과 해석의 한계를 함께 표시합니다.

Plotly Basic 4.1.2는 npm의 고정 버전으로 설치하고 빌드 시 같은 출처의 정적 자산으로 복사합니다. 공식 CSS 규칙을 별도 파일로 제공하여 기존 `script-src 'self'`, `style-src 'self'`, `connect-src 'self'`를 유지합니다. CDN·외부 차트 서비스나 브라우저용 키는 사용하지 않습니다. 라이선스는 `/plotly-LICENSE.txt`에 포함됩니다.

## 분석 지표

- 계약일 `CTRT_DAY`: **2022-01-01 ~ 한국시간 전일**, 최대 2026-12-31. 진행 중인 2026년을 포함한 5개 연도이며 완성된 60개월이 아닙니다.
- 기본 연도 비교: 각 연도의 1월 1일부터 종료일과 같은 월·일까지. 월별 자료는 과거 연도 전체 월을 보존하고 현재 월을 부분월로 표시합니다.
- `RENT_SE`가 `전세`인 유효 날짜·양수 보증금·지원 지역/유형의 거래. 신규·갱신 모두 포함합니다.
- 평균 전세보증금: 보증금 합계 ÷ 거래 수, 단위 만원.
- 평균 ㎡당 전세보증금: 거래별 보증금/임대면적의 산술평균, 단위 만원/㎡. 면적 결측 거래는 총액 지표에만 포함합니다.
- 10건 미만은 해당 평균을 숨깁니다. 10~29건은 참고용, 연도 증감률은 양쪽 30건 이상일 때만 제공합니다.
- 법정동은 자치구코드+법정동코드로 식별합니다. 주택유형은 아파트·단독다가구·연립다세대·오피스텔입니다. 전체 평균은 유형별 평균의 단순평균이 아닌 거래 수 기준 합산값입니다.
- 전체 유형의 가격 변화에는 주택유형 구성 변화가 영향을 줄 수 있습니다. 면적·층·건축연도 등을 통제한 가격지수는 아닙니다.

## API 경계

| 경로 | 동작 |
| --- | --- |
| `GET /api/meta` | 공개 기간·지역·유형·자료원 구분 |
| `GET /api/summary?gu=11110&dong=all&type=all&comparison=samePeriod&view=dashboard` | 동 목록·전체 기간 지표·연도별 요약·집계 월별 시계열 반환 |
| `GET /api/summary?gu=all&dong=all&type=all&view=dashboard` | 동일 기간의 25개 구를 정확히 합산한 서울 전체 요약 |
| `GET /api/comparison?type=all` | 같은 기간으로 완료된 25개 구의 유형별 평균·건수만 반환 |
| `POST /api/admin/source-check` | 관리자 인증 후 1행의 필수 필드 존재 여부만 반환 |
| `POST /api/admin/sync` | `start`, `status`, `step` 관리 동작, 원본 대신 진행 상황만 반환 |

자치구·법정동·주택유형·응답 형태·비교 방식·중복/미등록 쿼리 인자를 검증합니다. `dong`은 `all` 또는 해당 구의 자료에 있는 5자리 법정동 코드입니다. `gu=all`은 `dong=all`만 허용하고 항상 압축된 서울 전체 요약만 반환합니다. `view=dashboard`는 화면용 요약과 압축한 월별 시계열만, 개별 구의 기본 `view=all`은 기존 그룹·월별 요약도 제공합니다. 서울 전체와 자치구 비교 Function은 최대 3개 구를 병렬로 읽고, 한 구라도 미준비·검증 실패이거나 기간이 다르면 HTTP 503으로 반환합니다. 한 번의 서울 전체 또는 25구 비교 조회는 R2 포인터·완료 스냅샷 합계 50회를 읽습니다. 화면은 자치구 비교 결과를 현재 세션에서 재사용하고 유형 변경 시 재수집하지 않습니다. A/B는 요약 Function을 각각 요청하되 같은 조건이면 한 요청을 재사용하며, 두 응답의 기간도 확인합니다. 관리자 요청은 JSON만 받고 크기를 제한합니다. 임의 API 주소·인증키·페이지 번호를 공개 조회 인자로 받지 않습니다. 공개 GET은 서울 API를 호출하거나 수집을 시작하지 않습니다. 미준비 자치구는 HTTP 503입니다.

수집은 API 연도별 최대 1,000행씩 처리합니다. 정상 코드, 총건수 타입·범위, 행 수, 접수연도·자치구와 필수 열 타입을 검증합니다. `INFO-200`은 명시적인 빈 결과로 처리하고 기존 총건수와 다르면 수집을 실패시킵니다. HTTP 429/5xx·네트워크 오류·일부 서울 서버 오류에는 1·2·4초 후 최대 3회 재시도합니다. 인증·형식 오류는 즉시 중단합니다. 각 연도 마지막에는 첫 페이지의 총건수를 재확인합니다. 건수만 같은 원본 변경·재정렬까지 완벽히 검출하는 시점 고정 조회는 아닙니다.

R2 체크포인트는 조건부 갱신으로 동시 단계의 중복 합산을 막습니다. 한 자치구의 파일+API 3개 연도가 완료되면 새 스냅샷을 만들고 포인터를 교체합니다. 25개 구 전체를 완료하지 않아도 완료한 구는 조회 가능하지만, 이를 서울 전체 완료로 표시하지 않습니다.

## 비밀값과 배포

- 키는 Function의 `context.env.SEOUL_API_KEY`에서만 사용합니다. 프런트엔드 환경변수, 번들, 화면, API 응답, 오류 원문, 로그에 넣지 않습니다.
- `.env`는 로컬 전용이며 예제에는 빈 값만 있습니다. 실제 파일은 업로드·수정·복사하지 않습니다. 운영 키는 Pages의 암호화 런타임 Secret에 별도로 설정합니다.
- 개발 실행기는 상속된 서울/관리자 키를 제거하고 Wrangler의 터미널·디스크 로그와 사용 통계 전송을 비활성화합니다. `dev:keyless`는 dotenv 로딩도 끕니다. 원시 Wrangler 실행으로 보호 설정을 우회하지 마세요.
- 로컬 실행기만 `LOCAL_ADMIN=1`을 주입하고 127.0.0.1에 바인딩합니다. 로컬 관리자 요청은 루프백 Host와 동일 출처/Origin 없음만 허용하며 JSON을 요구합니다. **운영·미리보기 설정에 LOCAL_ADMIN을 추가하지 마세요.** 운영 관리자 API는 별도의 `ADMIN_TOKEN` Secret이 필요합니다.
- 서울 API 키를 추가하는 요청은 공식 HTTP 8088 경로입니다. 다른 호스트로 리다이렉트를 따라가지 않습니다. HTTP 전송구간 암호화 제약은 운영 배포 전 검토해야 합니다.
- `/data`, `/.generated`, `/.env`, 서버 소스 경로는 차단하며 `dist/`에는 허용한 정적 파일 29개만 들어갑니다(화면·공개 경계·폰트/라이선스 18개, Plotly 자산/라이선스 3개, Leaflet 자산/라이선스 8개). 응답은 허용된 요약 필드만 투영하고 마지막 경계에서 우발적인 비밀값 포함도 차단합니다.

## GitHub 업로드와 Cloudflare Pages 배포 준비

**GitHub 커밋·push만 승인되었으며 Cloudflare 배포는 보류 상태입니다.** Cloudflare 프로젝트 생성·배포·원격 데이터 수집은 실행하지 않았습니다. 아래 배포 명령은 별도로 진행하기로 결정한 다음에만 실행합니다. Pages의 Preview URL도 기본적으로 공개이므로 배포 승인 전에는 Preview를 만들지 않습니다. 검토 결과는 [DEPLOYMENT_REVIEW.md](docs/DEPLOYMENT_REVIEW.md)에 기록합니다.

### 저장소와 최초 업로드 검사

로컬 `Assignment02`에 독립 Git 저장소를 만들었고 브랜치는 `main`, origin은 `https://github.com/djayl-crypto/Seoul_rent_api.git`입니다. **Assignment02 폴더의 내용이 GitHub 저장소의 루트**가 됩니다. 다른 실습 폴더와 그 안의 환경파일은 대상이 아닙니다. 2026-10-17 후속 확인에서 GitHub 연결 앱과 사용자 환경의 `gh` CLI 모두 `djayl-crypto` 계정으로 인증됨을 확인했습니다. 최초 준비 단계의 샌드박스 CLI 인증 확인과 달리, 실제 사용자 환경에서는 기존 인증을 사용할 수 있습니다. Cloudflare Git 연결과 배포는 별도 단계입니다.

```powershell
# Assignment02 안에서, 원문 diff 대신 파일 목록부터 검토
git status --short
git diff --cached --name-only
npm.cmd run check:upload
```

`check:upload`는 작업 파일·Git 인덱스·모든 로컬 ref의 이력을 검사합니다. `.env`·`.dev.vars`·개인키·비공개 저장 폴더가 추적되거나 이력에 있으면 **내용을 읽기 전에 실패**합니다. 상위 폴더의 junction·심볼릭 링크, 저장소 밖으로 해석되는 경로, 인덱스·이력의 비정상 파일 모드도 내용 읽기 전에 차단합니다. 알려진 토큰 형식·키의 리터럴 대입·인증키가 들어간 서울 API 주소·의심스러운 긴 문자열을 검사하고, 오류는 파일명·줄 번호·규칙만 출력합니다. 실제 `.env` 내용과 키는 읽지 않으며, `.env.example`은 빈 값만 허용합니다. 공개 폰트 바이너리는 형식을 확인합니다. 패턴 검사는 임의 형식의 비밀값 전체나 원본 `.env` 값과의 일치까지 보증하는 검사는 아닙니다. 실패하면 커밋·push를 중단하고 원인을 검토합니다. 환경파일이 이력에 포함됐다면 ignore 추가만으로 해결되지 않으며, 노출 가능성이 있는 키는 교체하고 이력을 정리한 후 재검사합니다.

제외 대상은 `.env*`(빈 `.env.example` 제외), `.dev.vars*`, `data/`, `.generated/`, `.wrangler/`, `node_modules/`, `dist/`, 각종 로그·검증 출력, 로컬 수집 실행 보고서 `docs/collection-report-*.json`입니다. 수집 보고서의 저장 식별값은 업로드에 필요하지 않아 파일을 보존한 채 제외합니다. 예제·테스트의 값은 합성 데이터만 사용합니다. 검사 도구가 지정하는 `safe.directory`는 현재 저장소에 대한 개별 Git 명령에만 적용하며 전역 Git 설정은 변경하지 않습니다.

### 직접 GitHub 인증·저장소 생성·업로드할 때

다음은 **사용자 검토 후** 직접 실행할 절차입니다. 로그인은 브라우저에서 마치고, 토큰이나 API 키를 채팅·명령행 인자에 넣지 않습니다.

```powershell
cd Assignment02
gh auth login --web --git-protocol https
gh auth setup-git
gh repo view djayl-crypto/Seoul_rent_api --json nameWithOwner,url,isPrivate
```

저장소가 없다는 것을 직접 확인했다면 `gh repo create djayl-crypto/Seoul_rent_api --private`로 빈 비공개 저장소를 만듭니다. GitHub 웹에서 만들 경우 이름은 `Seoul_rent_api`, 가시성은 Private, README·gitignore 자동 생성은 선택하지 않습니다. 저장소가 이미 있으면 재생성하거나 강제 push하지 말고 해당 저장소의 권한·기존 이력을 먼저 확인합니다. GitHub 앱 인증은 CLI 로그인이나 Cloudflare GitHub 앱의 저장소 접근 권한을 대신하지 않습니다.

```powershell
# 승인 후 변경된 파일을 다시 스테이징할 때도 명시한 프로젝트 경로만 사용
git add -- .gitignore .env.example .node-version README.md package.json package-lock.json wrangler.jsonc functions public scripts src tests docs
npm.cmd run check:upload
git diff --cached --name-only
# 위 결과가 정상이고 최초 업로드를 진행하기로 했을 때만
git commit -m "Prepare Seoul rent dashboard for Pages"
git push -u origin main
```

작성자 정보가 없어 커밋이 거절되면 본인의 Git 작성자 이름·이메일을 이 저장소에 설정합니다. 키·비밀번호를 Git 설정값이나 remote URL에 넣지 않습니다. 현재 origin은 이미 준비했으므로 중복 `remote add`는 하지 않습니다.

### Pages 프로젝트 설정

[Cloudflare Git integration 가이드](https://developers.cloudflare.com/pages/get-started/git-integration/)에 따라 Workers & Pages → Create application → Pages → Connect to Git에서 저장소 접근 권한을 선택합니다. 현재 단계에서는 **Save and Deploy를 누르지 않습니다. 이 버튼은 첫 배포를 시작합니다.**

| 항목 | 준비할 값 |
| --- | --- |
| GitHub 저장소 | `djayl-crypto/Seoul_rent_api` |
| Pages 프로젝트 | `seoul-rent-api` |
| Production branch | `main` |
| Framework preset | None |
| Root directory | **빈 값(/)** — 로컬 Assignment02의 내용이 저장소 루트이기 때문 |
| Build command | `npm ci --include=dev --ignore-scripts --no-audit --no-fund && npm run build` |
| Build output directory | `dist` |
| 빌드용 일반 변수 | `SKIP_DEPENDENCY_INSTALL=1`, `NODE_VERSION=22` |
| Node 버전 파일 | 저장소 루트 `.node-version`의 `22` |
| Functions 위치 | 저장소 루트 `functions/` — `dist/functions`로 옮기지 않음 |
| compatibility date | `2026-09-30` — `wrangler.jsonc` 기준 |

상위 실습 저장소에 Assignment02 폴더를 통째로 넣는 다른 구조를 선택한 경우에만 Root directory를 `Assignment02`로 바꿉니다. 현재 준비한 독립 저장소 구조에서 `Assignment02`를 입력하면 경로가 맞지 않습니다. Node 버전·자동 의존성 설치 제어는 [Pages 빌드 이미지 설정](https://developers.cloudflare.com/pages/configuration/build-image/)을 따릅니다. `dist`의 29개 허용 자산과 루트 Functions를 함께 배포하며, Functions를 지원하지 않는 대시보드 폴더 드래그 업로드는 사용하지 않습니다. [Functions 프로젝트 구조](https://developers.cloudflare.com/pages/functions/get-started/)를 참고하세요.

기존 프로젝트를 연결하는 경우 Settings → Builds & deployments → Configure Production deployments에서 **Enable automatic production branch deployments를 해제**하고 Preview branch control은 **None**으로 두어 업로드가 즉시 사이트 공개로 이어지지 않게 합니다. 새 프로젝트의 최초 Save and Deploy도 승인 뒤에만 실행합니다. 이 제어와 이후 해제 위치는 [Branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)에 설명돼 있습니다. 원격 검토본이 필요할 때에는 [Preview Access policy](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access)를 먼저 설정하고 별도로 진행합니다. 이 정책은 Production 주소까지 보호하는 설정은 아닙니다.

### 서울 API 키를 암호화 Secret으로 등록

프로젝트가 만들어진 뒤 **Workers & Pages → 해당 Pages 프로젝트 → Settings → Variables and Secrets → 환경 Production 선택 → Add**로 들어갑니다. 이름을 `SEOUL_API_KEY`로 입력하고 실제 값은 사용자가 대시보드에서만 입력한 뒤 **Encrypt를 선택해 Secret으로 저장**합니다. Preview에서 수집할 경우 환경을 Preview로 바꾸어 별도로 등록합니다. 기존 프로젝트는 등록 후 다시 배포해야 새 Secret이 적용됩니다. 신규 프로젝트의 첫 빌드는 키 없이도 가능하지만, Secret·R2 데이터 준비가 끝나기 전에는 서비스 준비 완료로 보지 않습니다. [공식 Secrets 등록 절차](https://developers.cloudflare.com/pages/functions/bindings/#secrets)를 따릅니다.

- 런타임의 `context.env.SEOUL_API_KEY`만 사용합니다. `.env`는 로컬 전용으로 운영에 자동 전송되지 않습니다.
- `vars`나 Build 설정의 일반 변수, `PUBLIC_*`·`VITE_*`·클라이언트 코드에 키를 넣지 않습니다. GitHub Actions Secret과 Pages 런타임 Secret도 별개의 설정입니다.
- 원격 수집을 사용할 환경에는 별도 관리자 인증값 `ADMIN_TOKEN`도 같은 방법으로 암호화해 등록합니다. 이 값이 없으면 원격 관리자 API가 비활성화됩니다.
- `LOCAL_ADMIN`은 Production과 Preview 어디에도 등록하지 않습니다. 로컬 실행기가 127.0.0.1에만 주입하는 값입니다.
- CARTO 키는 사용하지 않으므로 등록할 필요가 없습니다. 공개 조회는 완료된 R2 요약을 읽고, 서울 키는 관리자 수집의 Function 내부에서만 사용합니다.

### R2와 운영 데이터 준비

R2 Object Storage에서 **공개 접근이 꺼진** 다음 두 버킷을 준비합니다. 생성과 원격 전송은 이 문서의 로컬 준비 단계에서 실행하지 않았습니다.

| 환경 | Function 바인딩 | 실제 버킷 |
| --- | --- | --- |
| Production | `RENT_DATA` | `seoul-rent-api-data` |
| Preview | `RENT_DATA` | `seoul-rent-api-preview-data` |

`wrangler.jsonc`의 기본 `r2_buckets`는 로컬·Production, `env.preview.r2_buckets`는 Preview에 적용합니다. 설정 파일이 [구성의 기준](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)이므로 대시보드 Bindings에서 이름·환경을 확인하고, 변경은 파일에서 합니다. 두 환경은 저장 공간과 Secrets가 독립적입니다.

**로컬에서 수집한 `.wrangler` R2와 `.generated`는 Git push나 Pages 배포로 운영 R2에 복사되지 않습니다.** 원본 CSV도 Git에 넣지 않습니다. 따라서 코드 배포만으로 차트 자료까지 준비되는 것은 아닙니다. 승인 후 런타임 Secret·R2 바인딩을 적용하고 로컬의 원본 CSV로 `npm.cmd run prepare:data`를 실행한 다음, HTTPS 원격 관리 API에 `npm.cmd run sync`로 자료를 준비해야 합니다. 먼저 한 구로 점검하고 전체25개 구를 완료합니다. 동일한 완료본은 재실행 때 재수집하지 않으며 현재 cutoff와 다르면 준비·재수집이 필요합니다.

다음은 승인 후 원격 수집을 진행할 때의 마스킹 입력 예시입니다. 서울 API 키는 여기에 입력하지 않습니다. 아래 토큰은 해당 환경의 `ADMIN_TOKEN`과 같은 **관리자 인증값**입니다.

```powershell
npm.cmd run prepare:data
$deployAdminInput = Read-Host '관리자 토큰 (화면에 표시되지 않음)' -AsSecureString
$deployAdminPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($deployAdminInput)
try {
  $env:SYNC_ADMIN_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($deployAdminPointer)
  $env:SYNC_BASE_URL = 'https://YOUR-APP.pages.dev'
  npm.cmd run sync -- --gu 11110
  # 한 구가 정상 완료된 뒤 전체 수집을 승인한 경우
  npm.cmd run sync
} finally {
  Remove-Item Env:\SYNC_ADMIN_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:\SYNC_BASE_URL -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($deployAdminPointer)
  $deployAdminInput.Dispose()
}
```

완료 자료가 없는 환경은 `DATA_NOT_READY`와 HTTP 503을 반환합니다. 전체 화면·지도 비교가 정상 동작하려면 25개 구가 같은 기간으로 완료되어야 합니다. 원격 수집은 실제 서울 API 호출·R2 사용량이 발생하므로 승인 후 계정 한도와 선택한 Cloudflare 플랜에서 확인합니다. 현재 로컬의 수집 완료 상태를 운영 완료로 간주하지 않습니다.

최종 공개 전에는 선택 환경의 키·R2·25구 자료 준비, `/api/meta`·`/api/summary?gu=all&view=dashboard`·`/api/comparison?type=all`의 기간·건수 일치, 모바일 조회·비교·오류 상태를 확인합니다. 그 뒤에만 Production 배포 또는 자동 배포 활성화를 진행합니다.

## 검증과 구조

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check:functions
```

테스트·빌드·Functions 컴파일은 실제 키를 읽지 않습니다. API는 합성 응답과 메모리 R2로 오류·재시도·페이지네이션·중복 합산·게시 순서·재개를 검증합니다. 대량 집계의 CPU 예산은 선택한 Cloudflare 플랜에서 별도 실측해야 하며 무료 플랜 충족을 보장하지 않습니다.

```text
data/                     사용자가 제공한 원본 CSV, 정적 배포/Git 제외
.generated/archives/      스트리밍 전처리 결과, 비공개/Git 제외
src/analysis.js           필터·가산 집계·병합·소표본·연도/월 요약
src/server/               원본 어댑터·관리 인증·수집 상태·요약 검증
functions/api/            공개 조회와 관리자 수집 Pages Functions
public/                   차트·표·필터 UI, 비밀값 접근 없음
scripts/                  CSV 준비·수집 실행·안전한 로컬 실행·빌드
tests/                    키 없는 회귀 테스트
docs/SNAPSHOT.md          비공개 저장 구조와 공개 응답 계약
```

공식 자료: [서울시 전월세 데이터](https://data.seoul.go.kr/dataList/OA-21276/A/1/datasetView.do), [Pages 바인딩](https://developers.cloudflare.com/pages/functions/bindings/), [R2 조건부 저장](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
