// CodeMirror bundle for md-quiz code editor
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { lineNumbers } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import * as lz from "@lezer/highlight";

// ── Theme cache (lazy — tags accessed at call time, not module-init time) ──

let _themeCache = null;

function getTheme(themeName) {
  if (_themeCache) return _themeCache[themeName];
  // `tags` resolved at call time — all modules are initialized by then
  const t = lz.tags;
  _themeCache = {
    "one-dark": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#df8d9e" },
      { tag: t.controlKeyword, color: "#df8d9e" },
      { tag: t.definitionKeyword, color: "#df8d9e" },
      { tag: t.moduleKeyword, color: "#df8d9e" },
      { tag: t.modifier, color: "#df8d9e" },
      { tag: t.self, color: "#e5916b" },
      { tag: t.string, color: "#9bbf7d" },
      { tag: t.docString, color: "#9bbf7d" },
      { tag: t.comment, color: "#8b8d94", fontStyle: "italic" },
      { tag: t.docComment, color: "#8b8d94", fontStyle: "italic" },
      { tag: t.number, color: "#d4a56a" },
      { tag: t.bool, color: "#d4a56a" },
      { tag: t.null, color: "#d4a56a" },
      { tag: t.typeName, color: "#deb86a" },
      { tag: t.className, color: "#deb86a" },
      { tag: t.propertyName, color: "#e5916b" },
      { tag: t.attributeName, color: "#d4a56a" },
      { tag: t.operator, color: "#8dbc8d" },
      { tag: t.variableName, color: "#d4b896" },
      { tag: t.annotation, color: "#d4a56a" },
      { tag: t.punctuation, color: "#b8a896" },
      { tag: t.separator, color: "#b8a896" },
      { tag: t.bracket, color: "#b8a896" },
      { tag: t.meta, color: "#b8a896" },
    ])),
    "monokai": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#eb6b8a" },
      { tag: t.controlKeyword, color: "#eb6b8a" },
      { tag: t.definitionKeyword, color: "#eb6b8a" },
      { tag: t.moduleKeyword, color: "#eb6b8a" },
      { tag: t.modifier, color: "#eb6b8a" },
      { tag: t.self, color: "#e5954f" },
      { tag: t.string, color: "#98b85e" },
      { tag: t.docString, color: "#98b85e" },
      { tag: t.comment, color: "#8b876b", fontStyle: "italic" },
      { tag: t.docComment, color: "#8b876b", fontStyle: "italic" },
      { tag: t.number, color: "#d4a56a" },
      { tag: t.bool, color: "#d4a56a" },
      { tag: t.null, color: "#d4a56a" },
      { tag: t.typeName, color: "#c4b860" },
      { tag: t.className, color: "#c4b860" },
      { tag: t.propertyName, color: "#eb7a6b" },
      { tag: t.attributeName, color: "#98b85e" },
      { tag: t.operator, color: "#eb7a6b" },
      { tag: t.variableName, color: "#e5954f" },
      { tag: t.annotation, color: "#d4a56a" },
      { tag: t.punctuation, color: "#e0dcc8" },
      { tag: t.separator, color: "#e0dcc8" },
      { tag: t.bracket, color: "#e0dcc8" },
      { tag: t.meta, color: "#e0dcc8" },
    ])),
    "dracula": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#d491a8" },
      { tag: t.controlKeyword, color: "#eb7a8a" },
      { tag: t.definitionKeyword, color: "#eb7a8a" },
      { tag: t.moduleKeyword, color: "#d491a8" },
      { tag: t.modifier, color: "#eb7a8a" },
      { tag: t.self, color: "#eb7a8a" },
      { tag: t.string, color: "#7ac97a" },
      { tag: t.docString, color: "#7ac97a" },
      { tag: t.comment, color: "#7e839e", fontStyle: "italic" },
      { tag: t.docComment, color: "#7e839e", fontStyle: "italic" },
      { tag: t.number, color: "#d491a8" },
      { tag: t.bool, color: "#d491a8" },
      { tag: t.null, color: "#d491a8" },
      { tag: t.typeName, color: "#7cc9a5" },
      { tag: t.className, color: "#7cc9a5" },
      { tag: t.propertyName, color: "#eb7a8a" },
      { tag: t.attributeName, color: "#7ac97a" },
      { tag: t.operator, color: "#eb7a8a" },
      { tag: t.variableName, color: "#e8e3d4" },
      { tag: t.annotation, color: "#e5b080" },
      { tag: t.punctuation, color: "#e8e3d4" },
      { tag: t.separator, color: "#e8e3d4" },
      { tag: t.bracket, color: "#e8e3d4" },
      { tag: t.meta, color: "#e5b080" },
    ])),
    "nord": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#d4918d" },
      { tag: t.controlKeyword, color: "#d4918d" },
      { tag: t.definitionKeyword, color: "#d4918d" },
      { tag: t.moduleKeyword, color: "#d4918d" },
      { tag: t.modifier, color: "#d4918d" },
      { tag: t.self, color: "#9ebd84" },
      { tag: t.string, color: "#9ebd84" },
      { tag: t.docString, color: "#9ebd84" },
      { tag: t.comment, color: "#7b88a4", fontStyle: "italic" },
      { tag: t.docComment, color: "#7b88a4", fontStyle: "italic" },
      { tag: t.number, color: "#d4918d" },
      { tag: t.bool, color: "#d4918d" },
      { tag: t.null, color: "#d4918d" },
      { tag: t.typeName, color: "#c4b88d" },
      { tag: t.className, color: "#c4b88d" },
      { tag: t.propertyName, color: "#d4918d" },
      { tag: t.attributeName, color: "#9ebd84" },
      { tag: t.operator, color: "#d4918d" },
      { tag: t.variableName, color: "#e0dcc8" },
      { tag: t.annotation, color: "#d4918d" },
      { tag: t.punctuation, color: "#d0ccc0" },
      { tag: t.separator, color: "#d0ccc0" },
      { tag: t.bracket, color: "#d0ccc0" },
      { tag: t.meta, color: "#9ebd84" },
    ])),
  };
  return _themeCache[themeName];
}

export function getThemeNames() {
  return [
    { id: "one-dark", label: "One Dark" },
    { id: "monokai", label: "Monokai" },
    { id: "dracula", label: "Dracula" },
    { id: "nord", label: "Nord" },
  ];
}

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
    backgroundColor: "rgba(100,116,139,0.3)",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(100,116,139,0.42)",
  },
}, { dark: true });

// ── Create editor ──

export function createCodeMirror(container, options = {}) {
  const { value = "", lang = "java", themeName = "one-dark", readOnly = false, wrap = false } = options;

  const langComp = new Compartment();
  const themeComp = new Compartment();
  const wrapComp = new Compartment();

  container._cmCompartments = { langComp, themeComp, wrapComp };

  // getTheme() accesses tags lazily — safe at call time
  const syntaxTheme = getTheme(themeName);

  const state = EditorState.create({
    doc: value,
    extensions: [
      basicSetup,
      langComp.of(LANG_MAP[lang]()),
      themeComp.of(syntaxTheme),
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

export function reconfigureTheme(el, themeName) {
  const view = el._cmView;
  const comps = el._cmCompartments;
  if (!view || !comps) return;
  const th = getTheme(themeName);
  view.dispatch({ effects: comps.themeComp.reconfigure(th) });
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
