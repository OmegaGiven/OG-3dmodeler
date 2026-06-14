import { ReactNode, useMemo, useState } from "react";
import { Circle, Download, MoveVertical, Ruler } from "lucide-react";
import { downloadText, safeName } from "../lib/export2d";
import {
  createInitialWasherDesign,
  createWasherGeometry,
  WasherDesign,
  washerSizeLabel,
  washerToAsciiStl,
  washerToStep,
} from "../lib/washer";
import { inchesToMm, mmToInches } from "../shared/design";
import { GeometryPreview } from "./GeometryPreview";

export function WasherTool() {
  const [washer, setWasher] = useState<WasherDesign>(() => createInitialWasherDesign());
  const [unit, setUnit] = useState<"mm" | "in">("mm");
  const [status, setStatus] = useState("");
  const warnings = useMemo(() => validateWasher(washer), [washer]);

  function updateWasher(patch: Partial<WasherDesign>) {
    setWasher((current) => ({ ...current, ...patch }));
  }

  function displayMm(value: number) {
    return unit === "in" ? Number(mmToInches(value).toFixed(3)) : Number(value.toFixed(1));
  }

  function inputToMm(value: number) {
    return unit === "in" ? inchesToMm(value) : value;
  }

  function exportStl() {
    const errors = warnings.filter((warning) => warning.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} washer setting${errors.length === 1 ? "" : "s"} before STL export.`);
      return;
    }

    downloadText(`${safeName(washer.name)}.stl`, washerToAsciiStl(washer), "model/stl");
    setStatus("STL downloaded.");
  }

  function exportStep() {
    const errors = warnings.filter((warning) => warning.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} washer setting${errors.length === 1 ? "" : "s"} before STEP export.`);
      return;
    }

    downloadText(`${safeName(washer.name)}.step`, washerToStep(washer), "model/step");
    setStatus("STEP downloaded.");
  }

  return (
    <section className="lid-tool">
      <div className="lid-header">
        <input className="name-input light" value={washer.name} aria-label="Washer name" onChange={(event) => updateWasher({ name: event.target.value })} />
      </div>

      <div className="lid-preview-panel">
        <GeometryPreview
          ariaLabel="3D washer preview"
          maxDimension={washer.outerDiameterMm}
          createGeometries={() => [createWasherGeometry(washer)]}
          color="#5667a8"
        />
        <span>{washerSizeLabel(washer)}</span>
      </div>

      <div className="lid-controls">
        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Units" />
          <select value={unit} onChange={(event) => setUnit(event.target.value as "mm" | "in")}>
            <option value="mm">Millimeters</option>
            <option value="in">Inches</option>
          </select>
        </label>
        <label>
          <FieldLabel icon={<Circle size={18} />} title="Inner diameter" />
          <input
            type="number"
            min={unit === "in" ? "0.04" : "1"}
            step={unit === "in" ? "0.01" : "0.5"}
            value={displayMm(washer.innerDiameterMm)}
            onChange={(event) => updateWasher({ innerDiameterMm: inputToMm(Number(event.target.value)) })}
          />
        </label>
        <label>
          <FieldLabel icon={<Circle size={18} />} title="Outer diameter" />
          <input
            type="number"
            min={unit === "in" ? "0.08" : "2"}
            step={unit === "in" ? "0.01" : "0.5"}
            value={displayMm(washer.outerDiameterMm)}
            onChange={(event) => updateWasher({ outerDiameterMm: inputToMm(Number(event.target.value)) })}
          />
        </label>
        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Height" />
          <input
            type="number"
            min={unit === "in" ? "0.01" : "0.2"}
            step={unit === "in" ? "0.01" : "0.2"}
            value={displayMm(washer.heightMm)}
            onChange={(event) => updateWasher({ heightMm: inputToMm(Number(event.target.value)) })}
          />
        </label>
        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Nozzle" />
          <input
            type="number"
            min="0.2"
            max="1"
            step="0.05"
            value={washer.nozzleDiameterMm}
            onChange={(event) => updateWasher({ nozzleDiameterMm: Number(event.target.value) })}
          />
        </label>
        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Tolerance" />
          <input
            type="number"
            min="0"
            step="0.05"
            value={washer.toleranceMm}
            onChange={(event) => updateWasher({ toleranceMm: Number(event.target.value) })}
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
      </div>

      <div className="export-warnings">
        {warnings.length === 0 ? (
          <span>Washer geometry checks are clear.</span>
        ) : (
          warnings.map((warning) => (
            <span key={warning.id} className={warning.severity}>
              {warning.message}
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

function validateWasher(washer: WasherDesign) {
  const warnings: Array<{ id: string; severity: "warning" | "error"; message: string }> = [];
  if (washer.innerDiameterMm <= 0) {
    warnings.push({ id: "inner", severity: "error", message: "Inner diameter must be greater than 0mm." });
  }
  if (washer.outerDiameterMm <= washer.innerDiameterMm) {
    warnings.push({ id: "outer", severity: "error", message: "Outer diameter must be larger than inner diameter." });
  }
  if (washer.outerDiameterMm - washer.toleranceMm <= washer.innerDiameterMm + washer.toleranceMm) {
    warnings.push({ id: "tolerance-fit", severity: "error", message: "Tolerance leaves no printable washer wall between inner and outer diameters." });
  }
  if (washer.heightMm < 0.2) {
    warnings.push({ id: "height", severity: "error", message: "Height must be at least 0.2mm." });
  }
  if (washer.innerDiameterMm < washer.nozzleDiameterMm) {
    warnings.push({ id: "hole-nozzle", severity: "warning", message: "Inner diameter is smaller than the nozzle diameter and may not print as a clean hole." });
  }
  if (washer.heightMm < washer.nozzleDiameterMm) {
    warnings.push({ id: "height-nozzle", severity: "warning", message: "Height is smaller than the nozzle diameter and may slice unpredictably." });
  }
  if ((washer.outerDiameterMm - washer.innerDiameterMm) / 2 < Math.max(0.8, washer.nozzleDiameterMm * 2)) {
    warnings.push({ id: "wall", severity: "warning", message: "Washer wall is under 0.8mm and may be fragile." });
  }
  return warnings;
}
