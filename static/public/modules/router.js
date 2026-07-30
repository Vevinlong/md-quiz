import { createSessionId } from "./constants.js";

const BACK_GUARD_WINDOW_MS = 2000;
const BACK_GUARD_HISTORY_STATE_KEY = "__mdQuizPublicBackGuard";

export function createPublicRouterModule() {
  return {
          currentPublicPath() {
            return `${location.pathname}${location.search}${location.hash}`;
          },

          currentHistoryState() {
            const state = window.history.state;
            return state && typeof state === "object" ? state : {};
          },

          isBackGuardHistoryState(state = this.currentHistoryState()) {
            return Boolean(state?.[BACK_GUARD_HISTORY_STATE_KEY]);
          },

          clearBackGuardTimer() {
            if (this.backGuardTimer) {
              window.clearTimeout(this.backGuardTimer);
              this.backGuardTimer = null;
            }
          },

          resetBackGuardPrompt() {
            this.clearBackGuardTimer();
            this.backGuardArmed = false;
            this.backGuardDeadline = 0;
            this.backGuardHintVisible = false;
          },

          armBackGuardPrompt() {
            this.resetBackGuardPrompt();
            this.backGuardArmed = true;
            this.backGuardHintVisible = true;
            this.backGuardDeadline = Date.now() + BACK_GUARD_WINDOW_MS;
            this.backGuardTimer = window.setTimeout(() => {
              this.resetBackGuardPrompt();
            }, BACK_GUARD_WINDOW_MS);
          },

          shouldEnableBackGuard() {
            const step = String(this.state.step || "").trim();
            return this.route.kind === "attempt" && ["verify", "resume", "quiz"].includes(step);
          },

          shouldSkipSameFlowHistory(pathname = location.pathname) {
            const currentToken = String(this.route?.token || "").trim();
            const nextToken = String(this.parseRoute(pathname)?.token || "").trim();
            return Boolean(currentToken && nextToken && currentToken === nextToken);
          },

          shouldSkipSameFlowHistoryOutsideGuard(pathname = location.pathname) {
            return ["done", "unavailable"].includes(String(this.viewCard || "").trim())
              && this.shouldSkipSameFlowHistory(pathname);
          },

          pushBackGuardHistoryEntry() {
            const nextState = {
              ...this.currentHistoryState(),
              [BACK_GUARD_HISTORY_STATE_KEY]: true,
            };
            window.history.pushState(nextState, "", this.currentPublicPath());
            this.backGuardHistoryArmed = true;
          },

          syncBackGuardAfterRoute() {
            if (this.shouldEnableBackGuard()) {
              this.backGuardBypass = false;
              this.backGuardSkipToken = "";
              if (!this.isBackGuardHistoryState()) {
                this.pushBackGuardHistoryEntry();
              } else {
                this.backGuardHistoryArmed = true;
              }
              return;
            }
            this.resetBackGuardPrompt();
            this.backGuardBypass = false;
            this.backGuardSkipToken = "";
            this.backGuardHistoryArmed = false;
          },

          handleBeforeUnload(event) {
            if (this.backGuardBypass || !this.shouldEnableBackGuard()) return undefined;
            event.preventDefault();
            event.returnValue = "";
            return "";
          },

          async handlePopState(event) {
            const nextPathname = location.pathname;
            if (this.backGuardBypass) {
              if (this.backGuardSkipToken && this.shouldSkipSameFlowHistory(nextPathname)) {
                window.history.back();
                return;
              }
              this.backGuardBypass = false;
              this.backGuardSkipToken = "";
              this.backGuardHistoryArmed = this.isBackGuardHistoryState(event?.state);
              await this.syncRoute(nextPathname);
              return;
            }

            if (!this.shouldEnableBackGuard()) {
              if (this.shouldSkipSameFlowHistoryOutsideGuard(nextPathname)) {
                window.history.back();
                return;
              }
              this.backGuardHistoryArmed = this.isBackGuardHistoryState(event?.state);
              await this.syncRoute(nextPathname);
              return;
            }

            const stillArmed = this.backGuardArmed && Date.now() < Number(this.backGuardDeadline || 0);
            if (!stillArmed) {
              this.armBackGuardPrompt();
              this.pushBackGuardHistoryEntry();
              return;
            }

            this.resetBackGuardPrompt();
            this.backGuardBypass = true;
            this.backGuardSkipToken = String(this.route?.token || "").trim();
            this.backGuardHistoryArmed = false;
            window.history.back();
          },

          async init() {
            if (!this._popstateHandler) {
              this._popstateHandler = (event) => {
                this.handlePopState(event).catch((error) => {
                  this.error = error.message || "页面切换失败";
                });
              };
              window.addEventListener("popstate", this._popstateHandler);
            }
            if (!this._beforeUnloadHandler) {
              this._beforeUnloadHandler = (event) => this.handleBeforeUnload(event);
              window.addEventListener("beforeunload", this._beforeUnloadHandler);
            }
            try {
              await this.syncRoute(location.pathname);
            } catch (error) {
              this.error = error.message || "页面初始化失败";
            } finally {
              this.booting = false;
            }
          },

          async syncRoute(pathname) {
            this.error = "";
            this.resetSmsState();
            this.route = this.parseRoute(pathname);
            if (this.route.kind === "invite") {
              await this.ensureInvite(this.route.token);
              return;
            }
            if (!this.route.token) {
              throw new Error("无效链接");
            }
            this.ensureSession(this.route.token);
            await this.loadAttempt(this.route.token);
          },

          parseRoute(pathname) {
            let match = pathname.match(/^\/p\/([^/]+)$/);
            if (match) return { kind: "invite", token: decodeURIComponent(match[1]) };
            match = pathname.match(/^\/(?:t|resume|quiz|exam|done|a)\/([^/]+)$/);
            if (match) return { kind: "attempt", token: decodeURIComponent(match[1]) };
            return { kind: "invalid", token: "" };
          },

          sessionStorageKey(token) {
            return `md-quiz-public-session:${token}`;
          },

          ensureSession(token) {
            if (!token) return "";
            const key = this.sessionStorageKey(token);
            let sessionId = window.sessionStorage.getItem(key) || "";
            if (!sessionId) {
              sessionId = createSessionId();
              window.sessionStorage.setItem(key, sessionId);
            }
            this.sessionId = sessionId;
            return sessionId;
          },

          async ensureInvite(publicToken) {
            const result = await this.api(`/api/public/invites/${encodeURIComponent(publicToken)}/ensure`, {
              method: "POST",
            });
            history.replaceState({}, "", result.redirect);
            this.route = { kind: "attempt", token: result.token };
            this.ensureSession(result.token);
            await this.loadAttempt(result.token);
          },

    async syncFromState() {
          this.clearAutosaveTimer();
          this.stopQuestionTimer();
          this.verifySubmitting = false;
          if (this.state.step !== "verify") {
            this.resetSmsState();
          }

          if (this.state.step === "verify") {
            this.viewCard = "start";
            if (this.state.verify?.mode !== "direct_phone") {
              this.forms.verify.name = this.state.verify?.name || "";
              this.forms.verify.phone = this.state.verify?.phone || "";
            }
            this.resetVerifyCode();
          } else if (this.state.step === "resume") {
            this.viewCard = "resume";
          } else if (this.state.step === "quiz") {
            if (this.state.quiz?.entered_at) {
              const examMode = String(this.state.quiz?.exam_mode || "").trim().toLowerCase();
              this.viewCard = examMode === "full" ? "full-quiz" : "question";
            } else {
              this.viewCard = "start";
            }
          } else if (this.state.step === "done") {
            this.viewCard = "done";
          } else {
            this.viewCard = "unavailable";
          }

          const question = this.currentQuestion();
          const answer = this.currentAnswer();
          if (question?.type === "short") {
            this.textDraft = typeof answer === "string" ? answer : "";
            this.selectedMultiple = [];
          } else if (question?.type === "multiple") {
            this.selectedMultiple = Array.isArray(answer) ? [...answer] : [];
            this.textDraft = "";
          } else {
            this.textDraft = "";
            this.selectedMultiple = [];
          }

          this.autosaveMessage = this.state.quiz?.entered_at ? this.deferredSaveText(question) : "";
          if (this.viewCard === "full-quiz") {
            this.startTotalTimer();
          } else {
            this.syncQuestionTimer();
          }
          await this.renderCurrentView();
          await this.$nextTick();
          if (this.state.step === "verify") {
            this.focusOtpInput(0);
          }
          if (this.viewCard === "full-quiz" && typeof CodeMirrorBundle !== "undefined") {
            this.$nextTick(() => {
              const theme = this.codeSettings?.theme || "one-dark";
              const wrap = this.codeSettings?.wrap === true;
              const pageTheme = this.pageTheme || "dark";
              document.querySelectorAll(".code-mount").forEach((el) => {
                if (el._cmView) return;
                const qid = el.dataset.qid;
                const lang = el.dataset.lang || "java";
                const val = (this.state?.assignment?.answers || {})[qid] || "";
                const question = (this.state?.quiz?.spec?.questions || []).find(q => String(q.qid) === qid);
                let saveTimer = null;
                CodeMirrorBundle.createCodeMirror(el, {
                  value: val, lang: lang, pageTheme: pageTheme, themeName: theme, wrap: wrap,
                  onChange(v) {
                    if (!this.state.assignment.answers) this.state.assignment.answers = {};
                    this.state.assignment.answers[qid] = v;
                    if (saveTimer) clearTimeout(saveTimer);
                    const self = this;
                    saveTimer = setTimeout(() => {
                      if (v.trim() && question) self.saveAnswer(question, v);
                    }, 2000);
                  }.bind(this),
                });
              });
              // Initialize read-only stem code blocks
              document.querySelectorAll(".code-stem").forEach((el) => {
                if (el._cmView) return;
                try {
                  const lang = el.dataset.lang || "java";
                  const val = el.textContent || "";
                  const id = this._nextStemId();
                  el.dataset.stemId = id;
                  el.textContent = "";

                  const stTheme = this.getStemTheme(id);
                  const stWrap = this.getStemWrap(id);
                  const themeNames = CodeMirrorBundle.getThemeNames(pageTheme);
                  const selectHtml = themeNames.map(t =>
                    '<option value="' + t.id + '"' + (t.id === stTheme ? ' selected' : '') + '>' + t.label + '</option>'
                  ).join("");

                  // Build full toolbar (same structure as answer editor)
                  const tb = document.createElement("div");
                  tb.className = "stem-toolbar flex items-center gap-2 mb-2 flex-wrap";
                  tb.innerHTML =
                    '<span class="stem-toolbar--badge rounded-full border border-white/10 bg-white/8 px-2.5 py-0.5 text-[11px] font-semibold text-slate-400">' + lang + '</span>' +
                    '<span class="text-[11px] text-slate-500">高亮配色</span>' +
                    '<select class="full-quiz--toolbar-select rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 transition focus:border-emerald-400/40 focus:outline-none">' + selectHtml + '</select>' +
                    '<button type="button" class="full-quiz--toolbar-btn rounded-lg border px-2.5 py-1 text-xs transition' +
                    (stWrap ? ' border-emerald-400/40 bg-emerald-400/10 text-emerald-400' : ' border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300') + '">↻ 自动换行</button>';
                  el.parentNode.insertBefore(tb, el);

                  const thSel = tb.querySelector("select");
                  const wrapBtn = tb.querySelector("button");

                  CodeMirrorBundle.createCodeMirror(el, { value: val, lang: lang, pageTheme: pageTheme, themeName: stTheme, readOnly: true, wrap: stWrap });

                  thSel.addEventListener("change", () => {
                    this.setStemTheme(id, thSel.value);
                    if (el._cmView) CodeMirrorBundle.reconfigureTheme(el, thSel.value);
                  });

                  wrapBtn.addEventListener("click", () => {
                    const on = !this.getStemWrap(id);
                    this.setStemWrap(id, on);
                    if (el._cmView) CodeMirrorBundle.reconfigureWrap(el, on);
                    if (on) {
                      wrapBtn.classList.add("border-emerald-400/40", "bg-emerald-400/10", "text-emerald-400");
                      wrapBtn.classList.remove("text-slate-400", "hover:text-slate-300");
                    } else {
                      wrapBtn.classList.remove("border-emerald-400/40", "bg-emerald-400/10", "text-emerald-400");
                      wrapBtn.classList.add("text-slate-400", "hover:text-slate-300");
                    }
                  });
                } catch (e) {
                  console.warn("[code-stem] CM init failed:", e.message);
                }
              });
            });
          }
          this.queueMathTypeset();
          this.syncBackGuardAfterRoute();
        },

          async loadAttempt(token) {
            const data = await this.api(`/api/public/attempt/${encodeURIComponent(token)}`);
            this.state = data || this.state;
            await this.syncFromState();
          },
  };
}
