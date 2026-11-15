<p align="center"><img src="public/assets/brand/logo.webp" alt="Areographic" width="420" /></p>

# Areographic (team navis)

A layered, integrated view of Mars surface data that helps astronauts plan and carry out a Marswalk in search of potential biosignatures, from route planning in the habitat to the helmet HUD in the field.

- **Live demo:** <https://team-navis.github.io/Areographic/> (desktop browser with WebGL2; press Enter on the start screen)
- **Challenge:** NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map". Seoul event, 14 to 15 November 2026 KST.
- **Sources and licenses:** [docs/REFERENCES.md](docs/REFERENCES.md)

## What it does

The demo runs in one 3D world at Jezero crater, on the Perseverance drive path. You pick one of two roles.

- **Habitat Planner.** Sits at the habitat display inside the crew's habitat. The display opens the team's habitat planning display (`pad/pad.html`): a route map on NASA Mars Trek tiles with a 160 m grid of data layers (minerals, geology, slope, comm link line of sight, rock cover). The planner compares candidate sites by science value and astronaut safety factors and plans the route.
- **Surface Astronaut.** Walks through the habitat (`WASD`, mouse drag or arrow keys), passes the airlock and starts a Marswalk. A heads-up-display (HUD) projected on the spacesuit's helmet visor shows the route, destination, oxygen, turnaround time (latest return start), alerts and a minimap. The astronaut rides the rover along the route, gets off at the destination and works through arrive, task, record and return. At the destination, point-of-view images and planned outlines on the visor (POV match) show what to expect. The astronaut takes photos, records voice memos and checks the rock against an observation checklist (layering, grains, sorting, veins, spots, non-biological explanation). The HUD has no mouse targets. It uses suit-style keys (`1`, `2`, `3`, `M`, `W`/`S` auto-advance) and `V` (hold) for a voice memo.

The planning display and the 3D Marswalk are separate pages. The planning display does not yet send its plan into the 3D mission state.

## NASA data used

Data from multiple NASA science missions, pre-downloaded and bundled as static files. The 3D demo makes no live NASA API calls. Full identifiers, processing and use conditions are in [docs/REFERENCES.md](docs/REFERENCES.md).

- **Topographic and optical:** Mars 2020 Terrain Relative Navigation HiRISE DTM (1 m) and orthoimage (25 cm), CTX DTM (20 m) and orthoimage (6 m) mosaics (USGS Astrogeology; HiRISE and CTX on Mars Reconnaissance Orbiter).
- **Perseverance (Mars 2020):** MMGIS waypoints (sols 1171 to 1220) and the real traverse (sols 1175 to 1185), used as the route; sol 1215 front Hazcam and sol 1176 Navcam terrain meshes from the PDS Imaging Node; WATSON image PIA26368; Raw Images metadata for two WATSON frames, used to estimate sampling-point positions.
- **Published analysis (shown as reference, not our analysis):** PIXL mineral map PIA26640, the NASA rock sample list, and the NASA release of 2025-09-10 on a "potential biosignature".
- **Planning display:** NASA Mars Trek map tiles, loaded at runtime. Grid layers derived by the team's data work from CRISM (clays, carbonates), USGS geologic map SIM3464, DEM (slope, line of sight) and THEMIS thermal inertia (rock cover). Product IDs and processing records for the grid sources are not yet confirmed.

## Limits and simulated parts

- **Measured (archived observations):** terrain, orthoimages, rover waypoints and traverse, Hazcam/Navcam meshes, PIA26368.
- **Estimated (our calculation):** sampling points A and B (from raw camera metadata, not official target coordinates), route length and slope.
- **Simulated:** mission clock, astronaut position and speed, oxygen, dose, comm loss, alerts, the simulated partner's responses, and the weather and alert scenarios in the planning display. Nothing is live.
- **Not connected:** live Mars weather, space weather (DONKI), spacesuit sensors and comm link line of sight. The screen shows them as not connected.
- **Visual only:** the habitat, the NASA Mark III spacesuit (static model, no rigging, not certified for the Mars surface), the procedural planner and rover (fictional, not Perseverance), rocks, sky and colour tinting of greyscale images.
- The project does not detect or judge life and performs no new instrument analysis. The "exploration priority" grid in the planning display ranks where to explore from layered data. It is not a detection or a probability of life. The Perseverance traverse was driven by a rover. It is not verified as safe for a walking astronaut or a crewed rover.
- Tested on desktop. Mobile controls and low-end GPU performance are not verified. Voice memo needs HTTPS or localhost and a microphone. Real microphone recognition has not been tested on a device.

