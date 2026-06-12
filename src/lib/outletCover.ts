import * as THREE from "three";
import { geometryToAsciiStl } from "./geometry3d";

export type OutletType = "duplex" | "decora";

export interface OutletCoverDesign {
  name: string;
  outletType: OutletType;
  cutoutWidthMm: number;
  cutoutHeightMm: number;
  ovalSpacingMm: number;
  cornerRadiusMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  depthMm: number;
  thicknessMm: number;
  screwHoleDiameterMm: number;
  nozzleDiameterMm: number;
  toleranceMm: number;
}

const DUPLEX_CUTOUT_W = 34.1;
const DUPLEX_CUTOUT_H = 28.6;
const DUPLEX_OVAL_SPACING = 38.9;
const DUPLEX_MARGIN_TB = 23.4;
const DUPLEX_MARGIN_LR = 17.9;

const DECORA_CUTOUT_W = 45.2;
const DECORA_CUTOUT_H = 70.6;
const DECORA_MARGIN_TB = 21.9;
const DECORA_MARGIN_LR = 12.4;

// Decora strap-mount screw spacing: 3-13/16" = 96.8mm center-to-center
const DECORA_SCREW_SPACING_MM = 96.8;

export function createInitialOutletCoverDesign(): OutletCoverDesign {
  return {
    name: "New outlet cover",
    outletType: "duplex",
    cutoutWidthMm: DUPLEX_CUTOUT_W,
    cutoutHeightMm: DUPLEX_CUTOUT_H,
    ovalSpacingMm: DUPLEX_OVAL_SPACING,
    cornerRadiusMm: 3,
    marginTopMm: DUPLEX_MARGIN_TB,
    marginBottomMm: DUPLEX_MARGIN_TB,
    marginLeftMm: DUPLEX_MARGIN_LR,
    marginRightMm: DUPLEX_MARGIN_LR,
    depthMm: 0,
    thicknessMm: 3,
    screwHoleDiameterMm: 3.5,
    nozzleDiameterMm: 0.4,
    toleranceMm: 0.2,
  };
}

export function switchOutletType(design: OutletCoverDesign, type: OutletType): OutletCoverDesign {
  if (type === "duplex") {
    return {
      ...design,
      outletType: "duplex",
      cutoutWidthMm: DUPLEX_CUTOUT_W,
      cutoutHeightMm: DUPLEX_CUTOUT_H,
      ovalSpacingMm: DUPLEX_OVAL_SPACING,
      marginTopMm: DUPLEX_MARGIN_TB,
      marginBottomMm: DUPLEX_MARGIN_TB,
      marginLeftMm: DUPLEX_MARGIN_LR,
      marginRightMm: DUPLEX_MARGIN_LR,
    };
  }
  return {
    ...design,
    outletType: "decora",
    cutoutWidthMm: DECORA_CUTOUT_W,
    cutoutHeightMm: DECORA_CUTOUT_H,
    marginTopMm: DECORA_MARGIN_TB,
    marginBottomMm: DECORA_MARGIN_TB,
    marginLeftMm: DECORA_MARGIN_LR,
    marginRightMm: DECORA_MARGIN_LR,
  };
}

export function outletCoverTotalSize(design: OutletCoverDesign) {
  const {
    outletType,
    marginTopMm,
    marginBottomMm,
    marginLeftMm,
    marginRightMm,
    cutoutWidthMm,
    cutoutHeightMm,
    ovalSpacingMm,
    thicknessMm,
    depthMm,
  } = design;
  const widthMm = marginLeftMm + cutoutWidthMm + marginRightMm;
  const heightMm =
    outletType === "duplex"
      ? marginTopMm + ovalSpacingMm + cutoutHeightMm + marginBottomMm
      : marginTopMm + cutoutHeightMm + marginBottomMm;
  const totalDepthMm = thicknessMm + Math.max(0, depthMm);
  return { widthMm, heightMm, totalDepthMm };
}

export function outletCoverSizeLabel(design: OutletCoverDesign): string {
  const { widthMm, heightMm, totalDepthMm } = outletCoverTotalSize(design);
  const typeLabel = design.outletType === "duplex" ? "duplex" : "Decora";
  return `${round(widthMm)}mm × ${round(heightMm)}mm × ${round(totalDepthMm)}mm · ${typeLabel}`;
}

