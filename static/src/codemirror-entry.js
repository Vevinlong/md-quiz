// CodeMirror bundle for md-quiz code editor
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { lineNumbers, keymap } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { indentWithTab } from "@codemirror/commands";
import * as lz from "@lezer/highlight";

const LANG_MAP = {
  java, python,
  js: javascript,
  javascript,
  sql,
};

// ── Theme cache (lazy — tags accessed at call time, not module-init time) ──

let _themeCache = null;

function getTheme(themeName) {
  if (_themeCache) return _themeCache[themeName];
  const t = lz.tags;

  // ── Dark syntax themes ──
  _themeCache = {
    "one-dark": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#df8d9e" }, { tag: t.controlKeyword, color: "#df8d9e" },
      { tag: t.definitionKeyword, color: "#df8d9e" }, { tag: t.moduleKeyword, color: "#df8d9e" },
      { tag: t.modifier, color: "#df8d9e" }, { tag: t.self, color: "#e5916b" },
      { tag: t.string, color: "#9bbf7d" }, { tag: t.docString, color: "#9bbf7d" },
      { tag: t.comment, color: "#8b8d94", fontStyle: "italic" }, { tag: t.docComment, color: "#8b8d94", fontStyle: "italic" },
      { tag: t.number, color: "#d4a56a" }, { tag: t.bool, color: "#d4a56a" }, { tag: t.null, color: "#d4a56a" },
      { tag: t.typeName, color: "#deb86a" }, { tag: t.className, color: "#deb86a" },
      { tag: t.propertyName, color: "#e5916b" }, { tag: t.attributeName, color: "#d4a56a" },
      { tag: t.operator, color: "#8dbc8d" }, { tag: t.variableName, color: "#d4b896" },
      { tag: t.annotation, color: "#d4a56a" },
      { tag: t.punctuation, color: "#b8a896" }, { tag: t.separator, color: "#b8a896" },
      { tag: t.bracket, color: "#b8a896" }, { tag: t.meta, color: "#b8a896" },
    ])),
    "monokai": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#eb6b8a" }, { tag: t.controlKeyword, color: "#eb6b8a" },
      { tag: t.definitionKeyword, color: "#eb6b8a" }, { tag: t.moduleKeyword, color: "#eb6b8a" },
      { tag: t.modifier, color: "#eb6b8a" }, { tag: t.self, color: "#e5954f" },
      { tag: t.string, color: "#98b85e" }, { tag: t.docString, color: "#98b85e" },
      { tag: t.comment, color: "#8b876b", fontStyle: "italic" }, { tag: t.docComment, color: "#8b876b", fontStyle: "italic" },
      { tag: t.number, color: "#d4a56a" }, { tag: t.bool, color: "#d4a56a" }, { tag: t.null, color: "#d4a56a" },
      { tag: t.typeName, color: "#c4b860" }, { tag: t.className, color: "#c4b860" },
      { tag: t.propertyName, color: "#eb7a6b" }, { tag: t.attributeName, color: "#98b85e" },
      { tag: t.operator, color: "#eb7a6b" }, { tag: t.variableName, color: "#e5954f" },
      { tag: t.annotation, color: "#d4a56a" },
      { tag: t.punctuation, color: "#e0dcc8" }, { tag: t.separator, color: "#e0dcc8" },
      { tag: t.bracket, color: "#e0dcc8" }, { tag: t.meta, color: "#e0dcc8" },
    ])),
    "dracula": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#d491a8" }, { tag: t.controlKeyword, color: "#eb7a8a" },
      { tag: t.definitionKeyword, color: "#eb7a8a" }, { tag: t.moduleKeyword, color: "#d491a8" },
      { tag: t.modifier, color: "#eb7a8a" }, { tag: t.self, color: "#eb7a8a" },
      { tag: t.string, color: "#7ac97a" }, { tag: t.docString, color: "#7ac97a" },
      { tag: t.comment, color: "#7e839e", fontStyle: "italic" }, { tag: t.docComment, color: "#7e839e", fontStyle: "italic" },
      { tag: t.number, color: "#d491a8" }, { tag: t.bool, color: "#d491a8" }, { tag: t.null, color: "#d491a8" },
      { tag: t.typeName, color: "#7cc9a5" }, { tag: t.className, color: "#7cc9a5" },
      { tag: t.propertyName, color: "#eb7a8a" }, { tag: t.attributeName, color: "#7ac97a" },
      { tag: t.operator, color: "#eb7a8a" }, { tag: t.variableName, color: "#e8e3d4" },
      { tag: t.annotation, color: "#e5b080" },
      { tag: t.punctuation, color: "#e8e3d4" }, { tag: t.separator, color: "#e8e3d4" },
      { tag: t.bracket, color: "#e8e3d4" }, { tag: t.meta, color: "#e5b080" },
    ])),
    "nord": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#d4918d" }, { tag: t.controlKeyword, color: "#d4918d" },
      { tag: t.definitionKeyword, color: "#d4918d" }, { tag: t.moduleKeyword, color: "#d4918d" },
      { tag: t.modifier, color: "#d4918d" }, { tag: t.self, color: "#9ebd84" },
      { tag: t.string, color: "#9ebd84" }, { tag: t.docString, color: "#9ebd84" },
      { tag: t.comment, color: "#7b88a4", fontStyle: "italic" }, { tag: t.docComment, color: "#7b88a4", fontStyle: "italic" },
      { tag: t.number, color: "#d4918d" }, { tag: t.bool, color: "#d4918d" }, { tag: t.null, color: "#d4918d" },
      { tag: t.typeName, color: "#c4b88d" }, { tag: t.className, color: "#c4b88d" },
      { tag: t.propertyName, color: "#d4918d" }, { tag: t.attributeName, color: "#9ebd84" },
      { tag: t.operator, color: "#d4918d" }, { tag: t.variableName, color: "#e0dcc8" },
      { tag: t.annotation, color: "#d4918d" },
      { tag: t.punctuation, color: "#d0ccc0" }, { tag: t.separator, color: "#d0ccc0" },
      { tag: t.bracket, color: "#d0ccc0" }, { tag: t.meta, color: "#9ebd84" },
    ])),

    // ── Light syntax themes ──
    "atom-one-light": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#a626a4" }, { tag: t.controlKeyword, color: "#a626a4" },
      { tag: t.definitionKeyword, color: "#a626a4" }, { tag: t.moduleKeyword, color: "#a626a4" },
      { tag: t.modifier, color: "#a626a4" }, { tag: t.self, color: "#e45649" },
      { tag: t.string, color: "#50a14f" }, { tag: t.docString, color: "#50a14f" },
      { tag: t.comment, color: "#a0a1a7", fontStyle: "italic" }, { tag: t.docComment, color: "#a0a1a7", fontStyle: "italic" },
      { tag: t.number, color: "#986801" }, { tag: t.bool, color: "#986801" }, { tag: t.null, color: "#986801" },
      { tag: t.typeName, color: "#e45649" }, { tag: t.className, color: "#c18401" },
      { tag: t.propertyName, color: "#e45649" }, { tag: t.attributeName, color: "#986801" },
      { tag: t.function(t.variableName), color: "#4078f2" },
      { tag: t.operator, color: "#383a42" }, { tag: t.variableName, color: "#986801" },
      { tag: t.annotation, color: "#986801" },
      { tag: t.punctuation, color: "#383a42" }, { tag: t.separator, color: "#383a42" },
      { tag: t.bracket, color: "#383a42" }, { tag: t.meta, color: "#a0a1a7" },
    ])),
    "solarized-light": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#859900" }, { tag: t.controlKeyword, color: "#859900" },
      { tag: t.definitionKeyword, color: "#859900" }, { tag: t.moduleKeyword, color: "#859900" },
      { tag: t.modifier, color: "#859900" }, { tag: t.self, color: "#268bd2" },
      { tag: t.string, color: "#2aa198" }, { tag: t.docString, color: "#2aa198" },
      { tag: t.comment, color: "#93a1a1", fontStyle: "italic" }, { tag: t.docComment, color: "#93a1a1", fontStyle: "italic" },
      { tag: t.number, color: "#d33682" }, { tag: t.bool, color: "#d33682" }, { tag: t.null, color: "#d33682" },
      { tag: t.typeName, color: "#b58900" }, { tag: t.className, color: "#b58900" },
      { tag: t.function(t.variableName), color: "#268bd2" },
      { tag: t.propertyName, color: "#b58900" }, { tag: t.attributeName, color: "#2aa198" },
      { tag: t.operator, color: "#657b83" }, { tag: t.variableName, color: "#b58900" },
      { tag: t.annotation, color: "#d33682" },
      { tag: t.punctuation, color: "#93a1a1" }, { tag: t.separator, color: "#93a1a1" },
      { tag: t.bracket, color: "#93a1a1" }, { tag: t.meta, color: "#93a1a1" },
    ])),
    "github-light": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#d73a49" }, { tag: t.controlKeyword, color: "#d73a49" },
      { tag: t.definitionKeyword, color: "#d73a49" }, { tag: t.moduleKeyword, color: "#d73a49" },
      { tag: t.modifier, color: "#d73a49" }, { tag: t.self, color: "#d73a49" },
      { tag: t.string, color: "#032f62" }, { tag: t.docString, color: "#032f62" },
      { tag: t.comment, color: "#6a737d", fontStyle: "italic" }, { tag: t.docComment, color: "#6a737d", fontStyle: "italic" },
      { tag: t.number, color: "#005cc5" }, { tag: t.bool, color: "#005cc5" }, { tag: t.null, color: "#005cc5" },
      { tag: t.typeName, color: "#6f42c1" }, { tag: t.className, color: "#6f42c1" },
      { tag: t.function(t.variableName), color: "#6f42c1" },
      { tag: t.propertyName, color: "#005cc5" }, { tag: t.attributeName, color: "#005cc5" },
      { tag: t.operator, color: "#d73a49" }, { tag: t.variableName, color: "#e36209" },
      { tag: t.annotation, color: "#005cc5" },
      { tag: t.punctuation, color: "#24292e" }, { tag: t.separator, color: "#24292e" },
      { tag: t.bracket, color: "#24292e" }, { tag: t.meta, color: "#6a737d" },
    ])),
    "nord-light": syntaxHighlighting(HighlightStyle.define([
      { tag: t.keyword, color: "#5e81ac" }, { tag: t.controlKeyword, color: "#5e81ac" },
      { tag: t.definitionKeyword, color: "#5e81ac" }, { tag: t.moduleKeyword, color: "#5e81ac" },
      { tag: t.modifier, color: "#5e81ac" }, { tag: t.self, color: "#88c0d0" },
      { tag: t.string, color: "#a3be8c" }, { tag: t.docString, color: "#a3be8c" },
      { tag: t.comment, color: "#616e88", fontStyle: "italic" }, { tag: t.docComment, color: "#616e88", fontStyle: "italic" },
      { tag: t.number, color: "#b48ead" }, { tag: t.bool, color: "#b48ead" }, { tag: t.null, color: "#b48ead" },
      { tag: t.typeName, color: "#8fbcbb" }, { tag: t.className, color: "#8fbcbb" },
      { tag: t.function(t.variableName), color: "#88c0d0" },
      { tag: t.propertyName, color: "#81a1c1" }, { tag: t.attributeName, color: "#a3be8c" },
      { tag: t.operator, color: "#81a1c1" }, { tag: t.variableName, color: "#4c566a" },
      { tag: t.annotation, color: "#b48ead" },
      { tag: t.punctuation, color: "#4c566a" }, { tag: t.separator, color: "#4c566a" },
      { tag: t.bracket, color: "#4c566a" }, { tag: t.meta, color: "#88c0d0" },
    ])),
  };
  return _themeCache[themeName];
}

