import { describe, expect, it } from "vitest";
import { createDrywallPlugGeometries, createInitialDrywallPlugDesign, DrywallPlugDesign, drywallPlugToAsciiStl } from "./drywallPlug";
import * as THREE from "three";

function countOpenEdges(asciiStl: string): number {
  const lines = asciiStl.split("\n");
  const verts: [number, number, number][] = [];
  for (const line of lines) {
    const m = line.trim().match(/^vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/);
    if (m) verts.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  const key = (v: [number, number, number]) => v.map((n) => n.toFixed(4)).join(",");
  const edgeCount = new Map<string, number>();
  for (let i = 0; i < verts.length; i += 3) {
    const tri = [verts[i], verts[i + 1], verts[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = key(tri[e]);
      const b = key(tri[(e + 1) % 3]);
      const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeCount.set(edgeKey, (edgeCount.get(edgeKey) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const count of edgeCount.values()) if (count % 2 !== 0) open++;
  return open;
}

// Signed volume via the divergence theorem — negative means inverted (inside-out) winding.
function signedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.index ? geo.toNonIndexed().attributes.position : geo.attributes.position;
  let volume = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

const base = createInitialDrywallPlugDesign();

const cases: Array<[string, DrywallPlugDesign]> = [
  ["defaults", { ...base }],
  ["thin drywall", { ...base, drywallThicknessMm: 6 }],
  ["thick drywall", { ...base, drywallThicknessMm: 25 }],
  ["small hole", { ...base, coverDiameterMm: 40, holeDiameterMm: 20, clipWidthMm: 6 }],
  ["no barb protrusion", { ...base, barbProtrusionMm: 0 }],
  ["wide clips", { ...base, clipWidthMm: 14 }],
  ["thin disk", { ...base, diskThicknessMm: 2 }],
  ["thick disk", { ...base, diskThicknessMm: 8 }],
  ["thin clips", { ...base, clipThicknessMm: 2 }],
  ["thick clips", { ...base, clipThicknessMm: 8 }],
  ["no disk fillet", { ...base, diskFilletMm: 0 }],
  ["large disk fillet", { ...base, diskFilletMm: 2.4 }],
  ["disk fillet clamped by thin disk", { ...base, diskThicknessMm: 2, diskFilletMm: 3 }],
];

describe("drywall plug STL is watertight (0 open edges)", () => {
  it.each(cases)("%s", (_label, design) => {
    const stl = drywallPlugToAsciiStl(design);
    expect(countOpenEdges(stl)).toBe(0);
  });
});

describe("drywall plug solids are right-side-out", () => {
  it.each(cases)("%s", (_label, design) => {
    const geos = createDrywallPlugGeometries(design);
    for (const geo of geos) {
      expect(signedVolume(geo)).toBeGreaterThan(0);
    }
  });
});

describe("drywall plug disk fillet only rounds the outward-facing edge", () => {
  it("back edge (where clips attach) stays sharp at full radius", () => {
    const design = { ...base, diskFilletMm: 2 };
    const [disk] = createDrywallPlugGeometries(design);
    disk.computeBoundingBox();
    const box = disk.boundingBox!;
    const coverRadius = design.coverDiameterMm / 2;
    const pos = disk.attributes.position;

    // The back face (z = min, where clips attach) should still reach full
    // radius — only the front (z = max) should be pulled in by the fillet.
    let maxRadiusAtBack = 0;
    let maxRadiusAtFront = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.sqrt(x * x + y * y);
      if (Math.abs(z - box.min.z) < 0.01) maxRadiusAtBack = Math.max(maxRadiusAtBack, r);
      if (Math.abs(z - box.max.z) < 0.01) maxRadiusAtFront = Math.max(maxRadiusAtFront, r);
    }

    expect(maxRadiusAtBack).toBeGreaterThan(coverRadius - 0.1);
    expect(maxRadiusAtFront).toBeLessThan(coverRadius - 1);
  });
});

describe("clip barb tapers back down at the tip for an easy lead-in", () => {
  it("tip radius is back near the hole width, not stuck at max protrusion", () => {
    const design = { ...base, barbProtrusionMm: 2 };
    const geos = createDrywallPlugGeometries(design);
    const clip = geos[1]; // geos[0] is the disk
    clip.computeBoundingBox();
    const box = clip.boundingBox!;
    const holeRadius = design.holeDiameterMm / 2;
    const pos = clip.attributes.position;

    // The tip is the most-negative-z end (furthest from the disk, leading edge on insertion).
    let maxRadiusAtTip = 0;
    let maxRadiusOverall = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.sqrt(x * x + y * y);
      maxRadiusOverall = Math.max(maxRadiusOverall, r);
      if (Math.abs(z - box.min.z) < 0.01) maxRadiusAtTip = Math.max(maxRadiusAtTip, r);
    }

    // Peak (mid-barb) should reach the full protruded radius somewhere in the geometry...
    expect(maxRadiusOverall).toBeGreaterThan(holeRadius + design.barbProtrusionMm - 0.1);
    // ...but the tip itself should have tapered back down near the hole radius, well under the peak.
    expect(maxRadiusAtTip).toBeLessThan(holeRadius + 0.1);
  });
});
