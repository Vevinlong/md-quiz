const PROCESS_DEBUG_ON_VALUES = new Set(["1", "true", "yes", "on"]);
const PROCESS_DEBUG_VERSION = "20260910-1";

export function createPublicProcessSignalsModule() {
  return {
    processDebugVersion: PROCESS_DEBUG_VERSION,
    _processSignals: {},
    _processLastValues: {},
    _processStartedAtMs: {},
    _processHiddenQid: "",
    _processHiddenAtMs: null,
    _processHydrated: false,
    _processCurrentQid: "",

    _processQuestion(qid) {
      const questions = this.state?.quiz?.spec?.questions || [];
      return questions.find((question) => String(question?.qid || "") === String(qid || "")) || null;
    },

    _processDebugEnabled() {
      try {
        const params = new URLSearchParams(window.location.search);
        const queryValue = String(params.get("process_debug") || "").trim().toLowerCase();
        const storedValue = String(window.localStorage.getItem("md-quiz-process-debug") || "").trim().toLowerCase();
        return PROCESS_DEBUG_ON_VALUES.has(queryValue) || PROCESS_DEBUG_ON_VALUES.has(storedValue);
      } catch (_error) {
        return false;
      }
    },

    _processDebug(event, data = {}) {
      if (!this._processDebugEnabled()) return;
      console.log("[process-signals]", event, data);
    },

    _processDebugAnswerSize(answer) {
      if (answer === null || answer === undefined) return 0;
      if (typeof answer === "string") return answer.length;
      if (Array.isArray(answer)) return answer.length;
      return null;
    },

    _processDebugSignalKeys(value) {
      return value && typeof value === "object" ? Object.keys(value) : [];
    },

    _processDebugTarget(event) {
      const target = event?.target;
      const textarea = target?.closest?.("textarea[data-process-qid]");
      return {
        tag: String(target?.tagName || "").toLowerCase(),
        processQid: String(textarea?.dataset?.processQid || ""),
        codeQid: String(target?.closest?.(".code-mount")?.dataset?.qid || ""),
      };
    },

    logProcessSignalsRequest(stage, body = {}) {
      this._processDebug(stage, {
        questionId: String(body.question_id || ""),
        answerSize: this._processDebugAnswerSize(body.answer),
        advance: Boolean(body.advance),
        submit: Boolean(body.submit),
        forceTimeout: Boolean(body.force_timeout),
        signalsPresent: body.signals !== undefined,
        signals: body.signals ?? null,
      });
    },

    logProcessSignalsResponse(stage, data) {
      const signals = data?.assignment?.process_signals;
      this._processDebug(stage, {
        step: String(data?.step || ""),
        status: String(data?.assignment?.status || ""),
        signalsPresent: signals !== undefined,
        signals: signals ?? null,
      });
    },

    logProcessSignalsState(stage) {
      const questions = this.state?.quiz?.spec?.questions || [];
      this._processDebug(stage, {
        debugVersion: PROCESS_DEBUG_VERSION,
        step: String(this.state?.step || ""),
        examMode: String(this.state?.quiz?.exam_mode || ""),
        questions: questions.map((question) => ({
          qid: String(question?.qid || ""),
          type: String(question?.type || ""),
          trackable: ["short", "code"].includes(String(question?.type || "").trim()),
        })),
        storedSignalKeys: this._processDebugSignalKeys(this.state?.assignment?.process_signals),
        localSignalKeys: this._processDebugSignalKeys(this._processSignals),
        hydrated: Boolean(this._processHydrated),
      });
    },

    _processTrackable(qid) {
      const question = this._processQuestion(qid);
      const trackable = question && ["short", "code"].includes(String(question.type || "").trim()) ? question : null;
      if (!trackable) {
        this._processDebug("ignore-question", {
          qid: String(qid || ""),
          questionFound: Boolean(question),
          type: String(question?.type || ""),
        });
      }
      return trackable;
    },

    _ensureProcessSignal(qid) {
      if (!this._processSignals[qid]) {
        this._processSignals[qid] = {
          paste_count: 0,
          chunk_inputs: [],
          tab_switches: [],
        };
      }
      return this._processSignals[qid];
    },

    _processSecondsSinceStart(qid) {
      const startedAt = this._processStartedAtMs[qid];
      if (!startedAt) return 0;
      return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    },

    markProcessFocus(qid) {
      if (!this._processTrackable(qid)) return;
      this._processCurrentQid = String(qid || "");
    },

    trackProcessInput(qid, rawValue) {
      const question = this._processTrackable(qid);
      if (!question) return;
      qid = String(qid || "");
      const value = String(rawValue || "");
      const previous = String(this._processLastValues[qid] || "");
      this._processCurrentQid = qid;

      if (value && !this._processStartedAtMs[qid]) {
        this._processStartedAtMs[qid] = Date.now();
      }

      const delta = value.length - previous.length;
      if (delta > 0 && delta >= 20) {
        this._ensureProcessSignal(qid).chunk_inputs.push({
          at_sec: this._processSecondsSinceStart(qid),
          chars: delta,
        });
      }
      this._processLastValues[qid] = value;
      this._processDebug("input", {
        qid,
        type: String(question.type || ""),
        previousLength: previous.length,
        valueLength: value.length,
        delta,
        chunkRecorded: delta > 0 && delta >= 20,
        editStartTs: this._processStartedAtMs[qid] ? Math.floor(this._processStartedAtMs[qid] / 1000) : null,
        editDurationSeconds: this._processSecondsSinceStart(qid),
      });
    },

    trackProcessPaste(qid) {
      const question = this._processTrackable(qid);
      if (!question) return;
      this._processCurrentQid = String(qid || "");
      const signal = this._ensureProcessSignal(qid);
      signal.paste_count += 1;
      this._processDebug("paste", {
        qid: String(qid || ""),
        type: String(question.type || ""),
        pasteCount: signal.paste_count,
      });
    },

    _processQidFromEvent(event) {
      const target = event?.target;
      if (!target?.closest) return "";
      const textarea = target.closest("textarea[data-process-qid]");
      if (textarea) return String(textarea.dataset.processQid || "");
      const mount = target.closest(".code-mount[data-qid]");
      return mount ? String(mount.dataset.qid || "") : "";
    },

    _processFallbackQid() {
      const current = this._processCurrentQid;
      if (this._processTrackable(current)) return current;
      const question = this.currentQuestion?.();
      const qid = String(question?.qid || "");
      return this._processTrackable(qid) ? qid : "";
    },

    _processFinishHiddenSwitch() {
      const qid = this._processHiddenQid;
      if (!qid || !this._processHiddenAtMs) return;
      const signal = this._processSignals[qid];
      const list = Array.isArray(signal?.tab_switches) ? signal.tab_switches : [];
      const item = list[list.length - 1];
      if (item && !item.duration_sec) {
        item.duration_sec = Math.max(0, Math.round((Date.now() - this._processHiddenAtMs) / 1000));
      }
      this._processHiddenQid = "";
      this._processHiddenAtMs = null;
    },

    trackProcessVisibility() {
      const hidden = Boolean(document.hidden);
      this._processFinishHiddenSwitch();
      const qid = this._processFallbackQid();
      this._processDebug("visibility", {
        hidden,
        currentQid: String(this._processCurrentQid || ""),
        fallbackQid: qid,
      });
      if (hidden) {
        if (!qid) return;
        const signal = this._ensureProcessSignal(qid);
        signal.tab_switches.push({
          at_sec: this._processSecondsSinceStart(qid),
          duration_sec: 0,
        });
        this._processHiddenQid = qid;
        this._processHiddenAtMs = Date.now();
      } else {
        return;
      }
    },

    processSignalSnapshot(qid) {
      qid = String(qid || "");
      this._processFinishHiddenSwitch();
      const signal = this._processSignals[qid];
      if (!signal) return null;
      const startedAtMs = this._processStartedAtMs[qid];
      const hasFact = Boolean(
        (signal.paste_count || 0) > 0
        || (Array.isArray(signal.chunk_inputs) && signal.chunk_inputs.length)
        || (Array.isArray(signal.tab_switches) && signal.tab_switches.length)
        || startedAtMs
      );
      const snapshot = {
        paste_count: Number(signal.paste_count || 0),
        chunk_inputs: Array.isArray(signal.chunk_inputs) ? signal.chunk_inputs : [],
        edit_start_ts: startedAtMs ? Math.floor(startedAtMs / 1000) : null,
        edit_duration_seconds: startedAtMs ? Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)) : null,
        tab_switches: Array.isArray(signal.tab_switches) ? signal.tab_switches : [],
      };
      if (!hasFact) {
        this._processDebug("snapshot", { qid, result: null, reason: "no-fact" });
        return null;
      }
      this._processDebug("snapshot", { qid, result: snapshot });
      return snapshot;
    },

    processSignalsPayload(qids = null) {
      const candidates = Array.isArray(qids)
        ? qids.map((qid) => String(qid || ""))
        : Object.keys(this._processSignals || {});
      const payload = {};
      for (const qid of candidates) {
        const snapshot = this.processSignalSnapshot(qid);
        if (snapshot) payload[qid] = snapshot;
      }
      const result = Object.keys(payload).length ? payload : undefined;
      this._processDebug("payload", {
        requestedQids: candidates,
        requestedAll: !Array.isArray(qids),
        signalKeys: Object.keys(payload),
        result,
      });
      return result;
    },

    hydrateProcessSignalsFromState() {
      if (this._processHydrated) return;
      this._processHydrated = true;
      const stored = this.state?.assignment?.process_signals;
      const answers = this.state?.assignment?.answers || {};
      if (!stored || typeof stored !== "object") {
        this._processDebug("hydrate", { stored: false, storedSignalKeys: [] });
        return;
      }
      const skippedKeys = [];
      for (const [qid, raw] of Object.entries(stored)) {
        if (!this._processTrackable(qid)) {
          skippedKeys.push(qid);
          continue;
        }
        const signal = raw && typeof raw === "object" ? raw : {};
        this._processSignals[qid] = {
          paste_count: Math.max(0, Number(signal.paste_count || 0)),
          chunk_inputs: Array.isArray(signal.chunk_inputs) ? signal.chunk_inputs : [],
          tab_switches: Array.isArray(signal.tab_switches) ? signal.tab_switches : [],
        };
        const startTs = Number(signal.edit_start_ts);
        if (Number.isFinite(startTs) && startTs > 0) {
          this._processStartedAtMs[qid] = startTs * 1000;
        } else {
          const duration = Number(signal.edit_duration_seconds);
          if (Number.isFinite(duration) && duration > 0) {
            this._processStartedAtMs[qid] = Date.now() - duration * 1000;
          }
        }
        this._processLastValues[qid] = String(answers[qid] || "");
      }
      this._processDebug("hydrate", {
        stored: true,
        storedSignalKeys: Object.keys(stored),
        skippedKeys,
        hydratedSignalKeys: Object.keys(this._processSignals),
      });
    },

    initProcessSignals() {
      if (this._processListenersReady) return;
      this._processListenersReady = true;
      this._processInputHandler = (event) => {
        const textarea = event?.target?.closest?.("textarea[data-process-qid]");
        if (textarea) {
          this._processDebug("textarea-input-event", {
            qid: String(textarea.dataset.processQid || ""),
            valueLength: textarea.value.length,
            target: this._processDebugTarget(event),
          });
          this.trackProcessInput(textarea.dataset.processQid, textarea.value);
        }
      };
      this._processFocusHandler = (event) => {
        const qid = this._processQidFromEvent(event);
        if (qid) {
          this._processDebug("focus-event", {
            qid,
            target: this._processDebugTarget(event),
          });
          this.markProcessFocus(qid);
        }
      };
      this._processPasteHandler = (event) => {
        const qid = this._processQidFromEvent(event);
        this._processDebug("paste-event", {
          qid,
          target: this._processDebugTarget(event),
        });
        if (qid) this.trackProcessPaste(qid);
      };
      this._processVisibilityHandler = () => this.trackProcessVisibility();
      document.addEventListener("input", this._processInputHandler, true);
      document.addEventListener("paste", this._processPasteHandler, true);
      document.addEventListener("focusin", this._processFocusHandler, true);
      document.addEventListener("visibilitychange", this._processVisibilityHandler);
      this._processDebug("init", {
        debugVersion: PROCESS_DEBUG_VERSION,
        listenersReady: true,
      });
    },
  };
}
