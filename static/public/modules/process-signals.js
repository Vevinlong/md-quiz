export function createPublicProcessSignalsModule() {
  return {
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

    _processTrackable(qid) {
      const question = this._processQuestion(qid);
      return question && ["short", "code"].includes(String(question.type || "").trim()) ? question : null;
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
    },

    trackProcessPaste(qid) {
      const question = this._processTrackable(qid);
      if (!question) return;
      this._processCurrentQid = String(qid || "");
      this._ensureProcessSignal(qid).paste_count += 1;
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
      if (document.hidden) {
        this._processFinishHiddenSwitch();
        const qid = this._processFallbackQid();
        if (!qid) return;
        const signal = this._ensureProcessSignal(qid);
        signal.tab_switches.push({
          at_sec: this._processSecondsSinceStart(qid),
          duration_sec: 0,
        });
        this._processHiddenQid = qid;
        this._processHiddenAtMs = Date.now();
      } else {
        this._processFinishHiddenSwitch();
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
      if (!hasFact) return null;
      return {
        paste_count: Number(signal.paste_count || 0),
        chunk_inputs: Array.isArray(signal.chunk_inputs) ? signal.chunk_inputs : [],
        edit_start_ts: startedAtMs ? Math.floor(startedAtMs / 1000) : null,
        edit_duration_seconds: startedAtMs ? Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)) : null,
        tab_switches: Array.isArray(signal.tab_switches) ? signal.tab_switches : [],
      };
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
      return Object.keys(payload).length ? payload : undefined;
    },

    hydrateProcessSignalsFromState() {
      if (this._processHydrated) return;
      this._processHydrated = true;
      const stored = this.state?.assignment?.process_signals;
      const answers = this.state?.assignment?.answers || {};
      if (!stored || typeof stored !== "object") return;
      for (const [qid, raw] of Object.entries(stored)) {
        if (!this._processTrackable(qid)) continue;
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
    },

    initProcessSignals() {
      if (this._processListenersReady) return;
      this._processListenersReady = true;
      this._processInputHandler = (event) => {
        const textarea = event?.target?.closest?.("textarea[data-process-qid]");
        if (textarea) {
          this.trackProcessInput(textarea.dataset.processQid, textarea.value);
        }
      };
      this._processFocusHandler = (event) => {
        const qid = this._processQidFromEvent(event);
        if (qid) this.markProcessFocus(qid);
      };
      this._processPasteHandler = (event) => {
        const qid = this._processQidFromEvent(event);
        if (qid) this.trackProcessPaste(qid);
      };
      this._processVisibilityHandler = () => this.trackProcessVisibility();
      document.addEventListener("input", this._processInputHandler, true);
      document.addEventListener("paste", this._processPasteHandler, true);
      document.addEventListener("focusin", this._processFocusHandler, true);
      document.addEventListener("visibilitychange", this._processVisibilityHandler);
    },
  };
}
