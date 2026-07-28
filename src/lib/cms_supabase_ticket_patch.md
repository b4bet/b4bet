# Supabase Ticket Integration
This patch documents the required changes to cms.ts for full Supabase-backed live chat.

RPCs available:
- admin_claim_ticket(p_ticket_id uuid, p_staff_id uuid)
- admin_reply_ticket(p_ticket_id uuid, p_staff_id uuid, p_message text)
- user_post_ticket_message(p_account_id text, p_body text)
- admin_get_support_tickets() -- returns messages[] as jsonb
- admin_get_ticket_messages(p_ticket_id uuid)
