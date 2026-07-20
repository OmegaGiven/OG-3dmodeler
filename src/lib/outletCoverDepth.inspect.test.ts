import { describe, it } from "vitest";
import { createInitialOutletCoverDesign, outletCoverToAsciiStl } from "./outletCover";
import { writeFileSync } from "fs";

describe("depth only", () => {
  it("check manifold", () => {
    const stl = outletCoverToAsciiStl({ ...createInitialOutletCoverDesign(), depthMm: 10 });
    writeFileSync("/tmp/outlet_depth.stl", stl);
  });
});
