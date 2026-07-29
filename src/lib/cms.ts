  async addStaffAccount(name: string, email: string, password: string, isOwner: boolean = false): Promise<StaffAccount | null> {
    const supabaseRole = isOwner ? 'super_admin' : 'staff';
    const perms: Partial<Record<PermissionKey, boolean>> = isOwner ? Object.fromEntries(ALL_PERMISSIONS.map(k => [k, true])) : {};
    const hash = await this.hashPassword(password);
    try {
      const { data, error } = await supabase.rpc('admin_create_staff', { p_email: email.toLowerCase(), p_name: name, p_role: supabaseRole, p_password_hash: hash, p_permissions: perms });
      if (error) { console.warn('[cms] addStaffAccount error:', error.message); return null; }
      if (data) { await this.syncStaffFromSupabase(); return this.staff.find(s => s.id === data) ?? null; }
      return null;
    } catch (e) { console.warn('[cms] addStaffAccount failed:', e); return null; }
  }

  async removeStaff(id: string) {
    this.staff = this.staff.filter(s => s.id !== id); this.emitStaff();
    await supabase.rpc('admin_delete_staff', { p_staff_id: id }).catch(e => console.warn('[cms] removeStaff error:', e));
  }

  async setStaffPermission(id: string, key: PermissionKey, value: boolean) {