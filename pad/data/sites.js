// Areographic data - based on marswalk_handoff (2026-11-15)
// Scores are read from real grid data (grid.js). This file only defines sites, routes, weather and indicators.

// Habitat = Perseverance landing site (same as grid origin)
const BASE = { lat: 18.44, lon: 77.45, name: 'Habitat (Octavia E. Butler Landing)' };

// Candidate sites - score is not hardcoded: computed live from the grid cell at that location
const SPOTS = [
  { id: 'delta', name: 'Delta front', lat: 18.472, lon: 77.424,
    desc: 'Hydrated-mineral outcrop · fine-grained delta deposits (top grid cells, real data)' },
  { id: 'hawksbill', name: 'Hawksbill Gap', lat: 18.458, lon: 77.434,
    desc: 'Sediment cross-section at the delta entrance' },
  { id: 'seitah', name: 'Séítah', lat: 18.433, lon: 77.406,
    desc: 'Sand and igneous rock - includes a comm shadow segment (DEM line of sight, real data)' },
  { id: 'cheyava-dir', name: 'North toward Cheyava', lat: 18.492, lon: 77.440,
    desc: 'Toward the rover-found candidate - outside the current safe search range' },
  { id: 'north-high', name: 'North delta high-score zone', lat: 18.509, lon: 77.414,
    desc: 'Cluster with top potential biosignature score (100) - outside search range · comm shadow' }
];

// Routes - wp waypoints, hiddenSeg comm-shadow segment index (DEM line of sight), blocked slope caution zone
const ROUTES = {
  'delta': {
    wp: [[18.440, 77.450], [18.4475, 77.4420], [18.4560, 77.4345], [18.4640, 77.4290], [18.472, 77.424]],
    blocked: { lat: 18.4660, lon: 77.4330, note: '11° slope - metabolic rate spikes (Pandolf)' },
    hiddenSeg: 2, altNote: 'Plan B · +11 min · avoids comm shadow',
    altWp: [[18.440, 77.450], [18.4500, 77.4470], [18.4610, 77.4400], [18.4690, 77.4310], [18.472, 77.424]]
  },
  'hawksbill': {
    wp: [[18.440, 77.450], [18.4490, 77.4420], [18.458, 77.434]],
    blocked: null, hiddenSeg: null, altNote: null
  },
  'seitah': {
    wp: [[18.440, 77.450], [18.4360, 77.4320], [18.4330, 77.4180], [18.433, 77.406]],
    blocked: { lat: 18.4345, lon: 77.4250, note: 'High rock cover (obstacles) - detour cost applied (THEMIS thermal inertia)' },
    hiddenSeg: 2, altNote: null
  }
};

// Rover find pins (approx. real coordinates)
const PINS = [
  { name: 'Three Forks sample depot', lat: 18.400, lon: 77.440, desc: '10 sample tubes cached - crewed retrieval target' },
  { name: 'Séítah drill site', lat: 18.435, lon: 77.408, desc: 'Igneous core sampled (early campaign)' },
  { name: 'Kodiak', lat: 18.423, lon: 77.403, desc: 'Delta remnant butte - lake level record' },
  { name: 'Hawksbill Gap outcrop', lat: 18.459, lon: 77.433, desc: 'Delta front campaign observation point' }
];

// Past water trace vectors (approx., based on CRISM / USGS)
const WATER = {
  polys: [
    { name: 'Delta fan deposits (S2=4 zone)', color: '#3b86d4',
      pts: [[18.482, 77.408], [18.476, 77.428], [18.466, 77.436], [18.455, 77.432], [18.460, 77.416], [18.470, 77.405]] },
    { name: 'Delta front mudstone (estimated)', color: '#4aa3ff',
      pts: [[18.455, 77.432], [18.450, 77.442], [18.442, 77.446], [18.444, 77.436], [18.450, 77.430]] }
  ],
  dots: [
    { name: 'Hydrated minerals detected (CRISM)', lat: 18.474, lon: 77.420 },
    { name: 'Clay minerals detected (CRISM)', lat: 18.465, lon: 77.428 },
    { name: 'Carbonate traces (CRISM)', lat: 18.448, lon: 77.440 }
  ]
};

// Weather (simulated from MEDA) + space weather (DONKI replay)
const WEATHER = {
  tempC: -42, tempRange: 'day -18 / night -80 ℃', wind: 4.2, tau: 0.42, pressure: 735,
  src: 'Simulated from Mars2020 MEDA'
};
const DONKI = {
  type: 'FLR', time: '2024-05-10 06:51Z', note: 'DONKI replay (2024-05 solar activity)',
  spe: { onset: 10, dur: 30, spike: 1.2, shieldPct: 20 }   // sim ticks (min) · spike mSv · max terrain shielding %
};

// Potential biosignature score indicators (weights.json · set rank only; formula computes weights)
const INDICATORS = [
  { key: 'S1', name: 'Hydrated/clay minerals', desc: 'Top medium for organic preservation (CRISM spectra, iMOST)' },
  { key: 'S2', name: 'Sediment/delta context', desc: 'Fine-grained lake mudstone, delta fan (USGS SIM3464)' },
  { key: 'S4', name: 'Water activity traces', desc: 'Channels, hydrated minerals - habitability premise (in design; built into S1/S2)' },
  { key: 'S3', name: 'Preserving salts', desc: 'Sulfates, carbonates - sparse at Jezero (kept in design)' },
  { key: 'S5', name: 'Rover close-up', desc: 'Highest confidence for direct detection · narrow coverage (not yet used)' }
];
const PRESET_RANKS = {
  'Science default': { order: ['S1', 'S2', 'S4', 'S3', 'S5'], formula: 'ROC' },
  'Follow the water': { order: ['S4', 'S1', 'S2', 'S3', 'S5'], formula: 'ROC' },
  'Verified first': { order: ['S5', 'S1', 'S2', 'S4', 'S3'], formula: 'RS' }
};

// Model constants (1_model_spec_handoff.md · 2_sources.md)
const MODEL = {
  eta: 2.0, gMars: 0.38,                 // Pandolf - Mars regolith and gravity
  o2PerWatt: 1 / 348,                    // M_W → L/min
  baseMW: 273,                           // baseline metabolic rate (930 BTU/hr)
  vo2abs: 3.0, sustain: 0.35,            // stamina (W'BAL)
  hrA: 70.5, hrB: 113.2, hrMax: 186,     // heart rate (calibrated on PhysioNet, 992 people)
  radDay: 0.64,                          // mSv/day (Curiosity RAD)
  consumables: [                         // capacity (min) · metabolic scale factor - return limit = MIN
    { key: 'o2', name: 'Oxygen', cap: 480, scale: 1.0 },
    { key: 'fw', name: 'Cooling water', cap: 450, scale: 1.05 },
    { key: 'co', name: 'CO₂ removal', cap: 500, scale: 0.95 },
    { key: 'ba', name: 'Battery', cap: 420, scale: 0 }    // scale 0 = constant draw
  ]
};
