# ARQIS Work Log

Last updated: 2026-05-28

## Project

ARQIS is a plan measuring and costing web app. The current live site is deployed on Vercel at:

- https://project-z1btm.vercel.app

Main repository:

- AnastasiaGiannakou/arqis

DWG converter service:

- https://arqis-converter.onrender.com

Supabase project:

- https://yopapazipjztygtwqshg.supabase.co

## Current Working Features

- ARQIS branded front screen and estimator workspace.
- PDF floor plan upload and rendering.
- Multiple PDF floor plans can now be added one at a time into the same project session.
- Floor tabs are created from uploaded PDFs, including known drawing labels:
  - A002: Ground floor
  - A003: Floor 1
  - A004: Floor 2
  - A005: Floor 3
  - A006: Loft
- PDF zoom controls are present.
- Manual room marking uses a lasso-style workflow:
  - Mark room
  - Finish room
  - Undo point
  - Drag corner handles to amend a selected room
  - Right-click room/tab to clear an individual room
- Marked rooms are shown over the PDF and also redrawn below as a clean room outline.
- Wall length labels are drawn on the clean room outline.
- Saved projects can be stored in Supabase under a client and project.
- Reopened saved projects can restore saved room polygons and the saved floor preview image when available.
- The selected marked room now recalculates estimates when the left-side fields are changed.

## Latest Changes Saved

### Incremental PDF upload

File changed:

- `pdf-set.js`

Behavior:

- Previously, ARQIS only understood a PDF floor set if multiple PDFs were selected together in one upload.
- Now a user can upload one PDF, then upload another PDF, and ARQIS appends the new PDF to the same current floor set.
- The Clear button still resets the uploaded plan set.

Related cache-bust update:

- `index.html` now loads `pdf-set.js?v=20260528-1`.

### Height recalculation for marked rooms

File changed:

- `pdf-lasso.js`

Behavior:

- When a marked/lasso room is selected, changing the left-side inputs recalculates the selected room estimate.
- Inputs now affecting the selected lasso room estimate:
  - Length
  - Width
  - Ceiling height
  - Tile height
  - Tiling mode: Full, Half, Custom
  - Include floor tiling
  - Include wall tiling
  - Waste percentage
  - Doors and door area
  - Windows and window area
  - Tile/finish product
  - Labour rate
  - Extras
- Wall tile area is calculated from the marked room perimeter multiplied by the selected tile height/ceiling height, minus openings.
- Floor area remains based on the marked room shape and the length/width scale.
- Totals, boxes, materials, labour, extras, and summary text are updated immediately.

Related cache-bust update:

- `index.html` now loads `pdf-lasso.js?v=20260528-1`.

## Important Current Limitation

The PDF/lasso measurement still depends on the user setting the correct real-world scale using the left-side Length and Width fields for the selected room. It is not yet automatically reading dimensions from the PDF text or CAD geometry.

DWG automatic floor/room recognition is still experimental. For reliable measuring right now, the best workflow is:

1. Upload the relevant floor PDF.
2. Zoom in.
3. Mark rooms manually with the lasso tool.
4. Enter/check the real-world room dimensions on the left.
5. Let ARQIS calculate tile and cost estimates.
6. Save the project.

## Next Recommended Work

1. Add true per-floor saving so one project can save multiple floor PDFs and multiple floor previews, not only the latest saved floor.
2. Add a proper scale calibration step, for example:
   - Click two points on a known wall.
   - Type the real measured length.
   - Use that scale for all rooms on that floor.
3. Store per-room height and costing settings in Supabase, not just in the browser/session.
4. Improve saved project loading so all floors appear again as tabs, with their rooms underneath.
5. Later: use CAD/PDF text extraction to help detect dimensions automatically.

## Recovery Notes

If the chat is lost, continue from the GitHub repository `AnastasiaGiannakou/arqis` on the `main` branch. The important recent commits are:

- Incremental PDF floor upload support.
- Lasso room estimate recalculation from ceiling height and costing fields.
- Cache-bust updates in `index.html` for the new scripts.

The live Vercel site should auto-deploy from `main` after commits.
