import * as THREE from "three";
import { geometryToAsciiStl, geometryToStep } from "./geometry3d";

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
  screwHeadDiameterMm: number;
  screwHeadDepthMm: number;
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
    // Standard wall-plate mounting screw is a #6-32 oval head: shank ~3.5mm,
    // head diameter up to ~7.1mm (ANSI B18.6.3, 82° oval/flat head), head
    // height ~2.7-3.3mm. screwHeadDiameterMm/DepthMm size a counterbore so
    // the head seats recessed like on a normal outlet cover.
    screwHoleDiameterMm: 3.5,
    screwHeadDiameterMm: 7.5,
    screwHeadDepthMm: 2.5,
    nozzleDiameterMm: 0.4,
    toleranceMm: 0.4,
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

  // Screw positions, anchored to the outlet receptacle center, not the plate center
  const screwCenters: Array<[number, number]> =
    outletType === "duplex"
      ? [[cx, cy]]
      : (() => {
          const sy = DECORA_SCREW_SPACING_MM / 2;
          return [[cx, cy + sy], [cx, cy - sy]];
        })();

  // Face plate outer boundary is shrunk by bs so the bevel ring covers the outer perimeter
  function buildFrontShape(screwHoleDiameterMm: number): THREE.Shape {
    const shape = new THREE.Shape();
    shape.moveTo(-(tw / 2 - bs), -(th / 2 - bs));
    shape.lineTo( (tw / 2 - bs), -(th / 2 - bs));
    shape.lineTo( (tw / 2 - bs),  (th / 2 - bs));
    shape.lineTo(-(tw / 2 - bs),  (th / 2 - bs));
    shape.closePath();

    if (outletType === "duplex") {
      // Real duplex receptacle openings aren't a stadium (semicircular ends) —
      // they're a circle of diameter cw with the top and bottom flattened off at
      // height ch, so the sides stay fully round and bulge out wider than the
      // flats. cutoutWidthMm is that circle's diameter, cutoutHeightMm is the
      // flat-to-flat height.
      for (const yHole of [cy + ovalSpacingMm / 2, cy - ovalSpacingMm / 2]) {
        shape.holes.push(duplexReceptacleHole(cx, yHole, cw, ch));
      }
    } else {
      const r = Math.min(Math.max(0.5, cornerRadiusMm), cw / 2, ch / 2);
      shape.holes.push(roundedRectHole(cx, cy, cw, ch, r));
    }
    for (const [sx, sy] of screwCenters) {
      addScrewHole(shape, sx, sy, screwHoleDiameterMm);
    }
    return shape;
  }

  const geos: THREE.BufferGeometry[] = [];

  // Screw head counterbore: a wider, shallower recess up front so a standard
  // wall-plate screw's head seats flush instead of proud of the surface. Built
  // as its own stacked slab (wide screw holes) welded onto the rest of the
  // plate (normal-diameter screw holes) rather than a single variable-diameter
  // hole, since ExtrudeGeometry only supports one constant cross-section.
  const counterboreDepth = Math.min(Math.max(0, design.screwHeadDepthMm), wt - 0.4);
  if (counterboreDepth > 0.05 && design.screwHeadDiameterMm > design.screwHoleDiameterMm) {
    const counterboreGeo = new THREE.ExtrudeGeometry(buildFrontShape(design.screwHeadDiameterMm), {
      depth: counterboreDepth + WELD_OVERLAP_MM,
      bevelEnabled: false,
      curveSegments: 64,
    });
    const restGeo = new THREE.ExtrudeGeometry(buildFrontShape(design.screwHoleDiameterMm), {
      depth: wt - counterboreDepth,
      bevelEnabled: false,
      curveSegments: 64,
    });
    restGeo.translate(0, 0, counterboreDepth);
    geos.push(counterboreGeo, restGeo);
  } else {
    geos.push(new THREE.ExtrudeGeometry(buildFrontShape(design.screwHoleDiameterMm), {
      depth: wt,
      bevelEnabled: false,
      curveSegments: 64,
    }));
  }

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

