"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import Editor, { type EditorHandle } from "@/components/Editor";
import Preview from "@/components/Preview";
import ImageUploadButton from "@/components/ImageUploadButton";
import GalleryUploadButton from "@/components/GalleryUploadButton";

interface Template {
  id: string;
  name: string;
  markdownBody: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
}

export default function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const editorRef = useRef<EditorHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    fetch(`/api/admin/templates/${id}`)
      .then((r) => r.json())
      .then((row: Template) => {
        setTemplate(row);
        setName(row.name);
        setMarkdown(row.markdownBody);
        setHeroImageUrl(row.heroImageUrl || "");
        loaded.current = true;
      });
  }, [id]);

  function scheduleSave(patch: Record<string, unknown>) {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/admin/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSaveState("saved");
    }, 800);
  }

  function handleNameChange(text: string) {
    setName(text);
    if (!loaded.current) return;
    scheduleSave({ name: text });
  }

  function handleMarkdownChange(text: string) {
    setMarkdown(text);
    if (!loaded.current) return;
    scheduleSave({ markdownBody: text });
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

  if (!template) {
    return <p className="p-6 text-sm text-[var(--muted)]">Loading…</p>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-2 border-b border-[var(--border)] flex gap-2 items-center">
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Template name"
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
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-[var(--border)] p-4 min-h-0 overflow-auto">
          <Editor ref={editorRef} value={markdown} onChange={handleMarkdownChange} />
        </div>
        <div className="w-1/2 overflow-auto p-6">
          <Preview markdown={markdown} heroImageUrl={heroImageUrl || undefined} heroImageAlt={template.heroImageAlt || undefined} />
        </div>
      </div>
    </div>
  );
}
