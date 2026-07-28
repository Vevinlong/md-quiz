// CodeMirror bundle for md-quiz code editor
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { lineNumbers } from "@codemirror/view";

const LANG_MAP = {
  java, python,
  js: javascript,
  javascript,
  sql,
};

// ── Dark editor chrome ──

const darkTheme = EditorView.theme({
  "&": {
    minHeight: "600px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    fontSize: "13px",
    lineHeight: "1.6",
  },
  ".cm-content": {
    minHeight: "600px",
    caretColor: "#22c55e",
    padding: "8px 0",
  },
  ".cm-gutters": {
    backgroundColor: "#0f172a",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    color: "#475569",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  ".cm-cursor": {
    borderLeftColor: "#22c55e",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(34,197,94,0.2)",
  },
});

// ── Create editor ──

export function createCodeMirror(container, options = {}) {
  const { value = "", lang = "java", readOnly = false, wrap = false } = options;

  const langComp = new Compartment();
  const wrapComp = new Compartment();

  container._cmCompartments = { langComp, wrapComp };

  const state = EditorState.create({
    doc: value,
    extensions: [
      basicSetup,
      langComp.of(LANG_MAP[lang]()),
      wrapComp.of(wrap ? EditorView.lineWrapping : []),
      darkTheme,
      EditorView.updateListener.of((update) => {
        if (update.changes) {
          container._cmValue = update.state.doc.toString();
        }
      }),
      ...(readOnly ? [EditorView.editable.of(false)] : []),
    ],
  });

  const view = new EditorView({ state, parent: container });
  container._cmView = view;
  container._cmValue = value;
  return view;
}

// ── Runtime reconfiguration ──

export function reconfigureLanguage(el, lang) {
  const view = el._cmView;
  const comps = el._cmCompartments;
  if (!view || !comps) return;
  const fn = LANG_MAP[lang];
  if (!fn) return;
  view.dispatch({ effects: comps.langComp.reconfigure(fn()) });
}

export function reconfigureWrap(el, wrap) {
  const view = el._cmView;
  const comps = el._cmCompartments;
  if (!view || !comps) return;
  view.dispatch({ effects: comps.wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) });
}

// ── Value access ──

export function getCodeMirrorValue(el) {
  return el._cmValue || "";
}

export function setCodeMirrorValue(el, val) {
  if (el._cmView) {
    el._cmView.dispatch({
      changes: { from: 0, to: el._cmView.state.doc.length, insert: String(val || "") },
    });
  }
  el._cmValue = String(val || "");
}

export function destroyCodeMirror(el) {
  if (el._cmView) {
    el._cmView.destroy();
    el._cmView = null;
  }
}
