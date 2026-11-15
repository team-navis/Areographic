# 공개 데모 배포

이 저장소는 현재 제품 파일로 시작한 별도 공개 스냅샷이다. 기존 비공개 저장소의 `.git`, 과거 커밋, 브랜치, 태그는 가져오지 않았다. 원본 저장소와 과거 검증 기록은 비공개로 보존한다.

## 포함 범위

실행 코드, 관제 패드, 현재 데이터와 자산, 테스트, 수집 도구, 문서와 라이선스를 옮겼다. EVOVA 모델 3개와 과거 테스트 캡처(`docs/captures/`)는 공개본에 넣지 않는다. 기존 개발 문서의 브랜치명, 커밋 표기와 캡처 링크는 당시 기록이며 이 저장소의 Git 이력을 뜻하지 않는다.

대원은 NASA 3D Resources의 Mark III 우주복을 쓰고, 관제자와 로버는 기존 코드의 절차적 모델을 사용한다. NASA 모델은 정적 시각 자료이며 화성 표면용 인증을 뜻하지 않는다. NASA 공식 배포 파일과 바이트 일치를 확인했고, 출처는 `public/CREDITS.txt`에 있다.

## 로컬 확인

```bash
npm ci --ignore-scripts
npm test
npm run build -- --base=/Areographic/
MW_PREVIEW_PORT=4192 npm run preview -- --base=/Areographic/
MW_URL=http://127.0.0.1:4192/Areographic/ node tools/pages-smoke.mjs
```

브라우저 검증은 Chrome 설치가 필요하다. 결과는 `test-results/pages/`에 저장하며 Git에 포함하지 않는다. 자동화는 관제 패드, 대원 진입, 에어록, HUD와 자산 요청을 확인하며 실제 마이크 인식이나 사람 사용성 시험을 대신하지 않는다.

## GitHub Pages

- 공개 주소: <https://team-navis.github.io/Areographic/>
- 저장소: <https://github.com/team-navis/Areographic>
- GitHub Pages의 Source는 GitHub Actions를 사용한다.
- Actions에서 `Deploy submission to GitHub Pages`를 `main` 기준으로 수동 실행한다. 일반 push는 배포를 시작하지 않는다.
- 워크플로는 고정 버전의 action과 Node 22로 설치, 테스트, 빌드한 뒤 `dist/`만 배포한다. EVOVA 모델 경로가 빌드에 있으면 중단한다.
- `deployment.json`에 공개 저장소의 배포 커밋, 실행 ID와 빌드 시각을 기록한다. 기존 비공개 저장소의 커밋 이력을 포함하지 않는다.

관제 패드의 HTML, 데이터와 이미지는 `pad/`에서 `dist/pad/`로 복사된다. 3D와 패드가 별도 페이지로 실행되는 구조, 현재 기능과 디자인은 유지하며 Pages 하위 경로에 맞춘 자산 URL 처리만 추가했다.

## 외부 요청과 이용 고지

3D 데모는 보관된 관측 자료를 정적으로 제공하며 NASA API 키를 사용하지 않는다. Google Fonts, Leaflet CDN(unpkg), NASA Mars Trek 지도 타일은 방문자의 브라우저가 외부 서버에 요청한다. 외부 서비스의 가용성은 이 배포가 보장하지 않는다.

`CREDITS.txt`, `THIRD_PARTY_NOTICES.txt`, `LEAFLET_LICENSE.txt`, `draco/LICENSE`를 배포에 포함한다. 데이터와 라이선스별 조건은 `REFERENCES.md`를 따른다. 무료 호스팅을 사용하되 무중단이나 무제한 트래픽을 보장한다는 의미는 아니다.
