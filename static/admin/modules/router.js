import { clearFragmentMount, loadHtmlFragment } from "/static/assets/js/shared/runtime.js";

export const ADMIN_ROUTE_FRAGMENTS = {
  login: { fragment: "/static/admin/pages/login.html", mountRef: "loginMount" },
  quizzes: { fragment: "/static/admin/pages/quizzes.html", mountRef: "pageMount" },
  "quiz-analytics": { fragment: "/static/admin/pages/quiz-analytics.html", mountRef: "pageMount" },
  "quiz-detail": { fragment: "/static/admin/pages/quiz-detail.html", mountRef: "pageMount" },
  candidates: { fragment: "/static/admin/pages/candidates.html", mountRef: "pageMount" },
  "job-descriptions": { fragment: "/static/admin/pages/job-descriptions.html", mountRef: "pageMount" },
  "candidate-detail": { fragment: "/static/admin/pages/candidate-detail.html", mountRef: "pageMount" },
  assignments: { fragment: "/static/admin/pages/assignments.html", mountRef: "pageMount" },
  "attempt-detail": { fragment: "/static/admin/pages/attempt-detail.html", mountRef: "pageMount" },
  logs: { fragment: "/static/admin/pages/logs.html", mountRef: "pageMount" },
  status: { fragment: "/static/admin/pages/status.html", mountRef: "pageMount" },
  mcp: { fragment: "/static/admin/pages/mcp.html", mountRef: "pageMount" },
  accounts: { fragment: "/static/admin/pages/accounts.html", mountRef: "pageMount" },
};

