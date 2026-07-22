import * as THREE from "three";
import { geometryToAsciiStl, geometryToStep } from "./geometry3d";

export interface DrywallPlugDesign {
  name: string;
  coverDiameterMm: number;
  holeDiameterMm: number;
  drywallThicknessMm: number;
  diskThicknessMm: number;
  diskFilletMm: number;
  clipWidthMm: number;
  clipThicknessMm: number;
  barbLengthMm: number;
  barbProtrusionMm: number;
  nozzleDiameterMm: number;
}

const CLIP_COUNT = 4;
const WELD_OVERLAP_MM = 0.02;

export function createInitialDrywallPlugDesign(): DrywallPlugDesign {
  return {
    name: "New drywall plug",
    coverDiameterMm: 60,
    holeDiameterMm: 35,
    drywallThicknessMm: 12.7,
    diskThicknessMm: 5,
    diskFilletMm: 1,
    clipWidthMm: 10,
    clipThicknessMm: 5,
    barbLengthMm: 3,
    barbProtrusionMm: 1.5,
    nozzleDiameterMm: 0.4,
  };
}

export function drywallPlugSizeLabel(design: DrywallPlugDesign): string {
  // Total clip length: shoulder + barb rise + an equal-length, equal-slope run
  // back down past the hole radius to a pointed tip.
  const totalDepth = design.diskThicknessMm + design.drywallThicknessMm + design.barbLengthMm * 2;
  return `${round(design.coverDiameterMm)}mm cover x ${round(design.holeDiameterMm)}mm hole · ${round(totalDepth)}mm deep`;
}

export function createDrywallPlugGeometries(design: DrywallPlugDesign): THREE.BufferGeometry[] {
  const coverRadius = Math.max(1, design.coverDiameterMm / 2);
  const holeRadius = Math.max(1, design.holeDiameterMm / 2);
  const diskThickness = Math.max(0.5, design.diskThicknessMm);
  const drywallThickness = Math.max(0.5, design.drywallThicknessMm);
  const clipWidth = Math.max(1, design.clipWidthMm);
  const clipThickness = Math.max(0.5, design.clipThicknessMm);
  const barbLength = Math.max(0.5, design.barbLengthMm);
  const barbProtrusion = Math.max(0, design.barbProtrusionMm);
  const clipInnerRadius = Math.max(0.2, holeRadius - clipThickness);

  const diskFillet = Math.max(0, Math.min(design.diskFilletMm, diskThickness / 2 - 0.05, coverRadius * 0.4));
  const disk = createFilletedDiskGeometry(coverRadius, diskThickness, diskFillet);

  const geos: THREE.BufferGeometry[] = [disk];
  for (let i = 0; i < CLIP_COUNT; i++) {
    const angle = (i / CLIP_COUNT) * Math.PI * 2;
    geos.push(createClipGeometry(angle, holeRadius, clipInnerRadius, clipWidth, diskThickness, drywallThickness, barbLength, barbProtrusion));
  }

  // z=0 is the disk's front (outward-facing) face; the disk body sits from
  // z=0 to z=-diskThickness, and clips extend further into -z from there.
  const frontZ = diskThickness / 2;
  for (const geo of geos) {
    geo.translate(0, 0, frontZ);
  }

  return geos;
}

const DISK_FILLET_SEGMENTS = 8;
const DISK_RADIAL_SEGMENTS = 128;

