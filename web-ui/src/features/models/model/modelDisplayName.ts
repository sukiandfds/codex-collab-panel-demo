export function formatModelDisplayName(model: string, displayName = ""): string {
  const normalized = model.trim();
  const match = /^([a-z][a-z0-9]*)-(.+)$/iu.exec(normalized);
  if (!match) return displayName || normalized;

  const provider = match[1].toLowerCase() === "gpt"
    ? "GPT"
    : `${match[1].charAt(0).toUpperCase()}${match[1].slice(1).toLowerCase()}`;
  const suffix = match[2]
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${provider}-${suffix}`;
}