export function createOutletCoverGeometries(design: OutletCoverDesign): THREE.BufferGeometry[] {
  const t = Math.max(0, design.toleranceMm);
  const cw = design.cutoutWidthMm + t * 2;
  const ch = design.cutoutHeightMm + t * 2;
  const {
    outletType,
    ovalSpacingMm,
    cornerRadiusMm,
    marginTopMm,
    marginBottomMm,
    marginLeftMm,
    marginRightMm,
    depthMm,
    thicknessMm,
  } = design;

  const tw = marginLeftMm + design.cutoutWidthMm + marginRightMm;
  const th =
    outletType === "duplex"
      ? marginTopMm + ovalSpacingMm + design.cutoutHeightMm + marginBottomMm
      : marginTopMm + design.cutoutHeightMm + marginBottomMm;

  // Offsets so margins are honored exactly even when top≠bottom or left≠right
  const cx = (marginLeftMm - marginRightMm) / 2;
  const cy = (marginBottomMm - marginTopMm) / 2;

  const wt = Math.max(0.4, thicknessMm);

  const frontShape = new THREE.Shape();
  frontShape.moveTo(-tw / 2, -th / 2);
  frontShape.lineTo(tw / 2, -th / 2);
  frontShape.lineTo(tw / 2, th / 2);
  frontShape.lineTo(-tw / 2, th / 2);
  frontShape.closePath();

  if (outletType === "duplex") {
    // Stadium (discorectangle): flat top/bottom, semicircular left/right ends
    // r = ch/2 makes it a true stadium; clamp to cw/2 to never exceed half-width
    const stadiumR = Math.min(ch / 2, cw / 2);
    for (const yHole of [cy + ovalSpacingMm / 2, cy - ovalSpacingMm / 2]) {
      frontShape.holes.push(roundedRectHole(cx, yHole, cw, ch, stadiumR));
    }
    // Single center screw hole between the two openings
    addScrewHole(frontShape, 0, 0, design.screwHoleDiameterMm);
  } else {
    const r = Math.min(Math.max(0.5, cornerRadiusMm), cw / 2, ch / 2);
    frontShape.holes.push(roundedRectHole(cx, cy, cw, ch, r));
    // Two screw holes: 3-13/16" (96.8mm) apart, centered on plate
    const sy = DECORA_SCREW_SPACING_MM / 2;
    addScrewHole(frontShape, 0, sy, design.screwHoleDiameterMm);
    addScrewHole(frontShape, 0, -sy, design.screwHoleDiameterMm);
  }

  const frontGeo = new THREE.ExtrudeGeometry(frontShape, {
    depth: wt,
    bevelEnabled: false,
    curveSegments: 64,
  });

  const geos: THREE.BufferGeometry[] = [frontGeo];

  if (depthMm > 0.1) {
    const wallZCenter = wt + depthMm / 2;

    const topWall = new THREE.BoxGeometry(tw, wt, depthMm);
    topWall.translate(0, th / 2 - wt / 2, wallZCenter);
    geos.push(topWall);

    const botWall = new THREE.BoxGeometry(tw, wt, depthMm);
    botWall.translate(0, -th / 2 + wt / 2, wallZCenter);
    geos.push(botWall);

    const innerH = Math.max(0.1, th - 2 * wt);

    const leftWall = new THREE.BoxGeometry(wt, innerH, depthMm);
    leftWall.translate(-tw / 2 + wt / 2, 0, wallZCenter);
    geos.push(leftWall);

    const rightWall = new THREE.BoxGeometry(wt, innerH, depthMm);
    rightWall.translate(tw / 2 - wt / 2, 0, wallZCenter);
    geos.push(rightWall);
  }

  const totalDepth = wt + Math.max(0, depthMm);
  for (const geo of geos) {
    geo.translate(0, 0, -totalDepth / 2);
  }

  return geos;
}

export function outletCoverToAsciiStl(design: OutletCoverDesign): string {
  const geos = createOutletCoverGeometries(design);
  try {
    return geometryToAsciiStl(design.name, geos);
  } finally {
    for (const geo of geos) {
      geo.dispose();
    }
  }
}

