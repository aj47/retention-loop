// Fixed-locale date formatting so server and client render identical text.
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export const fmtDateTime = (d: Date | string) => dateTime.format(new Date(d));
export const fmtTime = (d: Date | string) => time.format(new Date(d));
export const fmtDate = (d: Date | string) => date.format(new Date(d));
