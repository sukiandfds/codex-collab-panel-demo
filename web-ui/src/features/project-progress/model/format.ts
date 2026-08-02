export const formatProgressTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "未记录";
  const currentYear = new Date().getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (date.getFullYear() !== currentYear) options.year = "numeric";
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
};

export const splitDetailParagraphs = (value: string) => value
  .split(/\n\s*\n/)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);
