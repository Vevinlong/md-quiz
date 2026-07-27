export function createAdminAccountsModule() {
  return {
    async loadAccounts() {
      try {
        const data = await this.api("/api/admin/accounts");
        this.accountList = data?.items || [];
      } catch (_e) {
        this.accountList = [];
      }
    },

    async submitCreateAccount() {
      const username = String(this.createForm?.username || "").trim();
      const password = String(this.createForm?.password || "").trim();
      if (!username || !password) {
        this.createError = "用户名和密码不能为空";
        return;
      }
      this.createBusy = true;
      this.createError = "";
      try {
        await this.api("/api/admin/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, role: "admin" }),
        });
        this.showCreateForm = false;
        this.createForm = { username: "", password: "" };
        await this.loadAccounts();
      } catch (e) {
        this.createError = String(e?.message || "创建失败");
      } finally {
        this.createBusy = false;
      }
    },

    deleteAccount(user) {
      this.deleteTarget = user;
    },

    async confirmDeleteAccount() {
      if (!this.deleteTarget) return;
      this.deleteBusy = true;
      try {
        await this.api(`/api/admin/accounts/${this.deleteTarget.id}`, { method: "DELETE" });
        this.deleteTarget = null;
        await this.loadAccounts();
      } catch (_e) {
        this.deleteTarget = null;
      } finally {
        this.deleteBusy = false;
      }
    },
  };
}
