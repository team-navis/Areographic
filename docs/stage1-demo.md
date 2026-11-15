# mars walk 3D 데모 — stage 1

> 이 문서는 기준 브랜치 `demo/3d-stage1`의 이전 대표 장면·조작 기록입니다. 현재 `feat/immersive-mission-control`의 실내 `WASD` 보행·모니터 탐색·탐사 HUD는 [immersive-control.md](immersive-control.md)를 따릅니다. 아래의 A/S/D 미지원과 직접 헬멧 진입 설명은 이전 stage 1 또는 현재 외부 고정 경로에 해당하며, 현재 실내 보행 입력을 설명하지 않습니다.

대표 장면 확인용 빌드다. 왕복 임무, 관찰·기록, 기상 사건, 자동 관제는 아직 없다.

## 실행

```bash
npm install
npm run dev            # http://127.0.0.1:5173/
npm run build          # dist/ 생성
npm run preview        # http://127.0.0.1:4173/ (빌드 결과 확인)
npm run capture:stage1 # dev 서버가 떠 있을 때. 시스템 Chrome으로 검증 + docs/captures/stage1/ 캡처
```

의존성은 `three@0.170.0`, `vite@5.4.11`, `playwright-core@1.49.0`(devDependency, 브라우저를 따로 받지 않고 설치된 Chrome 사용)이다.

`capture:stage1`·`capture:rover`는 이 문서의 이전 화면 순서를 사용하므로 후속 실내 보행·HUD 수정의 검증 결과로 사용하지 않는다. 후속 브랜치는 현재 `npm test` 23개와 빌드를 통과했으며, 최신 조명·재질·우주복·HUD의 브라우저 QA는 진행 중이다.

## 조작

- 시작 화면에서 인물을 클릭하거나 아래 역할 버튼을 누른다.
- 관제자: 모니터의 PAD는 실제 DOM이다. `계획 시작` → ① 지점 고르기에서 레이어 5개, 가중치 슬라이더 3개, 후보 선택이 동작한다. `F`로 모니터 확대.
- 현장 대원: 접근 → 어깨 → 바이저 → 헬멧 안으로 카메라가 이어진다. 화면을 클릭하면 마우스 시선(Pointer Lock), 드래그로도 시선 이동. `W`를 누르는 동안만 고정 경로를 따라 전진한다. A/S/D·점프는 없다. `Esc`로 커서를 풀고 `역할 전환`.
- URL에 `?s=120`을 붙이면 경로 120 m 지점에서 시작한다(확인용).

## 구조

- `src/world/terrain.js` 실측 지형 로딩·좌표 변환·연출 디테일, `base.js` 가상 기지, `people.js` 인물, `helmet.js` 헬멧 내부
- `src/state/mission.js` 두 역할이 공유하는 임무 상태와 경로
- `src/pad/pad.js` PAD(DOM), `src/hud/hud.js` HUD, `src/camera/director.js` 카메라 전환
- `tools/` 자료 추출 스크립트, `tests/stage1.capture.mjs` 브라우저 검증

자료 출처와 실측/연출/모의 경계는 [stage1-data-assets.md](stage1-data-assets.md)에 있다.

## 로버 (브랜치 `demo/rover`)

- 기지 경사로 끝에서 경로를 따라 약 7 m 앞에 가상 로버가 서 있다. 도보로 3 m 안에 들어가면 HUD에 `E · 로버 탑승`이 뜬다. `E` 키 또는 그 버튼으로 탄다.
- 탑승 중에도 `W`를 누르는 동안만 같은 고정 경로를 따라 전진한다(모의 3.5 m/s, 도보는 1.4 m/s). 조향·후진·A/S/D는 없다.
- 멈춘 상태에서 `E`로 내린다. 내린 뒤에는 `W`로 걸어서 계속 간다. 로버는 내린 자리에 남고, 3 m 안에서 다시 탈 수 있다.
- PAD 홈의 `이동 수단`과 대원 상태, 지도 위 로버 표식이 같은 임무 상태를 보여 준다.
- 검증: `npm run capture:rover` (캡처는 `docs/captures/stage1-rover/`).

## Stage 2 (브랜치 `demo/hud-route`)

HUD 요소(H1·H2), 미니맵 다이얼 `M`, 로버 배속 `Shift`+`W`, 실제 주행선 기반 경로를 추가했다. 키·근거·한계는 [stage2-hud-route.md](stage2-hud-route.md), 검증은 `npm run capture:stage2`.

## 3D 기지 보행 · 관제 모니터 (브랜치 `feat/immersive-mission-control`)

현재 후속 브랜치는 실제 3D 기지 내부의 자유 보행과 충돌, 모니터 상세 화면에서 원위치 복귀, 에어록 출구에서 기존 외부 경로로 합류하는 동선을 추가했다. 외부에서는 여전히 W 전진과 E 승하차를 사용하며 자유 조향·후진을 구현하지 않았다. 우주복은 재질·헬멧 표현을 다듬어도 관절 애니메이션이 없는 정적 모델이다.

새 HUD는 실제 공유 임무의 산소·시간·경로·이동 수단을 사용한다. 정지 속도는 0, 남은 이동 시간은 경로 길이/설정 속도로 계산하고 정지·조사·귀환은 제외한다. 우주복 상세 패널은 미연결 센서를 명시하며, 패널 조작 중 이동·승하차·시선 입력을 막는다. 현재 개선 범위와 향후 UV·조명 정리, 우주복 리깅, 조사·기록·귀환 흐름 제안은 [관제실 문서](immersive-control.md)에 기록한다.

## 통합 (브랜치 `integrate/immersive`)

위 두 브랜치를 합친 상태다. 기지 안은 3D 기지 보행·관제 모니터 쪽을, 기지 밖은 Stage 2 HUD·경로 쪽을 따른다. 위 문단의 "새 HUD" 설명 가운데 클릭식 상태 패널과 패널 조작 중 입력 차단은 통합본에 해당하지 않는다. 상태 패널 내용은 버튼 2(또는 음성 "상세")로 여닫는 표시 전용 층으로 옮겼다. 무엇을 어느 쪽에서 가져왔는지와 판단 근거는 [integration-immersive.md](integration-immersive.md)에 적었다. 이 문서 앞부분의 Stage 1 실내 조작(기지 안에서 `W`로 고정 경로 전진, 3D 인물 클릭으로 역할 선택)은 통합본에서 실내 자유 보행과 버튼 선택으로 바뀌었다.

## Stage 3 (브랜치 `demo/v02-field`)

기능 정의 v0.2의 현장 기능을 추가했다. 현장 대조(계획 사진에서 딴 선을 암석 대역에 투영), 관찰 대조 화면, 관찰 리스트, 추가 관심 지점, 시료 기록, 경보, 버튼 2개와 음성 명령이다. 범위·한계·공유 파일 훅은 [stage3-v02-field.md](stage3-v02-field.md), 검증은 `npm run capture:stage3`.

다른 포트로 띄울 때: `MW_PORT=5174 npm run dev`, `MW_PREVIEW_PORT=4174 npm run preview`, 검증은 `MW_URL=http://127.0.0.1:5174/ npm run capture:stage3`.
