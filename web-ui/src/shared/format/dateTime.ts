type DateValue = string | null | undefined;

const formatters = {
  clock: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  compact: new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  dateKey: new Intl.DateTimeFormat("zh-CN"),
  dayLabel: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }),
  recorded: new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }),
  recordedWithYear: new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }),
};

const parseDate = (value: DateValue) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const pad = (value: number) => String(value).padStart(2, "0");
const format = (value: DateValue, formatter: Intl.DateTimeFormat) => {
  const date = parseDate(value);
  return date ? formatter.format(date) : "";
};

export const formatConversationTimestamp = (value: DateValue) => {
  const date = parseDate(value);
  if (!date) return "";
  const monthDayTime = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return date.getFullYear() === new Date().getFullYear() ? monthDayTime : `${date.getFullYear()}-${monthDayTime}`;
};

export const formatClockTime = (value: DateValue) => {
  return format(value, formatters.clock);
};

export const localDateKey = (value: DateValue) => format(value, formatters.dateKey);

export const formatDayLabel = (value: DateValue) => {
  const date = parseDate(value);
  if (!date) return "";
  return localDateKey(value) === localDateKey(new Date().toISOString()) ? "今天" : formatters.dayLabel.format(date);
};

export const formatCompactTimestamp = (value: DateValue) => format(value, formatters.compact);

export const formatRecordedTimestamp = (value: DateValue) => {
  const date = parseDate(value);
  if (!date) return value || "未记录";
  return formatters[date.getFullYear() === new Date().getFullYear() ? "recorded" : "recordedWithYear"].format(date);
};
