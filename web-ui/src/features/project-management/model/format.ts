export const formatProjectManagementTimestamp = (value: string | null) => {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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

export const splitProjectText = (value: string) => value
  .split(/\n\s*\n/u)
  .map((part) => part.trim())
  .filter(Boolean);
