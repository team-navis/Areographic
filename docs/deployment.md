# Public demo deployment

This repository is a separate public snapshot started from the current product files. It does not bring over the `.git` directory, past commits, branches or tags of the original private repository. The original repository and past verification records stay private.

## Scope

We moved the runtime code, the habitat planning display, current data and assets, tests, collection tools, documents and licenses. The three EVOVA models and past test captures (`docs/captures/`) are not in the public snapshot. Branch names, commit IDs and capture links in older development documents are records from that time. They do not refer to this repository's Git history.

The astronaut uses the Mark III spacesuit from NASA 3D Resources. The habitat planner and the rover use the existing procedural models from the code. The NASA model is a static visual asset and does not imply certification for the Mars surface. It was checked to be byte-identical to the official NASA file. Its source is in `public/CREDITS.txt`.

## Local check

```bash
npm ci --ignore-scripts
npm test
npm run build -- --base=/Areographic/
MW_PREVIEW_PORT=4192 npm run preview -- --base=/Areographic/
MW_URL=http://127.0.0.1:4192/Areographic/ node tools/pages-smoke.mjs
```

The browser check needs Chrome installed. Results are saved to `test-results/pages/` and are not committed to Git. The automation checks the planning display, astronaut entry, the airlock, the HUD and asset requests. It does not replace real microphone recognition or usability testing with people.

## GitHub Pages

- Public URL: <https://team-navis.github.io/Areographic/>
- Repository: <https://github.com/team-navis/Areographic>
- The GitHub Pages source is GitHub Actions.
- Run `Deploy submission to GitHub Pages` manually in Actions on `main`. A normal push does not start a deployment.
- The workflow uses pinned action versions and Node 22 to install, test and build, then deploys only `dist/`. It stops if an EVOVA model path is in the build.
- `deployment.json` records the deployed commit of the public repository, the run ID and the build time. It does not include the commit history of the original private repository.

The planning display's HTML, data and images are copied from `pad/` to `dist/pad/`. The 3D demo and the planning display still run as separate pages, and their current features and design are unchanged. We only added asset URL handling for the Pages sub-path. (Since then the Cheyava mission is shared between the two inside the app through same-origin `postMessage`; the planning display opened on its own still works as the standalone 2D simulator. See the README.)

## External requests and notices

The 3D demo serves archived observations as static files and uses no NASA API key. Google Fonts, the Leaflet CDN (unpkg) and NASA Mars Trek map tiles are requested by the visitor's browser from external servers. This deployment does not guarantee the availability of those services.

The deployment includes `CREDITS.txt`, `THIRD_PARTY_NOTICES.txt`, `LEAFLET_LICENSE.txt` and `draco/LICENSE`. Conditions per data set and license follow `REFERENCES.md`. We use free hosting. This does not mean uninterrupted service or unlimited traffic.
