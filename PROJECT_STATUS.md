# Arqis Project Status

Last updated: 21 May 2026

## Product goal

Arqis is a quoting and visualisation tool for architectural plans.

Target flow:

1. A user uploads an architectural plan, ideally AutoCAD DWG or DXF.
2. Arqis identifies rooms room-by-room.
3. Arqis calculates floor and wall areas for tiling, flooring, carpentry, bathrooms, and related quoting.
4. Arqis shows room tabs such as Bathroom 1, Kitchen, Bedroom 1.
5. A selected room shows its outline and measured size.
6. Later stages add product selection from supplier websites, cost estimates, and 3D room previews.

## Current deployments

### Main website

- GitHub repo: `AnastasiaGiannakou/arqis`
- Hosting: Vercel
- Production domain currently used in Vercel: `project-z1btm.vercel.app`

### DWG converter backend

- GitHub repo: `AnastasiaGiannakou/arqis-converter`
- Visibility: private
- Hosting: Render
- Health URL: `https://arqis-converter.onrender.com/health`
- Convert URL: `https://arqis-converter.onrender.com/convert`
- Converter currently running: LibreDWG `dwg2dxf 0.13.3`

## What works now

- Arqis front screen opens into the estimator.
- CAD upload area exists.
- DXF closed polylines can become room outline tabs.
- Sample DXF creates Bathroom 1, Kitchen, and Bedroom 1 tabs.
- Room tab selection changes the right-side outline and area display.
- Main Arqis backend endpoint exists at `/api/analyse-plan`.
- DWG files are sent to a backend converter path.
- LibreDWG converter service on Render successfully converts the supplied DWG test file to DXF.
- DWG embedded preview can be displayed.

## Important finding from the DWG test

Tested DWG: `RHGA FERAIOY.dwg` / similar plan upload.

LibreDWG conversion works, but the converted drawing contains many closed CAD outlines that are not rooms. The current test plan produced 55 closed outlines. These include drawing symbols and other geometry, so treating every closed outline as a room is wrong.

Arqis was updated to avoid displaying those DWG closed outlines as room tabs unless they are likely room-boundary layers.

## Next development task

Build wall-line room detection for converted DWG/DXF plans.

The next detector should:

1. Read wall-line geometry from converted DXF.
2. Identify enclosed spaces bounded by walls.
3. Ignore fixtures, furniture, symbols, details, and projection layers.
4. Return actual room polygons for the room tabs.
5. Later use room labels/text where available to name rooms more accurately.

## Restart prompt

If resuming in Codex, say:

> Continue Arqis from `PROJECT_STATUS.md` and work on wall-line room detection for converted DWG/DXF plans.