## Run locally

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173/>. You need a browser with WebGL2. Data and models are in the repository. No NASA API key is needed.

```bash
npm test       # habitat walk, collision, mission, rover, HUD and indirect light calculations
npm run build  # creates dist/
```

The build does not deploy or publish anything. Pages deployment is described in [docs/deployment.md](docs/deployment.md).

## AI use

- Code was written with the help of an AI coding assistant (Claude). Commits show it as co-author.
- The HUD design kit (`public/assets/hud/`) and the Areographic logo were generated by the team with OpenAI image generation (ChatGPT). We only resized and converted them. The logo carries a visible "AI-generated" label and the HUD shows a fixed "HUD artwork: AI-generated" label. Four line icons (destination, habitat, partner, return) were written as SVG code with Claude in the kit style.
- 3D models made earlier with the AI 3D service EVOVA were removed from the repository on 2026-11-15. They are not in this repository or the deployment.

## License

Code and documents written by the team are under the [MIT License](LICENSE) (Copyright © 2026 team-navis). Other material in the repository is not MIT. It keeps its own terms.

- **AI output made by the team:** HUD design assets and the Areographic logo (OpenAI image generation; under the OpenAI Terms of Use the output belongs to the user). The terms of the generation tool also apply.
- **NASA, JPL and USGS material** (terrain mosaics, rover traverse and waypoints, Hazcam and Navcam meshes, images PIA26368 and PIA26640, Mars Trek map tiles in the planning display): follows each agency's public media guidelines (give credit, do not imply endorsement) and the USGS citation request. It is not under a Creative Commons license. The Mark III spacesuit model from NASA 3D Resources also follows the NASA media guidelines.
- **Open source and third-party assets:** three.js (MIT), Draco decoder (Apache-2.0, `public/draco/LICENSE`), Poly Haven textures (CC0 1.0, `public/textures/polyhaven/LICENSES.json`), Inter font (SIL OFL 1.1, Google Fonts), Leaflet (BSD-2-Clause, planning display).

This is a hackathon demo, not a NASA product. No endorsement by NASA, JPL, Caltech or USGS is implied. Per-asset sources, terms and open items are in [docs/REFERENCES.md](docs/REFERENCES.md).

## Repository notes

This public repository is a snapshot started from the current product files. It does not include the Git history or old test captures of the original private repository, which is kept as is. Branch names, commit IDs and verification records in older development documents describe that time, not this repository's history. Event rules, team decisions and data-source research are kept in the separate [hackathon-kit event workspace](https://github.com/team-navis/hackathon-kit/tree/main/workspace/2026-nasa-space-apps-seoul). Each team member uses their own AI and development setup. Personal accounts, credentials and secrets are not stored in the repository. The [GitHub Pages demo](https://team-navis.github.io/Areographic/) is deployed manually from Actions, not on every push. Deployment and official submission are separate steps.

More documents: habitat control room [docs/immersive-control.md](docs/immersive-control.md), field HUD and route [docs/stage2-hud-route.md](docs/stage2-hud-route.md) and [docs/hud-design-basis.md](docs/hud-design-basis.md), astronaut and rover controls [docs/stage1-demo.md](docs/stage1-demo.md), data sources and limits [docs/stage1-data-assets.md](docs/stage1-data-assets.md).

<details>
<summary>Development record (earlier integration state, kept for history)</summary>

These notes describe the integration branch before the afternoon of 2026-11-15. Some details changed later: the habitat now has one large screen that opens the planning display instead of three monitors, and the EVOVA models were removed.

