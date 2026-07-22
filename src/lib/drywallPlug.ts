import * as THREE from "three";
import { geometryToAsciiStl, geometryToStep } from "./geometry3d";

export interface DrywallPlugDesign {
  name: string;
  coverDiameterMm: number;
  holeDiameterMm: number;
  drywallThicknessMm: number;
  diskThicknessMm: number;
  clipWidthMm: number;
  barbLengthMm: number;
  barbProtrusionMm: number;
  nozzleDiameterMm: number;
}

// Fixed per spec: the clip blades are 5mm of radial material, independent of
// how thick the disk is set to.
const CLIP_RADIAL_THICKNESS_MM = 5;
const CLIP_COUNT = 4;
const WELD_OVERLAP_MM = 0.02;

export function createInitialDrywallPlugDesign(): DrywallPlugDesign {
  return {
    name: "New drywall plug",
    coverDiameterMm: 60,
    holeDiameterMm: 35,
    drywallThicknessMm: 12.7,
    diskThicknessMm: 5,
    clipWidthMm: 10,
    barbLengthMm: 3,
    barbProtrusionMm: 1.5,
    nozzleDiameterMm: 0.4,
  };
}

export function drywallPlugSizeLabel(design: DrywallPlugDesign): string {
  const totalDepth = design.diskThicknessMm + design.drywallThicknessMm + design.barbLengthMm;
  return `${round(design.coverDiameterMm)}mm cover x ${round(design.holeDiameterMm)}mm hole · ${round(totalDepth)}mm deep`;
}

export function createDrywallPlugGeometries(design: DrywallPlugDesign): THREE.BufferGeometry[] {
  const coverRadius = Math.max(1, design.coverDiameterMm / 2);
  const holeRadius = Math.max(1, design.holeDiameterMm / 2);
  const diskThickness = Math.max(0.5, design.diskThicknessMm);
  const drywallThickness = Math.max(0.5, design.drywallThicknessMm);
  const clipWidth = Math.max(1, design.clipWidthMm);
  const barbLength = Math.max(0.5, design.barbLengthMm);
  const barbProtrusion = Math.max(0, design.barbProtrusionMm);
  const clipInnerRadius = Math.max(0.2, holeRadius - CLIP_RADIAL_THICKNESS_MM);

  const disk = new THREE.CylinderGeometry(coverRadius, coverRadius, diskThickness, 128);
  disk.rotateX(Math.PI / 2); // cylinder's default axis is Y; align it to Z

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
    backZ - drywallThickness - barbLength, // tip: flared out by barbProtrusion
  ];
  const ringOuter = [holeRadius, holeRadius, holeRadius + barbProtrusion];

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
  if (holeRadius - CLIP_RADIAL_THICKNESS_MM < 1) {
    warnings.push({ id: "clip-thickness", severity: "error", message: "Hole diameter is too small for 5mm-thick clips — increase hole diameter." });
  }
  if (design.drywallThicknessMm <= 0) {
    warnings.push({ id: "drywall-thickness", severity: "error", message: "Drywall thickness must be greater than 0mm." });
  }
  if (design.diskThicknessMm < 1) {
    warnings.push({ id: "disk-thickness", severity: "warning", message: "Disk under 1mm may be too fragile to hold the clips." });
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
  if (design.nozzleDiameterMm > CLIP_RADIAL_THICKNESS_MM) {
    warnings.push({ id: "nozzle", severity: "warning", message: "Nozzle diameter is larger than the clip thickness and may not print clips cleanly." });
  }

  return warnings;
}

function round(value: number) {
  return Number(value.toFixed(1));
}