export function outletCoverToStep(design: OutletCoverDesign): string {
  const geos = createOutletCoverGeometries(design);
  try {
    return geometryToStep(design.name, geos);
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
  if (design.bevelType !== "none") {
    if (design.bevelSizeMm <= 0)
      warnings.push({ id: "bevel-size", severity: "warning", message: "Bevel selected but bevel size is 0 — no bevel will appear." });
    if (design.bevelSizeMm >= design.thicknessMm)
      warnings.push({ id: "bevel-thick", severity: "warning", message: "Bevel size equals or exceeds plate thickness — bevel will be clamped." });
    if (design.depthMm > 0.1 && design.bevelSizeMm >= design.depthMm)
      warnings.push({ id: "bevel-depth", severity: "warning", message: "Bevel size equals or exceeds wall depth — bevel will be clamped." });
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
    // Screws at (cx, cy ± sy); check both stay within plate bounds
    const cy = (design.marginBottomMm - design.marginTopMm) / 2;
    const sy = DECORA_SCREW_SPACING_MM / 2;
    if (Math.abs(cy) + sy + sr > heightMm / 2)
      warnings.push({ id: "screw-oob", severity: "error", message: "Decora screw holes extend outside plate — increase top/bottom margins." });
  }

  if (design.screwHeadDepthMm > 0 && design.screwHeadDiameterMm <= design.screwHoleDiameterMm)
    warnings.push({
      id: "screw-head-diameter",
      severity: "warning",
      message: "Screw head diameter must exceed the shaft hole diameter — no counterbore will appear.",
    });
  if (design.screwHeadDepthMm >= design.thicknessMm)
    warnings.push({
      id: "screw-head-depth",
      severity: "warning",
      message: "Screw head recess depth is clamped to stay under the plate thickness.",
    });

  return warnings;
}

// Wall front face is pulled slightly INTO the plate volume instead of sitting exactly
// coincident with the plate's back face. Two solids sharing an exact coplanar face
// produce zero-thickness duplicate geometry that Bambu Studio's manifold check flags;
// its auto-repair pass then re-triangulates the area and can erase nearby cutouts.
// A tiny true volumetric overlap (well under nozzle resolution) makes the union
// unambiguous for the slicer without any visible/dimensional effect.
const WELD_OVERLAP_MM = 0.02;

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
    rings.push({ z: wt - WELD_OVERLAP_MM, ow: tw, oh: th });
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

  // This shell only traces the OUTER profile (knife-edge front → full tw×th → back).
  // Its inner boundary (the iw×ih hole where frontGeo's solid sits) was previously left
  // as two bare, unpaired edge loops (front rim + back-frame inner edge) with nothing in
  // this mesh closing them — frontGeo touches them but is a separate watertight solid, so
  // the loops stayed open ("8 open edges" in Bambu Studio) and its repair pass erased the
  // nearby cutouts along with them. Give the shell its own inner wall, pulled slightly
  // inside frontGeo's boundary for genuine volumetric overlap (same fix as the wall/plate
  // seam below), so this geometry is a fully closed, independent solid.
  const lastZ = outerRings[outerRings.length - 1].z;
  const iwIn = iw - 2 * WELD_OVERLAP_MM;
  const ihIn = ih - 2 * WELD_OVERLAP_MM;
  const innerAt = (z: number): Array<[number,number,number]> => [
    [-iwIn/2,  ihIn/2, z], [ iwIn/2,  ihIn/2, z],
    [ iwIn/2, -ihIn/2, z], [-iwIn/2, -ihIn/2, z],
  ];
  const rimAt = (z: number): Array<[number,number,number]> => [
    [-iw/2,  ih/2, z], [ iw/2,  ih/2, z],
    [ iw/2, -ih/2, z], [-iw/2, -ih/2, z],
  ];

  // Front knife-edge cap: bridges the true rim (matches ring 0) down to the inset inner wall.
  const rim0 = rimAt(0);
  const in0 = innerAt(0);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(rim0[i], rim0[j], in0[j], in0[i], false);
  }

  // Straight inner wall, full depth, facing inward (opposite winding of the outer shell).
  const inWt = innerAt(wt);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(in0[i], in0[j], inWt[j], inWt[i], true);
  }

  // Back frame closes the outer strip at z=wt (needed when no wall ring is present),
  // then bridges the true inner rim down to the inset inner wall, same as the front.
  const vO: Array<[number,number,number]> = [
    [-tw/2,  th/2, lastZ], [ tw/2,  th/2, lastZ],
    [ tw/2, -th/2, lastZ], [-tw/2, -th/2, lastZ],
  ];
  const vI = rimAt(lastZ);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(vO[i], vO[j], vI[j], vI[i], true);
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(vI[i], vI[j], inWt[j], inWt[i], false);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function addScrewHole(shape: THREE.Shape, x: number, y: number, diameterMm: number) {
  const r = Math.max(0.5, diameterMm / 2);
  // Use manually-computed points instead of absellipse (which creates an EllipseCurve that
  // ExtrudeGeometry oversamples by 2×, producing ~0.18mm spacing that causes near-zero-area
  // Earcut bridge triangles which Bambu Studio mesh repair removes, then fills as solid).
  // Min 8 segments (45° per step): fewer steps than 16 keeps adjacent vertices far enough
  // apart that none land nearly collinear with Earcut's bridge to the nearest oval boundary,
  // which was the source of 0.018 mm² triangles that Bambu's repair threshold removes.
  // Do NOT include the closing point (i < segs, not <=): setFromPoints with a duplicate
  // endpoint gives Earcut a zero-length edge that can produce degenerate triangles.
  const segs = Math.max(8, Math.ceil(Math.PI * r));
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < segs; i++) {
    const angle = -2 * Math.PI * i / segs; // negative = CW winding
    pts.push(new THREE.Vector2(x + r * Math.cos(angle), y + r * Math.sin(angle)));
  }
  const hole = new THREE.Path();
  hole.setFromPoints(pts);
  shape.holes.push(hole);
}

