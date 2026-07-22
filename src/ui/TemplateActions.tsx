import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { downloadText, safeName } from "../lib/export2d";
import { parseDesignTemplate, serializeDesignTemplate } from "../lib/designTemplate";

export function TemplateActions<T extends { name: string }>(props: {
  kind: string;
  design: T;
  base: T;
  enums?: Partial<Record<keyof T, readonly string[]>>;
  onLoad: (design: T) => void;
  onStatus: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function download() {
    downloadText(`${safeName(props.design.name)}.json`, serializeDesignTemplate(props.kind, props.design), "application/json");
    props.onStatus("Template downloaded.");
  }

  function loadFile(file: File) {
    file
      .text()
      .then((text) => {
        try {
          props.onLoad(parseDesignTemplate(text, props.base, props.enums));
          props.onStatus(`Loaded template "${file.name}".`);
        } catch (error) {
          props.onStatus(error instanceof Error ? error.message : "Couldn't load that template.");
        }
      })
      .catch(() => props.onStatus("Couldn't read that file."));
  }

  return (
    <>
      <button onClick={download}>
        <Download size={20} />
        <span>Save template</span>
      </button>
      <button onClick={() => inputRef.current?.click()}>
        <Upload size={20} />
        <span>Load template</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) loadFile(file);
          event.target.value = "";
        }}
      />
    </>
  );
}