- A browser demo built on the 3D astronaut and rover of `demo/3d-stage1`. NAVIS / HABITAT ALPHA was a label on the demo screen. The final product name was not decided at that time.
- Start, habitat control, indoor walking and the surface excursion use one real 3D world. Warm metal panels, a workbench, three monitors, a Mars window and an airlock are procedural models. From the astronaut's view you can walk inside the habitat with `WASD`.
- Walls and ceiling are stepped metal panels with fasteners. Furniture has a folding workbench, recessed doors, hinges, drawers and latches on carrying cases. Surfaces use painted and brushed metal. The airlock door has a real see-through window. Static diffuse indirect light accounts for position and occlusion.
- The three monitors showed terrain and observation data, route and mission plan, and astronaut and rover status. Clicking a monitor moved the camera in and let you use the detail tabs on screen.
- Indoors, walls, desks, chairs and other furniture have collision. You look around with mouse drag or arrow keys. Opening and closing a monitor returns you to the spot where you stood. Passing the airlock leads to the helmet HUD, the fixed-route Marswalk and rover board and get off.
- Habitat and field share the mission state in the same browser. While walking indoors, EVA distance, time and oxygen do not advance. The selected plan and the indoor position are kept.
- The field HUD is the evidence-based HUD of `demo/hud-route` (green normal display, yellow and red alerts, fixed status band at the top, minimap, arrive → task → record → return → End Marswalk). The HUD has no mouse targets. It uses hand-controller keys (`1`, `2`, wheel, `M`) and voice `V`. The **spacesuit and mission status** content of `feat/immersive-mission-control` (calculation conditions, unconnected sensor items, stopped speed 0, calculated remaining travel time) is in a display-only layer opened and closed with button 2 or the voice word "detail".
- Terrain uses archived HiRISE/CTX observations. Habitat, people, rover, movement and oxygen are virtual or simulated, not live sensors.
- Implementation: one Three.js 3D scene, CanvasTexture summaries on physical monitor meshes, DOM detail overlays after the camera arrives, Vite. This replaced the earlier 2.5D image scene and the CSS3D render path. The earlier habitat concept image was kept as a reference asset and was not used in the running screen.
- The branch `integrate/immersive` was a local integration candidate that merged `feat/immersive-mission-control` (`04ed300`) into `demo/hud-route` (`80e0e10`). Inside the habitat it followed the former, outside the latter. Choices and checks: [integration-immersive.md](docs/integration-immersive.md). It was not yet reviewed by the team and not pushed.
- The surface excursion is fixed-route movement along the real Perseverance traverse (M20 traverse). It runs Confirm arrival → task (H2) → record (H3) → return (H5) → arrive at habitat → End Marswalk. The NASA Mark III spacesuit is a static model with no rigging, walk cycle or seated pose.

Quick demo at that time:

1. Choose **Habitat Planner**, click one of the three monitors or press `1`, `2`, `3` to open the detail screen. `Esc` returns to the planner seat.
2. In the centre **Route and mission plan → Start plan**, compare terrain layers and candidate sites. On the left, **Science and observation data** shows the elevation profile, waypoints and sources.
3. Choose **Astronaut view · walk the habitat** or **Surface Astronaut** on the start screen. Walk indoors with `WASD` and look around with mouse drag or arrow keys. Face a monitor and press `F` or click it to open the detail screen. `Esc` returns you to where you stood.
4. Walk through the airlock on the left to switch to the field HUD. Outside, hold `W` to move forward on the fixed route (free `WASD` walking ends here). Stop within 3 m of the rover on the route, press `E` to board, `Shift`+`W` to drive faster, stop and press `E` to get off. In the HUD, `2` opens the spacesuit and mission status layer and `1` runs the highlighted item.
5. In **Switch role → Habitat Planner → Astronaut and habitat operations**, check the same mission position, oxygen and rover state. Switching back to an astronaut who already left continues the Marswalk.

At that time the work passed **31** `npm test` tests and a production build. The indoor model and indirect light changes were checked on a 1512×1243 desktop screen: walking, desk collision, monitor click and `F` entry, rover detail tab, `Esc` return, airlock passage and the link to the field HUD. Earlier HUD and rover board checks and these checks are recorded separately in the [control room document](docs/immersive-control.md). Mobile controls and low-end GPU performance were not verified. Earlier `capture:stage1` and `capture:rover` results are not used as verification of these changes.

</details>
