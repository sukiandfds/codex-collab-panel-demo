export const splitParagraphs = (value: string) => value
  .split(/\n\s*\n/u)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);
