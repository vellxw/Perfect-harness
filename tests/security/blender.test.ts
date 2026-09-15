import test from "node:test";
import assert from "node:assert/strict";
import {
  BlenderSpecSchema,
  validateGlb,
} from "../../src/adapters/blender/validation.js";
function glb(json: unknown) {
  let raw = Buffer.from(JSON.stringify(json));
  while (raw.length % 4) raw = Buffer.concat([raw, Buffer.from(" ")]);
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + raw.length, 8);
  header.writeUInt32LE(raw.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, raw]);
}
test("Blender spec and GLB reject corrupt, empty and external resources", () => {
  assert.throws(() => validateGlb(Buffer.from("pretend.glb")), /GLB_INVALID/);
  assert.throws(
    () =>
      validateGlb(glb({ asset: { version: "2.0" }, scenes: [{}], meshes: [] })),
    /GLB_EMPTY/,
  );
  assert.throws(
    () =>
      validateGlb(
        glb({
          asset: { version: "2.0" },
          scenes: [{}],
          meshes: [{}],
          images: [{ uri: "file:///secret" }],
        }),
      ),
    /GLB_EXTERNAL/,
  );
  assert.throws(
    () =>
      validateGlb(
        glb({
          asset: { version: "2.0" },
          scenes: [{}],
          meshes: [{}],
          buffers: [{ byteLength: 999999 }],
        }),
      ),
    /GLB_BUFFER/,
  );
  assert.throws(() =>
    BlenderSpecSchema.parse({
      script: "scene.py",
      sourceFile: "../outside.blend",
    }),
  );
  assert.throws(() =>
    BlenderSpecSchema.parse({ script: "scene.py", width: 99999 }),
  );
});