export function createAdminRouterModule() {
  return {
    normalizeRouteLocation(pathOrUrl = "", search = "") {
      const raw = String(pathOrUrl || "").trim() || "/admin";
      try {
        const url = new URL(raw, window.location.origin);
        return { pathname: url.pathname, search: url.search || String(search || "") };
      } catch (_error) {
        const [pathnamePart, searchPart = ""] = raw.split("?");
        return {
          pathname: pathnamePart || "/admin",
          search: search || (searchPart ? `?${searchPart}` : ""),
        };
      }
    },

    parseRouteQuery(search = "") {
      const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
      return Object.fromEntries(params.entries());
    },

    async resolveAdminRouteMount(refName, maxTicks = 4) {
      let mount = this.$refs?.[refName];
      if (mount instanceof HTMLElement) {
        return mount;
      }
      // 登录态切换依赖 x-if 重建壳层，先等挂载点真正进入 DOM。
      for (let index = 0; index < maxTicks; index += 1) {
        if (typeof this.$nextTick === "function") {
          await this.$nextTick();
        } else {
          await Promise.resolve();
        }
        mount = this.$refs?.[refName];
        if (mount instanceof HTMLElement) {
          return mount;
        }
      }
      return null;
    },

    currentAdminRouteFragment() {
      return ADMIN_ROUTE_FRAGMENTS[String(this.route?.name || "").trim()] || ADMIN_ROUTE_FRAGMENTS.quizzes;
    },

    async renderCurrentRoute() {
      const current = this.currentAdminRouteFragment();
      const target = await this.resolveAdminRouteMount(current.mountRef);
      const otherRef = current.mountRef === "loginMount" ? "pageMount" : "loginMount";
      const other = this.$refs?.[otherRef];
      clearFragmentMount(other, window.Alpine);
      if (!(target instanceof HTMLElement)) {
        return;
      }
      await loadHtmlFragment({
        mount: target,
        path: current.fragment,
        cache: null,
        alpine: window.Alpine,
      });
    },

    resolveRoute(pathname, search = "") {
      const path = pathname || "/admin";
      const currentSearch = String(search || "");
      const query = this.parseRouteQuery(currentSearch);
      const withMeta = (route) => ({
        ...route,
        search: currentSearch,
        query,
        fullPath: `${route.path}${currentSearch}`,
      });
      if (path === "/admin/login") {
        return withMeta({ name: "login", path, title: "管理员登录", section: "Login", params: {} });
      }
      if (path === "/admin") {
        return withMeta({ name: "assignments", path: "/admin/assignments", title: "邀约与答题", section: "Assignments", params: {} });
      }
      if (path === "/admin/quizzes") {
        return withMeta({ name: "quizzes", path: "/admin/quizzes", title: "测验", section: "Quizzes", params: {} });
      }
      if (path === "/admin/quiz-analytics") {
        return withMeta({ name: "quiz-analytics", path, title: "测验分析", section: "Quiz Analytics", params: {} });
      }
      let match = path.match(/^\/admin\/(?:quizzes|exams)\/([^/]+)$/);
      if (match) {
        return withMeta({
          name: "quiz-detail",
          path,
          title: "测验详情",
          section: "Quizzes",
          params: { quizKey: decodeURIComponent(match[1]) },
        });
      }
      if (path === "/admin/candidates") {
        return withMeta({ name: "candidates", path, title: "候选人", section: "Candidates", params: {} });
      }
      if (path === "/admin/job-descriptions") {
        return withMeta({ name: "job-descriptions", path, title: "职位管理", section: "Job Descriptions", params: {} });
      }
      match = path.match(/^\/admin\/candidates\/(\d+)$/);
      if (match) {
        return withMeta({
          name: "candidate-detail",
          path,
          title: "候选人详情",
          section: "Candidates",
          params: { candidateId: Number(match[1]) },
        });
      }
      if (path === "/admin/assignments") {
        return withMeta({ name: "assignments", path, title: "邀约与答题", section: "Assignments", params: {} });
      }
      if (path === "/admin/accounts") {
        return withMeta({ name: "accounts", path, title: "账户管理", section: "Accounts", params: {} });
      }
      match = path.match(/^\/admin\/(?:attempt|result)\/([^/]+)$/);
      if (match) {
        return withMeta({
          name: "attempt-detail",
          path,
          title: "答题详情",
          section: "Assignments",
          params: { token: decodeURIComponent(match[1]) },
        });
      }
      if (path === "/admin/logs") {
        return withMeta({ name: "logs", path, title: "系统日志", section: "Logs", params: {} });
      }
      if (path === "/admin/status") {
        return withMeta({ name: "status", path, title: "系统状态", section: "Status", params: {} });
      }
      if (path === "/admin/mcp") {
        return withMeta({ name: "mcp", path, title: "MCP", section: "MCP", params: {} });
      }
      return withMeta({ name: "assignments", path: "/admin/assignments", title: "邀约与答题", section: "Assignments", params: {} });
    },

    async refreshSession() {
      const data = await this.api("/api/admin/session", { quiet: true });
      this.session = data || { authenticated: false, username: "" };
      this.loadVersion().catch(() => {});
      // Rebuild navItems based on role
      const common = [
        { href: "/admin/assignments", label: "邀约与答题", icon: "assignment" },
        { href: "/admin/quizzes", label: "测验", icon: "library_books" },
        { href: "/admin/quiz-analytics", label: "测验分析", icon: "analytics" },
        { href: "/admin/job-descriptions", label: "职位管理", icon: "work" },
        { href: "/admin/candidates", label: "候选人", icon: "group" },
      ];
      if (this.session.authenticated && this.session.role === "super_admin") {
        this.navItems = [
          ...common,
          { href: "/admin/accounts", label: "账户管理", icon: "manage_accounts" },
          { href: "/admin/logs", label: "系统日志", icon: "receipt_long" },
          { href: "/admin/status", label: "系统状态", icon: "monitoring" },
          { href: "/admin/mcp", label: "MCP", iconKind: "mcp" },
        ];
      } else {
        this.navItems = common;
      }
      return this.session;
    },

    async loadVersion() {
      try {
        const v = await this.api("/api/admin/version", { quiet: true });
        this.buildVersion = v?.version ? "V" + v.base + "." + v.build : "";
      } catch (_e) {
        this.buildVersion = "";
      }
    },

    async loadBootstrap() {
      await Promise.all([
        this.loadSystemBootstrap(),
        this.loadQuizzes({ quiet: true }),
        this.loadQuizOptions({ quiet: true }),
        this.loadCandidates({ quiet: true }),
      ]);
      try { await this.loadStatusSummary(); } catch (_e) { /* 403 if not super_admin */ }
    },

    setRouteSearchParams(nextParams = {}, { replace = true } = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(nextParams || {})) {
        const text = String(value ?? "").trim();
        if (text) {
          params.set(key, text);
        }
      }
      const search = params.toString() ? `?${params.toString()}` : "";
      const nextRoute = this.resolveRoute(this.route?.path || "/admin/quizzes", search);
      this.route = nextRoute;
      history[replace ? "replaceState" : "pushState"]({}, "", nextRoute.fullPath);
    },

    async handleRoute(pathname, { replace = false, search = "" } = {}) {
      if (!this.session.authenticated && pathname !== "/admin/login") {
        this.destroyLogsChart();
        this.stopSyncPolling();
        this.stopAssignmentsPolling();
        history.replaceState({}, "", "/admin/login");
        this.route = this.resolveRoute("/admin/login", "");
        await this.renderCurrentRoute();
        return;
      }

      let nextRoute = this.resolveRoute(pathname, search);
      if (this.session.authenticated && nextRoute.name === "login") {
        nextRoute = this.resolveRoute("/admin/assignments", "");
        replace = true;
      }

      const previousRouteName = String(this.route?.name || "").trim();
      if (previousRouteName === "logs" && nextRoute.name !== "logs") {
        this.destroyLogsChart();
      }
      if (previousRouteName && previousRouteName !== nextRoute.name) {
        this.resetAdminCompactTab(previousRouteName);
      }

      this.route = nextRoute;
      this.ensureAdminCompactTab(this.route.name);
      if (!replace) {
        history.pushState({}, "", this.route.fullPath);
      } else {
        history.replaceState({}, "", this.route.fullPath);
      }

      this.error = "";
      await this.renderCurrentRoute();
      await this.$nextTick();

      // Initialize CodeMirror on .code-stem and .code-answer blocks (quiz detail, attempt detail, etc.)
      if (typeof CodeMirrorBundle !== "undefined") {
        document.querySelectorAll(".code-stem, .code-answer").forEach((el) => {
          // Alpine 的 x-text 更新会摧毁 CodeMirror DOM，但 _cmView 残留，需要检测并重建
          if (el._cmView) {
            if (el.querySelector(".cm-editor")) return;
            try { el._cmView.destroy(); } catch (e) { /* ignore */ }
            delete el._cmView;
          }
          try {
            const lang = el.dataset.lang || "java";
            const val = el.textContent || "";
            el.textContent = "";
            // Admin pages are light-themed, use light defaults
            CodeMirrorBundle.createCodeMirror(el, { value: val, lang: lang, pageTheme: "light", themeName: "atom-one-light", readOnly: true, wrap: true });
          } catch (e) {
            console.warn("[admin] code-block init failed:", e.message);
          }
        });
      }

      if (this.route.name !== "quizzes") {
        this.stopSyncPolling();
      }
      if (!["assignments", "attempt-detail"].includes(this.route.name)) {
        this.stopAssignmentsPolling();
      }
      if (this.route.name !== "candidates") {
        this.stopCandidateResumeUploadPolling();
      }
      if (this.route.name !== "candidate-detail") {
        this.stopCandidateResumeReparsePolling();
      }
      if (this.route.name !== "job-descriptions") {
        window.clearTimeout(this.jobDescriptionsFilterTimer);
        this.jobDescriptionsFilterTimer = null;
      }

      switch (this.route.name) {
        case "quizzes":
          await this.loadQuizzes();
          break;
        case "quiz-analytics":
          await this.loadQuizAnalyticsPage();
          break;
        case "quiz-detail":
          await this.loadQuizDetail(this.route.params.quizKey);
          break;
        case "candidates":
          this.resetCandidateResumeUploadState();
          await this.loadCandidates();
          break;
        case "candidate-detail":
          await this.loadCandidateDetail(this.route.params.candidateId);
          break;
        case "job-descriptions":
          await this.loadQuizOptions({ quiet: true });
          await this.loadJobDescriptions();
          break;
        case "assignments":
          await this.loadQuizOptions({ quiet: true });
          await this.loadCandidates({ quiet: true });
          await this.loadAssignments();
          break;
        case "attempt-detail":
          await this.loadAttemptDetail(this.route.params.token);
          break;
        case "logs":
          await this.loadLogs();
          break;
        case "status":
          await this.loadStatus();
          break;
        case "mcp":
          await this.loadMcpPage();
          break;
        case "accounts":
          await this.loadAccounts();
          break;
        default:
          break;
      }
      await this.$nextTick();
      this.updateAdminStickyLayoutState();
    },

    async go(path) {
      const next = this.normalizeRouteLocation(path);
      await this.handleRoute(next.pathname, { search: next.search });
    },
  };
}
