import assert from "node:assert/strict";
import test from "node:test";
import { IntegrationActionSchema } from "../../src/integrations/actions.js";
import {
  DesktopSchemas,
  inspectedElements,
} from "../../src/integrations/desktop/session.js";
import { IntegrationSchema } from "../../src/integrations/types.js";

test("escritorio solo admite referencias observadas y teclas limitadas, sin coordenadas arbitrarias", () => {
  assert.equal(
    DesktopSchemas.desktop_click.safeParse({ x: 0, y: 0 }).success,
    false,
  );
  assert.equal(
    DesktopSchemas.desktop_key.safeParse({
      snapshot: "21b34e15-e02f-4e3d-a3d0-b2e7c6b876d4",
      ref: "e0",
      key: "win+r",
    }).success,
    false,
  );
  assert.equal(
    DesktopSchemas.desktop_type.safeParse({
      snapshot: "21b34e15-e02f-4e3d-a3d0-b2e7c6b876d4",
      ref: "e0",
      value: "texto",
      window: "999",
    }).success,
    false,
  );
});
test("captura de escritorio rechaza diálogos u otras ventanas y elimina campos privados", () => {
  assert.throws(
    () => inspectedElements({ windows: [{ hwnd: 2, elements: [] }] }, "1"),
    /DESKTOP_CAPTURE_SCOPE/,
  );
  assert.throws(() =>
    inspectedElements(
      {
        windows: [
          { hwnd: 1, elements: [] },
          { hwnd: 2, elements: [] },
        ],
      },
      "1",
    ),
  );
  assert.equal(
    inspectedElements(
      {
        windows: [
          {
            hwnd: 1,
            elements: [
              { selector: "Password", type: "Edit", isPassword: true },
              {
                selector: "Save",
                type: "Button",
                name: "Guardar",
                isEnabled: true,
              },
            ],
          },
        ],
      },
      "1",
    ).length,
    1,
  );
});
test("administración no acepta confirmaciones inventadas ni amplía un permiso por omisión", () => {
  assert.equal(
    IntegrationActionSchema.safeParse({
      command: "window",
      handle: "1",
      hash: "12345678",
      confirmation: "YES",
    }).success,
    false,
  );
  assert.equal(
    IntegrationActionSchema.safeParse({
      command: "approve",
      id: "op",
      digest: "12345678",
      confirmation: "AUTORIZAR",
      tool: "another",
    }).success,
    false,
  );
  assert.equal(
    IntegrationSchema.parse({
      id: "windows",
      title: "Windows",
      kind: "desktop",
      roles: ["general"],
    }).enabled,
    false,
  );
});
