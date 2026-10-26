import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, templates } from "@/lib/schema";
import { deriveTitle } from "@/lib/markdown/parse";

export async function GET() {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Duplicating an existing campaign (draft or sent) — copies its content into a brand-new
  // draft. Images are shared by URL, which is safe: deleteOrphanedImages() only removes an
  // image once no campaign or template references it anymore.
  if (typeof body.duplicateOf === "string") {
    const [source] = await db.select().from(campaigns).where(eq(campaigns.id, body.duplicateOf));
    if (!source) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const [row] = await db
      .insert(campaigns)
      .values({
        title: `${source.title || "(untitled)"} (copy)`,
        subject: source.subject,
        preheader: source.preheader,
        markdownBody: source.markdownBody,
        heroImageUrl: source.heroImageUrl,
        heroImageAlt: source.heroImageAlt,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  }

  // Creating "from a template" copies its content in as a one-time starting point —
  // there's no ongoing link, so editing the template later never touches this campaign.
  if (typeof body.templateId === "string") {
    const [template] = await db.select().from(templates).where(eq(templates.id, body.templateId));
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    const [row] = await db
      .insert(campaigns)
      .values({
        title: deriveTitle(template.markdownBody) || template.name,
        markdownBody: template.markdownBody,
        heroImageUrl: template.heroImageUrl,
        heroImageAlt: template.heroImageAlt,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  }

  const [row] = await db
    .insert(campaigns)
    .values({
      title: body.title ?? "",
      subject: body.subject ?? "",
      markdownBody: body.markdownBody ?? "",
      heroImageUrl: typeof body.heroImageUrl === "string" ? body.heroImageUrl : null,
      heroImageAlt: typeof body.heroImageAlt === "string" ? body.heroImageAlt : null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