// A lathe-revolved profile (rather than a plain cylinder) so the rounded
// edge is one continuous surface of revolution — no separate solid to weld
// against the flat faces, so there's nothing for it to be non-manifold with.
// Only the front (outward-facing, y=+halfT before rotateX) edge is rounded —
// the back edge stays sharp since that side sits flush against the wall.
function createFilletedDiskGeometry(radius: number, thickness: number, fillet: number): THREE.BufferGeometry {
  const halfT = thickness / 2;
  const points: THREE.Vector2[] = [new THREE.Vector2(0, -halfT), new THREE.Vector2(radius, -halfT)];

  if (fillet > 0.001) {
    const topCenter = new THREE.Vector2(radius - fillet, halfT - fillet);
    points.push(new THREE.Vector2(radius, halfT - fillet));
    for (let i = 0; i <= DISK_FILLET_SEGMENTS; i++) {
      const a = (Math.PI / 2) * (i / DISK_FILLET_SEGMENTS);
      points.push(new THREE.Vector2(topCenter.x + fillet * Math.cos(a), topCenter.y + fillet * Math.sin(a)));
    }
  } else {
    points.push(new THREE.Vector2(radius, halfT));
  }

  points.push(new THREE.Vector2(0, halfT));

  const geo = new THREE.LatheGeometry(points, DISK_RADIAL_SEGMENTS);
  geo.rotateX(Math.PI / 2); // Lathe revolves around Y by default; align it to Z like the rest of the model
  return geo;
}

const CLIP_ARC_SEGMENTS = 6;

