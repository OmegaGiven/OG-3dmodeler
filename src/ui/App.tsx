import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Box,
  Trash2,
  Download,
  FileText,
  Image,
  FilePlus2,
  HelpCircle,
  Layers,
  MoveHorizontal,
  MoveVertical,
  Palette,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Settings,
  CircleDot,
  Disc,
  Plug,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Group, Layer, Rect, Stage, Text as KonvaText } from "react-konva";
import QRCode from "qrcode";
import { designToSvg, downloadText, exportPdf, exportPngFromDesign, safeName } from "../lib/export2d";
import { validatePrintability } from "../lib/printability";
import { createQrMatrix } from "../lib/qr";
import { extractSafeSvgPathData } from "../lib/sanitizeSvg";
import { designToAsciiStl, designToStep } from "../lib/stl";
import { loadLocalDesign, saveLocalDesign } from "../lib/storage";
import {
  CARD_SIZES,
  CardSide,
  CardElement,
  createInitialDesign,
  Design,
  getCardSize,
  getElementSize,
  getPrintSettings,
  inchesToMm,
  mmToInches,
  mmToPx,
  PRINT_DEFAULTS,
  pxToMm,
} from "../shared/design";
import { createId } from "../shared/id";
import { DrywallPlugTool } from "./DrywallPlugTool";
import { LidMakerTool } from "./LidMakerTool";
import { OutletCoverTool } from "./OutletCoverTool";
import { ThreePreview } from "./ThreePreview";
import { WasherTool } from "./WasherTool";

const MAX_SCALE = 8;
const MAX_HISTORY = 80;
const FONTS = ["Inter", "Arial", "Georgia", "Courier New", "Trebuchet MS"];
type ActiveTool = "business-card" | "lid-maker" | "washer" | "outlet-cover" | "drywall-plug";

interface DesignHistory {
  past: Design[];
  present: Design;
  future: Design[];
}

