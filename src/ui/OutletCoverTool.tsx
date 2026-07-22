import { ReactNode, useMemo, useState } from "react";
import { Circle, Download, MoveHorizontal, MoveVertical, Ruler, Square } from "lucide-react";
import { downloadText, safeName } from "../lib/export2d";
import {
  BevelType,
  createInitialOutletCoverDesign,
  createOutletCoverGeometries,
  OutletCoverDesign,
  outletCoverSizeLabel,
  outletCoverToAsciiStl,
  outletCoverToStep,
  outletCoverTotalSize,
  switchOutletType,
  validateOutletCover,
} from "../lib/outletCover";
import { inchesToMm, mmToInches } from "../shared/design";
import { GeometryPreview } from "./GeometryPreview";
import { TemplateActions } from "./TemplateActions";

export function OutletCoverTool() {
  const [cover, setCover] = useState<OutletCoverDesign>(() => createInitialOutletCoverDesign());
  const [unit, setUnit] = useState<"mm" | "in">("mm");
  const [status, setStatus] = useState("");
  const warnings = useMemo(() => validateOutletCover(cover), [cover]);

  function updateCover(patch: Partial<OutletCoverDesign>) {
    setCover((current) => ({ ...current, ...patch }));
  }

  function displayMm(value: number) {
    return unit === "in" ? Number(mmToInches(value).toFixed(3)) : Number(value.toFixed(1));
  }

  function inputToMm(value: number) {
    return unit === "in" ? inchesToMm(value) : value;
  }

  function exportStl() {
    const errors = warnings.filter((w) => w.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} setting${errors.length === 1 ? "" : "s"} before STL export.`);
      return;
    }
    downloadText(`${safeName(cover.name)}.stl`, outletCoverToAsciiStl(cover), "model/stl");
    setStatus("STL downloaded.");
  }

  function exportStep() {
    const errors = warnings.filter((w) => w.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} setting${errors.length === 1 ? "" : "s"} before STEP export.`);
      return;
    }
    downloadText(`${safeName(cover.name)}.step`, outletCoverToStep(cover), "model/step");
    setStatus("STEP downloaded.");
  }

  const { widthMm, heightMm } = outletCoverTotalSize(cover);
  const maxDim = Math.max(widthMm, heightMm);
  const minStep = unit === "in" ? "0.01" : "0.5";
  const minSmall = unit === "in" ? "0.04" : "1";

  return (
    <section className="lid-tool">
      <div className="lid-header">
        <input
          className="name-input light"
          value={cover.name}
          aria-label="Cover name"
          onChange={(e) => updateCover({ name: e.target.value })}
        />
        <div className="segmented" aria-label="Outlet type">
          <button
            className={cover.outletType === "duplex" ? "active" : ""}
            title="Traditional duplex — two oval openings"
            aria-label="Duplex outlet type"
            onClick={() => setCover((c) => switchOutletType(c, "duplex"))}
          >
            <Circle size={18} />
            <span>Duplex</span>
          </button>
          <button
            className={cover.outletType === "decora" ? "active" : ""}
            title="Decora style — single rectangular opening"
            aria-label="Decora outlet type"
            onClick={() => setCover((c) => switchOutletType(c, "decora"))}
          >
            <Square size={18} />
            <span>Decora</span>
          </button>
        </div>
      </div>

      <div className="lid-preview-panel">
        <GeometryPreview
          ariaLabel="3D outlet cover preview"
          maxDimension={maxDim}
          createGeometries={() => createOutletCoverGeometries(cover)}
          color="#c47a35"
        />
        <span>{outletCoverSizeLabel(cover)}</span>
      </div>

      <div className="lid-controls">
        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Units" />
          <select value={unit} onChange={(e) => setUnit(e.target.value as "mm" | "in")}>
            <option value="mm">Millimeters</option>
            <option value="in">Inches</option>
          </select>
        </label>

        <label>
          <FieldLabel icon={<MoveHorizontal size={18} />} title="Cutout width" />
          <input
            type="number"
            min={minSmall}
            step={minStep}
            value={displayMm(cover.cutoutWidthMm)}
            onChange={(e) => updateCover({ cutoutWidthMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Cutout height" />
          <input
            type="number"
            min={minSmall}
            step={minStep}
            value={displayMm(cover.cutoutHeightMm)}
            onChange={(e) => updateCover({ cutoutHeightMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        {cover.outletType === "duplex" && (
          <label>
            <FieldLabel icon={<MoveVertical size={18} />} title="Oval spacing" />
            <input
              type="number"
              min={minSmall}
              step={minStep}
              value={displayMm(cover.ovalSpacingMm)}
              onChange={(e) => updateCover({ ovalSpacingMm: inputToMm(Number(e.target.value)) })}
            />
          </label>
        )}

        {cover.outletType === "decora" && (
          <label>
            <FieldLabel icon={<Ruler size={18} />} title="Corner radius" />
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={displayMm(cover.cornerRadiusMm)}
              onChange={(e) => updateCover({ cornerRadiusMm: inputToMm(Number(e.target.value)) })}
            />
          </label>
        )}

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Top margin" />
          <input
            type="number"
            min={minSmall}
            step={minStep}
            value={displayMm(cover.marginTopMm)}
            onChange={(e) => updateCover({ marginTopMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Bottom margin" />
          <input
            type="number"
            min={minSmall}
            step={minStep}
            value={displayMm(cover.marginBottomMm)}
            onChange={(e) => updateCover({ marginBottomMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveHorizontal size={18} />} title="Left margin" />
          <input
            type="number"
            min={minSmall}
            step={minStep}
            value={displayMm(cover.marginLeftMm)}
            onChange={(e) => updateCover({ marginLeftMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveHorizontal size={18} />} title="Right margin" />
          <input
            type="number"
            min={minSmall}
            step={minStep}
            value={displayMm(cover.marginRightMm)}
            onChange={(e) => updateCover({ marginRightMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Wall depth" />
          <input
            type="number"
            min="0"
            step={minStep}
            value={displayMm(cover.depthMm)}
            onChange={(e) => updateCover({ depthMm: Math.max(0, inputToMm(Number(e.target.value))) })}
          />
        </label>

        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Edge bevel" />
          <select value={cover.bevelType} onChange={(e) => updateCover({ bevelType: e.target.value as BevelType })}>
            <option value="none">None</option>
            <option value="chamfer">Chamfer (straight)</option>
            <option value="fillet">Fillet (curved)</option>
          </select>
        </label>

        {cover.bevelType !== "none" && (
          <label>
            <FieldLabel icon={<Ruler size={18} />} title="Bevel size" />
            <input
              type="number"
              min="0.5"
              step={minStep}
              value={displayMm(cover.bevelSizeMm)}
              onChange={(e) => updateCover({ bevelSizeMm: inputToMm(Number(e.target.value)) })}
            />
          </label>
        )}

        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Plate thickness" />
          <input
            type="number"
            min={unit === "in" ? "0.03" : "0.8"}
            step={unit === "in" ? "0.01" : "0.2"}
            value={displayMm(cover.thicknessMm)}
            onChange={(e) => updateCover({ thicknessMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Screw hole" />
          <input
            type="number"
            min="1"
            step="0.1"
            value={displayMm(cover.screwHoleDiameterMm)}
            onChange={(e) => updateCover({ screwHoleDiameterMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Nozzle" />
          <input
            type="number"
            min="0.2"
            max="1"
            step="0.05"
            value={cover.nozzleDiameterMm}
            onChange={(e) => updateCover({ nozzleDiameterMm: Number(e.target.value) })}
          />
        </label>

        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Tolerance" />
          <input
            type="number"
            min="0"
            step="0.05"
            value={cover.toleranceMm}
            onChange={(e) => updateCover({ toleranceMm: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="lid-actions">
        <button onClick={exportStl}>
          <Download size={20} />
          <span>Export STL</span>
        </button>
        <button onClick={exportStep}>
          <Download size={20} />
          <span>Export STEP</span>
        </button>
        <TemplateActions
          kind="og-3dmodeler-outlet-cover"
          design={cover}
          base={createInitialOutletCoverDesign()}
          enums={{ outletType: ["duplex", "decora"], bevelType: ["none", "chamfer", "fillet"] }}
          onLoad={setCover}
          onStatus={setStatus}
        />
      </div>

      <div className="export-warnings">
        {warnings.length === 0 ? (
          <span>Cover geometry checks are clear.</span>
        ) : (
          warnings.map((w) => (
            <span key={w.id} className={w.severity}>
              {w.message}
            </span>
          ))
        )}
      </div>
      <p className="export-status">{status}</p>
    </section>
  );
}

function FieldLabel(props: { icon: ReactNode; title: string }) {
  return (
    <span className="field-icon lid-field-label" title={props.title} aria-label={props.title}>
      {props.icon}
      <span>{props.title}</span>
    </span>
  );
}
