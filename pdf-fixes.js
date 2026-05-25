const pdfFixStyle = document.createElement("style");
pdfFixStyle.textContent = `
  .pdf-room-label {
    font-size: 2.2px !important;
    stroke-width: 0.45px !important;
    letter-spacing: 0 !important;
  }

  .pdf-room-rect,
  .pdf-room-draft {
    stroke-width: 1.4px !important;
    vector-effect: non-scaling-stroke;
  }

  .pdf-room-rect.active {
    stroke-width: 1.8px !important;
  }
`;
document.head.append(pdfFixStyle);