export function App() {
  const [history, setHistory] = useState<DesignHistory>(() => ({
    past: [],
    present: migrateFrontOnly(loadLocalDesign() ?? createInitialDesign()),
    future: [],
  }));
  const design = history.present;
  const [selectedId, setSelectedId] = useState(design.side.elements[0]?.id ?? "");
  const [activeTool, setActiveTool] = useState<ActiveTool>("business-card");
  const [view, setView] = useState<"editor" | "export">("editor");
  const [status, setStatus] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [fitScale, setFitScale] = useState(MAX_SCALE);
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<any>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const size = getCardSize(design);
  const scale = fitScale * zoom;
  const selected = design.side.elements.find((element) => element.id === selectedId);
  const warnings = useMemo(() => validatePrintability(design), [design]);

  useEffect(() => {
    saveLocalDesign(design);
  }, [design]);

  useEffect(() => () => stopViewportPan(), []);

  useEffect(() => {
    const element = editorRef.current;
    if (!element) {
      return;
    }

    const resize = () => {
      const available = element.clientWidth - 24;
      setFitScale(Math.min(MAX_SCALE, Math.max(3.2, available / size.widthMm)));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [size.widthMm]);

  function updateDesign(updater: (current: Design) => Design) {
    setHistory((current) => {
      const next = { ...updater(current.present), updatedAt: new Date().toISOString() };
      return {
        past: [...current.past, current.present].slice(-MAX_HISTORY),
        present: next,
        future: [],
      };
    });
  }

  function undo() {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) {
        return current;
      }
      setSelectedId("");
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, MAX_HISTORY),
      };
    });
  }

  function redo() {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) {
        return current;
      }
      setSelectedId("");
      return {
        past: [...current.past, current.present].slice(-MAX_HISTORY),
        present: next,
        future: current.future.slice(1),
      };
    });
  }

  function newCard() {
    const fresh = createInitialDesign();
    updateDesign((current) => ({
      ...fresh,
      id: current.id,
      ownerId: current.ownerId,
      name: current.name,
      side: {
        ...fresh.side,
        elements: [],
      },
    }));
    setSelectedId("");
    setShowSettings(false);
    setStatus("Started a new blank card.");
  }

  function zoomIn() {
    setZoom((current) => Math.min(2.5, Number((current + 0.15).toFixed(2))));
  }

  function zoomOut() {
    setZoom((current) => Math.max(0.55, Number((current - 0.15).toFixed(2))));
  }

  function openSettings() {
    setSelectedId("");
    setShowSettings((value) => (selected ? true : !value));
  }

  function updateSelected(patch: Partial<CardElement>) {
    if (!selected) {
      return;
    }
    updateDesign((current) => ({
      ...current,
      side: {
        ...current.side,
        elements: current.side.elements.map((element) =>
          element.id === selected.id ? ({ ...element, ...patch } as CardElement) : element,
        ),
      },
    }));
  }

  function appendElement(element: CardElement) {
    updateDesign((current) => ({
      ...current,
      side: {
        ...current.side,
        elements: [...current.side.elements, element],
      },
    }));
    setSelectedId(element.id);
    setShowSettings(true);
  }

  function addText() {
    const element: CardElement = {
      id: createId(),
      type: "text",
      text: "New text",
      fontFamily: "Inter",
      fontSizeMm: 4.2,
      xMm: 10,
      yMm: 10,
      rotationDeg: 0,
      color: "#1c1c1a",
      mode: "raised",
      depthMm: PRINT_DEFAULTS.raisedDepthMm,
    };
    appendElement(element);
    editText(element);
  }

  function addShape(shape: "rect" | "circle") {
    appendElement({
      id: createId(),
      type: "shape",
      shape,
      widthMm: 14,
      heightMm: 8,
      xMm: 12,
      yMm: 30,
      rotationDeg: 0,
      color: shape === "rect" ? "#cf4f35" : "#2f7c6b",
      mode: "raised",
      depthMm: PRINT_DEFAULTS.raisedDepthMm,
    });
  }

  async function addQr() {
    const value = window.prompt("QR code value", "https://example.com");
    if (!value) {
      return;
    }
    await QRCode.toDataURL(value);
    appendElement({
      id: createId(),
      type: "qr",
      value,
      widthMm: 14,
      heightMm: 14,
      xMm: 68,
      yMm: 29,
      rotationDeg: 0,
      color: "#1c1c1a",
      mode: "raised",
      depthMm: PRINT_DEFAULTS.raisedDepthMm,
    });
  }

  async function importSvg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const svg = await file.text();
      const path = extractSafeSvgPathData(svg);
      appendElement({
        id: createId(),
        type: "svg-logo",
        svgPathData: path,
        widthMm: 18,
        heightMm: 18,
        xMm: 62,
        yMm: 9,
        rotationDeg: 0,
        color: "#1c1c1a",
        mode: "raised",
        depthMm: PRINT_DEFAULTS.raisedDepthMm,
      });
      setStatus("SVG logo imported.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import SVG.");
    } finally {
      event.target.value = "";
    }
  }

  function saveDesign() {
    saveLocalDesign(design);
    setStatus("Design saved locally.");
  }

  function exportStl() {
    const errors = validatePrintability(design).filter((warning) => warning.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} printability error${errors.length === 1 ? "" : "s"} before STL export.`);
      return;
    }

    downloadText(`${safeName(design.name)}.stl`, designToAsciiStl(design), "model/stl");
    setStatus("STL downloaded.");
  }

  function exportStep() {
    const errors = validatePrintability(design).filter((warning) => warning.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} printability error${errors.length === 1 ? "" : "s"} before STEP export.`);
      return;
    }

    downloadText(`${safeName(design.name)}.step`, designToStep(design), "model/step");
    setStatus("STEP downloaded.");
  }

  function selectElement(element: CardElement) {
    setSelectedId(element.id);
    const now = Date.now();
    if (element.type === "text" && lastTapRef.current.id === element.id && now - lastTapRef.current.time < 360) {
      editText(element);
    }
    lastTapRef.current = { id: element.id, time: now };
  }

  function editText(element: CardElement) {
    if (element.type !== "text") {
      return;
    }
    const next = window.prompt("Edit text", element.text);
    if (next !== null) {
      updateElement(element.id, { text: next } as Partial<CardElement>);
    }
  }

  function updateElement(id: string, patch: Partial<CardElement>) {
    updateDesign((current) => ({
      ...current,
      side: {
        ...current.side,
        elements: current.side.elements.map((element) => (element.id === id ? ({ ...element, ...patch } as CardElement) : element)),
      },
    }));
  }

  function updateSelectedPosition(id: string, x: number, y: number) {
    const element = design.side.elements.find((item) => item.id === id);
    if (!element) {
      return;
    }

    const nextX = pxToMm(x, scale);
    const nextY = pxToMm(y, scale);
    if (isElementFullyOffCard(element, nextX, nextY, design)) {
      deleteElement(id);
      setStatus("Element removed because it was moved off the card.");
      return;
    }

    updateElement(id, { xMm: nextX, yMm: nextY });
  }

  function startViewportPan(clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    if (!viewport || zoom <= 1 || (viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight)) {
      return;
    }

    panRef.current = {
      x: clientX,
      y: clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };

    window.addEventListener("mousemove", panWithMouse);
    window.addEventListener("mouseup", stopViewportPan);
    window.addEventListener("touchmove", panWithTouch, { passive: false });
    window.addEventListener("touchend", stopViewportPan);
  }

  function panWithMouse(event: MouseEvent) {
    panViewport(event.clientX, event.clientY);
  }

  function panWithTouch(event: TouchEvent) {
    if (event.touches[0]) {
      event.preventDefault();
      panViewport(event.touches[0].clientX, event.touches[0].clientY);
    }
  }

  function panViewport(clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    const pan = panRef.current;
    if (!viewport || !pan) {
      return;
    }
    viewport.scrollLeft = pan.scrollLeft - (clientX - pan.x);
    viewport.scrollTop = pan.scrollTop - (clientY - pan.y);
  }

  function stopViewportPan() {
    panRef.current = null;
    window.removeEventListener("mousemove", panWithMouse);
    window.removeEventListener("mouseup", stopViewportPan);
    window.removeEventListener("touchmove", panWithTouch);
    window.removeEventListener("touchend", stopViewportPan);
  }

  function handleEmptyCanvasPointerStart(event: any) {
    setSelectedId("");
    const nativeEvent = event.evt as MouseEvent | TouchEvent;
    if ("touches" in nativeEvent) {
      const touch = nativeEvent.touches[0];
      if (touch) {
        startViewportPan(touch.clientX, touch.clientY);
      }
      return;
    }
    startViewportPan(nativeEvent.clientX, nativeEvent.clientY);
  }

  function selectTool(tool: ActiveTool) {
    setActiveTool(tool);
    setView("editor");
    setSelectedId("");
    setShowSettings(false);
  }

  if (activeTool === "lid-maker") {
    return (
      <main className="mobile-shell">
        <ToolNav activeTool={activeTool} selectTool={selectTool} />
        <LidMakerTool />
      </main>
    );
  }

  if (activeTool === "washer") {
    return (
      <main className="mobile-shell">
        <ToolNav activeTool={activeTool} selectTool={selectTool} />
        <WasherTool />
      </main>
    );
  }

  if (activeTool === "outlet-cover") {
    return (
      <main className="mobile-shell">
        <ToolNav activeTool={activeTool} selectTool={selectTool} />
        <OutletCoverTool />
      </main>
    );
  }

  if (activeTool === "drywall-plug") {
    return (
      <main className="mobile-shell">
        <ToolNav activeTool={activeTool} selectTool={selectTool} />
        <DrywallPlugTool />
      </main>
    );
  }

  if (view === "export") {
    return (
      <ExportScreen
        design={design}
        status={status}
        warnings={warnings}
        setStatus={setStatus}
        saveDesign={saveDesign}
        exportStl={exportStl}
        exportStep={exportStep}
        activeTool={activeTool}
        selectTool={selectTool}
        back={() => setView("editor")}
      />
    );
  }

  return (
    <main className="mobile-shell">
      <ToolNav activeTool={activeTool} selectTool={selectTool} />
      <header className="top-bar">
        <div className="brand-strip">
          <input
            className="name-input"
            value={design.name}
            aria-label="Design name"
            onChange={(event) => updateDesign((current) => ({ ...current, name: event.target.value }))}
          />
          <button title="Guide" aria-label="Guide" onClick={() => setShowGuide(true)}>
            <HelpCircle size={19} />
          </button>
          <button title="Settings" aria-label="Settings" onClick={openSettings}>
            <Settings size={19} />
          </button>
        </div>

        <div className="action-bar" aria-label="Add and export tools">
          <IconButton label="Undo" icon={<Undo2 size={19} />} onClick={undo} disabled={history.past.length === 0} />
          <IconButton label="Redo" icon={<Redo2 size={19} />} onClick={redo} disabled={history.future.length === 0} />
          <IconButton label="New card" icon={<FilePlus2 size={19} />} onClick={newCard} />
          <IconButton label="Zoom out" icon={<ZoomOut size={19} />} onClick={zoomOut} disabled={zoom <= 0.55} />
          <IconButton label="Zoom in" icon={<ZoomIn size={19} />} onClick={zoomIn} disabled={zoom >= 2.5} />
          <IconButton label="Add text" icon={<Type size={19} />} onClick={addText} />
          <IconButton label="Add QR" icon={<QrIcon />} onClick={addQr} />
          <IconButton label="Import SVG" icon={<Image size={19} />} onClick={() => fileInputRef.current?.click()} />
          <IconButton label="Save" icon={<Save size={19} />} onClick={saveDesign} />
        </div>
        <input ref={fileInputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={importSvg} />
      </header>

      <section className="editor-focus" ref={editorRef}>
        <div className="card-meta">
          <span>{size.label}</span>
          <span>{size.widthMm}mm x {size.heightMm}mm x {design.thicknessMm}mm · {Math.round(zoom * 100)}%</span>
        </div>

        <div className="canvas-wrap" ref={viewportRef}>
          <Stage
            ref={stageRef}
            width={mmToPx(size.widthMm, scale)}
            height={mmToPx(size.heightMm, scale)}
            onMouseDown={(event) => event.target === event.target.getStage() && handleEmptyCanvasPointerStart(event)}
            onTouchStart={(event) => event.target === event.target.getStage() && handleEmptyCanvasPointerStart(event)}
          >
            <Layer>
              <Rect
                width={mmToPx(size.widthMm, scale)}
                height={mmToPx(size.heightMm, scale)}
                fill={design.side.backgroundColor}
                onMouseDown={handleEmptyCanvasPointerStart}
                onTouchStart={handleEmptyCanvasPointerStart}
              />
              {design.side.elements.map((element) => (
                <DesignNode
                  key={element.id}
                  element={element}
                  scale={scale}
                  selected={element.id === selectedId}
                  onSelect={() => selectElement(element)}
                  onEdit={() => editText(element)}
                  onDragEnd={(x, y) => updateSelectedPosition(element.id, x, y)}
                />
              ))}
            </Layer>
          </Stage>
        </div>
      </section>

      <section className={`bottom-sheet ${selected || showSettings ? "open" : ""}`}>
        {selected ? (
          <Controls selected={selected} updateSelected={updateSelected} deleteSelected={deleteSelected} />
        ) : (
          <SettingsPanel
            design={design}
            status={status}
            warnings={warnings}
            updateDesign={updateDesign}
          />
        )}
      </section>

      <section className="preview-section">
        <ThreePreview design={design} />
      </section>

      <section className="card-actions">
        <button onClick={() => setView("export")}>
          <Download size={20} />
          <span>Export</span>
        </button>
      </section>

      {showGuide && <GuideDialog close={() => setShowGuide(false)} />}
    </main>
  );

  function deleteSelected() {
    if (!selected) {
      return;
    }
    deleteElement(selected.id);
  }

  function deleteElement(id: string) {
    updateDesign((current) => ({
      ...current,
      side: {
        ...current.side,
        elements: current.side.elements.filter((element) => element.id !== id),
      },
    }));
    setSelectedId("");
  }
}

