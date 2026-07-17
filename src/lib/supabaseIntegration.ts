export { supabase } from '@/integrations/supabase/client';

// All Supabase database operations now go through the centralized client from @/integrations/supabase/client
// This file is kept for backward compatibility. All new code should import directly from @/integrations/supabase/client.
