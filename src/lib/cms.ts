  loginStaff(id: string) {
    this.staffSessionId = id;
    try { localStorage.setItem(ADMIN_SESSION_KEY, id); } catch { /* ignore */ }
  }

  logoutStaff() {
    this.staffSessionId = null;
    try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
  }