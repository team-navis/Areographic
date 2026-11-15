// MARSWALK 탐사 지점 데이터 (로직과 분리).
// 지점 추가·수정하려면 여기만 고치면 됨 — html은 안 건드려도 됨.
const SPOTS = [
  { name:"델타 전선",    lat:18.472, lon:77.424, score:92, note:"함수광물 노두 · 생명점수 최고",
    img:"https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00400/ids/edr/browse/zcam/ZR0_0400_0702461657_553EBY_N0191126ZCAM07114_0340LUJ01_1200.jpg" },
  { name:"Cheyava 방향", lat:18.492, lon:77.440, score:85, note:"로봇 발견 유력 바이오시그니처 후보",
    img:"https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00401/ids/edr/browse/zcam/ZL0_0401_0702535082_292EBY_N0191126ZCAM05100_1100LMJ01_1200.jpg" },
  { name:"Hawksbill Gap", lat:18.458, lon:77.434, score:78, note:"퇴적층 단면",
    img:"https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00401/ids/edr/browse/ncam/NLE_0401_0702543750_942ECM_N0192066SAPP00601_00_0LLJ01_1200.jpg" },
  { name:"Séítah",       lat:18.433, lon:77.406, score:54, note:"모래·화성암 (접근성 대비)",
    img:"https://mars.nasa.gov/mars2020-raw-images/pub/ods/surface/sol/00400/ids/edr/browse/ncam/NLE_0400_0702456078_362ECM_N0191126SAPP00601_00_0LLJ01_1200.jpg" }
];
