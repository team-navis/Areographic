# References · 자료·자산 출처 대장

공개 스냅샷에서는 EVOVA 모델 3개를 배포하지 않는다. NASA Mark III 우주복은 [공식 NASA 3D Resources 페이지](https://science.nasa.gov/3d-resources/mark-iii-spacesuit/)의 GLB와 바이트 일치를 확인했다(894,092 bytes, NASA/Michael D. Carbajal). 아래는 기존 출처 기록을 보존한 내용이며, 과거 커밋 표기가 이 공개 저장소의 Git 이력을 뜻하지 않는다. 현재 배포 범위는 [deployment.md](deployment.md)를 따른다.

2026-11-15 점검. 기준 브랜치 `main` 커밋 `123ac4c`. 이 문서는 **찾아보기 위한 목록**이다. 바이트 수·SHA-256·좌표 기준 같은 세부 값은 아래 정본 기록에만 있고 여기서는 다시 적지 않는다.

- 관측 지형·로버 위치: [`public/data/jezero/terrain.json`](../public/data/jezero/terrain.json), 주행선: [`public/data/jezero/route.json`](../public/data/jezero/route.json)
- 사진·메시: [`public/data/reference/SOURCES.json`](../public/data/reference/SOURCES.json), [`public/data/workspace/*.json`](../public/data/workspace/)
- 텍스처: [`public/textures/polyhaven/LICENSES.json`](../public/textures/polyhaven/LICENSES.json)
- 가공 설명: [`stage1-data-assets.md`](stage1-data-assets.md), [`stage2-hud-route.md`](stage2-hud-route.md), [`stage3-v02-field.md`](stage3-v02-field.md), HUD 설계 근거: [`hud-design-basis.md`](hud-design-basis.md)

**출처가 기록돼 있다는 것과 사용 권한이 확인됐다는 것은 다르다.** 각 항목의 "확인 상태"는 이 둘을 따로 적는다. 이 문서를 썼다고 해서 모든 이용 조건이 충족된 것은 아니다. 남은 항목은 7·8절에 있다.

## 1. 자료를 쓰는 방식

- **미리 받아 가공한 정적 파일만 쓴다.** 수집 스크립트(`tools/terrain/*.py`, `tools/assets/*.py`)로 한 번 받아 자르고 줄인 결과를 `public/`에 넣고, 실행 중에는 같은 서버의 상대 경로(`/data/...`, `/models/...`, `/textures/...`)로만 불러온다.
- **3D 데모(`src/`)에는 실시간 NASA API 연결이 없다.** NASA·JPL·USGS 주소로 가는 요청이 없고, 실행 중 외부 요청은 Google Fonts(Inter) 1건뿐이다(`src/pad/console-theme.css`).
- **관제 패드(`pad/pad.html`, 2026-11-15 병합)는 실행 중 외부에서 불러온다**: NASA Mars Trek 지도 타일(`https://trek.nasa.gov/tiles/Mars/EQ/`, 실시간 타일 서비스)과 Leaflet 1.9.4(unpkg CDN). 아래 6.1절.
- 실시간 화성 기상, 우주기상(DONKI), 우주복 센서, 통신 가시선은 연결하지 않았다. 화면에도 "미연결"로 나온다.

## 2. 제품 안 자료의 성격

- **실측(보관된 관측 자료)**: HiRISE·CTX 지형과 정사영상, Perseverance 정지점과 실제 주행선, sol 1215 전방 Hazcam 메시, sol 1176 Navcam 메시, WATSON 사진 PIA26368.
- **공개된 분석 결과(우리가 분석하지 않음)**: PIXL 광물 지도 PIA26640(NASA 공개 이미지와 캡션 그대로), NASA 시료 목록과 2025-09-10 발표의 사실 문구("잠재적 생명 흔적 · 생명 확인 아님").
- **추정(우리가 계산)**: 채취 지점 A·B 위치는 raw WATSON 카메라 메타데이터로 계산한 추정이며 공식 목표 좌표가 아니다. 경로 길이·경사는 DTM으로 계산한 값이다.
- **가상·연출**: 기지 건물(절차적 모델링), 우주복·관제자·로버 3D 모델, 흩어 놓은 바위, 하늘, 정사영상의 화성색 착색(원본은 단색), Navcam 회색 영상의 착색, 바닥·옷감 텍스처.
- **모의**: 임무 시계, 대원 위치·속도, 산소, 선량, 교신 두절, 경보, 모의 대원의 시연 응답.
- 이 프로젝트는 생명을 검출하거나 판정하지 않으며, 현장에서 새 장비 분석을 하지 않는다. 대원 기록은 "분석 전"으로 남는다.

## 3. 제품에 포함한 관측 자료

### 3.1 HiRISE DTM·정사영상 모자이크 (근거리 640 m)
- 자료: *Mars 2020 Terrain Relative Navigation HiRISE DTM Mosaic* (1 m), 같은 세트의 *HiRISE Orthorectified Image Mosaic* (25 cm). 제작·배포 USGS Astrogeology Science Center, 2020-07-24. DTM DOI <https://doi.org/10.5066/P9REJ9JN>
- 원본: `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif`, `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif` (<https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif>, <https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif>). 상품 페이지 <https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_hirise_dtm_mosaic>
- 프로젝트 파일: `public/data/jezero/hirise_dtm_1m_640.u16`, `hirise_ortho_25cm_2560.jpg`. 용도: 3D 지면 높이, 지도 바탕, 경로 경사 계산
- 가공: 640 m × 640 m 창만 HTTP range로 읽음 → float32 → uint16 양자화(최대 오차 0.73 mm) · 정사영상 2560 px JPEG · 좌표는 Mars 2000 구면 등장방형 → 로컬 동·북(원점 site 52/drive 7624) · 장면에서 단색 영상을 화성색으로 착색(연출). 스크립트 `tools/terrain/extract_jezero.py`, `quantize_dtm.py`
- 이용 조건: 상품 페이지 "Use Constraints: Please cite authors", "Access Constraints: None". USGS 저작물 일반 정책 <https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits>
- 크레딧: USGS Astrogeology Science Center; HiRISE (NASA/JPL-Caltech/University of Arizona)
- 확인 상태: 출처·이용 조건 확인(상품 페이지 "인용 요청", 접근 제한 없음). 원 영상은 PDS에 공개된 HiRISE 자료로 만든 USGS 산출물이며, PDS FAQ "Data sets archived in the PDS are in the public domain" <https://pds-geosciences.wustl.edu/faq.html>. 남은 것: 상품 페이지가 요구하는 저자 인용(Fergason 외 LPSC 2020 초록 <https://www.hou.usra.edu/meetings/lpsc2020/pdf/2020.pdf>)을 References에 넣을지 결정

### 3.2 CTX DTM·정사영상 모자이크 (원거리 8 km)
- 자료: *Mars 2020 Terrain Relative Navigation CTX DTM Mosaic* (20 m), *CTX Orthorectified Image Mosaic* (6 m). USGS Astrogeology, 2020-07-24
- 원본: `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif`, `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif` (<https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif>, <https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif>), 상품 페이지 <https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic>
- 프로젝트 파일: `public/data/jezero/ctx_dtm_20m_400.u16`, `ctx_ortho_6m.jpg`. 용도: 먼 배경 지형
- 가공: 8 km 창 자르기 → uint16 양자화 · 실행 중 착색(연출). 같은 스크립트
- 이용 조건: DTM 상품 페이지 "Please cite authors". 원 영상은 PDS에 공개된 CTX 원자료로 만든 USGS 산출물. MSSS 이미지 정책 <https://www.msss.com/policies/index.html>은 "MSSS가 만든 파생 영상"에 대한 것이고 PDS 원자료·USGS 모자이크에는 해당하지 않는다(정책 본문: "MSSS derived products are not released through [PDS]")
- 크레딧: USGS Astrogeology Science Center; CTX (NASA/JPL-Caltech/MSSS)
- 확인 상태: 출처·이용 조건 확인(DTM 상품 페이지, PDS 공개 원자료). CTX 정사영상 상품 페이지는 이번에 열리지 않아 그 페이지 문구만 미확인(같은 세트·같은 기관)

### 3.3 Perseverance 정지점과 실제 주행선 (MMGIS 공개 레이어)
- 자료: Mars 2020 MMGIS `M20_waypoints.json`(정지점 21개, sol 1171~1220), `M20_traverse.json`(주행 폴리라인, sol 1175~1185 구간). NASA/JPL-Caltech
- 원본: <https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json>, <https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json>
- 프로젝트 파일: `terrain.json`의 `waypoints`, `public/data/jezero/route.json`. 용도: 기지·목적지 위치, 대원·모의 대원이 따라가는 경로
- 가공: 경위도 → 지형과 같은 로컬 좌표 · 해당 구간 꼭짓점만 사용(새로 그린 선 없음). 스크립트 `tools/terrain/extract_route.py`
- 이용 조건: 두 파일(GeoJSON)과 MMGIS 화면 어디에도 라이선스·이용 조건 문구가 없다(파일 속성은 `type`, `name`, `crs`와 측정 필드뿐). JPL이 운영하는 공개 사이트의 자료이므로 JPL Image Use Policy <https://www.jpl.nasa.gov/jpl-image-use-policy/>("JPL 공개 사이트의 이미지·영상은 허가 없이 사용, 크레딧 Courtesy NASA/JPL-Caltech")를 유추 적용
- 크레딧: NASA/JPL-Caltech (Mars 2020 mission)
- 확인 상태: 출처 확인 · 이용 조건은 **명시 문구 없음**(찾을 수 있는 곳은 다 봄). JPL 정책 유추 적용과 크레딧 표기로 처리하는 것이 현실적. 확실히 하려면 JPL에 문의 · 주행선은 사람 보행·유인 로버 안전성 검증 아님

### 3.4 sol 1215 전방 Hazcam 지형 메시 / sol 1176 Navcam 지형 메시
- 자료: PDS Imaging Node `mars2020_hazcam_ops_mesh` 제품 `FLF_1215_0774815107M492RAS_N0560000FHAZ02008_0A0095J01`, `mars2020_navcam_ops_mesh` 제품 `NLG_1176_0771346345M727RAS_N0530130SCAM06176_0A01LLJ01`. NASA/JPL-Caltech. 다운로드 주소·원본 해시는 `SOURCES.json`
- 프로젝트 파일: `public/data/workspace/fhaz_1215_workspace.{bin,jpg,json}`, `navcam_1176_s53.{bin,jpg,json}`. 용도: 목적지 현장 대조 표면과 PAD 계획 영상(Hazcam), 경로 옆 실측 지면 조각(Navcam)
- 가공: Hazcam 1.5 m 반경 자르기, 꼭짓점 군집 단순화(8/20 mm), 텍스처 자르기·2048 px 축소 · Navcam 5 cm 군집 단순화, 0.6 m 넘는 변 제거, 1024 px 축소 · 둘 다 DTM 위에 일정 높이 보정과 가장자리 섞기 · Navcam 회색 영상은 장면에서 착색(연출). 스크립트 `tools/terrain/build_workspace_mesh.py`, `build_route_mesh.py`
- 이용 조건: JPL Data and Documentation Use Policy for PDS <https://pds-geosciences.wustl.edu/jplcopyright.html> — "JPL이 PDS에 제공한 문서·영상·데이터는 누구나 어떤 목적이든 사전 허가 없이 사용", 조건은 품질 보증 없음, 영상 크레딧 "Courtesy NASA/JPL-Caltech", NASA·JPL·Caltech 보증 암시 금지. PDS FAQ "Data sets archived in the PDS are in the public domain" <https://pds-geosciences.wustl.edu/faq.html>. Imaging Node 자체 페이지에는 별도 정책 문구가 없음
- 크레딧: NASA/JPL-Caltech (PDS Imaging Node)
- 확인 상태: 출처·이용 조건 확인(PDS 공통 정책 기준)

### 3.5 PIA26368 WATSON 사진 (기준 사진)
- 자료: *Perseverance Finds a Rock With 'Leopard Spots'* (PIA26368), WATSON, sol 1212. <https://www.jpl.nasa.gov/images/pia26368-perseverance-finds-a-rock-with-leopard-spots/>
- 프로젝트 파일: `public/data/reference/pia26368_cheyava_falls.jpg`. 용도: HUD·관찰 대조 기준 사진
- 가공: 1648×1200 PNG → 824×600 JPEG, 그 밖 수정 없음
- 이용 조건: JPL Image Use Policy <https://www.jpl.nasa.gov/jpl-image-use-policy/> (허가 없이 사용 가능, 크레딧 필수, 보증 암시 금지, 캡션에 제3자 소유 표기가 있으면 별도 조건)
- 크레딧: NASA/JPL-Caltech/MSSS
- 확인 상태: 출처·크레딧·이용 조건 확인. 공개 페이지 캡션은 "Credit: NASA/JPL-Caltech/MSSS"이고 제3자 소유·저작권 문구가 없다(2026-11-15 확인). JPL 정책은 제3자 소유일 때 캡션에 표기한다고 하므로 JPL 정책을 따른다. 크레딧 줄은 그대로 써야 한다. 캡션 문장을 그대로 옮겨 쓰지는 않는다

### 3.6 PIA26640 PIXL 광물 지도 (공개 분석 결과)
- 자료: *Perseverance's PIXL Finds Vivianite, Greigite in 'Cheyava Falls' Sample* (PIA26640), 2025-09-10. <https://science.nasa.gov/photojournal/perseverances-pixl-finds-vivianite-greigite-in-cheyava-falls-sample/>
- 프로젝트 파일: `public/data/reference/pia26640_pixl_cheyava_falls.jpg`. 용도: 관찰 대조 화면의 참고 이미지. 우리가 PIXL 분석을 한 것이 아니며, PIA26368과의 위치 정합도 하지 않았다
- 가공: 없음(공개 JPEG 그대로)
- 이용 조건: NASA 미디어 지침 <https://www.nasa.gov/nasa-brand-center/images-and-media/>, JPL Image Use Policy
- 크레딧: NASA/JPL-Caltech
- 확인 상태: 출처 확인. 크레딧·캡션은 2026-11-15 디자인 검토 때 읽은 페이지 문구 기준이며 이번에 다시 열지 않음

### 3.7 raw WATSON 카메라 메타데이터 (채취 지점 추정용, 파일은 포함 안 함)
- 자료: Mars 2020 Raw Images 피드 메타데이터(카메라 위치·시선). 챌린지 Resources의 Perseverance Raw Images와 같은 공개 자료. 피드 `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol=<sol>`, 화면 <https://mars.nasa.gov/mars2020/multimedia/raw-images/>
- 사용한 프레임: A `SIF_1217_0774993507_945EBY_N0560000SRLC02503_0000LMJ`(sol 1217, 연마 자국이 보이는 프레임), B `SIF_1212_0774536492_390EBY_N0560000SRLC08048_0000LMJ`(sol 1212, 자연면 근접)
- 프로젝트 반영: 계산한 좌표만 `tools/terrain/build_workspace_mesh.py`의 `POINTS`와 `fhaz_1215_workspace.json`의 `points`에 있다. 영상 파일은 넣지 않았다. 계산 근거는 `SOURCES.json`의 `sampling_points`
- 가공: 카메라 위치·시선 + 가정한 촬영 거리 4.5 / 6.5 cm → rover frame → SITE_FRAME 56. A = Apollo Temple, B = Cheyava Falls·코어 구역이라는 이름 붙이기는 Nature 논문 캡션에 기댄 추론
- 이용 조건: JPL Image Use Policy(raw 영상은 크레딧 NASA/JPL-Caltech)
- 확인 상태: 출처 확인(이전 세션 조사 기록에서 찾아 2026-11-15 정본 기록에 추가) · 결과는 화면에 "추정"으로 표시

## 4. 3D 모델·이미지

- **EVOVA(AI 3D) 모델 3개는 repo에서 제거했다(2026-11-15).** 원래 AI 3D 서비스 EVOVA(이보바, ㈜미타운 Metown Inc.) <https://www.evova.ai/ko>로 만든 우주복·관제자·로버 모델(`public/models/{eva,operator,rover}/*.glb`)이었다. 요금제의 별도 개별 계약 유무(아래 7절 1번)가 미확인이라 공개·제출 배포에서 빼기로 했고, 세 경로를 `.gitignore`에 추가해 소스 트리·배포 산출물에 포함하지 않는다. **데모는 이들 없이도 동작한다** — 기본 대원 모델은 **NASA Mark III**(아래, 번들·라이선스 확인), 관제자·로버는 **코드로 만든 절차적 모델**(`src/world/people.js`·`rover.js`)로 폴백한다. 로컬에서 쓰려면 해당 경로에 파일을 두고 `?suit=surface`·`?operator=mesh`·`?rover=mesh`로 불러올 수 있다(배포본에는 없음). 아래 제거 전 확인 내역은 참고용으로 남긴다(재투입 시 근거)
  - 이용 조건: EVOVA 서비스 통합 이용약관 <https://www.evova.ai/ko/agreements/service> (2026-11-15 시행본을 같은 날 읽음)
    - 제4장 제3조 1항: 이용자가 업로드하거나 제작을 의뢰한 자료와 이를 바탕으로 만든 3D 아이템·콘텐츠의 지식재산권은 "원칙적으로 이용자에게 귀속". 회사와 이용자 사이에 별도 개별 계약이 있으면 그 계약이 우선
    - 제4장 제3조 5항: 서비스로 만든 콘텐츠를 외부 플랫폼(자사 웹사이트, SNS 등)에 게시·활용할 수 있고, 약관이나 별도 계약에서 제한하지 않는 한 별도 제한 없음
    - 제4장 제3조 2·3항: 회사는 운영·개선을 위한 비독점 무상 이용권을 가진다. 공개로 설정한 아이템은 AI 학습과 회사 홍보에 쓰일 수 있다
    - 제2장 제6조: AI 결과물의 정확성·적합성은 보증하지 않는다
    - 마켓에서 산 아이템은 다른 약관을 따르며 재배포가 금지된다(마켓 제2조). 이 모델들은 해당 없음(아래)
  - 사용자 확인(2026-11-15): 세 모델 모두 2026-11-15에 만들었다(읽은 시행본이 적용됨) · 마켓 구매가 아니라 우리 계정으로 제작 · 제작한 팀원(계정 명의자)이 공개에 동의
  - 확인 상태: 약관상 이용자 귀속·외부 게시 허용으로 확인. 남은 것은 요금제에 별도 개별 계약이 있는지 하나(사용자도 모름, 7절 1번)
  - **Mars Surface EVA 우주복** `public/models/eva/mars-surface-eva-suit.glb` (제거됨 — 이전 기본 대원 모델, 현재 Mark III로 대체). permeant 커밋 `07fd555`. 우리가 1M → 약 19만 삼각형 단순화, Draco 압축, 색 텍스처 2048 → 1024 JPEG(커밋 `c12402e`, `54c449f`, 도구 `@gltf-transform/cli`, `tools/assets/resize_glb_texture.py`)
  - **앉은 관제자** `public/models/operator/base-operator-seated.glb`. permeant `1b688bf`, 1M → 18만 삼각형·Draco
  - **2인승 로버** `public/models/rover/crew-rover.glb` (34.6 MB, 지연 로딩). permeant `60a4ad4`, 가공 없음(`THREE.GLTFExporter r172`로 내보낸 파일). 실제 차량 설계나 Perseverance가 아니다
- **HUD 디자인 에셋** `public/assets/hud/*.webp` (브랜치 `design/hud-assets`). 팀원이 공유한 디자인 키트 2종(2026-11-15, 1배 선 세트 `mars_hud_assets.zip`, 3배 글로우 세트 `hud_png_assets_3x.zip`). 패널·바·테두리·나침반 호·화살표·조준점은 3배 세트, 아이콘은 1배 하늘색 선 아이콘. 크기 축소와 WebP 변환만 했다(`tools/assets/prepare_hud_assets.py`, 기록 `public/assets/hud/provenance.json`). **팀이 OpenAI 이미지 생성으로 만든 AI 생성물**(사용자 확인, 2026-11-15). 이용 조건: OpenAI Terms of Use — 사용자와 OpenAI 사이에서 출력물(Output)은 사용자 소유이고 OpenAI는 자신의 권리를 사용자에게 넘긴다(법이 허용하는 범위) <https://openai.com/policies/row-terms-of-use/>. 목적지·기지·버디·귀환 아이콘 4개(SVG)는 이 키트 스타일로 직접 그린 것. 제출 양식 AI 사용 칸에 적을 대상
- **NASA Mark III 우주복** `public/models/nasa/mark-iii-spacesuit.glb` — **현재 기본 대원 모델**(EVOVA 우주복 제거로 기본값이 됨). NASA 3D Resources(목록 <https://nasa3d.arc.nasa.gov/detail/mkiii-suit>, data.gov 항목 <https://catalog.data.gov/dataset/nasa-3d-models-mark-iii-spacesuit>). 배포 파일에 포함된다. 코드 주석의 크레딧 "NASA / Michael D. Carbajal"은 이번에 재확인하지 못했다. 받은 주소·파일 버전 **미기록**(제출 전 확인 권장). 조건: NASA 미디어 지침
- 기지 콘셉트 이미지 `interior.png`(AI 생성 콘셉트 그림, 실행 화면 미사용)는 2026-11-15 사용자 결정으로 배포 파일에서 **삭제**했다(기록: `stage1-data-assets.md` 7절, git 이력)
- 기지 건물, 헬멧 테두리, 바위, 하늘, 절차적 예비 인물·로버는 코드로 만든 것이다(`src/world/*.js`). 외부 자산 없음

## 5. 텍스처·폰트·코드

- **Poly Haven 텍스처 7종** `public/textures/polyhaven/` (Rubber Tiles, Fabric Pattern 07, Red Laterite Soil Stones, Rock Face, Fabric Leather 02, Denim Fabric, Blue Metal Plate). 작성자·원본 주소·가공(512~1024 px 재압축)은 `LICENSES.json`. 조건: CC0 1.0, 크레딧 불필요, 재배포 가능 <https://polyhaven.com/license>. 확인 상태: 확인. `denim_fabric_diff_1k.jpg`는 배포에 있으나 코드에서 쓰지 않음
- **Inter 폰트**: Google Fonts에서 실행 중 불러옴(파일 미포함). SIL Open Font License 1.1 <https://fonts.google.com/specimen/Inter/license>. 확인 상태: 라이선스 종류는 일반 정보로 확인, 이번에 원문 재확인 안 함. 방문자 브라우저가 Google 서버에 접속한다는 점은 공개 전 고지 대상
- Pretendard, Avenir Next, Apple SD Gothic Neo, SF Mono 등은 CSS에 이름만 있고 파일을 넣지 않았다(사용자 기기에 있을 때만 표시)
- **three.js 0.170.0** (MIT) — 실행 번들에 포함. `examples/jsm`의 GLTFLoader, DRACOLoader, EffectComposer·GTAOPass 등 후처리, RoundedBoxGeometry, BufferGeometryUtils, RectAreaLightUniformsLib 사용(같은 저장소, MIT). <https://github.com/mrdoob/three.js/blob/r170/LICENSE>
- **Draco 디코더** (Google, Apache-2.0) `public/draco/` — `three@0.170.0`의 `examples/jsm/libs/draco/gltf` 복사본(wasm 동일 확인). <https://github.com/google/draco/blob/master/LICENSE>. Apache-2.0 원문을 `public/draco/LICENSE`로 동봉했다(2026-11-15, <https://raw.githubusercontent.com/google/draco/master/LICENSE>에서 받음). Draco 저장소에는 NOTICE 파일이 없어 추가 고지 의무는 없다
- 빌드·도구만(배포 미포함): Vite 5.4.11 (MIT), @gltf-transform/cli 4.1.1 (MIT), playwright-core 1.49.0 (Apache-2.0, 검사용), Python numpy·Pillow(수집 스크립트)
- HUD 바이저 테마(`src/hud/visor-theme.css`, `hud.js` 일부)는 팀원 jeonseunghwan0811-dotcom의 작업이다(외부 자료 아님)
- AI 사용: 코드 작성에 AI 코딩 도우미(Claude)를 썼고(커밋 공동 작성자 표기), HUD 디자인 에셋·로고는 OpenAI 이미지 생성으로 만들었다. 3D 모델 3개는 AI 3D 서비스 EVOVA로 만들었으나 **2026-11-15 배포에서 제거**(개별 계약 유무 미확인)했다 — 제출 양식 AI 사용 칸에는 "사용 후 제거"로 적거나 뺄 수 있다. 현재 배포 자산 중 AI 생성은 HUD 에셋·로고(OpenAI)뿐

## 6.1 관제 패드 (`pad/`, 브랜치 `demo/areographic-pad`에서 병합)

팀원 Claireai107이 만든 독립 HTML 대시보드다. 3D 데모와 별개로 `pad/pad.html`을 직접 열거나 정적 서버로 연다. 아래는 저장소 파일과 커밋 설명만 보고 정리했다. 원자료는 다시 받지 않았다.

- **지도 타일**: NASA Mars Trek (`trek.nasa.gov`)을 실행 중 불러온다. 크레딧 NASA/JPL-Caltech(Mars Trek). 타일 상품명·레이어 ID와 이용 조건 **미확인**
- **Leaflet 1.9.4** (BSD-2-Clause, unpkg CDN에서 실행 중 로드) <https://leafletjs.com>
- **격자 3,067칸** `pad/data/grid.js` (160 m 칸, 데이터 팀 `marswalk_handoff`): 커밋·파일 설명상 CRISM(점토·탄산염), SIM3464(지질도), DEM(경사·교신 가시선), THEMIS 열관성 → 암석 피복(Zenodo 4931348, Edwards & Buz 2021). **각 원자료의 상품 ID·버전·가공 내역은 데이터 팀 기록 확인 필요**
- **탐사 지점·기지 좌표** `pad/data/sites.js`, `spots.js`/`spots.json` (Perseverance 착륙지 등). `spots.js`에는 Mars 2020 원본 영상 주소가 있다(Mastcam-Z raw, NASA/JPL-Caltech/ASU). 페이지가 이 영상을 쓰는지 **미확인**
- **소모품 가정** `pad/data/consumables.json`: 파일 설명 "아폴로 15-17 PLSS(8h), EMU PLSS"를 근거로 든 가정값. 원문 출처 **미기록**
- **로고** `pad/assets/logo.png`: 팀이 ChatGPT(OpenAI 이미지 생성)로 만든 AI 생성물(사용자 확인, 2026-11-15). 조건은 HUD 디자인 에셋과 같다(OpenAI Terms of Use: 출력물 사용자 소유). 3D 데모 화면용 변형은 `public/assets/brand/`(`tools/assets/prepare_brand.py`): 원본 색 그대로(`logo.webp`), 어두운 배경용으로 남색 글자만 흰색에 가깝게 바꾼 것(`logo-light.webp`), A 심볼만 잘라 낸 파비콘(`mark-*.png`)
- 유의: 화면 문구에 "생명점수"가 쓰인다(한 곳에 "생명 확률이 아닌 탐사 우선도"라고 설명). 제출 문구에서는 생명 판정으로 읽히지 않게 이름을 정리할지 팀 결정이 필요하다. 패드는 Vite 빌드 결과물(`dist/`)에 들어가지 않는다(배포에 넣으려면 위치 결정 필요)

## 6. 참고만 한 자료 (제품 파일에 포함 안 함)

- NASA 시료 목록(시료 25 Sapphire Canyon, 밀봉 sol 1215) <https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples> — 목적지 설명 문구
- NASA 발표 2025-09-10 "NASA Says Mars Rover Discovered Potential Biosignature Last Year" <https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/> — "잠재적 생명 흔적 · 생명 확인 아님" 문구의 근거(`src/pad/pad.js`)
- HUD 설계 근거: NASA-STD-3001 Vol 2 Rev E, NTRS 20250011653, 20130014736, 20230010234, 20180006618, 20205008200, 20230010686 (`hud-design-basis.md`). 팀 킷 조사 기록을 인용했고 원문은 그 작업에서 다시 열지 않았다
- Hurowitz 외 2025(Nature) 논문 — 제품 화면은 인용하지 않지만 채취 지점 A·B 이름 붙이기(3.7)에 캡션을 참고했다. 서지 정보·DOI는 저장소에 **미기록**

**챌린지 Resources와의 관계** (<https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources>, 2026-11-15 페이지 데이터에서 확인한 5개):
- Perseverance Raw Images — 사용(3.7, 메타데이터만, 영상 파일 미포함)
- USGS-NASA Planetary Geologic Mapping / Astrogeology interactive maps — 지질도는 사용 안 함. 같은 USGS Astrogeology의 TRN 지형 모자이크(3.1·3.2)를 사용
- JPL Mars Trek, Curiosity Mount Sharp 경로, NASA Worldview — 사용 안 함(References에 넣지 않음)

## 7. 출처 누락·이용 조건 미확인 목록

(2026-11-15 추가) 관제 패드: Mars Trek 타일 레이어·조건, 격자 원자료(CRISM·SIM3464·DEM·THEMIS) 상품 ID·가공 기록, 소모품 가정 출처. HUD 디자인 에셋은 팀이 OpenAI로 생성(약관상 출력물 사용자 소유, 4절).

해결됨(2026-11-15): WATSON 프레임 ID(3.7), PDS 메시 이용 조건(3.4), MSSS 크레딧 자료(3.2·3.5), Draco 라이선스 동봉(5절), 콘셉트 이미지 삭제(4절).

남은 것:
1. **EVOVA 모델 3개 → 해결(제거, 2026-11-15)**: 요금제 별도 개별 계약 유무가 미확인이라 공개·제출 배포에서 **제거**하고 `.gitignore` 처리했다(4절). 데모는 NASA Mark III + 절차적 모델로 폴백해 정상 동작. 재투입하려면 그 개별 계약 유무(월 99만 원 요금제)를 EVOVA 고객센터로 확인한 뒤 결정
2. MMGIS 정지점·주행선: 명시된 이용 조건이 없음. JPL 정책 유추 적용 상태
3. Mark III GLB: 받은 주소·버전, 코드 주석의 크레딧 인물 재확인(기본 화면에서는 안 씀)
4. CTX 정사영상 상품 페이지 문구, USGS 상품 인용 저자 목록 반영 여부
5. Hurowitz 외 2025 서지 정보(인용한다면)
6. jpl.nasa.gov·usgs.gov 정책 페이지는 자동 요청이 막혀 브라우저로 한 번 확인 필요

## 8. 공개·제출 전 해결할 것

- 7절 1번: **해결됨** — EVOVA 모델 3개를 공개 배포에서 제거하고 기본값을 NASA Mark III + 절차적 모델로 돌렸다(2026-11-15). 재투입하려면 별도 개별 계약 유무 확인 후 결정
- 제출 References 칸에 9절 문안 붙이기, AI 사용 칸 작성
- 배포 화면이나 README에 10절 고지문 넣을 위치 결정
- 쓰지 않는 배포 파일(`mark-iii-spacesuit.glb`, `denim_fabric_diff_1k.jpg`) 정리 여부 결정
- 기존 문서의 낡은 문장 정리: `stage1-data-assets.md` 2절(바위 "약 2,000개", "정지점 직선 스텁" 경로)과 3절(관제자 "미확보")은 이후 변경 전 기록이다(3·6절 하단에 변경 기록이 있음)

## 9. 제출 References 칸 문안 (영어, 복사용)

```
DATA (pre-downloaded, processed and bundled as static files; no live NASA API calls at runtime)
- USGS Astrogeology Science Center (2020). Mars 2020 Terrain Relative Navigation HiRISE DTM Mosaic (1 m) and HiRISE Orthorectified Image Mosaic (25 cm). https://doi.org/10.5066/P9REJ9JN ; https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif ; https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif (640 m window cropped, quantized, re-projected to a local frame; tinted for display)
- USGS Astrogeology Science Center (2020). Mars 2020 Terrain Relative Navigation CTX DTM Mosaic (20 m) and CTX Orthorectified Image Mosaic (6 m). https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif ; https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif (8 km window cropped)
- NASA/JPL-Caltech. Mars 2020 MMGIS waypoints and traverse layers. https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json ; https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json
- NASA/JPL-Caltech, PDS Imaging Node. Mars 2020 Hazcam terrain mesh FLF_1215_0774815107M492RAS_N0560000FHAZ02008_0A0095J01 and Navcam terrain mesh NLG_1176_0771346345M727RAS_N0530130SCAM06176_0A01LLJ01 (cropped, decimated, textures resized). https://pds-imaging.jpl.nasa.gov/
- NASA/JPL-Caltech. Mars 2020 Raw Images feed metadata for WATSON frames SIF_1217_0774993507_945EBY_N0560000SRLC02503_0000LMJ and SIF_1212_0774536492_390EBY_N0560000SRLC08048_0000LMJ (camera pose used to estimate sampling-point positions; images not included). https://mars.nasa.gov/mars2020/multimedia/raw-images/
- NASA/JPL-Caltech/MSSS. PIA26368, Perseverance Finds a Rock With 'Leopard Spots' (resized). https://www.jpl.nasa.gov/images/pia26368-perseverance-finds-a-rock-with-leopard-spots/
- NASA/JPL-Caltech. PIA26640, Perseverance's PIXL Finds Vivianite, Greigite in 'Cheyava Falls' Sample (published analysis shown as reference; unmodified). https://science.nasa.gov/photojournal/perseverances-pixl-finds-vivianite-greigite-in-cheyava-falls-sample/
- NASA. Mars 2020 rock sample list. https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples
- NASA (2025-09-10). NASA Says Mars Rover Discovered Potential Biosignature Last Year. https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/

DESIGN REFERENCES (consulted, not included)
- NASA-STD-3001 Vol. 2 Rev. E; NASA Technical Reports Server documents 20250011653, 20130014736, 20230010234, 20180006618, 20205008200, 20230010686. https://ntrs.nasa.gov/

3D MODELS, TEXTURES, FONTS
- NASA 3D Resources, Mark III Spacesuit (default crew model; credit NASA / Michael D. Carbajal). https://nasa3d.arc.nasa.gov/detail/mkiii-suit
- Seated operator and crew rover: procedural models built in code (src/world/people.js, rover.js). No external assets.
- (Removed) EVA suit, seated operator and crew rover meshes previously made with the AI 3D service EVOVA (Metown Inc.) were removed from the repository on 2026-11-15 pending confirmation of the paid-plan contract terms; they are not bundled or deployed. The demo falls back to the NASA Mark III suit and procedural operator/rover.
- Poly Haven textures (CC0 1.0): Rubber Tiles, Fabric Pattern 07, Red Laterite Soil Stones, Rock Face, Fabric Leather 02, Denim Fabric, Blue Metal Plate. https://polyhaven.com
- Inter typeface via Google Fonts (SIL Open Font License 1.1). https://fonts.google.com/specimen/Inter
- HUD design assets (panels, bars, compass arc, arrows, reticle, line icons) and the Areographic logo: generated by our team with OpenAI image generation (ChatGPT), resized for the web; output owned by the user under the OpenAI Terms of Use.

CODE
- three.js r170 (MIT). https://threejs.org
- Draco 3D decoder, Google (Apache-2.0; license included in public/draco/LICENSE). https://github.com/google/draco
- Vite (MIT), glTF-Transform (MIT), Playwright (Apache-2.0) used for build, asset optimization and testing.

NOTE: Habitat, crew state, oxygen, dose, alerts and the mission clock are simulated. Sampling-point positions are our estimates, not official target coordinates. The project does not detect or judge life and performs no new instrument analysis.
```

같은 내용(Claude로 코드 작성 보조, OpenAI로 HUD 에셋·로고 생성)을 제출 양식의 AI 사용 칸에도 적는다. EVOVA 3D 모델은 배포에서 제거했으므로 현재 배포본 기준 AI 생성 자산이 아니다.

## 10. 크레딧·고지문 (화면·README용 초안)

```
Terrain: USGS Astrogeology Science Center, Mars 2020 TRN HiRISE/CTX mosaics (HiRISE: NASA/JPL-Caltech/University of Arizona; CTX: NASA/JPL-Caltech/MSSS).
Rover positions, drive path, Hazcam/Navcam meshes: NASA/JPL-Caltech. Images: PIA26368 NASA/JPL-Caltech/MSSS; PIA26640 NASA/JPL-Caltech.
Textures: Poly Haven (CC0). three.js (MIT), Draco (Apache-2.0).
This is a hackathon demo, not a NASA product; no endorsement by NASA, JPL, Caltech or USGS is implied.
Archived observations are replayed; nothing is live. Habitat, crew state and alerts are simulated.
```
