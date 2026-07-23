export function createPublicFullQuizModule() {
  return {
    // ── question helpers ──

    allQuestions() {
      return this.state.quiz?.spec?.questions || [];
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
        await this.api(`/api/public/answers/${encodeURIComponent(this.route.token)}`, {
          method: "POST",
          body: JSON.stringify({
            question_id: qid,
            answer: value,
            advance: false,
            submit: false,
            session_id: this.sessionId,
          }),
          headers: { "Content-Type": "application/json" },
        });
      } finally {
        this.actionBusy = false;
      }
    },

    async selectSingleOption(question, optionKey) {
      if (this.actionBusy) return;
      const qid = String(question.qid || "");
      if (!qid) return;
      if (!this.state.assignment.answers) this.state.assignment.answers = {};
      this.state.assignment.answers[qid] = String(optionKey || "");
      await this.saveAnswer(question, String(optionKey || ""));
    },

    toggleMultipleOption(question, optionKey) {
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

    isSingleSelected(question, optionKey) {
      return String(this.state.assignment?.answers?.[String(question.qid || "")] || "") === String(optionKey || "");
    },

    isMultipleSelected(question, optionKey) {
      const current = this.state.assignment?.answers?.[String(question.qid || "")] || [];
      return Array.isArray(current) && current.includes(String(optionKey || ""));
    },

    // ── short answer ──

    shortAnswerDraft(qid) {
      return String(this.state.assignment?.answers?.[qid] || "");
    },

    _shortTimers: {},

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
      try {
        await this.api(`/api/public/answers/${encodeURIComponent(this.route.token)}`, {
          method: "POST",
          body: JSON.stringify({
            question_id: "",
            answer: null,
            advance: false,
            submit: true,
            session_id: this.sessionId,
          }),
          headers: { "Content-Type": "application/json" },
        });
        await this.loadAttempt(this.route.token);
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
      const remaining = this.state.quiz?.remaining_seconds;
      if (!remaining || remaining <= 0) return;
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

    // ── cleanup on view switch ──

    cleanupFullQuiz() {
      this.stopTotalTimer();
      this.confirmSubmitVisible = false;
      this.confirmSubmitLoading = false;
    },
  };
}