export function getThemeNames(pageTheme) {
  const dark = [
    { id: "one-dark", label: "One Dark" },
    { id: "monokai", label: "Monokai" },
    { id: "dracula", label: "Dracula" },
    { id: "nord", label: "Nord" },
  ];
  const light = [
    { id: "atom-one-light", label: "Atom One Light" },
    { id: "solarized-light", label: "Solarized Light" },
    { id: "github-light", label: "GitHub Light" },
    { id: "nord-light", label: "Nord Light" },
  ];
  return pageTheme === "light" ? light : dark;
}

// ── Editor chrome themes ──

const darkEditorTheme = EditorView.theme({
  "&": {
    minHeight: "600px", backgroundColor: "#0f172a", color: "#e2e8f0",
  },
  ".cm-scroller": {
    overflow: "auto", fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace", fontSize: "13px", lineHeight: "1.6",
  },
  ".cm-content": { minHeight: "600px", caretColor: "#22c55e", padding: "8px 0" },
  ".cm-gutters": { backgroundColor: "#0f172a", borderRight: "1px solid rgba(255,255,255,0.08)", color: "#475569" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(34,197,94,0.08)" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
  ".cm-cursor": { borderLeftColor: "#22c55e" },
  ".cm-selectionBackground": { backgroundColor: "rgba(100,116,139,0.3)" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(100,116,139,0.42)" },
}, { dark: true });

const lightEditorTheme = EditorView.theme({
  "&": {
    minHeight: "600px", backgroundColor: "#fafbfc", color: "#24292e",
  },
  ".cm-scroller": {
    overflow: "auto", fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace", fontSize: "13px", lineHeight: "1.6",
  },
  ".cm-content": { minHeight: "600px", caretColor: "#24292e", padding: "8px 0" },
  ".cm-gutters": { backgroundColor: "#f6f8fa", borderRight: "1px solid #e1e4e8", color: "#959da5" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(3,102,214,0.06)" },
  ".cm-activeLine": { backgroundColor: "rgba(0,0,0,0.03)" },
  ".cm-cursor": { borderLeftColor: "#24292e" },
  ".cm-selectionBackground": { backgroundColor: "rgba(3,102,214,0.15)" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(3,102,214,0.22)" },
}, { dark: false });

// ── Create editor ──

export function createCodeMirror(container, options = {}) {
  const { value = "", lang = "java", pageTheme = "dark", themeName = "one-dark", readOnly = false, wrap = false, onChange = null } = options;

  const langComp = new Compartment();
  const themeComp = new Compartment();
  const wrapComp = new Compartment();
  const chromeComp = new Compartment();

  container._cmCompartments = { langComp, themeComp, wrapComp, chromeComp };

  const syntaxTheme = getTheme(themeName);
  const editorChrome = pageTheme === "light" ? lightEditorTheme : darkEditorTheme;

  const state = EditorState.create({
    doc: String(value || ""),
    extensions: [
      basicSetup,
      indentUnit.of("    "),
      keymap.of([indentWithTab]),
      langComp.of(LANG_MAP[lang]()),
      themeComp.of(syntaxTheme),
      wrapComp.of(wrap ? EditorView.lineWrapping : []),
      chromeComp.of(editorChrome),
      EditorView.updateListener.of((update) => {
        if (update.changes) {
          const v = update.state.doc.toString();
          container._cmValue = v;
          if (typeof onChange === "function") onChange(v);
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
  const view = el._cmView, comps = el._cmCompartments;
  if (!view || !comps) return;
  const fn = LANG_MAP[lang];
  if (!fn) return;
  view.dispatch({ effects: comps.langComp.reconfigure(fn()) });
}

export function reconfigureTheme(el, themeName) {
  const view = el._cmView, comps = el._cmCompartments;
  if (!view || !comps) return;
  const th = getTheme(themeName);
  view.dispatch({ effects: comps.themeComp.reconfigure(th) });
}

export function reconfigureEditorChrome(el, pageTheme) {
  const view = el._cmView, comps = el._cmCompartments;
  if (!view || !comps) return;
  const chrome = pageTheme === "light" ? lightEditorTheme : darkEditorTheme;
  view.dispatch({ effects: comps.chromeComp.reconfigure(chrome) });
}

export function reconfigureWrap(el, wrap) {
  const view = el._cmView, comps = el._cmCompartments;
  if (!view || !comps) return;
  view.dispatch({ effects: comps.wrapComp.reconfigure(wrap ? EditorView.lineWrapping : []) });
}

// ── Value access ──

export function getCodeMirrorValue(el) { return el._cmValue || ""; }

export function setCodeMirrorValue(el, val) {
  if (el._cmView) {
    el._cmView.dispatch({ changes: { from: 0, to: el._cmView.state.doc.length, insert: String(val || "") } });
  }
  el._cmValue = String(val || "");
}

export function destroyCodeMirror(el) {
  if (el._cmView) { el._cmView.destroy(); el._cmView = null; }
}
