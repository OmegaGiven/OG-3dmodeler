import * as THREE from "three";
import { Font, FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import helvetikerBold from "three/examples/fonts/helvetiker_bold.typeface.json";
import { createQrMatrix } from "./qr";
import { CardElement, Design, getCardSize, getElementSize } from "../shared/design";

const font = new FontLoader().parse(helvetikerBold);
const CLIP_EPSILON_MM = 0.03;

export function createCardBaseGeometry(design: Design) {
  const cardSize = getCardSize(design);
  const cardShape = new THREE.Shape();
  cardShape.moveTo(-cardSize.widthMm / 2, -cardSize.heightMm / 2);
  cardShape.lineTo(cardSize.widthMm / 2, -cardSize.heightMm / 2);
  cardShape.lineTo(cardSize.widthMm / 2, cardSize.heightMm / 2);
  cardShape.lineTo(-cardSize.widthMm / 2, cardSize.heightMm / 2);
  cardShape.lineTo(-cardSize.widthMm / 2, -cardSize.heightMm / 2);

  for (const element of design.side.elements) {
    if (element.mode !== "cut" || element.type === "qr") {
      continue;
    }
    cardShape.holes.push(...elementToCutPaths(element, design));
  }

  const geometry = new THREE.ExtrudeGeometry(cardShape, {
    depth: design.thicknessMm,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geometry.center();
  return geometry;
}

export function createRaisedElementGeometries(design: Design) {
  const geometries: Array<{ geometry: THREE.BufferGeometry; color: string }> = [];
  for (const element of design.side.elements) {
    if (element.mode !== "raised" && !(element.type === "qr" && element.mode === "cut")) {
      continue;
    }

    if (element.type === "text") {
      for (const shape of textElementToShapes(element, design, true)) {
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: element.depthMm,
          bevelEnabled: false,
          curveSegments: 10,
        });
        geometry.translate(0, 0, design.thicknessMm / 2);
        geometries.push({ geometry, color: element.color });
      }
    } else if (element.type === "qr") {
      for (const path of qrElementToPaths(element, design)) {
        const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(path.getPoints(4)), {
          depth: element.depthMm,
          bevelEnabled: false,
        });
        geometry.translate(0, 0, design.thicknessMm / 2);
        geometries.push({ geometry, color: element.color });
      }
    } else {
      const size = getElementSize(element);
      const geometry = new THREE.BoxGeometry(size.widthMm, size.heightMm, element.depthMm);
      const { x, y } = elementCenter(element, size.widthMm, size.heightMm, design);
      geometry.rotateZ(THREE.MathUtils.degToRad(-element.rotationDeg));
      geometry.translate(x, y, design.thicknessMm / 2 + element.depthMm / 2);
      geometries.push({ geometry, color: element.color });
    }
  }
  return geometries;
}

function fmtFloat(n: number): string {
  // Clamp floating-point noise to zero, then emit fixed-decimal notation.
  // Scientific notation (e.g. 1e-16) is not valid in the STL spec and breaks
  // some slicer parsers (including Bambu Studio).
  const v = Math.abs(n) < 1e-10 ? 0 : n;
  return v.toFixed(6);
}

function fmtVec(v: THREE.Vector3): string {
  return `${fmtFloat(v.x)} ${fmtFloat(v.y)} ${fmtFloat(v.z)}`;
}

