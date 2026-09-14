export const glass = {
  void: "#050507",
  surface: "#0B0E14",
  raised: "#131823",
  focused: "#1A2030",
  border: "#343C4F",
  edge: "#6D7690",
  text: "#F5F5F7",
  secondary: "#ADB6CA",
  muted: "#7C879F",
  accent: "#9AAEFF",
  highlight: "#D4DCFF",
  success: "#8CDBAF",
  warning: "#EAC487",
  danger: "#FF91A0",
} as const;
export const roles: Record<string, { name: string; color: string }> = {
  planner: { name: "Planner", color: "#A7DCCC" },
  frontend: { name: "Muse", color: "#BAA9FF" },
  backend: { name: "Astra", color: "#93BBFF" },
  oracle: { name: "Oracle", color: "#EAC487" },
  general: { name: "Worker", color: "#ADB6CA" },
  integrator: { name: "Integrator", color: "#A9C9DB" },
  visual: { name: "Visual review", color: "#EAC487" },
};
export function stateIcon(state: string, ascii = false): string {
  if (ascii)
    return ["completed", "passed", "accepted", "DONE"].includes(state)
      ? "+"
      : /fail|error/i.test(state)
        ? "!"
        : /running|EXECUTE|REPAIR|VERIFY/.test(state)
          ? ">"
          : "-";
  return ["completed", "passed", "accepted", "DONE"].includes(state)
    ? "✓"
    : /fail|error/i.test(state)
      ? "!"
      : /block|PAUSED/i.test(state)
        ? "◆"
        : /running|EXECUTE|REPAIR|VERIFY/.test(state)
          ? "◌"
          : "○";
}
export function stateColor(state: string): string {
  return ["completed", "passed", "accepted", "DONE"].includes(state)
    ? glass.success
    : /fail|error/i.test(state)
      ? glass.danger
      : /block|PAUSED|repair/i.test(state)
        ? glass.warning
        : /running|EXECUTE|VERIFY/.test(state)
          ? glass.accent
          : glass.muted;
}
