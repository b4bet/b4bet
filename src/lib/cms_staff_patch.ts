// Patch: adds loginStaff and logoutStaff to the cms singleton
// Import this file once at app entry (main.tsx) or use directly.
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
