export function createPublicFullQuizModule() {
  // ── group definitions ──
  const QUESTION_GROUPS = [
    { label: "选择题", types: ["single", "multiple"] },
    { label: "简答题", types: ["short"] },
    { label: "编程题", types: ["code"] },
    { label: "量表题", types: ["traits"] },
  ];

  return {
    // ── page theme (dark / light) ──

    pageTheme: localStorage.getItem("md-quiz-page-theme") || "dark",

    // Per-stem editor state: { "stem-0": { theme: "...", wrap: true }, ... }
    _stemState: {},

    _nextStemId() { const n = (this._stemState._n || 0); this._stemState._n = n + 1; return "s" + n; },
    getStemTheme(id) { return this._stemState[id]?.theme || this.codeSettings.theme; },
    setStemTheme(id, t) { this._stemState[id] = { ...this._stemState[id], theme: t }; },
    getStemWrap(id)  { const s = this._stemState[id]; return s ? s.wrap : this.codeSettings.wrap; },
    setStemWrap(id, w) { this._stemState[id] = { ...this._stemState[id], wrap: w }; },

    refreshStemToolbars() {
      if (typeof CodeMirrorBundle === "undefined") return;
      const pt = this.pageTheme || "dark";
      const themes = CodeMirrorBundle.getThemeNames(pt);
      document.querySelectorAll(".stem-toolbar select").forEach(sel => {
        sel.innerHTML = themes.map(t => `<option value="${t.id}">${t.label}</option>`).join("");
        const first = themes[0].id;
        sel.value = first;
        // toolbar is sibling of .code-stem, not parent
        const stemEl = sel.closest(".stem-toolbar")?.nextElementSibling;
        const id = stemEl?.dataset?.stemId;
        if (id) this.setStemTheme(id, first);
        if (stemEl?._cmView) CodeMirrorBundle.reconfigureTheme(stemEl, first);
      });
    },

    togglePageTheme() {
      const next = this.pageTheme === "dark" ? "light" : "dark";
      this.pageTheme = next;
      localStorage.setItem("md-quiz-page-theme", next);
      this.codeSettings.theme = next === "light" ? "atom-one-light" : "one-dark";
      this.reconfigureAllCodeThemes();
      this.refreshStemToolbars();
      if (typeof CodeMirrorBundle !== "undefined") {
        document.querySelectorAll(".code-mount, .code-stem").forEach((el) => {
          if (el._cmView) CodeMirrorBundle.reconfigureEditorChrome(el, next);
        });
      }
    },

    codeThemeOptions() {
      if (typeof CodeMirrorBundle !== "undefined" && CodeMirrorBundle.getThemeNames) {
        return CodeMirrorBundle.getThemeNames(this.pageTheme || "dark");
      }
      if (this.pageTheme === "light") {
        return [
          { id: "atom-one-light", label: "Atom One Light" },
          { id: "solarized-light", label: "Solarized Light" },
          { id: "github-light", label: "GitHub Light" },
          { id: "nord-light", label: "Nord Light" },
        ];
      }
      return [
        { id: "one-dark", label: "One Dark" },
        { id: "monokai", label: "Monokai" },
        { id: "dracula", label: "Dracula" },
        { id: "nord", label: "Nord" },
      ];
    },

    // ── code editor settings ──

    codeSettings: {
      theme: localStorage.getItem("md-quiz-code-theme") || "one-dark",
      wrap: localStorage.getItem("md-quiz-code-wrap") === "true",
    },

    codeLangs: {},

    setCodeLang(qid, lang) {
      if (!lang) return;
      if (!this.codeLangs) this.codeLangs = {};
      this.codeLangs[qid] = lang;
      this.$nextTick(() => {
        const el = document.querySelector(`.code-mount[data-qid="${qid}"]`);
        if (el && typeof CodeMirrorBundle !== "undefined") {
          CodeMirrorBundle.reconfigureLanguage(el, lang);
        }
      });
    },

    reconfigureAllCodeThemes() {
      const theme = this.codeSettings?.theme || "one-dark";
      localStorage.setItem("md-quiz-code-theme", theme);
      if (typeof CodeMirrorBundle === "undefined") return;
      this.$nextTick(() => {
        document.querySelectorAll(".code-mount").forEach((el) => {
          if (el._cmView) CodeMirrorBundle.reconfigureTheme(el, theme);
        });
      });
    },

    toggleCodeWrap() {
      const wrap = !this.codeSettings?.wrap;
      this.codeSettings = { ...(this.codeSettings || {}), wrap };
      localStorage.setItem("md-quiz-code-wrap", String(wrap));
      if (typeof CodeMirrorBundle === "undefined") return;
      document.querySelectorAll(".code-mount").forEach((el) => {
        if (el._cmView) {
          CodeMirrorBundle.reconfigureWrap(el, wrap);
        }
      });
    },

    // ── question helpers ──

    allQuestions() {
      return this.state.quiz?.spec?.questions || [];
    },

    questionGroups() {
      const all = this.allQuestions();
      const labelFor = (q) => {
        if (q.bonus) return "附加题";
        const key = String(q.type || "").trim();
        if (key === "single" || key === "multiple") return "选择题";
        if (key === "short") return "简答题";
        if (key === "code") return "编程题";
        if (key === "traits") return "量表题";
        return "其他";
      };
      const typesFor = (label) => {
        if (label === "选择题") return ["single", "multiple"];
        if (label === "简答题") return ["short"];
        if (label === "编程题") return ["code"];
        if (label === "量表题") return ["traits"];
        if (label === "附加题") return [];
        return [];
      };
      // 严格按源码顺序分段：连续同类型题组成一段，类型变化处切段；附加题独立成段
      const groups = [];
      for (const q of all) {
        const label = labelFor(q);
        const last = groups[groups.length - 1];
        if (last && last.label === label) {
          last.questions.push(q);
        } else {
          groups.push({ label, types: typesFor(label), questions: [q], isBonus: label === "附加题" });
        }
      }
      return groups;
    },

    groupHeaderSuffix(group) {
      const count = group.questions?.length || 0;
      if (group.isBonus) {
        return `（共${count}题）`;
      }
      return `（共${count}题，${this.groupTotalPoints(group)}分）`;
    },

    answeredQids() {
      const answers = this.state.assignment?.answers || {};
      return new Set(Object.keys(answers).filter((qid) => {
        const v = answers[qid];
        return v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
      }));
    },

    unansweredQuestions() {
      const answered = this.answeredQids();
      return this.allQuestions().filter((q) => !answered.has(String(q.qid || "")));
    },

    answeredCount() {
      return this.answeredQids().size;
    },

    totalQuestions() {
      return this.allQuestions().length;
    },

    questionStatus(qid) {
      return this.answeredQids().has(String(qid || "")) ? "answered" : "unanswered";
    },

    groupAnsweredCount(group) {
      const answered = this.answeredQids();
      return (group.questions || []).filter((q) => answered.has(String(q.qid || ""))).length;
    },

    groupTotalPoints(group) {
      return (group.questions || []).reduce((sum, q) => sum + Number(q.points || q.max_points || 0), 0);
    },

    groupSectionLabel(gi) {
      const labels = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
      return labels[gi] || String(gi + 1);
    },

    questionTypeLabel(type) {
      const map = { single: "单选", multiple: "多选", short: "简答", code: "编程", traits: "量表" };
      return map[String(type || "").trim()] || type;
    },

    currentQidFromHash() {
      const hash = location.hash.replace(/^#/, "");
      if (hash.startsWith("q-")) return hash.slice(2);
      return "";
    },

    // ── answer actions ──

    async saveAnswer(question, value) {
      if (!question || !this.route.token) return;
      const qid = String(question.qid || "");
      if (!qid) return;
      this.actionBusy = true;
      try {
        const body = {
          question_id: qid,
          answer: value,
          advance: false,
          submit: false,
          session_id: this.sessionId,
          signals: this.processSignalsPayload([qid]),
          process_summary: this.processSummarySnapshot(),
        };
        this.logProcessSignalsRequest("full-save-request", body);
        const data = await this.api(`/api/public/answers/${encodeURIComponent(this.route.token)}`, {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        });
        this.logProcessSignalsResponse("full-save-response", data);
      } catch (error) {
        this._processDebug("full-save-error", { qid, message: String(error?.message || "") });
        throw error;
      } finally {
        this.actionBusy = false;
      }
    },

    async fqSelectSingleOption(question, optionKey) {
      if (this.actionBusy) return;
      const qid = String(question.qid || "");
      if (!qid) return;
      if (!this.state.assignment.answers) this.state.assignment.answers = {};
      this.state.assignment.answers[qid] = String(optionKey || "");
      await this.saveAnswer(question, String(optionKey || ""));
    },

    fqToggleMultipleOption(question, optionKey) {
      if (this.actionBusy) return;
      const qid = String(question.qid || "");
      if (!qid) return;
      if (!this.state.assignment.answers) this.state.assignment.answers = {};
      const current = Array.isArray(this.state.assignment.answers[qid])
        ? [...this.state.assignment.answers[qid]]
        : [];
      const value = String(optionKey || "");
      if (!value) return;
      const idx = current.indexOf(value);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(value);
      }
      this.state.assignment.answers[qid] = current;
      this.saveAnswer(question, current);
    },

    fqIsSingleSelected(question, optionKey) {
      return String(this.state.assignment?.answers?.[String(question.qid || "")] || "") === String(optionKey || "");
    },

    fqIsMultipleSelected(question, optionKey) {
      const current = this.state.assignment?.answers?.[String(question.qid || "")] || [];
      return Array.isArray(current) && current.includes(String(optionKey || ""));
    },

    // ── short answer ──

    shortAnswerDraft(qid) {
      return String(this.state.assignment?.answers?.[qid] || "");
    },

    _shortTimers: {},
    _codeTimers: {},

    debounceSaveShort(question) {
      const qid = String(question.qid || "");
      if (!qid) return;
      if (this._shortTimers[qid]) window.clearTimeout(this._shortTimers[qid]);
      this._shortTimers[qid] = window.setTimeout(() => {
        delete this._shortTimers[qid];
        const value = String(this.state.assignment?.answers?.[qid] || "").trim();
        if (value) {
          this.saveAnswer(question, value);
        }
      }, 1500);
    },

    debounceSaveCode(question) {
      const qid = String(question.qid || "");
      if (!qid) return;
      if (this._codeTimers[qid]) window.clearTimeout(this._codeTimers[qid]);
      this._codeTimers[qid] = window.setTimeout(() => {
        delete this._codeTimers[qid];
        const el = document.querySelector(`.code-mount[data-qid="${qid}"]`);
        const value = (el && typeof CodeMirrorBundle !== "undefined") ? CodeMirrorBundle.getCodeMirrorValue(el) : "";
        if (!this.state.assignment.answers) this.state.assignment.answers = {};
        this.state.assignment.answers[qid] = value;
        if (value.trim()) {
          this.saveAnswer(question, value);
        }
      }, 2000);
    },

    // ── submit ──

    confirmSubmitVisible: false,
    confirmSubmitLoading: false,

    showConfirmSubmit() {
      this.confirmSubmitVisible = true;
    },

    hideConfirmSubmit() {
      this.confirmSubmitVisible = false;
    },

    async confirmSubmit() {
      if (this.confirmSubmitLoading) return;
      this.confirmSubmitLoading = true;
      // Clear all auto-save debounce timers to prevent post-submit saves
      Object.values(this._shortTimers || {}).forEach(t => window.clearTimeout(t));
      this._shortTimers = {};
      Object.values(this._codeTimers || {}).forEach(t => window.clearTimeout(t));
      this._codeTimers = {};
      // Also clear CodeMirror saveTimers managed by router.js
      if (this._codeMirrorSaveTimers) {
        Object.values(this._codeMirrorSaveTimers).forEach(t => window.clearTimeout(t));
        this._codeMirrorSaveTimers = {};
      }
      try {
        const body = {
          question_id: "",
          answer: null,
          advance: false,
          submit: true,
          session_id: this.sessionId,
          signals: this.processSignalsPayload(),
          process_summary: this.processSummarySnapshot(),
        };
        this.logProcessSignalsRequest("full-submit-request", body);
        await this.api(`/api/public/answers/${encodeURIComponent(this.route.token)}`, {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        });
        await this.loadAttempt(this.route.token);
      } catch (error) {
        this._processDebug("full-submit-error", { message: String(error?.message || "") });
        throw error;
      } finally {
        this.confirmSubmitLoading = false;
        this.confirmSubmitVisible = false;
      }
    },

    // ── total countdown timer ──

    totalRemainingSeconds: 0,
    totalTimer: null,

    startTotalTimer() {
      this.stopTotalTimer();
      const remaining = Number(this.state?.quiz?.remaining_seconds || 0);
      if (remaining <= 0) return;
      this.totalRemainingSeconds = remaining;
      this.totalTimer = window.setInterval(() => {
        if (this.totalRemainingSeconds > 0) {
          this.totalRemainingSeconds--;
        }
      }, 1000);
    },

    stopTotalTimer() {
      if (this.totalTimer) {
        window.clearInterval(this.totalTimer);
        this.totalTimer = null;
      }
    },

    timerDisplay() {
      const s = Math.max(0, Number(this.totalRemainingSeconds || 0));
      if (s <= 0 && !this.state?.quiz?.entered_at) return "--";
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return m + "分" + sec + "秒";
    },

    progressDisplay() {
      return this.answeredCount() + "/" + this.totalQuestions();
    },

    // ── cleanup on view switch ──

    cleanupFullQuiz() {
      this.stopTotalTimer();
      this.confirmSubmitVisible = false;
      this.confirmSubmitLoading = false;
    },
  };
}