function createClipGeometry(
  angle: number,
  holeRadius: number,
  innerRadius: number,
  width: number,
  diskThickness: number,
  drywallThickness: number,
  barbLength: number,
  barbProtrusion: number,
): THREE.BufferGeometry {
  // Arc length s = r*theta, using the hole radius as the reference so the clip
  // follows the hole's roundness instead of sitting as a flat chord across it.
  const halfAngle = width / 2 / holeRadius;

  const arc = (radial: number, z: number): Array<[number, number, number]> => {
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i <= CLIP_ARC_SEGMENTS; i++) {
      const a = angle - halfAngle + (2 * halfAngle * i) / CLIP_ARC_SEGMENTS;
      points.push([radial * Math.cos(a), radial * Math.sin(a), z]);
    }
    return points;
  };

  const backZ = -diskThickness / 2;
  const ringZ = [
    backZ + WELD_OVERLAP_MM, // embedded slightly into the disk for real volumetric overlap
    backZ - drywallThickness, // shoulder: end of the straight, hole-width friction-fit section
    backZ - drywallThickness - barbLength, // peak: widest point, barbLength past the shoulder
    backZ - drywallThickness - barbLength * 2, // tip: same slope continued past the peak, same run length
  ];
  // Tip continues the same rise/run slope past the peak instead of reversing it,
  // ending up as far below holeRadius as the peak sits above it — a pointed end,
  // not just a return to flush.
  const tipRadius = Math.max(innerRadius + 0.2, holeRadius - barbProtrusion);
  const ringOuter = [holeRadius, holeRadius, holeRadius + barbProtrusion, tipRadius];

  const rings = ringZ.map((z, i) => ({
    outer: arc(ringOuter[i], z),
    inner: arc(innerRadius, z),
  }));

  const positions: number[] = [];
  const tri = (a: [number,number,number], b: [number,number,number], c: [number,number,number]) =>
    positions.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
  const quad = (
    p0: [number,number,number], p1: [number,number,number],
    p2: [number,number,number], p3: [number,number,number],
  ) => { tri(p0, p2, p1); tri(p0, p3, p2); };

  // Start cap (embedded end, facing back into the disk) — a fan across the arc.
  for (let j = 0; j < CLIP_ARC_SEGMENTS; j++) {
    quad(rings[0].inner[j], rings[0].inner[j + 1], rings[0].outer[j + 1], rings[0].outer[j]);
  }

  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r];
    const b = rings[r + 1];
    for (let j = 0; j < CLIP_ARC_SEGMENTS; j++) {
      // Outer face (the flexing/friction-fit/barb surface).
      quad(a.outer[j], a.outer[j + 1], b.outer[j + 1], b.outer[j]);
      // Inner face.
      quad(a.inner[j + 1], a.inner[j], b.inner[j], b.inner[j + 1]);
    }
    // Two flat end walls closing the arc's angular extremes.
    quad(a.outer[0], a.inner[0], b.inner[0], b.outer[0]);
    quad(a.inner[CLIP_ARC_SEGMENTS], a.outer[CLIP_ARC_SEGMENTS], b.outer[CLIP_ARC_SEGMENTS], b.inner[CLIP_ARC_SEGMENTS]);
  }

  // End cap (tip) — a fan across the arc.
  const last = rings[rings.length - 1];
  for (let j = 0; j < CLIP_ARC_SEGMENTS; j++) {
    quad(last.outer[j], last.outer[j + 1], last.inner[j + 1], last.inner[j]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function drywallPlugToAsciiStl(design: DrywallPlugDesign): string {
  const geos = createDrywallPlugGeometries(design);
  try {
    return geometryToAsciiStl(design.name, geos);
  } finally {
    for (const geo of geos) geo.dispose();
  }
}

export function drywallPlugToStep(design: DrywallPlugDesign): string {
  const geos = createDrywallPlugGeometries(design);
  try {
    return geometryToStep(design.name, geos);
  } finally {
    for (const geo of geos) geo.dispose();
  }
}

export function validateDrywallPlug(
  design: DrywallPlugDesign,
): Array<{ id: string; severity: "warning" | "error"; message: string }> {
  const warnings: Array<{ id: string; severity: "warning" | "error"; message: string }> = [];
  const holeRadius = design.holeDiameterMm / 2;

  if (design.holeDiameterMm <= 0) {
    warnings.push({ id: "hole", severity: "error", message: "Hole diameter must be greater than 0mm." });
  }
  if (design.coverDiameterMm <= design.holeDiameterMm) {
    warnings.push({ id: "cover-vs-hole", severity: "error", message: "Cover diameter must be larger than the hole diameter." });
  }
  if ((design.coverDiameterMm - design.holeDiameterMm) / 2 < 3) {
    warnings.push({ id: "cover-margin", severity: "warning", message: "Less than 3mm of cover overlaps the wall around the hole — may not seat securely." });
  }
  if (design.clipThicknessMm <= 0) {
    warnings.push({ id: "clip-thickness-value", severity: "error", message: "Clip thickness must be greater than 0mm." });
  }
  if (holeRadius - design.clipThicknessMm < 1) {
    warnings.push({ id: "clip-thickness", severity: "error", message: `Hole diameter is too small for ${round(design.clipThicknessMm)}mm-thick clips — increase hole diameter or reduce clip thickness.` });
  }
  if (design.drywallThicknessMm <= 0) {
    warnings.push({ id: "drywall-thickness", severity: "error", message: "Drywall thickness must be greater than 0mm." });
  }
  if (design.diskThicknessMm < 1) {
    warnings.push({ id: "disk-thickness", severity: "warning", message: "Disk under 1mm may be too fragile to hold the clips." });
  }
  if (design.diskFilletMm < 0) {
    warnings.push({ id: "disk-fillet-value", severity: "error", message: "Disk fillet can't be negative." });
  }
  const maxDiskFillet = Math.min(design.diskThicknessMm / 2, design.coverDiameterMm / 2 * 0.4);
  if (design.diskFilletMm > maxDiskFillet) {
    warnings.push({ id: "disk-fillet", severity: "warning", message: `Disk fillet is clamped to ${round(maxDiskFillet)}mm for this disk size.` });
  }
  // Clips are arcs of the hole circumference, spaced 90° apart; they'd touch once
  // each one's half-angle reaches 45° (width/2/holeRadius = pi/4).
  const maxClipWidth = holeRadius * (Math.PI / 2) * 0.9;
  if (design.clipWidthMm > maxClipWidth) {
    warnings.push({ id: "clip-width", severity: "warning", message: `Clip width may overlap between clips at this hole size — try under ${round(maxClipWidth)}mm.` });
  }
  if (design.barbProtrusionMm <= 0) {
    warnings.push({ id: "barb", severity: "warning", message: "No barb protrusion — clips will rely on friction alone to hold the disk in." });
  }
  if (design.nozzleDiameterMm > design.clipThicknessMm) {
    warnings.push({ id: "nozzle", severity: "warning", message: "Nozzle diameter is larger than the clip thickness and may not print clips cleanly." });
  }

  return warnings;
}

function round(value: number) {
  return Number(value.toFixed(1));
}
