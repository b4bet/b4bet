// Patch: Override cms.persistDynamicPagesToSupabase to use the robust version
// After a successful save, we also re-sync from Supabase so all subscribers
// (including other open tabs/browsers) receive the updated pages list.
import { cms } from '../lib/cms';
import { persistDynamicPages } from '../lib/dynamicPagesPersist';

type CmsInternal = {
  dynamicPages: unknown[];
  toast: (t: { title: string; body: string; kind: string }) => void;
  syncSettingsFromSupabase: () => Promise<void>;
};

// Override the private method with a working version that:
// 1. Persists to Supabase (RPC with direct upsert fallback)
// 2. Re-syncs settings from Supabase after successful save
//    → this re-emits DynamicPages bus event → all subscribers refresh
(cms as unknown as CmsInternal & Record<string, unknown>).persistDynamicPagesToSupabase = function (this: CmsInternal) {
  void persistDynamicPages(this.dynamicPages as import('../lib/cms').DynamicPage[]).then((ok: boolean) => {
    if (ok) {
      // Re-sync to confirm write and broadcast fresh pages to all subscribers
      void this.syncSettingsFromSupabase();
    } else {
      this.toast({
        title: 'Save failed',
        body: 'Dynamic page could not be saved to database. Check console.',
        kind: 'alert',
      });
    }
  });
};

console.log('[patch] Dynamic pages persist patched ✓');
