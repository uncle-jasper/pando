"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import Editor, { type EditorHandle } from "@/components/Editor";
import Preview from "@/components/Preview";
import ImageUploadButton from "@/components/ImageUploadButton";
import GalleryUploadButton, { type UploadedImage } from "@/components/GalleryUploadButton";
import ImagePickerModal, { type PickedImage } from "@/components/ImagePickerModal";
import { resizeImageFile } from "@/lib/client-image-resize";
import type { GalleryDimensions } from "@/lib/markdown/parse";

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
  const [dimensions, setDimensions] = useState<GalleryDimensions>({});
  const [pickerTarget, setPickerTarget] = useState<"hero" | "inline" | "gallery" | null>(null);
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
    fetch("/api/admin/images")
      .then((r) => r.json())
      .then((rows: { url: string; width: number | null; height: number | null }[]) => {
        mergeDimensions(rows);
      });
  }, [id]);

  function mergeDimensions(imgs: { url: string; width: number | null; height: number | null }[]) {
    const additions: GalleryDimensions = {};
    for (const img of imgs) {
      if (img.width && img.height) additions[img.url] = { width: img.width, height: img.height };
    }
    if (Object.keys(additions).length > 0) {
      setDimensions((prev) => ({ ...prev, ...additions }));
    }
  }

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

  function handleHeroUploaded(image: { url: string; width: number | null; height: number | null }) {
    mergeDimensions([image]);
    setHeroImageUrl(image.url);
    scheduleSave({ heroImageUrl: image.url });
  }

  function handleHeroRemove() {
    setHeroImageUrl("");
    scheduleSave({ heroImageUrl: null });
  }

  function handleImageInsert(image: { url: string; width: number | null; height: number | null }) {
    mergeDimensions([image]);
    editorRef.current?.insertAtCursor(`![](${image.url})`);
  }

  function handleGalleryInsert(images: UploadedImage[]) {
    mergeDimensions(images);
    const block = `\n:::gallery\n${images.map((img) => `![](${img.url})`).join("\n")}\n:::\n`;
    editorRef.current?.insertAtCursor(block);
  }

  function handlePickerSelect(images: PickedImage[]) {
    mergeDimensions(images);
    if (pickerTarget === "hero" && images[0]) {
      setHeroImageUrl(images[0].url);
      scheduleSave({ heroImageUrl: images[0].url });
    } else if (pickerTarget === "inline" && images[0]) {
      handleImageInsert(images[0]);
    } else if (pickerTarget === "gallery") {
      handleGalleryInsert(images);
    }
    setPickerTarget(null);
  }

  async function handleDropFiles(files: File[], pos: number) {
    let insertPos = pos;
    for (const file of files) {
      try {
        const resized = await resizeImageFile(file);
        const formData = new FormData();
        formData.append("file", resized.file);
        formData.append("width", String(resized.width));
        formData.append("height", String(resized.height));
        const res = await fetch("/api/admin/uploads", { method: "POST", body: formData });
        if (!res.ok) continue;
        const row = await res.json();
        mergeDimensions([row]);
        const markdown = `![](${row.url})\n`;
        editorRef.current?.insertAt(insertPos, markdown);
        insertPos += markdown.length;
      } catch {
        // skip a file that failed to resize or upload
      }
    }
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
          <span className="flex items-center gap-1">
            <ImageUploadButton label="Add hero image" onUploaded={handleHeroUploaded} />
            <button
              className="px-2 py-1 text-sm border border-[var(--border)] rounded"
              onClick={() => setPickerTarget("hero")}
            >
              Choose existing
            </button>
          </span>
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
        <button
          className="px-2 py-1 text-sm border border-[var(--border)] rounded"
          onClick={() => setPickerTarget("inline")}
        >
          Choose image
        </button>
        <button
          className="px-2 py-1 text-sm border border-[var(--border)] rounded"
          onClick={() => setPickerTarget("gallery")}
        >
          Choose for gallery
        </button>
        <button className="px-2 py-1 text-sm border border-[var(--border)] rounded" onClick={() => editorRef.current?.wrapFullBleed()}>Full-bleed</button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-[var(--border)] p-4 min-h-0 overflow-auto">
          <Editor ref={editorRef} value={markdown} onChange={handleMarkdownChange} onDropFiles={handleDropFiles} />
        </div>
        <div className="w-1/2 overflow-auto p-6">
          <Preview
            markdown={markdown}
            heroImageUrl={heroImageUrl || undefined}
            heroImageAlt={template.heroImageAlt || undefined}
            dimensions={dimensions}
          />
        </div>
      </div>

      {pickerTarget && (
        <ImagePickerModal
          mode={pickerTarget === "gallery" ? "multi" : "single"}
          onSelect={handlePickerSelect}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
