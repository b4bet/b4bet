  // ---- Dynamic Pages (Supabase-persisted via settings) ----
  addDynamicPage(title: string, html: string) {
    const page: DynamicPage = { id: 'dp_' + Math.random().toString(36).slice(2), title, html, ts: Date.now() };
    this.dynamicPages = [...this.dynamicPages, page];
    this.emitDynamicPages();
    this.persistDynamicPagesToSupabase();
  }
  updateDynamicPage(id: string, patch: Partial<Pick<DynamicPage, 'title' | 'html'>>) {
    this.dynamicPages = this.dynamicPages.map(p => p.id === id ? { ...p, ...patch, ts: Date.now() } : p);
    this.emitDynamicPages();
    this.persistDynamicPagesToSupabase();
  }
  removeDynamicPage(id: string) {
    this.dynamicPages = this.dynamicPages.filter(p => p.id !== id);
    this.emitDynamicPages();
    this.persistDynamicPagesToSupabase();
  }
  private persistDynamicPagesToSupabase() {
    void supabase.rpc('admin_update_setting', {
      p_key: 'dynamic_pages',
      p_value: this.dynamicPages as unknown as string,
    }).catch(() => {});
  }
