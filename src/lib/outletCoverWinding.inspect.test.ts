import { describe, it } from "vitest";
import { createInitialOutletCoverDesign, outletCoverToAsciiStl } from "./outletCover";
import { writeFileSync } from "fs";

describe("winding check", () => {
  it("checks hole wall normal directions", () => {
    const stl = outletCoverToAsciiStl(createInitialOutletCoverDesign());
    writeFileSync("/tmp/outlet_fixed2.stl", stl);
  });
});
