import { describe, expect, it } from "vitest";
import { createInitialOutletCoverDesign, duplexReceptacleHole, outletCoverToAsciiStl, OutletCoverDesign } from "./outletCover";

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
  for (const count of edgeCount.values()) {
    if (count % 2 !== 0) open++;
  }
  return open;
}

const base = createInitialOutletCoverDesign();

const cases: Array<[string, OutletCoverDesign]> = [
  ["duplex, flat", { ...base }],
  ["duplex, wall depth", { ...base, depthMm: 10 }],
  ["decora, flat", { ...base, outletType: "decora", cutoutWidthMm: 45.2, cutoutHeightMm: 70.6 }],
  ["duplex, chamfer bevel", { ...base, bevelType: "chamfer", bevelSizeMm: 1 }],
  ["duplex, fillet bevel", { ...base, bevelType: "fillet", bevelSizeMm: 1 }],
  ["duplex, chamfer bevel + wall depth", { ...base, bevelType: "chamfer", bevelSizeMm: 1, depthMm: 10 }],
  [
    "decora, fillet bevel + wall depth",
    {
      ...base, outletType: "decora", cutoutWidthMm: 45.2, cutoutHeightMm: 70.6,
      bevelType: "fillet", bevelSizeMm: 1.5, depthMm: 5,
    },
  ],
  ["duplex, no screw head counterbore", { ...base, screwHeadDepthMm: 0 }],
  ["duplex, deep screw head counterbore (clamped)", { ...base, screwHeadDepthMm: 10 }],
  ["duplex, screw head counterbore + wall depth + bevel", { ...base, depthMm: 8, bevelType: "chamfer", bevelSizeMm: 1 }],
  [
    "decora, screw head counterbore",
    { ...base, outletType: "decora", cutoutWidthMm: 45.2, cutoutHeightMm: 70.6 },
  ],
];

describe("outlet cover STL is watertight (0 open edges)", () => {
  it.each(cases)("%s", (_label, design) => {
    const stl = outletCoverToAsciiStl(design);
    expect(countOpenEdges(stl)).toBe(0);
  });
});

describe("duplex receptacle hole bulges to full diameter, not a stadium", () => {
  it("widest point reaches the full circle radius, not just the flat height", () => {
    const diameter = 34.1;
    const height = 28.6;
    const path = duplexReceptacleHole(0, 0, diameter, height);
    const points = path.getPoints();

    const maxRadiusFromCenter = Math.max(...points.map((p) => Math.hypot(p.x, p.y)));
    const maxAbsY = Math.max(...points.map((p) => Math.abs(p.y)));

    // A stadium (old shape) would cap out at height/2 everywhere; this shape
    // should bulge out to the full diameter/2 at its widest (near y=0).
    expect(maxRadiusFromCenter).toBeGreaterThan(height / 2 + 1);
    expect(maxRadiusFromCenter).toBeCloseTo(diameter / 2, 1);
    // Vertical extent must still match the flat-to-flat height, unchanged.
    expect(maxAbsY).toBeCloseTo(height / 2, 1);
  });
});