function ExportScreen(props: {
  design: Design;
  status: string;
  warnings: ReturnType<typeof validatePrintability>;
  setStatus: (status: string) => void;
  saveDesign: () => void;
  exportStl: () => void;
  exportStep: () => void;
  activeTool: ActiveTool;
  selectTool: (tool: ActiveTool) => void;
  back: () => void;
}) {
  const size = getCardSize(props.design);
  const svg = designToSvg(props.design);

  async function runExport(action: () => void | Promise<void>, success: string) {
    try {
      await action();
      props.setStatus(success);
    } catch (error) {
      props.setStatus(error instanceof Error ? error.message : "Export failed.");
    }
  }

  return (
    <main className="export-shell">
      <ToolNav activeTool={props.activeTool} selectTool={props.selectTool} />
      <header className="export-header">
        <button title="Back to editor" aria-label="Back to editor" onClick={props.back}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <strong>Export</strong>
          <span>{props.design.name}</span>
        </div>
      </header>

      <section className="export-preview">
        <ThreePreview design={props.design} />
        <span>{size.widthMm}mm x {size.heightMm}mm x {props.design.thicknessMm}mm</span>
      </section>

      <section className="export-options">
        <button onClick={() => runExport(() => downloadText(`${safeName(props.design.name)}.svg`, svg, "image/svg+xml"), "SVG downloaded.")}>
          <FileText size={20} />
          <span>SVG</span>
        </button>
        <button onClick={() => runExport(() => exportPngFromDesign(props.design), "PNG downloaded.")}>
          <Download size={20} />
          <span>PNG</span>
        </button>
        <button onClick={() => runExport(() => exportPdf(props.design), "PDF export started.")}>
          <FileText size={20} />
          <span>PDF</span>
        </button>
        <button onClick={() => runExport(props.exportStl, "STL downloaded.")}>
          <Box size={20} />
          <span>STL</span>
        </button>
        <button onClick={() => runExport(props.exportStep, "STEP downloaded.")}>
          <Box size={20} />
          <span>STEP</span>
        </button>
        <button onClick={() => runExport(props.saveDesign, "Design saved locally.")}>
          <Save size={20} />
          <span>Save</span>
        </button>
      </section>

      <section className="export-warnings">
        {props.warnings.length === 0 ? (
          <span>Printability checks are clear.</span>
        ) : (
          props.warnings.map((warning) => (
            <span key={warning.id} className={warning.severity}>
              {warning.message}
            </span>
          ))
        )}
      </section>
      <p className="export-status">{props.status}</p>
    </main>
  );
}

