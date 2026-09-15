import { Blocked } from "../../domain/util.js";

/** Scope switches precede a literal delimiter so text cannot become CLI options. */
export function scopedWindowsArguments(
  handle: string,
  command: string[],
): string[] {
  if (!/^[1-9][0-9]{0,18}$/.test(handle) || !command[0])
    throw new Blocked("DESKTOP_ARGUMENTS", "Ventana o comando no válido");
  return ["ui", command[0], "-w", handle, "--json", ...command.slice(1)];
}
export function literalDesktopCommand(
  tool: "desktop_type" | "desktop_set_value",
  selector: string,
  value: string,
): string[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(selector) || /\0/.test(value))
    throw new Blocked("DESKTOP_ARGUMENTS", "Referencia o texto no válido");
  return tool === "desktop_set_value"
    ? ["set-value", selector, "--", value]
    : [
        "send-keys",
        "--verbatim",
        "--target",
        selector,
        "--via",
        "send-input",
        "--",
        value,
      ];
}
