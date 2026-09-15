import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ConfigSchema, defaultConfig } from "../src/config/schema.ts";
import { format } from "prettier";
for (const [path, value] of [
  ["perfect.config.example.json", defaultConfig()],
  ["perfect.config.schema.json", z.toJSONSchema(ConfigSchema)],
]) {
  const rendered = await format(JSON.stringify(value), { parser: "json" });
  if (process.argv.includes("--check")) {
    if ((await readFile(path, "utf8")) !== rendered)
      throw new Error(path + " is stale; run npm run generate:config");
  } else await writeFile(path, rendered);
}