function ToolNav(props: { activeTool: ActiveTool; selectTool: (tool: ActiveTool) => void }) {
  return (
    <nav className="tool-nav" aria-label="Tool navigation">
      <button className={`tool-tab ${props.activeTool === "business-card" ? "active" : ""}`} onClick={() => props.selectTool("business-card")}>
        <Box size={18} />
        <span>Cards</span>
      </button>
      <button className={`tool-tab ${props.activeTool === "lid-maker" ? "active" : ""}`} onClick={() => props.selectTool("lid-maker")}>
        <Ruler size={18} />
        <span>Lids</span>
      </button>
      <button className={`tool-tab ${props.activeTool === "washer" ? "active" : ""}`} onClick={() => props.selectTool("washer")}>
        <CircleDot size={18} />
        <span>Washers</span>
      </button>
      <button className={`tool-tab ${props.activeTool === "outlet-cover" ? "active" : ""}`} onClick={() => props.selectTool("outlet-cover")}>
        <Plug size={18} />
        <span>Outlets</span>
      </button>
      <button className={`tool-tab ${props.activeTool === "drywall-plug" ? "active" : ""}`} onClick={() => props.selectTool("drywall-plug")}>
        <Disc size={18} />
        <span>Plugs</span>
      </button>
    </nav>
  );
}

