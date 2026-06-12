import * as THREE from "three";
import { geometryToAsciiStl } from "./geometry3d";

export type OutletType = "duplex" | "decora";
export type BevelType = "none" | "chamfer" | "fillet";

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
  bevelType: BevelType;
  bevelSizeMm: number;
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
    bevelType: "none",
    bevelSizeMm: 3,
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

  // Bevel size clamped so the inner plate stays valid
  const bs = design.bevelType !== "none"
    ? Math.min(design.bevelSizeMm, wt * 0.9, tw / 2 - 1, th / 2 - 1)
    : 0;

  // Face plate outer boundary is shrunk by bs so the bevel ring covers the outer perimeter
  const frontShape = new THREE.Shape();
  frontShape.moveTo(-(tw / 2 - bs), -(th / 2 - bs));
  frontShape.lineTo( (tw / 2 - bs), -(th / 2 - bs));
  frontShape.lineTo( (tw / 2 - bs),  (th / 2 - bs));
  frontShape.lineTo(-(tw / 2 - bs),  (th / 2 - bs));
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

  if (bs > 0) {
    geos.push(createFrontEdgeBevelRing(tw, th, bs, wt, design.bevelType));
  }

  if (depthMm > 0.1) {
    geos.push(createWallRingGeo(tw, th, wt, depthMm, "none", 0));
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
  if (design.bevelType !== "none" && design.depthMm > 0.1) {
    if (design.bevelSizeMm <= 0)
      warnings.push({ id: "bevel-size", severity: "warning", message: "Bevel selected but bevel size is 0 — no bevel will appear." });
    if (design.bevelSizeMm >= design.depthMm)
      warnings.push({ id: "bevel-depth", severity: "warning", message: "Bevel size equals or exceeds wall depth — bevel will be clamped." });
    if (design.bevelSizeMm >= design.thicknessMm)
      warnings.push({ id: "bevel-thick", severity: "warning", message: "Bevel size equals or exceeds plate thickness — bevel will be clamped." });
  }
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

function createWallRingGeo(
  tw: number, th: number, wt: number, depth: number,
  bevelType: BevelType, bevelSize: number,
): THREE.BufferGeometry {
  const iw = tw - 2 * wt;
  const ih = th - 2 * wt;
  const bs = bevelType !== "none" ? Math.min(bevelSize, depth * 0.9, wt * 0.9) : 0;

  // Build sequence of outer-rect cross-sections at increasing Z; inner rect stays iw×ih throughout.
  // Bevel is at the FRONT (z=wt, where walls meet the face plate) — visible from the front of the cover.
  // At each corner, both adjacent bevel slopes taper simultaneously → clean mitered corners, no seams.
  const rings: Array<{ z: number; ow: number; oh: number }> = [];

  if (bevelType === "chamfer" && bs > 0) {
    rings.push({ z: wt, ow: tw - 2 * bs, oh: th - 2 * bs }); // front, inset
    rings.push({ z: wt + bs, ow: tw, oh: th });                // full size after chamfer
    rings.push({ z: wt + depth, ow: tw, oh: th });             // back, square
  } else if (bevelType === "fillet" && bs > 0) {
    const segs = 12;
    for (let i = 0; i <= segs; i++) {
      const angle = (i / segs) * (Math.PI / 2);
      // θ=0 at z=wt (front, fully inset), θ=π/2 at z=wt+bs (full size)
      const shrink = bs * (1 - Math.sin(angle));
      rings.push({ z: wt + bs * (1 - Math.cos(angle)), ow: tw - 2 * shrink, oh: th - 2 * shrink });
    }
    rings.push({ z: wt + depth, ow: tw, oh: th }); // back, square
  } else {
    rings.push({ z: wt, ow: tw, oh: th });
    rings.push({ z: wt + depth, ow: tw, oh: th });
  }

  const N = rings.length;
  const positions: number[] = [];

  // Per-ring vertices: [0..3] outer TL/TR/BR/BL, [4..7] inner TL/TR/BR/BL
  const rv = rings.map(({ z, ow, oh }): Array<[number, number, number]> => [
    [-ow / 2,  oh / 2, z], [ ow / 2,  oh / 2, z],
    [ ow / 2, -oh / 2, z], [-ow / 2, -oh / 2, z],
    [-iw / 2,  ih / 2, z], [ iw / 2,  ih / 2, z],
    [ iw / 2, -ih / 2, z], [-iw / 2, -ih / 2, z],
  ]);

  const tri = (a: [number,number,number], b: [number,number,number], c: [number,number,number]) =>
    positions.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);

  const quad = (
    p0: [number,number,number], p1: [number,number,number],
    p2: [number,number,number], p3: [number,number,number],
    flip: boolean,
  ) => {
    if (flip) { tri(p0, p2, p1); tri(p0, p3, p2); }
    else       { tri(p0, p1, p2); tri(p0, p2, p3); }
  };

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(rv[0][i],   rv[0][j],   rv[0][4+j],   rv[0][4+i],   false); // front frame, -Z normal
    quad(rv[N-1][i], rv[N-1][j], rv[N-1][4+j], rv[N-1][4+i], true);  // back frame,  +Z normal
    quad(rv[0][4+i], rv[0][4+j], rv[N-1][4+j], rv[N-1][4+i], false); // inner walls, inward normal
  }

  // Outer lateral faces across consecutive ring pairs
  for (let r = 0; r < N - 1; r++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(rv[r][i], rv[r][j], rv[r+1][j], rv[r+1][i], true); // outward XY normal
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// Outer edge bevel ring: covers the perimeter of the face plate from z=0 to z=wt.
// The outer boundary grows from (tw-2bs)×(th-2bs) at z=0 (matching the shrunk plate front)
// to tw×th at z=bs (chamfer/fillet complete), then stays straight to z=wt.
// Inner boundary stays fixed at (tw-2bs)×(th-2bs) throughout, matching the plate outer edge.
function createFrontEdgeBevelRing(
  tw: number, th: number, bs: number, wt: number,
  bevelType: BevelType,
): THREE.BufferGeometry {
  const iw = tw - 2 * bs;
  const ih = th - 2 * bs;

  const outerRings: Array<{ z: number; ow: number; oh: number }> = [];

  if (bevelType === "chamfer") {
    outerRings.push({ z: 0, ow: iw, oh: ih }); // front, knife edge (outer=inner)
    outerRings.push({ z: bs, ow: tw, oh: th }); // chamfer complete
  } else {
    const segs = 12;
    for (let i = 0; i <= segs; i++) {
      const angle = (i / segs) * (Math.PI / 2);
      const grow = bs * Math.sin(angle);
      outerRings.push({ z: bs * (1 - Math.cos(angle)), ow: iw + 2 * grow, oh: ih + 2 * grow });
    }
  }

  if (wt > bs + 0.01) {
    outerRings.push({ z: wt, ow: tw, oh: th }); // straight outer wall to plate back
  }

  const positions: number[] = [];

  const tri = (a: [number,number,number], b: [number,number,number], c: [number,number,number]) =>
    positions.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);

  const quad = (
    p0: [number,number,number], p1: [number,number,number],
    p2: [number,number,number], p3: [number,number,number],
    flip: boolean,
  ) => {
    if (flip) { tri(p0, p2, p1); tri(p0, p3, p2); }
    else       { tri(p0, p1, p2); tri(p0, p2, p3); }
  };

  for (let r = 0; r < outerRings.length - 1; r++) {
    const { z: z0, ow: ow0, oh: oh0 } = outerRings[r];
    const { z: z1, ow: ow1, oh: oh1 } = outerRings[r + 1];
    const v0: Array<[number,number,number]> = [
      [-ow0/2,  oh0/2, z0], [ ow0/2,  oh0/2, z0],
      [ ow0/2, -oh0/2, z0], [-ow0/2, -oh0/2, z0],
    ];
    const v1: Array<[number,number,number]> = [
      [-ow1/2,  oh1/2, z1], [ ow1/2,  oh1/2, z1],
      [ ow1/2, -oh1/2, z1], [-ow1/2, -oh1/2, z1],
    ];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(v0[i], v0[j], v1[j], v1[i], true);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
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
