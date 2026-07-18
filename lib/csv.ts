// triggerDownload is forked verbatim (in spirit) from tree/index.html line 3557 —
// the same Blob + anchor download pattern, ported to TypeScript.
export function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

export interface ImportedSubscriber {
  email: string;
  name?: string;
}

// Accepts a CSV with an "email" column (required) and optional "name" column,
// in any order. Falls back to treating a headerless single-column file as emails.
export function parseSubscriberCsv(text: string): ImportedSubscriber[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const emailIdx = header.indexOf("email");
  const nameIdx = header.indexOf("name");

  const hasHeader = emailIdx !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const effectiveEmailIdx = hasHeader ? emailIdx : 0;
  const effectiveNameIdx = hasHeader ? nameIdx : -1;

  const results: ImportedSubscriber[] = [];
  for (const line of dataLines) {
    const fields = parseCsvLine(line);
    const email = fields[effectiveEmailIdx]?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const name = effectiveNameIdx !== -1 ? fields[effectiveNameIdx]?.trim() : undefined;
    results.push({ email, name: name || undefined });
  }
  return results;
}

export function subscribersToCsv(rows: { email: string; name: string | null; status: string; createdAt: string | Date }[]): string {
  const header = "email,name,status,created_at";
  const lines = rows.map((r) => {
    const created = new Date(r.createdAt).toISOString();
    const name = (r.name || "").replace(/"/g, '""');
    return `${r.email},"${name}",${r.status},${created}`;
  });
  return [header, ...lines].join("\n");
}