function DesignNode(props: {
  element: CardElement;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const { element, scale } = props;
  const size = getElementSize(element);
  const common = {
    x: mmToPx(element.xMm, scale),
    y: mmToPx(element.yMm, scale),
    rotation: element.rotationDeg,
    draggable: true,
    onClick: props.onSelect,
    onTap: props.onSelect,
    onDblClick: props.onEdit,
    onDblTap: props.onEdit,
    onDragEnd: (event: any) => props.onDragEnd(event.target.x(), event.target.y()),
  };

  if (element.type === "text") {
    return (
      <Group {...common}>
        {props.selected && (
          <Rect
            width={mmToPx(size.widthMm, scale)}
            height={mmToPx(size.heightMm, scale)}
            stroke="#2f7c6b"
            strokeWidth={1}
            dash={[4, 4]}
          />
        )}
        <KonvaText
          text={element.text}
          fontFamily={element.fontFamily}
          fontSize={mmToPx(element.fontSizeMm, scale)}
          fill={element.color}
          stroke={element.mode === "cut" ? "#cf4f35" : undefined}
          strokeWidth={element.mode === "cut" ? 1 : 0}
        />
      </Group>
    );
  }

  if (element.type === "qr") {
    const matrix = createQrMatrix(element.value);
    const moduleSize = mmToPx(element.widthMm / matrix.size, scale);
    return (
      <Group {...common}>
        {props.selected && (
          <Rect
            width={mmToPx(size.widthMm, scale)}
            height={mmToPx(size.heightMm, scale)}
            stroke="#2f7c6b"
            strokeWidth={1}
            dash={[4, 4]}
          />
        )}
        {matrix.modules.map(({ row, col }) => (
          <Rect
            key={`${row}-${col}`}
            x={col * moduleSize}
            y={row * moduleSize}
            width={moduleSize}
            height={moduleSize}
            fill={element.mode === "cut" ? "#ffffff" : element.color}
            stroke={element.mode === "cut" ? "#cf4f35" : undefined}
            strokeWidth={element.mode === "cut" ? 0.35 : 0}
          />
        ))}
      </Group>
    );
  }

  return (
    <Rect
      {...common}
      width={mmToPx(size.widthMm, scale)}
      height={mmToPx(size.heightMm, scale)}
      fill={element.mode === "cut" ? "#ffffff" : element.color}
      stroke={element.mode === "cut" ? "#cf4f35" : props.selected ? "#2f7c6b" : undefined}
      strokeWidth={element.mode === "cut" || props.selected ? 2 : 0}
      cornerRadius={element.type === "shape" && element.shape === "circle" ? mmToPx(size.heightMm / 2, scale) : 2}
    />
  );
}

function Controls(props: {
  selected: CardElement;
  updateSelected: (patch: Partial<CardElement>) => void;
  deleteSelected: () => void;
}) {
  const { selected } = props;

  return (
    <div className="control-panel">
      <button className="delete-button wide" onClick={props.deleteSelected}>
        <Trash2 size={17} /> Delete selected element
      </button>
      {selected.type === "text" && (
        <label className="wide">
          <FieldIcon title="Text" icon={<Type size={18} />} />
          <input value={selected.text} onChange={(event) => props.updateSelected({ text: event.target.value } as Partial<CardElement>)} />
        </label>
      )}
      <label>
        <FieldIcon title="Mode" icon={<Layers size={18} />} />
        <select
          value={selected.type === "qr" && selected.mode === "cut" ? "raised" : selected.mode}
          onChange={(event) => props.updateSelected({ mode: event.target.value as CardElement["mode"] })}
        >
          <option value="raised">Raised</option>
          <option value="engraved">Engraved</option>
          {selected.type !== "qr" && <option value="cut">Cut through</option>}
        </select>
      </label>
      <label>
        <FieldIcon title="Depth" icon={<Ruler size={18} />} />
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={selected.mode === "cut" ? "" : selected.depthMm}
          disabled={selected.mode === "cut"}
          aria-label={selected.mode === "cut" ? "Depth does not apply to cut-through mode" : "Depth millimeters"}
          onChange={(event) => props.updateSelected({ depthMm: Number(event.target.value) })}
        />
      </label>
      <label>
        <FieldIcon title="Color" icon={<Palette size={18} />} />
        <input type="color" value={selected.color} onChange={(event) => props.updateSelected({ color: event.target.value })} />
      </label>
      <label>
        <FieldIcon title="Rotation" icon={<RotateCw size={18} />} />
        <input type="number" value={selected.rotationDeg} onChange={(event) => props.updateSelected({ rotationDeg: Number(event.target.value) })} />
      </label>
      {selected.type === "text" && (
        <>
          <label>
            <FieldIcon title="Font" icon={<Type size={18} />} />
            <select value={selected.fontFamily} onChange={(event) => props.updateSelected({ fontFamily: event.target.value } as Partial<CardElement>)}>
              {FONTS.map((font) => <option key={font}>{font}</option>)}
            </select>
          </label>
          <label>
            <FieldIcon title="Font size" icon={<FontSizeIcon />} />
            <input type="number" min="1" step="0.2" value={selected.fontSizeMm} onChange={(event) => props.updateSelected({ fontSizeMm: Number(event.target.value) } as Partial<CardElement>)} />
          </label>
        </>
      )}
      {"widthMm" in selected && (
        <>
          <label>
            <FieldIcon title="Width" icon={<MoveHorizontal size={18} />} />
            <input type="number" min="1" step="0.5" value={selected.widthMm} onChange={(event) => props.updateSelected({ widthMm: Number(event.target.value) } as Partial<CardElement>)} />
          </label>
          <label>
            <FieldIcon title="Height" icon={<MoveVertical size={18} />} />
            <input type="number" min="1" step="0.5" value={selected.heightMm} onChange={(event) => props.updateSelected({ heightMm: Number(event.target.value) } as Partial<CardElement>)} />
          </label>
        </>
      )}
    </div>
  );
}

function SettingsPanel(props: {
  design: Design;
  status: string;
  warnings: ReturnType<typeof validatePrintability>;
  updateDesign: (updater: (current: Design) => Design) => void;
}) {
  const [customUnit, setCustomUnit] = useState<"mm" | "in">("mm");
  const size = getCardSize(props.design);
  const printSettings = getPrintSettings(props.design);
  const customWidthValue = customUnit === "in" ? Number(mmToInches(size.widthMm).toFixed(3)) : Number(size.widthMm.toFixed(1));
  const customHeightValue = customUnit === "in" ? Number(mmToInches(size.heightMm).toFixed(3)) : Number(size.heightMm.toFixed(1));

  function updateCardPreset(value: string) {
    if (value === "custom") {
      props.updateDesign((current) => ({
        ...current,
        cardSize: "custom",
        customSizeMm: {
          widthMm: size.widthMm,
          heightMm: size.heightMm,
        },
      }));
      return;
    }

    props.updateDesign((current) => ({
      ...current,
      cardSize: value as keyof typeof CARD_SIZES,
    }));
  }

  function updateCustomSize(axis: "widthMm" | "heightMm", value: number) {
    const valueMm = customUnit === "in" ? inchesToMm(value) : value;
    props.updateDesign((current) => ({
      ...current,
      cardSize: "custom",
      customSizeMm: {
        widthMm: axis === "widthMm" ? valueMm : getCardSize(current).widthMm,
        heightMm: axis === "heightMm" ? valueMm : getCardSize(current).heightMm,
      },
    }));
  }

  return (
    <div className="control-panel">
      <div className="sheet-title">
        <strong>Settings</strong>
        <span>{props.warnings.length ? `${props.warnings.length} warnings` : "print checks clear"}</span>
      </div>
      <label className="wide">
        <FieldIcon title="Card size" icon={<Box size={18} />} />
        <select value={props.design.cardSize} onChange={(event) => updateCardPreset(event.target.value)}>
          {Object.entries(CARD_SIZES).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {props.design.cardSize === "custom" && (
        <>
          <label>
            <FieldIcon title="Units" icon={<Ruler size={18} />} />
            <select value={customUnit} onChange={(event) => setCustomUnit(event.target.value as "mm" | "in")}>
              <option value="mm">Millimeters</option>
              <option value="in">Inches</option>
            </select>
          </label>
          <label>
            <FieldIcon title="Width" icon={<MoveHorizontal size={18} />} />
            <input
              type="number"
              min={customUnit === "in" ? "0.4" : "10"}
              step={customUnit === "in" ? "0.01" : "0.1"}
              value={customWidthValue}
              onChange={(event) => updateCustomSize("widthMm", Number(event.target.value))}
            />
          </label>
          <label>
            <FieldIcon title="Height" icon={<MoveVertical size={18} />} />
            <input
              type="number"
              min={customUnit === "in" ? "0.4" : "10"}
              step={customUnit === "in" ? "0.01" : "0.1"}
              value={customHeightValue}
              onChange={(event) => updateCustomSize("heightMm", Number(event.target.value))}
            />
          </label>
        </>
      )}
      <label>
        <FieldIcon title="Thickness" icon={<Layers size={18} />} />
        <input
          type="number"
          min="0.8"
          step="0.1"
          value={props.design.thicknessMm}
          onChange={(event) => props.updateDesign((current) => ({ ...current, thicknessMm: Number(event.target.value) }))}
        />
      </label>
      <label>
        <FieldIcon title="Nozzle" icon={<Ruler size={18} />} />
        <input
          type="number"
          min="0.2"
          max="1"
          step="0.05"
          value={printSettings.nozzleDiameterMm}
          onChange={(event) => props.updateDesign((current) => ({ ...current, nozzleDiameterMm: Number(event.target.value) }))}
        />
      </label>
      <label>
        <FieldIcon title="Tolerance" icon={<MoveHorizontal size={18} />} />
        <input
          type="number"
          min="0"
          step="0.05"
          value={printSettings.toleranceMm}
          onChange={(event) => props.updateDesign((current) => ({ ...current, toleranceMm: Number(event.target.value) }))}
        />
      </label>
      <div className="warnings wide">
        {props.warnings.length === 0 ? (
          <span>Printability checks are clear.</span>
        ) : (
          props.warnings.map((warning) => (
            <span key={warning.id} className={warning.severity}>
              {warning.message}
            </span>
          ))
        )}
      </div>
      <p className="status wide">{props.status}</p>
    </div>
  );
}

function FieldIcon(props: { title: string; icon: React.ReactNode }) {
  return (
    <span className="field-icon" title={props.title} aria-label={props.title}>
      {props.icon}
    </span>
  );
}

function FontSizeIcon() {
  return (
    <span className="font-size-icon" aria-hidden="true">
      <span>A</span>
      <strong>A</strong>
    </span>
  );
}

function QrIcon() {
  const matrix = createQrMatrix("https://github.com/OmegaGiven");
  return (
    <span className="qr-icon" style={{ gridTemplateColumns: `repeat(${matrix.size}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: matrix.size * matrix.size }, (_, index) => (
        <span
          key={index}
          className={matrix.modules.some((module) => module.row === Math.floor(index / matrix.size) && module.col === index % matrix.size) ? "on" : ""}
        />
      ))}
    </span>
  );
}

function GuideDialog(props: { close: () => void }) {
  return (
    <div className="guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="guide-panel">
        <div className="guide-header">
          <h2 id="guide-title">Editor Guide</h2>
          <button title="Close guide" aria-label="Close guide" onClick={props.close}>
            <X size={18} />
          </button>
        </div>
        <div className="guide-grid">
          <GuideItem icon={<Undo2 size={18} />} title="Undo" text="Step back through design edits." />
          <GuideItem icon={<Redo2 size={18} />} title="Redo" text="Restore edits after undo." />
          <GuideItem icon={<FilePlus2 size={18} />} title="New card" text="Clear the card and start fresh." />
          <GuideItem icon={<ZoomOut size={18} />} title="Zoom out" text="Make the editor canvas smaller." />
          <GuideItem icon={<ZoomIn size={18} />} title="Zoom in" text="Inspect and place details more closely." />
          <GuideItem icon={<Type size={18} />} title="Text" text="Add text. Double tap text to edit it." />
          <GuideItem icon={<MoveHorizontal size={18} />} title="Move" text="Tap to select, then drag to move an element. Drag empty space to pan when zoomed in." />
          <GuideItem icon={<QrIcon />} title="QR" text="Add a live QR code." />
          <GuideItem icon={<Image size={18} />} title="SVG" text="Import a simple SVG logo path." />
          <GuideItem icon={<Save size={18} />} title="Save" text="Save the design locally in this browser." />
          <GuideItem icon={<Download size={18} />} title="Export" text="Open STL, PDF, SVG, and PNG options." />
        </div>
      </div>
    </div>
  );
}

function GuideItem(props: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="guide-item">
      <span>{props.icon}</span>
      <div>
        <strong>{props.title}</strong>
        <p>{props.text}</p>
      </div>
    </div>
  );
}

function IconButton(props: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="icon-button" title={props.label} aria-label={props.label} onClick={props.onClick} disabled={props.disabled}>
      {props.icon}
    </button>
  );
}

type PersistedDesign = Partial<Design> & {
  sides?: {
    front?: CardSide;
  };
};

function migrateFrontOnly(design: PersistedDesign): Design {
  if (design.side) {
    return design as Design;
  }
  return {
    ...design,
    side: design.sides?.front ?? createInitialDesign().side,
  } as Design;
}

function isElementFullyOffCard(element: CardElement, xMm: number, yMm: number, design: Design) {
  const cardSize = getCardSize(design);
  const elementSize = getElementSize(element);
  return (
    xMm + elementSize.widthMm < 0 ||
    yMm + elementSize.heightMm < 0 ||
    xMm > cardSize.widthMm ||
    yMm > cardSize.heightMm
  );
}
