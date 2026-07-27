// Patch: Override cms.persistDynamicPagesToSupabase to use the robust version
import { cms } from './cms';
import { persistDynamicPages } from './dynamicPagesPersist';

// Override the private method with a working version
(cms as any).persistDynamicPagesToSupabase = function() {
  void persistDynamicPages(this.dynamicPages).then((ok: boolean) => {
    if (!ok) {
      this.toast({ title: 'Save failed', body: 'Dynamic page could not be saved to database. Check console.', kind: 'alert' });
    }
  });
};

console.log('[patch] Dynamic pages persist patched ✓');
