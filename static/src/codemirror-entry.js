// CodeMirror bundle for md-quiz code editor
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";

const LANG_MAP = {
  java, python,
  js: javascript,
  javascript,
  sql,
};

export function createCodeMirror(container, options = {}) {
  const { value = "", lang = "java", readOnly = false } = options;
  const langFn = LANG_MAP[lang] || LANG_MAP.java;
  const state = EditorState.create({
    doc: value,
    extensions: [
      basicSetup,
      langFn(),
      EditorView.lineWrapping,
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
