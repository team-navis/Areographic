// Areographic 데이터 - marswalk_handoff 기준 (2026-11-15)
// 점수 = 격자(grid.js) 실데이터에서 읽음. 여기엔 지점·경로·기상·지표 정의만.

// 기지 = Perseverance 착륙지 (격자 원점과 동일)
const BASE = { lat: 18.44, lon: 77.45, name: '기지 (Octavia E. Butler 착륙지)' };

// 탐사 지점 - score는 하드코딩하지 않음: 해당 위치 격자 셀에서 실시간 계산
const SPOTS = [
  { id: 'delta', name: '델타 전선', lat: 18.472, lon: 77.424,
    desc: '함수광물 노두 · 세립 델타 퇴적층 (격자 최고권 실데이터)' },
  { id: 'hawksbill', name: 'Hawksbill Gap', lat: 18.458, lon: 77.434,
    desc: '델타 진입부 퇴적층 단면' },
  { id: 'seitah', name: 'Séítah', lat: 18.433, lon: 77.406,
    desc: '모래·화성암 지대 - 교신 음영 구간 포함 (DEM 가시선 실데이터)' },
  { id: 'cheyava-dir', name: 'Cheyava 방향 북부', lat: 18.492, lon: 77.440,
    desc: '로봇 발견 후보 방향 - 현 안전 기준의 탐색 범위 밖' },
  { id: 'north-high', name: '델타 북부 고득점 구역', lat: 18.509, lon: 77.414,
    desc: '격자 생명점수 최고(100) 군집 - 탐색 범위 밖 · 교신 음영' }
];

// 경로 - wp 경유지, hiddenSeg 교신 음영 구간 인덱스(DEM 가시선), blocked 경사 주의 구역
const ROUTES = {
  'delta': {
    wp: [[18.440, 77.450], [18.4475, 77.4420], [18.4560, 77.4345], [18.4640, 77.4290], [18.472, 77.424]],
    blocked: { lat: 18.4660, lon: 77.4330, note: '경사 11° 비탈 - 대사율 급증 구간 (Pandolf)' },
    hiddenSeg: 2, altNote: '플랜 B · +11분 · 교신 음영 회피',
    altWp: [[18.440, 77.450], [18.4500, 77.4470], [18.4610, 77.4400], [18.4690, 77.4310], [18.472, 77.424]]
  },
  'hawksbill': {
    wp: [[18.440, 77.450], [18.4490, 77.4420], [18.458, 77.434]],
    blocked: null, hiddenSeg: null, altNote: null
  },
  'seitah': {
    wp: [[18.440, 77.450], [18.4360, 77.4320], [18.4330, 77.4180], [18.433, 77.406]],
    blocked: { lat: 18.4345, lon: 77.4250, note: '암석 피복 높은 구간 - 우회 비용 반영 (THEMIS 열관성)' },
    hiddenSeg: 2, altNote: null
  }
};

// 로봇 발견 핀 (실좌표 근사)
const PINS = [
  { name: 'Three Forks 샘플 depot', lat: 18.400, lon: 77.440, desc: '샘플 튜브 10개 매장 - 유인 회수 목표' },
  { name: 'Séítah 시추 지점', lat: 18.435, lon: 77.408, desc: '화성암질 코어 채취 (초기 캠페인)' },
  { name: 'Kodiak', lat: 18.423, lon: 77.403, desc: '델타 잔존 뷰트 - 호수 수위 기록' },
  { name: 'Hawksbill Gap 노두', lat: 18.459, lon: 77.433, desc: '델타 전면 캠페인 관측 지점' }
];

// 과거 물 흔적 벡터 (CRISM·USGS 기반 근사)
const WATER = {
  polys: [
    { name: '델타 팬 퇴적층 (S2=4 구역)', color: '#3b86d4',
      pts: [[18.482, 77.408], [18.476, 77.428], [18.466, 77.436], [18.455, 77.432], [18.460, 77.416], [18.470, 77.405]] },
    { name: '델타 전면 이암 (추정)', color: '#4aa3ff',
      pts: [[18.455, 77.432], [18.450, 77.442], [18.442, 77.446], [18.444, 77.436], [18.450, 77.430]] }
  ],
  dots: [
    { name: '함수광물 검출 (CRISM)', lat: 18.474, lon: 77.420 },
    { name: '점토광물 검출 (CRISM)', lat: 18.465, lon: 77.428 },
    { name: '탄산염 흔적 (CRISM)', lat: 18.448, lon: 77.440 }
  ]
};

// 기상 (MEDA 기반 모의) + 우주기상 (DONKI 리플레이)
const WEATHER = {
  tempC: -42, tempRange: '주간 -18 ~ 야간 -80 ℃', wind: 4.2, tau: 0.42, pressure: 735,
  src: 'Mars2020 MEDA 기반 모의값'
};
const DONKI = {
  type: 'FLR', time: '2024-05-10 06:51Z', note: 'DONKI 리플레이 (2024-05 태양활동기)',
  spe: { onset: 10, dur: 30, spike: 1.2, shieldPct: 20 }   // 시뮬 틱(분) 기준 · spike mSv · 지형 차폐 최대 %
};

// 생명점수 지표 (weights.json · 순위만 정하고 가중치는 공식이 계산)
const INDICATORS = [
  { key: 'S1', name: '함수·점토광물', desc: '유기물 보존 1순위 매질 (CRISM 분광, iMOST)' },
  { key: 'S2', name: '퇴적·델타 맥락', desc: '세립 호성 이암·델타 팬 (USGS SIM3464)' },
  { key: 'S4', name: '물 활동 흔적', desc: '수로·수화광물 - 거주가능성 전제 (설계 반영·S1·S2에 내재)' },
  { key: 'S3', name: '보존성 염류', desc: '황산염·탄산염 - Jezero 희박 (설계 유지)' },
  { key: 'S5', name: '로버 현장 근접', desc: '직접 검출 신뢰도 최고 · 커버리지 좁음 (미투입)' }
];
const PRESET_RANKS = {
  '과학 권장 (기본)': { order: ['S1', 'S2', 'S4', 'S3', 'S5'], formula: 'ROC' },
  '물 추적': { order: ['S4', 'S1', 'S2', 'S3', 'S5'], formula: 'ROC' },
  '검증 우선': { order: ['S5', 'S1', 'S2', 'S4', 'S3'], formula: 'RS' }
};

// 모델 상수 (1_model_spec_handoff.md · 2_sources.md)
const MODEL = {
  eta: 2.0, gMars: 0.38,                 // Pandolf - 화성 레골리스·중력
  o2PerWatt: 1 / 348,                    // M_W → L/min
  baseMW: 273,                           // 기준 대사율 (930 BTU/hr)
  vo2abs: 3.0, sustain: 0.35,            // 체력 (W'BAL)
  hrA: 70.5, hrB: 113.2, hrMax: 186,     // 심박 (PhysioNet 992명 보정)
  radDay: 0.64,                          // mSv/day (Curiosity RAD)
  consumables: [                         // 용량(분) · 대사율 비례 계수 - 복귀 한계 = MIN
    { key: 'o2', name: '산소', cap: 480, scale: 1.0 },
    { key: 'fw', name: '냉각수', cap: 450, scale: 1.05 },
    { key: 'co', name: 'CO₂ 제거', cap: 500, scale: 0.95 },
    { key: 'ba', name: '배터리', cap: 420, scale: 0 }    // scale 0 = 일정 소모
  ]
};