function roundedRectHole(cx: number, cy: number, w: number, h: number, r: number): THREE.Path {
  // Use manually-computed points instead of absarc (EllipseCurve gets 2× oversampled by
  // ExtrudeGeometry, creating ~0.18mm point spacing that causes degenerate Earcut bridges).
  // Target ~1mm per arc segment; LineCurves via setFromPoints bypass the 2× multiplier.
  const segs = Math.max(4, Math.ceil((Math.PI / 2) * r));

  const pts: THREE.Vector2[] = [];
  const addPt = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - x) > 1e-6 || Math.abs(last.y - y) > 1e-6) {
      pts.push(new THREE.Vector2(x, y));
    }
  };

  // CW winding: top-left → top-right → arc TR → right → arc BR → bottom-left → arc BL → left → arc TL → close
  addPt(cx - w / 2 + r, cy + h / 2);
  addPt(cx + w / 2 - r, cy + h / 2);
  for (let i = 1; i <= segs; i++) {
    const a = Math.PI / 2 * (1 - i / segs); // PI/2 → 0 (CW)
    addPt(cx + w / 2 - r + r * Math.cos(a), cy + h / 2 - r + r * Math.sin(a));
  }
  addPt(cx + w / 2, cy - h / 2 + r);
  for (let i = 1; i <= segs; i++) {
    const a = -Math.PI / 2 * i / segs; // 0 → -PI/2 (CW)
    addPt(cx + w / 2 - r + r * Math.cos(a), cy - h / 2 + r + r * Math.sin(a));
  }
  addPt(cx - w / 2 + r, cy - h / 2);
  for (let i = 1; i <= segs; i++) {
    const a = -Math.PI / 2 - Math.PI / 2 * i / segs; // -PI/2 → -PI (CW)
    addPt(cx - w / 2 + r + r * Math.cos(a), cy - h / 2 + r + r * Math.sin(a));
  }
  addPt(cx - w / 2, cy + h / 2 - r);
  for (let i = 1; i <= segs; i++) {
    const a = Math.PI - Math.PI / 2 * i / segs; // PI → PI/2 (CW)
    addPt(cx - w / 2 + r + r * Math.cos(a), cy + h / 2 - r + r * Math.sin(a));
  }
  addPt(cx - w / 2 + r, cy + h / 2); // close back to start

  const path = new THREE.Path();
  path.setFromPoints(pts);
  return path;
}

// Circle of diameter `diameterMm`, flattened by a horizontal chord top and
// bottom at ±heightMm/2 — the actual shape of a single duplex receptacle
// opening (per published wall-plate cutout specs), not a stadium.
export function duplexReceptacleHole(cx: number, cy: number, diameterMm: number, heightMm: number): THREE.Path {
  const R = diameterMm / 2;
  const halfH = Math.min(heightMm / 2, R - 0.01);
  const phi = Math.asin(halfH / R);
  const flatHalfWidth = R * Math.cos(phi);

  const segs = Math.max(4, Math.ceil(R * (2 * phi)));

  const pts: THREE.Vector2[] = [];
  const addPt = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - x) > 1e-6 || Math.abs(last.y - y) > 1e-6) {
      pts.push(new THREE.Vector2(x, y));
    }
  };

  // CW winding: top-left → top-right (flat) → arc down the right side → bottom-right
  // → bottom-left (flat) → arc up the left side → back to top-left.
  addPt(cx - flatHalfWidth, cy + halfH);
  addPt(cx + flatHalfWidth, cy + halfH);
  for (let i = 1; i <= segs; i++) {
    const a = phi - 2 * phi * (i / segs); // phi → -phi (CW, through angle 0 / rightmost point)
    addPt(cx + R * Math.cos(a), cy + R * Math.sin(a));
  }
  addPt(cx - flatHalfWidth, cy - halfH);
  for (let i = 1; i <= segs; i++) {
    const a = (Math.PI + phi) - 2 * phi * (i / segs); // pi+phi → pi-phi (CW, through angle pi / leftmost point)
    addPt(cx + R * Math.cos(a), cy + R * Math.sin(a));
  }

  const path = new THREE.Path();
  path.setFromPoints(pts);
  return path;
}

function round(value: number): number {
  return Number(value.toFixed(1));
}
