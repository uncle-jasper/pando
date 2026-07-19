"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Editor, { type EditorHandle } from "@/components/Editor";
import Preview from "@/components/Preview";
import ImageUploadButton from "@/components/ImageUploadButton";
import GalleryUploadButton from "@/components/GalleryUploadButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusLine from "@/components/StatusLine";
import EmailPreviewModal from "@/components/EmailPreviewModal";

interface Campaign {
  id: string;
  title: string;
  subject: string;
  markdownBody: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  status: "draft" | "sending" | "sent";
}

export default function CampaignEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [subscribedCount, setSubscribedCount] = useState<number | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const editorRef = useRef<EditorHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates fields across calls so editing e.g. the title and then quickly the body
  // (each on its own scheduleSave call) doesn't cancel and drop the earlier field's save —
  // every pending field goes out together on whichever call's timer fires next.
  const pendingPatch = useRef<Record<string, unknown>>({});
  const loaded = useRef(false);

  useEffect(() => {
    fetch(`/api/admin/campaigns/${id}`)
      .then((r) => r.json())
      .then((row: Campaign) => {
        setCampaign(row);
        setMarkdown(row.markdownBody);
        setTitle(row.title);
        setSubject(row.subject);
        setHeroImageUrl(row.heroImageUrl || "");
        loaded.current = true;
      });
    fetch("/api/admin/subscribers")
      .then((r) => r.json())
      .then((rows: { status: string }[]) => {
        setSubscribedCount(rows.filter((r) => r.status === "subscribed").length);
      });
  }, [id]);

  function scheduleSave(patch: Record<string, unknown>) {
    Object.assign(pendingPatch.current, patch);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const toSend = pendingPatch.current;
      pendingPatch.current = {};
      await fetch(`/api/admin/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSend),
      });
      setSaveState("saved");
    }, 800);
  }

  function handleMarkdownChange(text: string) {
    setMarkdown(text);
    if (!loaded.current) return;
    scheduleSave({ markdownBody: text });
  }

  function handleSubjectChange(text: string) {
    setSubject(text);
    if (!loaded.current) return;
    scheduleSave({ subject: text });
  }

  function handleTitleChange(text: string) {
    setTitle(text);
    if (!loaded.current) return;
    scheduleSave({ title: text });
  }

  function handleHeroUploaded(url: string) {
    setHeroImageUrl(url);
    scheduleSave({ heroImageUrl: url });
  }

  function handleHeroRemove() {
    setHeroImageUrl("");
    scheduleSave({ heroImageUrl: null });
  }

  function handleImageInsert(url: string) {
    editorRef.current?.insertAtCursor(`![](${url})`);
  }

  function handleGalleryInsert(urls: string[]) {
    const block = `\n:::gallery\n${urls.map((u) => `![](${u})`).join("\n")}\n:::\n`;
    editorRef.current?.insertAtCursor(block);
  }

  async function handleOpenPreview() {
    // The preview route reads from the database, not in-memory state — flush any pending
    // debounced autosave first so the preview always reflects what's currently on screen.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      const toSend = pendingPatch.current;
      pendingPatch.current = {};
      await fetch(`/api/admin/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSend),
      });
      setSaveState("saved");
    }
    setShowPreview(true);
  }

  async function handleSendTest() {
    setTestStatus({ message: "sending test…", tone: "info" });
    const res = await fetch(`/api/admin/campaigns/${id}/send-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testEmail }),
    });
    if (res.ok) {
      setTestStatus({ message: "test sent ✓", tone: "success" });
    } else {
      const body = await res.json().catch(() => ({}));
      setTestStatus({ message: body.error || "test send failed.", tone: "error" });
    }
  }

  async function handleSendCampaign() {
    setConfirmSendOpen(false);
    setSending(true);
    setSendStatus({ message: "sending…", tone: "info" });
    const res = await fetch(`/api/admin/campaigns/${id}/send`, { method: "POST" });
    setSending(false);
    if (res.ok) {
      const body = await res.json();
      const message =
        body.remaining > 0
          ? `sent to ${body.sent} of ${body.total} so far — remaining ${body.remaining} will go out automatically over the next few days.`
          : `sent to ${body.sent} of ${body.total} recipients.`;
      setSendStatus({ message, tone: "success" });
      setTimeout(() => router.push("/admin/campaigns"), 2000);
    } else {
      const body = await res.json().catch(() => ({}));
      setSendStatus({ message: body.error || "send failed.", tone: "error" });
    }
  }

  if (!campaign) {
    return <p className="p-6 text-sm text-[var(--muted)]">Loading…</p>;
  }

  if (campaign.status !== "draft") {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--muted)]">
          This campaign has already been sent and can no longer be edited.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-2 border-b border-[var(--border)] flex gap-2 items-center">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Title (for your drafts list only)"
          className="flex-1 px-2 py-1 text-sm border border-[var(--border)] rounded bg-transparent"
        />
        <input
          value={subject}
          onChange={(e) => handleSubjectChange(e.target.value)}
          placeholder="Subject line"
          className="flex-1 px-2 py-1 text-sm border border-[var(--border)] rounded bg-transparent"
        />
        {heroImageUrl ? (
          <span className="flex items-center gap-2">
            <img src={heroImageUrl} alt="" className="h-8 w-14 object-cover rounded border border-[var(--border)]" />
            <button onClick={handleHeroRemove} className="text-xs text-[var(--muted)] hover:text-red-500">
              Remove hero
            </button>
          </span>
        ) : (
          <ImageUploadButton label="Add hero image" onUploaded={handleHeroUploaded} />
        )}
        <span className="text-xs text-[var(--muted)] w-16 text-right">
          {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : ""}
        </span>
      </div>
      <div className="p-2 border-b border-[var(--border)] flex gap-2 items-center flex-wrap">
        <button
          className="px-2 py-1 text-sm border border-[var(--border)] rounded"
          onClick={() => editorRef.current?.wrapSelection("**", "**")}
        >
          Bold
        </button>
        <button
          className="px-2 py-1 text-sm border border-[var(--border)] rounded"
          onClick={() => editorRef.current?.wrapSelection("*", "*")}
        >
          Italic
        </button>
        <button
          className="px-2 py-1 text-sm border border-[var(--border)] rounded"
          onClick={() => editorRef.current?.wrapSelection("[", "](url)")}
        >
          Link
        </button>
        <ImageUploadButton label="Insert image" onUploaded={handleImageInsert} />
        <GalleryUploadButton onUploaded={handleGalleryInsert} />
        <button onClick={handleOpenPreview} className="px-2 py-1 text-sm border border-[var(--border)] rounded">
          Preview email
        </button>

        <span className="flex-1" />

        <input
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="test recipient email"
          className="px-2 py-1 text-sm border border-[var(--border)] rounded bg-transparent w-48"
        />
        <button onClick={handleSendTest} className="px-2 py-1 text-sm border border-[var(--border)] rounded">
          Send test
        </button>
        <StatusLine message={testStatus?.message ?? null} tone={testStatus?.tone} />

        <button
          onClick={() => setConfirmSendOpen(true)}
          disabled={sending}
          className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send campaign"}
        </button>
        <StatusLine message={sendStatus?.message ?? null} tone={sendStatus?.tone} />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-[var(--border)] p-4 min-h-0 overflow-auto">
          <Editor ref={editorRef} value={markdown} onChange={handleMarkdownChange} />
        </div>
        <div className="w-1/2 overflow-auto p-6">
          <Preview markdown={markdown} heroImageUrl={heroImageUrl || undefined} heroImageAlt={campaign.heroImageAlt || undefined} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmSendOpen}
        message={`Send this campaign to ${subscribedCount ?? "…"} subscribed recipient${subscribedCount === 1 ? "" : "s"}? This cannot be undone.`}
        confirmLabel="Send"
        onConfirm={handleSendCampaign}
        onCancel={() => setConfirmSendOpen(false)}
      />

      {showPreview && <EmailPreviewModal campaignId={id} onClose={() => setShowPreview(false)} />}
    </div>
  );
}
