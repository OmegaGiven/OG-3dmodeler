import { ReactNode, useMemo, useState } from "react";
import { Circle, Download, MoveVertical, Ruler } from "lucide-react";
import { downloadText, safeName } from "../lib/export2d";
import {
  createDrywallPlugGeometries,
  createInitialDrywallPlugDesign,
  DrywallPlugDesign,
  drywallPlugSizeLabel,
  drywallPlugToAsciiStl,
  drywallPlugToStep,
  validateDrywallPlug,
} from "../lib/drywallPlug";
import { inchesToMm, mmToInches } from "../shared/design";
import { GeometryPreview } from "./GeometryPreview";
import { TemplateActions } from "./TemplateActions";

export function DrywallPlugTool() {
  const [plug, setPlug] = useState<DrywallPlugDesign>(() => createInitialDrywallPlugDesign());
  const [unit, setUnit] = useState<"mm" | "in">("mm");
  const [status, setStatus] = useState("");
  const warnings = useMemo(() => validateDrywallPlug(plug), [plug]);

  function updatePlug(patch: Partial<DrywallPlugDesign>) {
    setPlug((current) => ({ ...current, ...patch }));
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
    downloadText(`${safeName(plug.name)}.stl`, drywallPlugToAsciiStl(plug), "model/stl");
    setStatus("STL downloaded.");
  }

  function exportStep() {
    const errors = warnings.filter((w) => w.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} setting${errors.length === 1 ? "" : "s"} before STEP export.`);
      return;
    }
    downloadText(`${safeName(plug.name)}.step`, drywallPlugToStep(plug), "model/step");
    setStatus("STEP downloaded.");
  }

  const minStep = unit === "in" ? "0.01" : "0.5";

  return (
    <section className="lid-tool">
      <div className="lid-header">
        <input
          className="name-input light"
          value={plug.name}
          aria-label="Drywall plug name"
          onChange={(e) => updatePlug({ name: e.target.value })}
        />
      </div>

      <div className="lid-preview-panel">
        <GeometryPreview
          ariaLabel="3D drywall plug preview"
          maxDimension={plug.coverDiameterMm}
          createGeometries={() => createDrywallPlugGeometries(plug)}
          color="#7a8c5a"
        />
        <span>{drywallPlugSizeLabel(plug)}</span>
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
          <FieldLabel icon={<Circle size={18} />} title="Cover diameter" />
          <input
            type="number"
            min={minStep}
            step={minStep}
            value={displayMm(plug.coverDiameterMm)}
            onChange={(e) => updatePlug({ coverDiameterMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<Circle size={18} />} title="Hole diameter" />
          <input
            type="number"
            min={minStep}
            step={minStep}
            value={displayMm(plug.holeDiameterMm)}
            onChange={(e) => updatePlug({ holeDiameterMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Drywall thickness" />
          <input
            type="number"
            min={minStep}
            step={minStep}
            value={displayMm(plug.drywallThicknessMm)}
            onChange={(e) => updatePlug({ drywallThicknessMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Disk thickness" />
          <input
            type="number"
            min={minStep}
            step={minStep}
            value={displayMm(plug.diskThicknessMm)}
            onChange={(e) => updatePlug({ diskThicknessMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Clip width" />
          <input
            type="number"
            min={minStep}
            step={minStep}
            value={displayMm(plug.clipWidthMm)}
            onChange={(e) => updatePlug({ clipWidthMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Barb length" />
          <input
            type="number"
            min={minStep}
            step={minStep}
            value={displayMm(plug.barbLengthMm)}
            onChange={(e) => updatePlug({ barbLengthMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Barb protrusion" />
          <input
            type="number"
            min="0"
            step={minStep}
            value={displayMm(plug.barbProtrusionMm)}
            onChange={(e) => updatePlug({ barbProtrusionMm: inputToMm(Number(e.target.value)) })}
          />
        </label>

        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Nozzle" />
          <input
            type="number"
            min="0.2"
            max="1"
            step="0.05"
            value={plug.nozzleDiameterMm}
            onChange={(e) => updatePlug({ nozzleDiameterMm: Number(e.target.value) })}
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
          kind="og-3dmodeler-drywall-plug"
          design={plug}
          base={createInitialDrywallPlugDesign()}
          onLoad={setPlug}
          onStatus={setStatus}
        />
      </div>

      <div className="export-warnings">
        {warnings.length === 0 ? (
          <span>Drywall plug geometry checks are clear.</span>
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
