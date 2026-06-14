import * as THREE from "three";
import { geometryToAsciiStl, geometryToStep } from "./geometry3d";

export interface WasherDesign {
  name: string;
  innerDiameterMm: number;
  outerDiameterMm: number;
  heightMm: number;
  nozzleDiameterMm: number;
  toleranceMm: number;
}

export function createInitialWasherDesign(): WasherDesign {
  return {
    name: "New washer",
    innerDiameterMm: 8,
    outerDiameterMm: 22,
    heightMm: 2,
    nozzleDiameterMm: 0.4,
    toleranceMm: 0.2,
  };
}

export function createWasherGeometry(design: WasherDesign) {
  const tolerance = Math.max(0, design.toleranceMm);
  const outerRadius = Math.max(1, (design.outerDiameterMm - tolerance) / 2);
  const innerRadius = Math.max(0.1, Math.min((design.innerDiameterMm + tolerance) / 2, outerRadius - 0.2));
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.2, design.heightMm),
    bevelEnabled: false,
    curveSegments: 128,
  });
  geometry.center();
  return geometry;
}

export function washerToAsciiStl(design: WasherDesign) {
  const geometry = createWasherGeometry(design);
  try {
    return geometryToAsciiStl(design.name, [geometry]);
  } finally {
    geometry.dispose();
  }
}

export function washerToStep(design: WasherDesign) {
  const geometry = createWasherGeometry(design);
  try {
    return geometryToStep(design.name, [geometry]);
  } finally {
    geometry.dispose();
  }
}

export function washerSizeLabel(design: WasherDesign) {
  return `${round(design.outerDiameterMm - design.toleranceMm)}mm generated OD x ${round(design.innerDiameterMm + design.toleranceMm)}mm generated ID x ${round(design.heightMm)}mm high · ${round(design.toleranceMm)}mm tolerance`;
}

function round(value: number) {
  return Number(value.toFixed(1));
}
