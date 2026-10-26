// The masthead's date line ("-# 2026-10-20") is typed by hand while drafting, so it can easily
// be stale by the time an issue goes out. On the real send, Pando rewrites it to the actual send
// date (Taipei calendar day) and saves that into the campaign, so the email, the /p web page and
// the danbenson.me archive all show the day it was really sent. Test sends show the same stamped
// date (without saving) so a test looks exactly like the real thing.
//
// Only the FIRST line that is exactly "-# YYYY-MM-DD" is touched; any other dates in the body
// are left alone. No such line → nothing changes.

const DATE_LINE = /^-#[ \t]+\d{4}-\d{2}-\d{2}[ \t]*$/m;

export function todayInTaipei(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function stampSendDate(markdown: string, date = todayInTaipei()): string {
  return markdown.replace(DATE_LINE, `-# ${date}`);
}

export function hasDateLine(markdown: string): boolean {
  return DATE_LINE.test(markdown);
}
