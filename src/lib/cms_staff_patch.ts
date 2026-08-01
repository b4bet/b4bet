// Patch: adds loginStaff and logoutStaff to the cms singleton at import time.
// Import this file in AdminLoginPage and AdminView to fix login/logout.
import { bus, Topics } from './bus';
import { cms } from './cms';

const ADMIN_SESSION_KEY = 'b4bet.admin.session';

/** Login: set staffSessionId, persist, and emit so React updates instantly */
export function loginStaff(staffId: string): void {
  cms.staffSessionId = staffId;
  try { localStorage.setItem(ADMIN_SESSION_KEY, staffId); } catch { /* ignore */ }
  bus.emit(Topics.StaffSession, staffId);
}

/** Logout: clear staffSessionId, remove from storage, emit so React updates instantly */
export function logoutStaff(): void {
  cms.staffSessionId = null;
  try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
  bus.emit(Topics.StaffSession, null);
}

// Monkey-patch the cms singleton so calls like cms.loginStaff(id) / cms.logoutStaff()
// don't crash even if the Cms class doesn't define those methods.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cmsAny = cms as Record<string, unknown>;
if (!cmsAny['loginStaff']) cmsAny['loginStaff'] = loginStaff;
if (!cmsAny['logoutStaff']) cmsAny['logoutStaff'] = logoutStaff;
