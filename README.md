[README.md](https://github.com/user-attachments/files/28104943/README.md)
# ARQIS Prototype

ARQIS is an early bathroom tiling estimate prototype. It lets a user upload a plan reference, enter room dimensions, choose tiling coverage, select a sample product, and generate a quote-style estimate with a simple 3D preview.

## Open locally

Open `index.html` in a browser.

## Deploy to Vercel

1. Create a free account at https://vercel.com.
2. Create a GitHub account at https://github.com if you do not already have one.
3. Create a new GitHub repository, for example `arqis`.
4. Upload these files to the repository:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `vercel.json`
5. In Vercel, choose **Add New Project**.
6. Import the GitHub repository.
7. Keep the default settings and deploy.
8. Vercel will give you a public website link.

## What works now

- Upload a plan file as a reference.
- Preview image plans.
- Accept PDF, DXF, and DWG files as selected plan references.
- Calculate floor area, wall tiling area, waste allowance, tile boxes, materials, labour, extras, and total estimate.
- Print the quote preview.

## What comes next

The next product stage should add:

- User accounts.
- Saved clients, projects, rooms, and quotes.
- Secure plan file storage.
- A product catalogue for tiles, flooring, and woodwork.
- PDF/image tracing for plan measurement.
- DXF parsing for CAD-based measurements.
- Supabase database and file storage.
