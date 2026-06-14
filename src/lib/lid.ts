import * as THREE from "three";
import { geometryToAsciiStl, geometryToStep } from "./geometry3d";

export type LidShape = "round" | "square";
export type LidFit = "inner" | "outer";

export interface LidDesign {
  name: string;
  shape: LidShape;
  fit: LidFit;
  widthMm: number;
  heightMm: number;
  diameterMm: number;
  thicknessMm: number;
  rimHeightMm: number;
  rimWallMm: number;
  rimInsetMm: number;
  nozzleDiameterMm: number;
  toleranceMm: number;
}

export function createInitialLidDesign(): LidDesign {
  return {
    name: "New lid",
    shape: "round",
    fit: "inner",
    widthMm: 70,
    heightMm: 50,
    diameterMm: 70,
    thicknessMm: 2,
    rimHeightMm: 6,
    rimWallMm: 2,
    rimInsetMm: 1.2,
    nozzleDiameterMm: 0.4,
    toleranceMm: 0.2,
  };
}

export function createLidGeometries(design: LidDesign) {
  return design.shape === "round" ? createRoundLidGeometries(design) : createSquareLidGeometries(design);
}

export function lidToAsciiStl(design: LidDesign) {
  const geometries = createLidGeometries(design);
  try {
    return geometryToAsciiStl(design.name, geometries);
  } finally {
    for (const geometry of geometries) {
      geometry.dispose();
    }
  }
}

export function lidToStep(design: LidDesign) {
  const geometries = createLidGeometries(design);
  try {
    return geometryToStep(design.name, geometries);
  } finally {
    for (const geometry of geometries) {
      geometry.dispose();
    }
  }
}

export function lidSizeLabel(design: LidDesign) {
  const measured = design.fit === "outer" ? "object OD" : "opening ID";
  if (design.shape === "round") {
    const diameter = design.fit === "outer" ? design.diameterMm + design.toleranceMm + (design.rimInsetMm + design.rimWallMm) * 2 : design.diameterMm;
    return `${round(diameter)}mm generated diameter x ${round(design.thicknessMm + design.rimHeightMm)}mm · ${round(design.diameterMm)}mm ${measured} · ${round(design.toleranceMm)}mm tolerance`;
  }
  const width = design.fit === "outer" ? design.widthMm + design.toleranceMm + (design.rimInsetMm + design.rimWallMm) * 2 : design.widthMm;
  const height = design.fit === "outer" ? design.heightMm + design.toleranceMm + (design.rimInsetMm + design.rimWallMm) * 2 : design.heightMm;
  return `${round(width)}mm x ${round(height)}mm generated x ${round(design.thicknessMm + design.rimHeightMm)}mm · ${round(design.widthMm)}mm x ${round(design.heightMm)}mm ${measured} · ${round(design.toleranceMm)}mm tolerance`;
}

function createRoundLidGeometries(design: LidDesign) {
  const radius = Math.max(2, design.diameterMm / 2);
  const radialTolerance = Math.max(0, design.toleranceMm) / 2;
  const rimInnerRadius = design.fit === "outer"
    ? Math.max(0.5, radius + design.rimInsetMm + radialTolerance)
    : Math.max(0.5, radius - design.rimInsetMm - design.rimWallMm - radialTolerance);
  const rimOuterRadius = design.fit === "outer"
    ? rimInnerRadius + design.rimWallMm
    : Math.max(1, radius - design.rimInsetMm - radialTolerance);
  const topRadius = design.fit === "outer" ? rimOuterRadius : radius;
  const top = extrudeCircle(topRadius, design.thicknessMm);
  const rim = extrudeRing(rimOuterRadius, rimInnerRadius, design.rimHeightMm);
  rim.translate(0, 0, -design.rimHeightMm);
  return [top, rim];
}

function createSquareLidGeometries(design: LidDesign) {
  const objectWidth = Math.max(4, design.widthMm);
  const objectHeight = Math.max(4, design.heightMm);
  const tolerance = Math.max(0, design.toleranceMm);
  const inset = Math.max(0, Math.min(design.rimInsetMm, Math.min(objectWidth, objectHeight) / 2 - 1));
  const wall = Math.max(0.4, Math.min(design.rimWallMm, Math.min(objectWidth, objectHeight) / 2 - inset));
  const outerWidth = design.fit === "outer" ? objectWidth + tolerance + (inset + wall) * 2 : Math.max(1, objectWidth - tolerance - inset * 2);
  const outerHeight = design.fit === "outer" ? objectHeight + tolerance + (inset + wall) * 2 : Math.max(1, objectHeight - tolerance - inset * 2);
  const innerWidth = Math.max(0.4, outerWidth - wall * 2);
  const innerHeight = Math.max(0.4, outerHeight - wall * 2);
  const topWidth = design.fit === "outer" ? outerWidth : objectWidth;
  const topHeight = design.fit === "outer" ? outerHeight : objectHeight;
  const z = -design.rimHeightMm / 2;

  const top = new THREE.BoxGeometry(topWidth, topHeight, design.thicknessMm);
  top.translate(0, 0, design.thicknessMm / 2);

  const north = new THREE.BoxGeometry(outerWidth, wall, design.rimHeightMm);
  north.translate(0, outerHeight / 2 - wall / 2, z);

  const south = new THREE.BoxGeometry(outerWidth, wall, design.rimHeightMm);
  south.translate(0, -outerHeight / 2 + wall / 2, z);

  const east = new THREE.BoxGeometry(wall, innerHeight, design.rimHeightMm);
  east.translate(outerWidth / 2 - wall / 2, 0, z);

  const west = new THREE.BoxGeometry(wall, innerHeight, design.rimHeightMm);
  west.translate(-outerWidth / 2 + wall / 2, 0, z);

  return [top, north, south, east, west];
}

function extrudeCircle(radius: number, depth: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 96,
  });
}

function extrudeRing(outerRadius: number, innerRadius: number, depth: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 96,
  });
}

function round(value: number) {
  return Number(value.toFixed(1));
}
