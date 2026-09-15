import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Plate } from "./components.js";
import { glass as g } from "./theme/tokens.js";
import type { Motion } from "../../presentation/protocol.js";
export interface FormField {
  key: string;
  label: string;
  initial?: string;
  choices?: { value: string; label: string }[];
  hint?: string;
}
export interface FormSpec {
  title: string;
  fields: FormField[];
  submit: (values: Record<string, string>) => void;
}
/** A scroll-windowed keyboard form; no hidden controls at 80x24. */
export function GuidedForm({
  spec,
  width,
  height,
  motion,
  onCancel,
}: {
  spec: FormSpec;
  width: number;
  height: number;
  motion: Motion;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        spec.fields.map((f) => [
          f.key,
          f.initial ?? f.choices?.[0]?.value ?? "",
        ]),
      ),
    ),
    [selected, setSelected] = useState(0),
    [editing, setEditing] = useState(false),
    [error, setError] = useState("");
  const count = spec.fields.length + 1,
    maxRows = Math.max(2, Math.floor((height - 13) / 2)),
    start = Math.max(
      0,
      Math.min(selected - Math.floor(maxRows / 2), count - maxRows),
    );
  const save = () => {
    try {
      spec.submit(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const field = spec.fields[selected];
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      if (editing) setEditing(false);
      else onCancel();
      return;
    }
    if (editing) return;
    if (["up", "down", "tab"].includes(key.name)) {
      key.preventDefault();
      setSelected((n) =>
        Math.max(0, Math.min(count - 1, n + (key.name === "up" ? -1 : 1))),
      );
      setError("");
      return;
    }
    if (key.name === "left" || key.name === "right") {
      key.preventDefault();
      if (field?.choices) {
        const i = field.choices.findIndex((c) => c.value === values[field.key]),
          step = key.name === "right" ? 1 : -1,
          c =
            field.choices[
              (i + step + field.choices.length) % field.choices.length
            ]!;
        setValues((v) => ({ ...v, [field.key]: c.value }));
      }
      return;
    }
    if (key.name === "return") {
      key.preventDefault();
      if (!field) save();
      else if (field.choices) {
        const i = field.choices.findIndex((c) => c.value === values[field.key]);
        setValues((v) => ({
          ...v,
          [field.key]: field.choices![(i + 1) % field.choices!.length]!.value,
        }));
      } else setEditing(true);
    }
  });
  return (
    <Plate
      title={spec.title}
      width={width}
      height={height}
      motion={motion}
      footer="↑↓ campo · Enter editar/confirmar · ←→ opción · Esc volver"
    >
      {editing && field ? (
        <box flexDirection="column" gap={1}>
          <text fg={g.highlight}>{field.label}</text>
          <input
            key={field.key}
            focused
            value={values[field.key] ?? ""}
            onSubmit={(answer) => {
              if (typeof answer === "string") {
                setValues((v) => ({
                  ...v,
                  [field.key]: answer.slice(0, 8000),
                }));
                setEditing(false);
                setError("");
              }
            }}
          />
          <text maxHeight={3} fg={g.secondary}>
            {field.hint ??
              "Enter conserva este campo. La operación se confirma después de revisar."}
          </text>
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1}>
          {Array.from({ length: count }, (_, i) => i)
            .slice(start, start + maxRows)
            .map((i) => {
              const f = spec.fields[i];
              return (
                <box
                  key={f?.key ?? "submit"}
                  height={2}
                  flexShrink={0}
                  backgroundColor={i === selected ? g.focused : "transparent"}
                  flexDirection="column"
                >
                  <text height={1} fg={i === selected ? g.highlight : g.text}>
                    {i === selected ? "› " : "  "}
                    {f?.label ?? "Revisar y continuar"}
                  </text>
                  {f && (
                    <text height={1} fg={g.secondary}>
                      {(
                        f.choices?.find((c) => c.value === values[f.key])
                          ?.label ??
                        values[f.key] ??
                        "Vacío"
                      ).slice(0, Math.max(10, width - 14))}
                    </text>
                  )}
                </box>
              );
            })}
          <text fg={g.muted} height={1}>
            {selected + 1}/{count} ·{" "}
            {(
              field?.hint ?? "No se conceden permisos al modificar un campo."
            ).slice(0, Math.max(10, width - 20))}
          </text>
        </box>
      )}
      {error && (
        <text fg={g.danger} maxHeight={2}>
          {error}
        </text>
      )}
    </Plate>
  );
}
