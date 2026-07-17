export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ---- RPC return row types ----
export interface StaffRow {
  id: string; email: string; name: string; role: string;
  permissions: Json; is_active: boolean;
  last_login_at: string | null; created_at: string;
}
export interface ProfileRow {
  id: string; username: string | null; display_name: string | null;
  avatar_url: string | null; phone: string | null;
  balance: number; total_deposit: number; total_withdrawal: number;
  vip_level: number; is_admin: boolean;
  created_at: string; updated_at: string;
}
export interface TransactionRow {
  id: string; user_id: string | null; type: string; amount: number;
  balance_before: number; balance_after: number;
  reference: string | null; metadata: Json; status: string;
  created_at: string; updated_at: string;
}
export interface TicketRow {
  id: string; user_id: string | null; subject: string; message: string;
  status: string; priority: string;
  created_at: string; updated_at: string;
}
export interface SettingRow {
  id: string; key: string; value: Json;
  description: string | null; updated_at: string;
}
export interface BannerRow {
  id: string; title: string; image_url: string;
  link_url: string | null; sort_order: number;
  is_active: boolean; created_at: string;
}
export interface PaymentMethodRow {
  id: string; method_type: string; account_details: Json;
  is_active: boolean; created_at: string;
}
export interface BetRow {
  id: string; user_id: string | null; game_id: string | null; round_id: string | null;
  bet_amount: number; bet_details: Json; win_amount: number;
  multiplier: number; status: string; placed_at: string; resolved_at: string | null;
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: { [_ in never]: never }
    Views: { [_ in never]: never }
    Functions: {
      admin_staff_login: {
        Args: { p_email: string; p_password_hash: string }
        Returns: StaffRow[]
      }
      get_all_staff: {
        Args: Record<string, never>
        Returns: StaffRow[]
      }
      admin_get_staff: {
        Args: Record<string, never>
        Returns: StaffRow[]
      }
      staff_login: {
        Args: { p_email: string; p_password: string }
        Returns: StaffRow[]
      }
      admin_create_staff: {
        Args: { p_email: string; p_name: string; p_role: string; p_password_hash: string; p_permissions: Json }
        Returns: string
      }
      admin_update_staff_password: {
        Args: { p_staff_id: string; p_password_hash: string }
        Returns: undefined
      }
      admin_update_staff_active: {
        Args: { p_staff_id: string; p_is_active: boolean }
        Returns: undefined
      }
      admin_update_staff_permissions: {
        Args: { p_staff_id: string; p_permissions: Json }
        Returns: undefined
      }
      admin_delete_staff: {
        Args: { p_staff_id: string }
        Returns: undefined
      }
      admin_get_profiles: {
        Args: Record<string, never>
        Returns: ProfileRow[]
      }
      admin_get_users: {
        Args: Record<string, never>
        Returns: ProfileRow[]
      }
      admin_update_balance: {
        Args: { p_user_id: string; p_balance: number }
        Returns: undefined
      }
      admin_update_user: {
        Args: { p_id: string; p_balance: number }
        Returns: undefined
      }
      admin_toggle_user_admin: {
        Args: { p_user_id: string; p_is_admin: boolean }
        Returns: undefined
      }
      admin_get_transactions: {
        Args: { p_limit?: number }
        Returns: TransactionRow[]
      }
      admin_update_transaction_status: {
        Args: { p_txn_id: string; p_status: string }
        Returns: undefined
      }
      admin_update_transaction: {
        Args: { p_id: string; p_status: string; p_utr?: string | null; p_reason?: string | null }
        Returns: undefined
      }
      admin_get_tickets: {
        Args: Record<string, never>
        Returns: TicketRow[]
      }
      admin_get_support_tickets: {
        Args: Record<string, never>
        Returns: TicketRow[]
      }
      admin_update_ticket_status: {
        Args: { p_ticket_id: string; p_status: string }
        Returns: undefined
      }
      admin_get_settings: {
        Args: Record<string, never>
        Returns: SettingRow[]
      }
      admin_update_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      admin_get_banners: {
        Args: Record<string, never>
        Returns: BannerRow[]
      }
      admin_upsert_banner: {
        Args: { p_id: string | null; p_title: string; p_image_url: string; p_link_url: string | null; p_sort_order: number; p_is_active: boolean }
        Returns: string
      }
      admin_delete_banner: {
        Args: { p_id: string }
        Returns: undefined
      }
      admin_get_payment_methods: {
        Args: Record<string, never>
        Returns: PaymentMethodRow[]
      }
      admin_get_bets: {
        Args: { p_limit?: number }
        Returns: BetRow[]
      }
      check_ip_signup_bonus: {
        Args: { p_ip: string }
        Returns: boolean
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
      DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
