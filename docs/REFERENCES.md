# References · Register of data and asset sources

The public snapshot does not distribute the three EVOVA models. The NASA Mark III spacesuit was checked to be byte-identical to the GLB on the [official NASA 3D Resources page](https://science.nasa.gov/3d-resources/mark-iii-spacesuit/) (894,092 bytes, NASA/Michael D. Carbajal). The content below keeps the earlier source records. Commit IDs from that time do not refer to the Git history of this public repository. The current deployment scope follows [deployment.md](deployment.md).

Checked 2026-11-15. Base branch `main`, commit `123ac4c`. This document is **a list for finding things**. Detailed values such as byte counts, SHA-256 hashes and coordinate frames are only in the canonical records below and are not repeated here.

- Observed terrain and rover positions: [`public/data/jezero/terrain.json`](../public/data/jezero/terrain.json), traverse: [`public/data/jezero/route.json`](../public/data/jezero/route.json)
- Images and meshes: [`public/data/reference/SOURCES.json`](../public/data/reference/SOURCES.json), [`public/data/workspace/*.json`](../public/data/workspace/)
- Textures: [`public/textures/polyhaven/LICENSES.json`](../public/textures/polyhaven/LICENSES.json)
- Processing notes: [`stage1-data-assets.md`](stage1-data-assets.md), [`stage2-hud-route.md`](stage2-hud-route.md), [`stage3-v02-field.md`](stage3-v02-field.md), HUD design basis: [`hud-design-basis.md`](hud-design-basis.md)

**A recorded source is not the same as a confirmed right to use.** The "Status" line of each item records the two separately. Writing this document does not mean every use condition is met. Open items are in sections 7 and 8.

## 1. How the data is used

- **Only pre-downloaded, processed static files are used.** Collection scripts (`tools/terrain/*.py`, `tools/assets/*.py`) download the data once, crop and reduce it, and put the result in `public/`. At runtime the app loads it only through relative paths on the same server (`/data/...`, `/models/...`, `/textures/...`).
- **The 3D demo (`src/`) has no live NASA API connection.** It sends no requests to NASA, JPL or USGS addresses. The only external request at runtime is Google Fonts (Inter) (`src/pad/console-theme.css`).
- **The habitat planning display (`pad/pad.html`, merged 2026-11-15) loads external resources at runtime**: NASA Mars Trek map tiles (`https://trek.nasa.gov/tiles/Mars/EQ/`, a live tile service) and Leaflet 1.9.4 (unpkg CDN). See section 6.1.
- Live Mars weather, space weather (DONKI), spacesuit sensors and comm link line of sight are not connected. The screen also shows them as "not connected".

## 2. Nature of the data in the product

- **Measured (archived observations)**: HiRISE and CTX terrain and orthoimages, Perseverance waypoints and real traverse, sol 1215 front Hazcam mesh, sol 1176 Navcam mesh, WATSON image PIA26368.
- **Published analysis (not analysed by us)**: PIXL mineral map PIA26640 (NASA public image and caption as published), the NASA sample list and the factual wording of the 2025-09-10 release ("potential biosignature · not a confirmation of life").
- **Estimated (calculated by us)**: the positions of sampling points A and B are estimates calculated from raw WATSON camera metadata, not official target coordinates. Route length and slope are calculated from the DTM.
- **Virtual or for presentation**: habitat building (procedural modelling), 3D models of the spacesuit, habitat planner and rover, scattered rocks, sky, Mars-colour tinting of the orthoimage (the original is greyscale), tinting of the grey Navcam image, floor and fabric textures.
- **Simulated**: mission clock, astronaut position and speed, oxygen, dose, comm loss, alerts, demo responses of the simulated partner.
- This project does not detect or judge life and performs no new instrument analysis in the field. Astronaut records stay marked "not yet analysed".

## 3. Observation data included in the product

### 3.1 HiRISE DTM and orthoimage mosaics (near field, 640 m)
- Data: *Mars 2020 Terrain Relative Navigation HiRISE DTM Mosaic* (1 m) and *HiRISE Orthorectified Image Mosaic* (25 cm) from the same set. Produced and distributed by USGS Astrogeology Science Center, 2020-07-24. DTM DOI <https://doi.org/10.5066/P9REJ9JN>
- Source files: `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif`, `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif` (<https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif>, <https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif>). Product page <https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_hirise_dtm_mosaic>
- Project files: `public/data/jezero/hirise_dtm_1m_640.u16`, `hirise_ortho_25cm_2560.jpg`. Use: 3D ground height, base map, route slope calculation
- Processing: only a 640 m × 640 m window read with HTTP range requests → float32 → uint16 quantization (maximum error 0.73 mm) · orthoimage as 2560 px JPEG · coordinates from Mars 2000 spherical equirectangular → local east/north (origin site 52 / drive 7624) · the greyscale image is tinted Mars colour in the scene (presentation). Scripts `tools/terrain/extract_jezero.py`, `quantize_dtm.py`
- Use conditions: product page "Use Constraints: Please cite authors", "Access Constraints: None". General USGS policy on its works <https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits>
- Credit: USGS Astrogeology Science Center; HiRISE (NASA/JPL-Caltech/University of Arizona)
- Status: source and use conditions confirmed (product page "citation requested", no access constraints). The source images are a USGS product made from HiRISE data published in the PDS. PDS FAQ: "Data sets archived in the PDS are in the public domain" <https://pds-geosciences.wustl.edu/faq.html>. Open: decide whether to add the author citation the product page asks for (Fergason et al., LPSC 2020 abstract <https://www.hou.usra.edu/meetings/lpsc2020/pdf/2020.pdf>) to the References

### 3.2 CTX DTM and orthoimage mosaics (far field, 8 km)
- Data: *Mars 2020 Terrain Relative Navigation CTX DTM Mosaic* (20 m), *CTX Orthorectified Image Mosaic* (6 m). USGS Astrogeology, 2020-07-24
- Source files: `JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif`, `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif` (<https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif>, <https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif>), product page <https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic>
- Project files: `public/data/jezero/ctx_dtm_20m_400.u16`, `ctx_ortho_6m.jpg`. Use: distant background terrain
- Processing: 8 km window cropped → uint16 quantization · tinted at runtime (presentation). Same scripts
- Use conditions: DTM product page "Please cite authors". The source images are a USGS product made from raw CTX data published in the PDS. The MSSS image policy <https://www.msss.com/policies/index.html> covers "derived images made by MSSS" and does not apply to raw PDS data or USGS mosaics (policy text: "MSSS derived products are not released through [PDS]")
- Credit: USGS Astrogeology Science Center; CTX (NASA/JPL-Caltech/MSSS)
- Status: source and use conditions confirmed (DTM product page, raw data public in the PDS). The CTX orthoimage product page did not open this time, so only that page's wording is unconfirmed (same set, same agency)

### 3.3 Perseverance waypoints and real traverse (public MMGIS layers)
- Data: Mars 2020 MMGIS `M20_waypoints.json` (21 waypoints, sols 1171 to 1220), `M20_traverse.json` (drive polyline, sols 1175 to 1185 segment). NASA/JPL-Caltech
- Source: <https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json>, <https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json>
- Project files: `waypoints` in `terrain.json`, `public/data/jezero/route.json`. Use: habitat and destination positions, the route followed by the astronaut and the simulated partner
- Processing: longitude/latitude → the same local frame as the terrain · only the vertices of that segment are used (no newly drawn lines). Script `tools/terrain/extract_route.py`
- Use conditions: neither file (GeoJSON) nor the MMGIS screen has any license or use-condition text (file properties are only `type`, `name`, `crs` and measurement fields). As the data is on a public site run by JPL, the JPL Image Use Policy <https://www.jpl.nasa.gov/jpl-image-use-policy/> ("images and video on JPL public sites may be used without permission, credit Courtesy NASA/JPL-Caltech") is applied by analogy
- Credit: NASA/JPL-Caltech (Mars 2020 mission)
- Status: source confirmed · use conditions: **no explicit text** (every place we could find was checked). Applying the JPL policy by analogy and giving credit is the practical approach. Asking JPL would make it certain · the traverse is not verified as safe for walking people or crewed rovers

### 3.4 Sol 1215 front Hazcam terrain mesh / sol 1176 Navcam terrain mesh
- Data: PDS Imaging Node `mars2020_hazcam_ops_mesh` product `FLF_1215_0774815107M492RAS_N0560000FHAZ02008_0A0095J01`, `mars2020_navcam_ops_mesh` product `NLG_1176_0771346345M727RAS_N0530130SCAM06176_0A01LLJ01`. NASA/JPL-Caltech. Download URLs and source hashes are in `SOURCES.json`
- Project files: `public/data/workspace/fhaz_1215_workspace.{bin,jpg,json}`, `navcam_1176_s53.{bin,jpg,json}`. Use: POV match surface at the destination and planning image in the PAD (Hazcam), a measured ground patch beside the route (Navcam)
- Processing: Hazcam cropped to a 1.5 m radius, vertex-cluster simplification (8/20 mm), texture cropped and reduced to 2048 px · Navcam 5 cm cluster simplification, edges longer than 0.6 m removed, reduced to 1024 px · both get a constant height offset onto the DTM and edge blending · the grey Navcam image is tinted in the scene (presentation). Scripts `tools/terrain/build_workspace_mesh.py`, `build_route_mesh.py`
- Use conditions: JPL Data and Documentation Use Policy for PDS <https://pds-geosciences.wustl.edu/jplcopyright.html>: "documents, images and data provided by JPL to the PDS may be used by anyone for any purpose without prior permission". Conditions: no quality warranty, image credit "Courtesy NASA/JPL-Caltech", no implied endorsement by NASA, JPL or Caltech. PDS FAQ: "Data sets archived in the PDS are in the public domain" <https://pds-geosciences.wustl.edu/faq.html>. The Imaging Node's own pages have no separate policy text
- Credit: NASA/JPL-Caltech (PDS Imaging Node)
- Status: source and use conditions confirmed (based on the common PDS policy)

### 3.5 PIA26368 WATSON image (reference image)
- Data: *Perseverance Finds a Rock With 'Leopard Spots'* (PIA26368), WATSON, sol 1212. <https://www.jpl.nasa.gov/images/pia26368-perseverance-finds-a-rock-with-leopard-spots/>
- Project file: `public/data/reference/pia26368_cheyava_falls.jpg`. Use: reference image for the HUD and the observation check
- Processing: 1648×1200 PNG → 824×600 JPEG, no other changes
- Use conditions: JPL Image Use Policy <https://www.jpl.nasa.gov/jpl-image-use-policy/> (may be used without permission, credit required, no implied endorsement, separate conditions if the caption marks third-party ownership)
- Credit: NASA/JPL-Caltech/MSSS
- Status: source, credit and use conditions confirmed. The public page caption says "Credit: NASA/JPL-Caltech/MSSS" and has no third-party ownership or copyright text (checked 2026-11-15). The JPL policy says third-party ownership is marked in the caption, so the JPL policy applies. The credit line must be used as is. We do not copy the caption sentences

### 3.6 PIA26640 PIXL mineral map (published analysis)
- Data: *Perseverance's PIXL Finds Vivianite, Greigite in 'Cheyava Falls' Sample* (PIA26640), 2025-09-10. <https://science.nasa.gov/photojournal/perseverances-pixl-finds-vivianite-greigite-in-cheyava-falls-sample/>
- Project file: `public/data/reference/pia26640_pixl_cheyava_falls.jpg`. Use: reference image on the observation check screen. We did not perform a PIXL analysis and did not register it to PIA26368
- Processing: none (public JPEG as published)
- Use conditions: NASA media guidelines <https://www.nasa.gov/nasa-brand-center/images-and-media/>, JPL Image Use Policy
- Credit: NASA/JPL-Caltech
- Status: source confirmed. Credit and caption are based on the page wording read during the 2026-11-15 design review. The page was not reopened this time

### 3.7 Raw WATSON camera metadata (for estimating sampling points; files not included)
- Data: Mars 2020 Raw Images feed metadata (camera position and view direction). The same public data as Perseverance Raw Images in the challenge Resources. Feed `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol=<sol>`, page <https://mars.nasa.gov/mars2020/multimedia/raw-images/>
- Frames used: A `SIF_1217_0774993507_945EBY_N0560000SRLC02503_0000LMJ` (sol 1217, frame showing the abrasion patch), B `SIF_1212_0774536492_390EBY_N0560000SRLC08048_0000LMJ` (sol 1212, close-up of the natural surface)
- In the project: only the calculated coordinates, in `POINTS` of `tools/terrain/build_workspace_mesh.py` and `points` of `fhaz_1215_workspace.json`. Image files are not included. The calculation basis is `sampling_points` in `SOURCES.json`
- Processing: camera position and view direction + assumed shooting distance 4.5 / 6.5 cm → rover frame → SITE_FRAME 56. Naming A = Apollo Temple and B = Cheyava Falls and core area is an inference based on a Nature paper caption
- Use conditions: JPL Image Use Policy (credit for raw images: NASA/JPL-Caltech)
- Status: source confirmed (found in research records of an earlier session and added to the canonical record on 2026-11-15) · results are shown as "estimated" on screen

## 4. 3D models and images

- **The three EVOVA (AI 3D) models were removed from the repo (2026-11-15).** They were the spacesuit, habitat planner and rover models (`public/models/{eva,operator,rover}/*.glb`) made with the AI 3D service EVOVA (Metown Inc.) <https://www.evova.ai/ko>. Whether the paid plan has a separate individual contract (section 7, item 1) is unconfirmed, so we decided to keep them out of the public and submission deployment. The three paths are in `.gitignore` and are not in the source tree or the build output. **The demo works without them**: the default astronaut model is the **NASA Mark III** (below, bundled, license confirmed), and the habitat planner and rover fall back to **procedural models built in code** (`src/world/people.js`, `rover.js`). To use them locally, put the files at those paths and load them with `?suit=surface`, `?operator=mesh`, `?rover=mesh` (not in the deployment). The checks made before removal are kept below for reference (basis for any reintroduction)
  - Use conditions: EVOVA integrated terms of service <https://www.evova.ai/ko/agreements/service> (version effective 2026-11-15, read on the same day)
    - Chapter 4, Article 3, paragraph 1: intellectual property in material the user uploads or commissions, and in 3D items and content made from it, "belongs to the user in principle". A separate individual contract between the company and the user takes precedence
    - Chapter 4, Article 3, paragraph 5: content made with the service may be posted and used on external platforms (own website, social media and so on), with no separate restriction unless the terms or a separate contract restrict it
    - Chapter 4, Article 3, paragraphs 2 and 3: the company has a non-exclusive, free right of use for operation and improvement. Items set to public may be used for AI training and company promotion
    - Chapter 2, Article 6: accuracy and fitness of AI output are not guaranteed
    - Items bought in the market follow different terms and may not be redistributed (Market Article 2). This does not apply to these models (below)
  - User confirmation (2026-11-15): all three models were made on 2026-11-15 (the version we read applies) · made with our own account, not bought in the market · the team member who made them (account holder) agreed to publication
  - Status: under the terms, ownership by the user and external posting are confirmed. One item remains: whether the paid plan has a separate individual contract (the user does not know either, section 7, item 1)
  - **Mars Surface EVA spacesuit** `public/models/eva/mars-surface-eva-suit.glb` (removed; former default astronaut model, now replaced by Mark III). permeant commit `07fd555`. We simplified it from 1M to about 190,000 triangles, applied Draco compression, and reduced the colour texture from 2048 to 1024 JPEG (commits `c12402e`, `54c449f`, tool `@gltf-transform/cli`, `tools/assets/resize_glb_texture.py`)
  - **Seated habitat planner** `public/models/operator/base-operator-seated.glb`. permeant `1b688bf`, 1M → 180,000 triangles, Draco
  - **Two-seat rover** `public/models/rover/crew-rover.glb` (34.6 MB, lazy loaded). permeant `60a4ad4`, no processing (file exported with `THREE.GLTFExporter r172`). Not a real vehicle design and not Perseverance
- **HUD design assets** `public/assets/hud/*.webp` (branch `design/hud-assets`). Two design kits shared by a team member (2026-11-15, 1x line set `mars_hud_assets.zip`, 3x glow set `hud_png_assets_3x.zip`). Panels, bars, frames, compass arc, arrows and reticle come from the 3x set. Icons are the 1x sky-blue line icons. We only resized them and converted them to WebP (`tools/assets/prepare_hud_assets.py`, record `public/assets/hud/provenance.json`). **AI output generated by the team with OpenAI image generation** (user confirmation, 2026-11-15). Use conditions: OpenAI Terms of Use: as between the user and OpenAI, the user owns the Output and OpenAI assigns its rights to the user (to the extent permitted by law) <https://openai.com/policies/row-terms-of-use/>. Four line icons (destination, habitat, partner, return; SVG) were written as SVG code with Claude in the kit style (AI-generated code, not hand-drawn). The HUD shows a fixed "HUD artwork: AI-generated" label and the logo carries a visible "AI-generated" label. To be listed in the AI use field of the submission form
- **NASA Mark III spacesuit** `public/models/nasa/mark-iii-spacesuit.glb`: **current default astronaut model** (became the default when the EVOVA suit was removed). NASA 3D Resources (listing <https://nasa3d.arc.nasa.gov/detail/mkiii-suit>, data.gov entry <https://catalog.data.gov/dataset/nasa-3d-models-mark-iii-spacesuit>). Included in the deployment. The credit "NASA / Michael D. Carbajal" in the code comment was not rechecked this time. Download URL and file version **not recorded** (check recommended before submission). Conditions: NASA media guidelines
- The habitat concept image `interior.png` (AI-generated concept picture, not used in the running screen) was **deleted** from the deployment by user decision on 2026-11-15 (record: `stage1-data-assets.md` section 7, git history)
- The habitat building, helmet frame, rocks, sky and procedural fallback people and rover are made in code (`src/world/*.js`). No external assets

## 5. Textures, fonts and code

- **Seven Poly Haven textures** `public/textures/polyhaven/` (Rubber Tiles, Fabric Pattern 07, Red Laterite Soil Stones, Rock Face, Fabric Leather 02, Denim Fabric, Blue Metal Plate). Authors, source URLs and processing (recompressed to 512 to 1024 px) are in `LICENSES.json`. Conditions: CC0 1.0, no credit required, redistribution allowed <https://polyhaven.com/license>. Status: confirmed. `denim_fabric_diff_1k.jpg` is in the deployment but not used by the code
- **Inter font**: loaded from Google Fonts at runtime (file not included). SIL Open Font License 1.1 <https://fonts.google.com/specimen/Inter/license>. Status: license type confirmed as general information, full text not rechecked this time. The fact that visitors' browsers connect to Google servers should be disclosed before publication
- Pretendard, Avenir Next, Apple SD Gothic Neo, SF Mono and others are only named in CSS. No files are included (shown only if present on the user's device)
- **three.js 0.170.0** (MIT): included in the runtime bundle. Uses GLTFLoader, DRACOLoader, EffectComposer and GTAOPass and other post-processing, RoundedBoxGeometry, BufferGeometryUtils and RectAreaLightUniformsLib from `examples/jsm` (same repository, MIT). <https://github.com/mrdoob/three.js/blob/r170/LICENSE>
- **Draco decoder** (Google, Apache-2.0) `public/draco/`: a copy of `examples/jsm/libs/draco/gltf` from `three@0.170.0` (wasm confirmed identical). <https://github.com/google/draco/blob/master/LICENSE>. The full Apache-2.0 text is included as `public/draco/LICENSE` (2026-11-15, downloaded from <https://raw.githubusercontent.com/google/draco/master/LICENSE>). The Draco repository has no NOTICE file, so there is no additional notice obligation
- Build and tools only (not deployed): Vite 5.4.11 (MIT), @gltf-transform/cli 4.1.1 (MIT), playwright-core 1.49.0 (Apache-2.0, for checks), Python numpy and Pillow (collection scripts)
- The HUD visor theme (`src/hud/visor-theme.css`, part of `hud.js`) is the work of team member jeonseunghwan0811-dotcom (not external material)
- AI use: code was written with an AI coding assistant (Claude) (shown as co-author in commits). HUD design assets and the logo were made with OpenAI image generation. The three 3D models were made with the AI 3D service EVOVA but **removed from the deployment on 2026-11-15** (individual contract unconfirmed). In the AI use field of the submission form they can be listed as "used, then removed" or left out. Among currently deployed assets, only the HUD assets and the logo (OpenAI) are AI-generated

## 6.1 Habitat planning display (`pad/`, merged from branch `demo/areographic-pad`)

A standalone HTML dashboard made by team member Claireai107. Separate from the 3D demo, open `pad/pad.html` directly or through a static server. The notes below are based only on the repository files and commit messages. The source data was not downloaded again.

- **Map tiles**: NASA Mars Trek (`trek.nasa.gov`), loaded at runtime. Credit NASA/JPL-Caltech (Mars Trek). Tile product name, layer ID and use conditions **unconfirmed**
- **Leaflet 1.9.4** (BSD-2-Clause, loaded at runtime from the unpkg CDN) <https://leafletjs.com>
- **Grid of 3,067 cells** `pad/data/grid.js` (160 m cells, data team `marswalk_handoff`): according to commit and file descriptions, CRISM (clays, carbonates), SIM3464 (geologic map), DEM (slope, comm link line of sight), THEMIS thermal inertia → rock cover (Zenodo 4931348, Edwards & Buz 2021). **Product ID, version and processing of each source need to be checked in the data team's records**
- **Site and habitat coordinates** `pad/data/sites.js`, `spots.js`/`spots.json` (Perseverance landing site and others). `spots.js` contains Mars 2020 original image URLs (Mastcam-Z raw, NASA/JPL-Caltech/ASU). Whether the page uses these images is **unconfirmed**
- **Consumables assumptions** `pad/data/consumables.json`: assumed values citing "Apollo 15-17 PLSS (8h), EMU PLSS" in the file description. Original source **not recorded**
- **Logo** `pad/assets/logo.png`: AI output made by the team with ChatGPT (OpenAI image generation) (user confirmation, 2026-11-15). Same conditions as the HUD design assets (OpenAI Terms of Use: output owned by the user). Variants for the 3D demo screen are in `public/assets/brand/` (`tools/assets/prepare_brand.py`): original colours (`logo.webp`), a version for dark backgrounds with only the navy letters changed to near white (`logo-light.webp`), and a favicon cropped to the A symbol (`mark-*.png`)
- Note: the score that the original Korean screen called "life score" is now named "exploration priority" (2026-11-15) so it does not read as a life judgement. It ranks where to explore; it is not a detection or a probability of life. When this note was written, the planning display was not in the Vite build output (`dist/`) and its place in the deployment was undecided. It is now copied to `dist/pad/` (see [deployment.md](deployment.md))

## 6. Material consulted only (not included in product files)

- NASA sample list (sample 25 Sapphire Canyon, sealed sol 1215) <https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples>: wording of the destination description
- NASA release 2025-09-10 "NASA Says Mars Rover Discovered Potential Biosignature Last Year" <https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/>: basis for the wording "potential biosignature · not a confirmation of life" (`src/pad/pad.js`)
- HUD design basis: NASA-STD-3001 Vol 2 Rev E, NTRS 20250011653, 20130014736, 20230010234, 20180006618, 20205008200, 20230010686 (`hud-design-basis.md`). Cited from the team kit research records. The original documents were not reopened in that work
- Hurowitz et al. 2025 (Nature): not cited on the product screens, but its caption was used to name sampling points A and B (3.7). Bibliographic data and DOI are **not recorded** in the repository

**Relation to the challenge Resources** (<https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources>, five items confirmed from the page data on 2026-11-15):
- Perseverance Raw Images: used (3.7, metadata only, image files not included)
- USGS-NASA Planetary Geologic Mapping / Astrogeology interactive maps: geologic maps not used. The TRN terrain mosaics of the same USGS Astrogeology are used (3.1, 3.2)
- JPL Mars Trek, Curiosity Mount Sharp route, NASA Worldview: not used (not listed in the References)

## 7. Missing sources and unconfirmed use conditions

(Added 2026-11-15) Habitat planning display: Mars Trek tile layer and conditions, product IDs and processing records of the grid sources (CRISM, SIM3464, DEM, THEMIS), source of the consumables assumptions. The HUD design assets were generated by the team with OpenAI (output owned by the user under the terms, section 4).

Resolved (2026-11-15): WATSON frame IDs (3.7), PDS mesh use conditions (3.4), MSSS credit material (3.2, 3.5), Draco license included (section 5), concept image deleted (section 4).

Open:
1. **Three EVOVA models → resolved (removed, 2026-11-15)**: whether the paid plan has a separate individual contract is unconfirmed, so they were **removed** from the public and submission deployment and added to `.gitignore` (section 4). The demo falls back to NASA Mark III and procedural models and works normally. To reintroduce them, first confirm with EVOVA customer support whether that individual contract exists (plan of KRW 990,000 per month), then decide
2. MMGIS waypoints and traverse: no stated use conditions. JPL policy applied by analogy
3. Mark III GLB: download URL and version, recheck of the credited person in the code comment (now the default astronaut model)
4. Wording of the CTX orthoimage product page, whether to add the author list for the USGS product citation
5. Bibliographic data for Hurowitz et al. 2025 (if cited)
6. The jpl.nasa.gov and usgs.gov policy pages block automated requests and need one check in a browser

## 8. To resolve before publication and submission

- Section 7, item 1: **resolved**. The three EVOVA models were removed from the public deployment and the default switched to NASA Mark III and procedural models (2026-11-15). To reintroduce them, confirm whether a separate individual contract exists, then decide
- Paste the section 9 text into the References field of the submission and fill in the AI use field
- Decide where to place the section 10 notice on the deployed screen or in the README
- Decide whether to clean up unused deployed files (`denim_fabric_diff_1k.jpg`; `mark-iii-spacesuit.glb` is now the default astronaut model and stays)
- Clean up outdated sentences in older documents: `stage1-data-assets.md` section 2 (rocks "about 2,000", route as "straight stubs between waypoints") and section 3 (habitat planner "not obtained") are records from before later changes (change records are at the end of sections 3 and 6)

## 9. Text for the submission References field (English, for copying)

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

Put the same content (Claude assisted with code; OpenAI generated the HUD assets and the logo) in the AI use field of the submission form. The EVOVA 3D models were removed from the deployment, so they are not AI-generated assets of the current deployment.

## 10. Credits and notice (draft for the screen and README)

```
Terrain: USGS Astrogeology Science Center, Mars 2020 TRN HiRISE/CTX mosaics (HiRISE: NASA/JPL-Caltech/University of Arizona; CTX: NASA/JPL-Caltech/MSSS).
Rover positions, drive path, Hazcam/Navcam meshes: NASA/JPL-Caltech. Images: PIA26368 NASA/JPL-Caltech/MSSS; PIA26640 NASA/JPL-Caltech.
Textures: Poly Haven (CC0). three.js (MIT), Draco (Apache-2.0).
This is a hackathon demo, not a NASA product; no endorsement by NASA, JPL, Caltech or USGS is implied.
Archived observations are replayed; nothing is live. Habitat, crew state and alerts are simulated.
```
