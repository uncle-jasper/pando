"use client";

// Forked from tree/index.html: the CM6 destructuring block (~lines 1624-1645) and the
// editor lifecycle functions buildExtensions/initEditor/getContent/setContent/wrapSelection
// (~lines 2137-2408). buildExtensions is trimmed for Pando: tree's writer-productivity
// features (annotations, zen mode, just-write mode, goal tracking, autohide toolbar, custom
// syntax-dimming plugins) aren't part of composing a newsletter and are dropped rather than
// ported, since they depend on substantial additional tree-specific code and UI (checkboxes,
// panels, timers) that has no equivalent in Pando's admin. Core writing behavior — history,
// selection, markdown language support, search, and the bold/italic/link/heading shortcuts —
// is kept faithful to tree.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    CM6: any;
  }
}

export interface EditorHandle {
  insertAtCursor: (text: string) => void;
  wrapSelection: (before: string, after: string) => void;
  getContent: () => string;
}

interface EditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, onChange, placeholder },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [cm6Ready, setCm6Ready] = useState(false);

  useEffect(() => {
    if (!cm6Ready || !containerRef.current || viewRef.current) return;

    const CM6 = window.CM6;
    const {
      EditorView, keymap, drawSelection, dropCursor,
      rectangularSelection, crosshairCursor, highlightSpecialChars, placeholder: cmPlaceholder,
    } = CM6;
    const { EditorState, EditorSelection } = CM6;
    const { defaultKeymap, history, historyKeymap, undo, redo } = CM6;
    const { markdown, markdownLanguage } = CM6;
    const { syntaxHighlighting, defaultHighlightStyle } = CM6;
    const { search, searchKeymap } = CM6;

    function wrapSelectionInternal(before: string, after: string) {
      const view = viewRef.current;
      if (!view) return;
      const { state } = view;
      const changes = state.changeByRange((range: any) => {
        const selected = state.sliceDoc(range.from, range.to);
        const insert = before + selected + after;
        return {
          changes: { from: range.from, to: range.to, insert },
          range: EditorSelection.range(
            range.from + before.length,
            range.from + before.length + selected.length
          ),
        };
      });
      view.dispatch(changes);
      view.focus();
    }

    function insertAtCursorInternal(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: EditorSelection.cursor(from + text.length),
        userEvent: "input",
      });
      view.focus();
    }

    function toggleHeading(level: number) {
      return (view: any) => {
        const { state } = view;
        const line = state.doc.lineAt(state.selection.main.head);
        const target = "#".repeat(level) + " ";
        const m = line.text.match(/^(#{1,6}) /);
        if (m && m[0] === target) {
          view.dispatch({ changes: { from: line.from, to: line.from + target.length, insert: "" }, userEvent: "input" });
        } else if (m) {
          view.dispatch({ changes: { from: line.from, to: line.from + m[0].length, insert: target }, userEvent: "input" });
        } else {
          view.dispatch({ changes: { from: line.from, to: line.from, insert: target }, userEvent: "input" });
        }
        return true;
      };
    }

    const extensions = [
      history(),
      drawSelection({ cursorBlinkRate: 1000 }),
      dropCursor(),
      EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      crosshairCursor(),
      highlightSpecialChars(),
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(defaultHighlightStyle),
      search({ top: true }),
      keymap.of([
        { key: "Mod-b", run: () => { wrapSelectionInternal("**", "**"); return true; } },
        { key: "Mod-i", run: () => { wrapSelectionInternal("*", "*"); return true; } },
        { key: "Mod-k", run: () => { wrapSelectionInternal("[", "](url)"); return true; } },
        { key: "Mod-1", run: toggleHeading(1) },
        { key: "Mod-2", run: toggleHeading(2) },
        { key: "Mod-3", run: toggleHeading(3) },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      EditorView.updateListener.of((update: any) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
      cmPlaceholder(placeholder || "Start writing… markdown is supported."),
      EditorView.theme({
        "&": { background: "transparent", height: "100%" },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { overflow: "auto", fontFamily: "var(--editor-font, monospace)" },
        ".cm-gutters": { display: "none" },
        ".cm-selectionBackground": { background: "var(--accent) !important", opacity: "0.25" },
        "&.cm-focused .cm-selectionBackground": { background: "var(--accent) !important", opacity: "0.25" },
        // CodeMirror's default cursor color is hardcoded black, invisible in dark mode.
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
      }),
    ];

    const state = EditorState.create({ doc: value || "", extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    (containerRef.current as any).__wrapSelection = wrapSelectionInternal;
    (containerRef.current as any).__insertAtCursor = insertAtCursorInternal;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [cm6Ready]);

  useImperativeHandle(ref, () => ({
    insertAtCursor: (text: string) => {
      (containerRef.current as any)?.__insertAtCursor?.(text);
    },
    wrapSelection: (before: string, after: string) => {
      (containerRef.current as any)?.__wrapSelection?.(before, after);
    },
    getContent: () => (viewRef.current ? viewRef.current.state.doc.toString() : ""),
  }));

  // Keep the editor in sync if `value` is replaced from outside (e.g. loading a draft).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <>
      <Script src="/cm6.js" strategy="afterInteractive" onReady={() => setCm6Ready(true)} />
      <div ref={containerRef} className="pando-editor" />
    </>
  );
});

export default Editor;
