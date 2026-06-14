import { createCardBaseGeometry, createRaisedElementGeometries, geometryToAsciiStl, geometryToStep } from "./geometry3d";
import { Design } from "../shared/design";

export function designToAsciiStl(design: Design) {
  const geometries = [
    createCardBaseGeometry(design),
    ...createRaisedElementGeometries(design).map((item) => item.geometry),
  ];

  try {
    return geometryToAsciiStl(design.name, geometries);
  } finally {
    for (const geometry of geometries) {
      geometry.dispose();
    }
  }
}

export function designToStep(design: Design) {
  const geometries = [
    createCardBaseGeometry(design),
    ...createRaisedElementGeometries(design).map((item) => item.geometry),
  ];

  try {
    return geometryToStep(design.name, geometries);
  } finally {
    for (const geometry of geometries) {
      geometry.dispose();
    }
  }
}
