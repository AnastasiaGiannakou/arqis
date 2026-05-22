const directDwgFile = document.querySelector("#planFile");
const directDwgFileStatus = document.querySelector("#fileStatus");
const directDwgPreviewBody = document.querySelector("#planPreviewBody");
const VERCEL_DWG_FILE_LIMIT = 3 * 1024 * 1024;
const DIRECT_CONVERTER_URL = "https://arqis-converter.onrender.com/convert";

function directDwgExtension(file) {
  return file.name.split(".").pop().toLowerCase();
}

function directDwgCard(file, lines) {
  directDwgPreviewBody.innerHTML = `
    <div class="plan-file-card">
      <strong>${file.name}</strong>
      ${lines.map((line) => `<span>${line}</span>`).join("")}
    </div>
  `;
}

function directDwgAnalysis(status, message, shapes = []) {
  if (typeof showCadAnalysis === "function") {
    showCadAnalysis({ status, message, shapes });
  }
}

function directTextBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function directJson(response, fallback) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallback);
  }
}

function directDwgErrorMessage(error) {
  if (!error?.message || error.message === "Failed to fetch") {
    return "The converter could not complete this large DWG yet. Arqis is still working on the large drawing conversion route.";
  }
  return error.message;
}

async function convertLargeDwg(file) {
  directDwgFileStatus.textContent = `Sending ${file.name} to the DWG converter...`;
  directDwgCard(file, [
    "Large DWG received.",
    "Arqis is converting it outside the small website upload route."
  ]);
  directDwgAnalysis(
    "Large DWG conversion running",
    "This CAD file is too large for the small Vercel analysis upload. Arqis is sending it directly to the DWG converter first."
  );

  const conversionResponse = await fetch(`${DIRECT_CONVERTER_URL}?fileName=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file
  });
  const conversion = await directJson(
    conversionResponse,
    "The DWG converter did not return a usable CAD result for this large drawing."
  );
  if (!conversionResponse.ok || !conversion.ok || !conversion.dxfText) {
    throw new Error(conversion.message || "The DWG converter could not process this drawing yet.");
  }

  directDwgFileStatus.textContent = `Checking converted geometry from ${file.name}...`;
  const analysisResponse = await fetch("/api/analyse-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: conversion.outputFileName || `${file.name}.dxf`,
      extension: "dxf",
      base64: directTextBase64(conversion.dxfText)
    })
  });
  const analysis = await directJson(
    analysisResponse,
    "The converted CAD geometry is still too large for the current room analysis step."
  );
  if (!analysisResponse.ok || !analysis.ok) {
    throw new Error(analysis.message || "The converted CAD geometry could not be analysed.");
  }

  directDwgFileStatus.textContent = `${file.name} converted and checked`;
  directDwgCard(file, [
    "Large DWG converted outside Vercel.",
    "Arqis is checking the extracted CAD geometry for floor and room candidates."
  ]);
  directDwgAnalysis(
    analysis.status || "Converted CAD geometry checked",
    analysis.message || "Arqis checked the converted CAD geometry.",
    analysis.shapes || []
  );
}

async function onLargeDwgChange(event) {
  const file = directDwgFile.files[0];
  if (!file || directDwgExtension(file) !== "dwg" || file.size <= VERCEL_DWG_FILE_LIMIT) return;

  event.stopImmediatePropagation();

  try {
    await convertLargeDwg(file);
  } catch (error) {
    directDwgFileStatus.textContent = `${file.name} is still converting differently`;
    directDwgCard(file, [
      "The large DWG did not complete through the current converter pass.",
      "Arqis will keep the upload route for large CAD files separate from the small-file analyser."
    ]);
    directDwgAnalysis(
      "Large DWG conversion not complete",
      directDwgErrorMessage(error)
    );
  }
}

directDwgFile.addEventListener("change", onLargeDwgChange, { capture: true });
