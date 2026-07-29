// CodeMirror code editor module for Alpine.js (candidate-facing)
export function createPublicCodeEditorModule() {
  return {
    codeEditorViews: {},

    initCodeEditor(qid, lang, initialValue) {
      this.destroyCodeEditor(qid);
      const el = this.$refs?.["cm-" + qid];
      if (!el) return;
      const view = CodeMirrorBundle.createCodeMirror(el, {
        value: String(initialValue || ""),
        lang: String(lang || "java").toLowerCase(),
      });
      this.codeEditorViews[qid] = el;
    },

    getCodeEditorValue(qid) {
      const el = this.codeEditorViews[qid];
      return el ? CodeMirrorBundle.getCodeMirrorValue(el) : "";
    },

    destroyCodeEditor(qid) {
      const el = this.codeEditorViews[qid];
      if (el) {
        CodeMirrorBundle.destroyCodeMirror(el);
        delete this.codeEditorViews[qid];
      }
    },

    destroyAllCodeEditors() {
      Object.keys(this.codeEditorViews).forEach((qid) => this.destroyCodeEditor(qid));
    },
  };
}