export function geometryToStep(name: string, geometries: THREE.BufferGeometry[]): string {
  const safeName = name.replace(/['"\\]/g, "_");
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  let nextId = 12;
  const data: string[] = [];
  const brepIds: number[] = [];

  function nextEntityId() {
    return ++nextId;
  }
  function add(entityId: number, type: string, args: string) {
    data.push(`#${entityId}=${type}(${args});`);
  }

  for (const geometry of geometries) {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = nonIndexed.getAttribute("position");
    const faceIds: number[] = [];

    for (let i = 0; i < position.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i);
      const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);

      const ab = new THREE.Vector3().subVectors(b, a);
      const ac = new THREE.Vector3().subVectors(c, a);
      const normal = new THREE.Vector3().crossVectors(ab, ac);
      if (normal.length() < 1e-10) continue;
      normal.normalize();
      const abDir = ab.clone().normalize();

      const fmt = (v: THREE.Vector3) => `${fmtFloat(v.x)},${fmtFloat(v.y)},${fmtFloat(v.z)}`;

      const idPA = nextEntityId(); add(idPA, "CARTESIAN_POINT", `'',(${fmt(a)})`);
      const idPB = nextEntityId(); add(idPB, "CARTESIAN_POINT", `'',(${fmt(b)})`);
      const idPC = nextEntityId(); add(idPC, "CARTESIAN_POINT", `'',(${fmt(c)})`);
      const idVA = nextEntityId(); add(idVA, "VERTEX_POINT", `'',#${idPA}`);
      const idVB = nextEntityId(); add(idVB, "VERTEX_POINT", `'',#${idPB}`);
      const idVC = nextEntityId(); add(idVC, "VERTEX_POINT", `'',#${idPC}`);

      function addEdge(pStart: number, vStart: number, vEnd: number, dir: THREE.Vector3, len: number): number {
        const idDir = nextEntityId(); add(idDir, "DIRECTION", `'',(${fmt(dir)})`);
        const idVec = nextEntityId(); add(idVec, "VECTOR", `'',#${idDir},${fmtFloat(len)}`);
        const idLine = nextEntityId(); add(idLine, "LINE", `'',#${pStart},#${idVec}`);
        const idEdge = nextEntityId(); add(idEdge, "EDGE_CURVE", `'',#${vStart},#${vEnd},#${idLine},.T.`);
        const idOE = nextEntityId(); add(idOE, "ORIENTED_EDGE", `'',*,*,#${idEdge},.T.`);
        return idOE;
      }

      const bc = new THREE.Vector3().subVectors(c, b);
      const ca = new THREE.Vector3().subVectors(a, c);
      const idOEAB = addEdge(idPA, idVA, idVB, abDir, ab.length());
      const idOEBC = addEdge(idPB, idVB, idVC, bc.clone().normalize(), bc.length());
      const idOECA = addEdge(idPC, idVC, idVA, ca.clone().normalize(), ca.length());

      const idLoop = nextEntityId(); add(idLoop, "EDGE_LOOP", `'',(#${idOEAB},#${idOEBC},#${idOECA})`);
      const idBound = nextEntityId(); add(idBound, "FACE_OUTER_BOUND", `'',#${idLoop},.T.`);

      const idNormal = nextEntityId(); add(idNormal, "DIRECTION", `'',(${fmt(normal)})`);
      const idXRef = nextEntityId(); add(idXRef, "DIRECTION", `'',(${fmt(abDir)})`);
      const idAxis = nextEntityId(); add(idAxis, "AXIS2_PLACEMENT_3D", `'',#${idPA},#${idNormal},#${idXRef}`);
      const idPlane = nextEntityId(); add(idPlane, "PLANE", `'',#${idAxis}`);

      const idFace = nextEntityId(); add(idFace, "ADVANCED_FACE", `'',(#${idBound}),#${idPlane},.T.`);
      faceIds.push(idFace);
    }

    if (nonIndexed !== geometry) nonIndexed.dispose();

    if (faceIds.length > 0) {
      const idShell = nextEntityId(); add(idShell, "CLOSED_SHELL", `'',(${faceIds.map((f) => `#${f}`).join(",")})`);
      const idBrep = nextEntityId(); add(idBrep, "MANIFOLD_SOLID_BREP", `'${safeName}',#${idShell}`);
      brepIds.push(idBrep);
    }
  }

  const idRepr = nextEntityId(); add(idRepr, "ADVANCED_BREP_SHAPE_REPRESENTATION", `'',(${brepIds.map((b) => `#${b}`).join(",")}),#8`);
  const idSDR = nextEntityId(); add(idSDR, "SHAPE_DEFINITION_REPRESENTATION", `#7,#${idRepr}`);

  return [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('STEP AP214 generated by OG-3dmodeler'),'2;1');`,
    `FILE_NAME('${safeName}.stp','${now}',('OG-3dmodeler'),(''),'OG-3dmodeler','','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));`,
    "ENDSEC;",
    "DATA;",
    `#1=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#2);`,
    `#2=APPLICATION_CONTEXT('core data for automotive mechanical design processes');`,
    `#3=PRODUCT_CONTEXT('',#2,'mechanical');`,
    `#4=PRODUCT('${safeName}','${safeName}','',(#3));`,
    `#5=PRODUCT_DEFINITION_FORMATION('','',#4);`,
    `#6=PRODUCT_DEFINITION('design','',#5,#1);`,
    `#7=PRODUCT_DEFINITION_SHAPE('','',#6);`,
    `#8=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#9))GLOBAL_UNIT_ASSIGNED_CONTEXT((#10,#11,#12))REPRESENTATION_CONTEXT('3D Dimensioning Space','3D'));`,
    `#9=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#10,'distance_accuracy_value','confusion accuracy');`,
    `#10=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));`,
    `#11=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));`,
    `#12=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());`,
    ...data,
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n");
}

export function geometryToAsciiStl(name: string, geometries: THREE.BufferGeometry[]) {
  const lines = [`solid ${name.replace(/\s+/g, "_")}`];
  for (const geometry of geometries) {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = nonIndexed.getAttribute("position");
    for (let i = 0; i < position.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i);
      const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      lines.push(`facet normal ${fmtVec(normal)}`);
      lines.push("  outer loop");
      lines.push(`    vertex ${fmtVec(a)}`);
      lines.push(`    vertex ${fmtVec(b)}`);
      lines.push(`    vertex ${fmtVec(c)}`);
      lines.push("  endloop");
      lines.push("endfacet");
    }
    if (nonIndexed !== geometry) {
      nonIndexed.dispose();
    }
  }
  lines.push(`endsolid ${name.replace(/\s+/g, "_")}`);
  return lines.join("\n");
}

function elementToCutPaths(element: CardElement, design: Design) {
  const cardSize = getCardSize(design);
  const clipBounds = {
    minX: -cardSize.widthMm / 2 + CLIP_EPSILON_MM,
    maxX: cardSize.widthMm / 2 - CLIP_EPSILON_MM,
    minY: -cardSize.heightMm / 2 + CLIP_EPSILON_MM,
    maxY: cardSize.heightMm / 2 - CLIP_EPSILON_MM,
  };

  if (element.type === "text") {
    return textElementToShapes(element, design, false).flatMap((shape) => shapeToClippedHolePaths(shape, clipBounds));
  }
  if (element.type === "qr") {
    return qrElementToPaths(element, design).flatMap((path) => pathToClippedHolePaths(path, clipBounds));
  }

  const size = getElementSize(element);
  if (element.type === "shape" && element.shape === "circle") {
    const { x, y } = elementCenter(element, size.widthMm, size.heightMm, design);
    const path = new THREE.Path();
    path.absellipse(x, y, size.widthMm / 2, size.heightMm / 2, 0, Math.PI * 2, false, THREE.MathUtils.degToRad(-element.rotationDeg));
    return pathToClippedHolePaths(path, clipBounds);
  }

  return pathToClippedHolePaths(rectPath(element, size.widthMm, size.heightMm, design), clipBounds);
}

function qrElementToPaths(element: Extract<CardElement, { type: "qr" }>, design: Design) {
  const matrix = createQrMatrix(element.value);
  const moduleSize = element.widthMm / matrix.size;
  const cardSize = getCardSize(design);
  const origin = new THREE.Vector2(element.xMm - cardSize.widthMm / 2, cardSize.heightMm / 2 - element.yMm);
  const rotation = THREE.MathUtils.degToRad(-element.rotationDeg);

  return matrix.modules.map(({ row, col }) => {
    const x = element.xMm + col * moduleSize;
    const y = element.yMm + row * moduleSize;
    const path = rectPath({ ...element, xMm: x, yMm: y, rotationDeg: 0 }, moduleSize, moduleSize, design);
    return new THREE.Path(path.getPoints(4).map((point) => point.rotateAround(origin, rotation)));
  });
}

function textElementToShapes(element: Extract<CardElement, { type: "text" }>, design: Design, preserveCounters: boolean) {
  const generated = font.generateShapes(element.text, element.fontSizeMm);
  const box = new THREE.Box2();
  for (const shape of generated) {
    for (const point of shape.getPoints(12)) {
      box.expandByPoint(point);
    }
  }

  const cardSize = getCardSize(design);
  const targetSize = getElementSize(element);
  const sourceWidth = Math.max(0.001, box.max.x - box.min.x);
  const sourceHeight = Math.max(0.001, box.max.y - box.min.y);
  const scaleX = targetSize.widthMm / sourceWidth;
  const scaleY = targetSize.heightMm / sourceHeight;
  const targetLeft = element.xMm - cardSize.widthMm / 2;
  const targetTop = cardSize.heightMm / 2 - element.yMm;
  const targetBottom = targetTop - targetSize.heightMm;
  const rotation = THREE.MathUtils.degToRad(-element.rotationDeg);
  const origin = new THREE.Vector2(targetLeft, targetTop);

  return generated.map((shape) => {
    const next = transformTextShape(shape, box, targetLeft, targetBottom, scaleX, scaleY, rotation, origin);
    if (!preserveCounters) {
      next.holes = [];
    }
    return next;
  });
}

function transformTextShape(
  shape: THREE.Shape,
  sourceBox: THREE.Box2,
  targetLeft: number,
  targetBottom: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
  origin: THREE.Vector2,
) {
  const next = new THREE.Shape(transformTextPoints(shape.getPoints(18), sourceBox, targetLeft, targetBottom, scaleX, scaleY, rotation, origin));
  next.holes = shape.holes.map((hole) =>
    new THREE.Path(transformTextPoints(hole.getPoints(18), sourceBox, targetLeft, targetBottom, scaleX, scaleY, rotation, origin)),
  );
  return next;
}

function transformTextPoints(
  points: THREE.Vector2[],
  sourceBox: THREE.Box2,
  targetLeft: number,
  targetBottom: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
  origin: THREE.Vector2,
) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return points.map((point) => {
    const translated = new THREE.Vector2(
      targetLeft + (point.x - sourceBox.min.x) * scaleX,
      targetBottom + (point.y - sourceBox.min.y) * scaleY,
    );
    const dx = translated.x - origin.x;
    const dy = translated.y - origin.y;
    return new THREE.Vector2(origin.x + dx * cos - dy * sin, origin.y + dx * sin + dy * cos);
  });
}

interface ClipBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function shapeToClippedHolePaths(shape: THREE.Shape, bounds: ClipBounds) {
  return pointsToClippedHolePaths(shape.getPoints(24), bounds);
}

function pathToClippedHolePaths(path: THREE.Path, bounds: ClipBounds) {
  return pointsToClippedHolePaths(path.getPoints(32), bounds);
}

function pointsToClippedHolePaths(points: THREE.Vector2[], bounds: ClipBounds) {
  const clipped = clipPolygonToBounds(removeDuplicateEndPoint(points), bounds);
  if (clipped.length < 3 || Math.abs(THREE.ShapeUtils.area(clipped)) < 0.05) {
    return [];
  }

  const oriented = THREE.ShapeUtils.isClockWise(clipped) ? clipped.reverse() : clipped;
  return [new THREE.Path([...oriented, oriented[0]])];
}

function removeDuplicateEndPoint(points: THREE.Vector2[]) {
  if (points.length > 1 && points[0].equals(points[points.length - 1])) {
    return points.slice(0, -1);
  }
  return points;
}

function clipPolygonToBounds(points: THREE.Vector2[], bounds: ClipBounds) {
  return clipTop(
    clipBottom(
      clipRight(
        clipLeft(points, bounds.minX),
        bounds.maxX,
      ),
      bounds.minY,
    ),
    bounds.maxY,
  );
}

function clipLeft(points: THREE.Vector2[], minX: number) {
  return clipPolygon(points, (point) => point.x >= minX, (a, b) => intersectVertical(a, b, minX));
}

function clipRight(points: THREE.Vector2[], maxX: number) {
  return clipPolygon(points, (point) => point.x <= maxX, (a, b) => intersectVertical(a, b, maxX));
}

function clipBottom(points: THREE.Vector2[], minY: number) {
  return clipPolygon(points, (point) => point.y >= minY, (a, b) => intersectHorizontal(a, b, minY));
}

function clipTop(points: THREE.Vector2[], maxY: number) {
  return clipPolygon(points, (point) => point.y <= maxY, (a, b) => intersectHorizontal(a, b, maxY));
}

function clipPolygon(
  points: THREE.Vector2[],
  inside: (point: THREE.Vector2) => boolean,
  intersect: (a: THREE.Vector2, b: THREE.Vector2) => THREE.Vector2,
) {
  if (points.length === 0) {
    return points;
  }

  const result: THREE.Vector2[] = [];
  let previous = points[points.length - 1];
  let previousInside = inside(previous);

  for (const current of points) {
    const currentInside = inside(current);
    if (currentInside) {
      if (!previousInside) {
        result.push(intersect(previous, current));
      }
      result.push(current.clone());
    } else if (previousInside) {
      result.push(intersect(previous, current));
    }
    previous = current;
    previousInside = currentInside;
  }

  return result;
}

function intersectVertical(a: THREE.Vector2, b: THREE.Vector2, x: number) {
  const t = (x - a.x) / (b.x - a.x || 1);
  return new THREE.Vector2(x, a.y + (b.y - a.y) * t);
}

function intersectHorizontal(a: THREE.Vector2, b: THREE.Vector2, y: number) {
  const t = (y - a.y) / (b.y - a.y || 1);
  return new THREE.Vector2(a.x + (b.x - a.x) * t, y);
}

function rectPath(element: CardElement, widthMm: number, heightMm: number, design: Design) {
  const { x, y } = elementCenter(element, widthMm, heightMm, design);
  const rotation = THREE.MathUtils.degToRad(-element.rotationDeg);
  const corners = [
    new THREE.Vector2(-widthMm / 2, -heightMm / 2),
    new THREE.Vector2(widthMm / 2, -heightMm / 2),
    new THREE.Vector2(widthMm / 2, heightMm / 2),
    new THREE.Vector2(-widthMm / 2, heightMm / 2),
  ].map((point) => point.rotateAround(new THREE.Vector2(0, 0), rotation).add(new THREE.Vector2(x, y)));
  const path = new THREE.Path();
  path.setFromPoints([...corners, corners[0]]);
  return path;
}

function elementCenter(element: CardElement, widthMm: number, heightMm: number, design: Design) {
  const cardSize = getCardSize(design);
  return {
    x: element.xMm - cardSize.widthMm / 2 + widthMm / 2,
    y: cardSize.heightMm / 2 - element.yMm - heightMm / 2,
  };
}