export function validateOutletCover(
  design: OutletCoverDesign,
): Array<{ id: string; severity: "warning" | "error"; message: string }> {
  const warnings: Array<{ id: string; severity: "warning" | "error"; message: string }> = [];

  if (design.thicknessMm < 0.8)
    warnings.push({ id: "thickness", severity: "error", message: "Plate thickness must be at least 0.8mm." });
  if (design.marginTopMm < 1)
    warnings.push({ id: "margin-top", severity: "error", message: "Top margin must be at least 1mm." });
  if (design.marginBottomMm < 1)
    warnings.push({ id: "margin-bottom", severity: "error", message: "Bottom margin must be at least 1mm." });
  if (design.marginLeftMm < 1)
    warnings.push({ id: "margin-left", severity: "error", message: "Left margin must be at least 1mm." });
  if (design.marginRightMm < 1)
    warnings.push({ id: "margin-right", severity: "error", message: "Right margin must be at least 1mm." });
  if (design.cutoutWidthMm <= 0)
    warnings.push({ id: "cutout-w", severity: "error", message: "Cutout width must be greater than 0." });
  if (design.cutoutHeightMm <= 0)
    warnings.push({ id: "cutout-h", severity: "error", message: "Cutout height must be greater than 0." });
  if (design.outletType === "duplex" && design.ovalSpacingMm <= design.cutoutHeightMm + design.toleranceMm * 2)
    warnings.push({ id: "spacing", severity: "error", message: "Oval spacing must exceed cutout height — ovals overlap." });
  if (design.depthMm > 0 && design.depthMm < 0.4)
    warnings.push({ id: "depth", severity: "warning", message: "Wall depth under 0.4mm may not print reliably." });
  if (design.thicknessMm < design.nozzleDiameterMm * 2)
    warnings.push({
      id: "thickness-nozzle",
      severity: "warning",
      message: "Plate thickness is less than 2× nozzle diameter and may print poorly.",
    });

  const minMargin = Math.min(
    design.marginTopMm,
    design.marginBottomMm,
    design.marginLeftMm,
    design.marginRightMm,
  );
  if (design.toleranceMm >= minMargin)
    warnings.push({
      id: "tolerance-margin",
      severity: "warning",
      message: "Tolerance equals or exceeds smallest margin — cutout may reach plate edge.",
    });

  const { heightMm } = outletCoverTotalSize(design);
  const sr = design.screwHoleDiameterMm / 2;

  if (design.outletType === "duplex") {
    // Screw at plate center; nearest cutout edge = ovalSpacingMm/2 - (ch/2)
    const t = Math.max(0, design.toleranceMm);
    const ch = design.cutoutHeightMm + t * 2;
    const gap = design.ovalSpacingMm / 2 - ch / 2 - sr;
    if (gap < 0.5)
      warnings.push({ id: "screw-cutout", severity: "warning", message: "Center screw hole nearly overlaps outlet openings — increase oval spacing or reduce screw hole diameter." });
  } else {
    // Screw holes at ±DECORA_SCREW_SPACING_MM/2 from plate center
    const screwEdge = DECORA_SCREW_SPACING_MM / 2 + sr;
    if (screwEdge > heightMm / 2)
      warnings.push({ id: "screw-oob", severity: "error", message: "Decora screw holes extend outside plate — increase top/bottom margins." });
  }

  return warnings;
}

function addScrewHole(shape: THREE.Shape, x: number, y: number, diameterMm: number) {
  const r = Math.max(0.5, diameterMm / 2);
  const hole = new THREE.Path();
  hole.absellipse(x, y, r, r, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);
}

function roundedRectHole(cx: number, cy: number, w: number, h: number, r: number): THREE.Path {
  const path = new THREE.Path();
  // CW winding so THREE.js treats this as a hole in the parent shape
  path.moveTo(cx - w / 2 + r, cy + h / 2);
  path.lineTo(cx + w / 2 - r, cy + h / 2);
  path.absarc(cx + w / 2 - r, cy + h / 2 - r, r, Math.PI / 2, 0, true);
  path.lineTo(cx + w / 2, cy - h / 2 + r);
  path.absarc(cx + w / 2 - r, cy - h / 2 + r, r, 0, -Math.PI / 2, true);
  path.lineTo(cx - w / 2 + r, cy - h / 2);
  path.absarc(cx - w / 2 + r, cy - h / 2 + r, r, -Math.PI / 2, -Math.PI, true);
  path.lineTo(cx - w / 2, cy + h / 2 - r);
  path.absarc(cx - w / 2 + r, cy + h / 2 - r, r, Math.PI, Math.PI / 2, true);
  path.closePath();
  return path;
}

function round(value: number): number {
  return Number(value.toFixed(1));
}
