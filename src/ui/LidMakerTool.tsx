import { ReactNode, useMemo, useState } from "react";
import { Box, Circle, Download, MoveHorizontal, MoveVertical, Ruler, Square } from "lucide-react";
import { downloadText, safeName } from "../lib/export2d";
import { createInitialLidDesign, LidDesign, lidSizeLabel, lidToAsciiStl, lidToStep } from "../lib/lid";
import { inchesToMm, mmToInches } from "../shared/design";
import { LidPreview } from "./LidPreview";

export function LidMakerTool() {
  const [lid, setLid] = useState<LidDesign>(() => createInitialLidDesign());
  const [unit, setUnit] = useState<"mm" | "in">("mm");
  const [status, setStatus] = useState("");
  const warnings = useMemo(() => validateLid(lid), [lid]);
  const fitDimensionLabel = lid.fit === "outer" ? "Object outer" : "Opening inner";

  function updateLid(patch: Partial<LidDesign>) {
    setLid((current) => ({ ...current, ...patch }));
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
      setStatus(`Fix ${errors.length} lid setting${errors.length === 1 ? "" : "s"} before STL export.`);
      return;
    }

    downloadText(`${safeName(lid.name)}.stl`, lidToAsciiStl(lid), "model/stl");
    setStatus("STL downloaded.");
  }

  function exportStep() {
    const errors = warnings.filter((warning) => warning.severity === "error");
    if (errors.length > 0) {
      setStatus(`Fix ${errors.length} lid setting${errors.length === 1 ? "" : "s"} before STEP export.`);
      return;
    }

    downloadText(`${safeName(lid.name)}.step`, lidToStep(lid), "model/step");
    setStatus("STEP downloaded.");
  }

  return (
    <section className="lid-tool">
      <div className="lid-header">
        <input className="name-input light" value={lid.name} aria-label="Lid name" onChange={(event) => updateLid({ name: event.target.value })} />
        <div className="segmented" aria-label="Lid shape">
          <button className={lid.shape === "round" ? "active" : ""} title="Circular lid" aria-label="Circular lid" onClick={() => updateLid({ shape: "round" })}>
            <Circle size={18} />
            <span>Round</span>
          </button>
          <button className={lid.shape === "square" ? "active" : ""} title="Square lid" aria-label="Square lid" onClick={() => updateLid({ shape: "square" })}>
            <Square size={18} />
            <span>Square</span>
          </button>
        </div>
      </div>

      <div className="lid-preview-panel">
        <LidPreview design={lid} />
        <span>{lidSizeLabel(lid)}</span>
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
          <FieldLabel icon={<Box size={18} />} title="Fit" />
          <select value={lid.fit} onChange={(event) => updateLid({ fit: event.target.value as LidDesign["fit"] })}>
            <option value="inner">Inner lid</option>
            <option value="outer">Outer lid</option>
          </select>
        </label>

        {lid.shape === "round" ? (
          <label>
            <FieldLabel icon={<Circle size={18} />} title={`${fitDimensionLabel} diameter`} />
            <input
              type="number"
              min={unit === "in" ? "0.4" : "10"}
              step={unit === "in" ? "0.01" : "0.5"}
              value={displayMm(lid.diameterMm)}
              onChange={(event) => updateLid({ diameterMm: inputToMm(Number(event.target.value)) })}
            />
          </label>
        ) : (
          <>
            <label>
              <FieldLabel icon={<MoveHorizontal size={18} />} title={`${fitDimensionLabel} X`} />
              <input
                type="number"
                min={unit === "in" ? "0.4" : "10"}
                step={unit === "in" ? "0.01" : "0.5"}
                value={displayMm(lid.widthMm)}
                onChange={(event) => updateLid({ widthMm: inputToMm(Number(event.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel icon={<MoveVertical size={18} />} title={`${fitDimensionLabel} Y`} />
              <input
                type="number"
                min={unit === "in" ? "0.4" : "10"}
                step={unit === "in" ? "0.01" : "0.5"}
                value={displayMm(lid.heightMm)}
                onChange={(event) => updateLid({ heightMm: inputToMm(Number(event.target.value)) })}
              />
            </label>
          </>
        )}

        <label>
          <FieldLabel icon={<Box size={18} />} title="Top thickness" />
          <input type="number" min="0.8" step="0.1" value={lid.thicknessMm} onChange={(event) => updateLid({ thicknessMm: Number(event.target.value) })} />
        </label>
        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Lip height" />
          <input type="number" min="0" step="0.5" value={lid.rimHeightMm} onChange={(event) => updateLid({ rimHeightMm: Number(event.target.value) })} />
        </label>
        <label>
          <FieldLabel icon={<MoveHorizontal size={18} />} title="Lip wall" />
          <input type="number" min="0.4" step="0.1" value={lid.rimWallMm} onChange={(event) => updateLid({ rimWallMm: Number(event.target.value) })} />
        </label>
        <label>
          <FieldLabel icon={<MoveVertical size={18} />} title="Lip inset" />
          <input type="number" min="0" step="0.1" value={lid.rimInsetMm} onChange={(event) => updateLid({ rimInsetMm: Number(event.target.value) })} />
        </label>
        <label>
          <FieldLabel icon={<Ruler size={18} />} title="Nozzle" />
          <input type="number" min="0.2" max="1" step="0.05" value={lid.nozzleDiameterMm} onChange={(event) => updateLid({ nozzleDiameterMm: Number(event.target.value) })} />
        </label>
        <label>
          <FieldLabel icon={<MoveHorizontal size={18} />} title="Tolerance" />
          <input type="number" min="0" step="0.05" value={lid.toleranceMm} onChange={(event) => updateLid({ toleranceMm: Number(event.target.value) })} />
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
          <span>Lid geometry checks are clear.</span>
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

function validateLid(lid: LidDesign) {
  const warnings: Array<{ id: string; severity: "warning" | "error"; message: string }> = [];
  const minBody = lid.shape === "round" ? lid.diameterMm : Math.min(lid.widthMm, lid.heightMm);
  if (minBody < 10) {
    warnings.push({ id: "size", severity: "error", message: "The lid body needs to be at least 10mm across." });
  }
  if (lid.thicknessMm < 0.8) {
    warnings.push({ id: "thickness", severity: "error", message: "Top thickness should be at least 0.8mm." });
  }
  if (lid.rimWallMm < 0.8) {
    warnings.push({ id: "rim-wall", severity: "warning", message: "Rim walls under 0.8mm may be fragile on common FDM printers." });
  }
  if (lid.rimWallMm < lid.nozzleDiameterMm * 2) {
    warnings.push({ id: "rim-nozzle", severity: "warning", message: `Lip wall is less than two nozzle widths for a ${lid.nozzleDiameterMm}mm nozzle.` });
  }
  if (lid.rimInsetMm > 0 && lid.rimInsetMm < lid.nozzleDiameterMm) {
    warnings.push({ id: "rim-inset", severity: "warning", message: "Lip inset is smaller than the nozzle diameter and may not slice cleanly." });
  }
  if (lid.fit === "inner" && lid.rimInsetMm + lid.rimWallMm >= minBody / 2) {
    warnings.push({ id: "rim-fit", severity: "error", message: "Rim inset and wall are too large for this lid size." });
  }
  return warnings;
}
