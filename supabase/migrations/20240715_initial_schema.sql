-- ============================================================================
-- B4BET DATABASE SCHEMA - Complete Production Setup
-- ============================================================================

-- ============================================================================
-- 1. USERS & AUTHENTICATION
-- ============================================================================

-- Users table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_id UUID UNIQUE, -- Links to Supabase auth.users
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  date_of_birth DATE,
  country TEXT,
  state TEXT,
  city TEXT,
  address TEXT,
  is_verified BOOLEAN DEFAULT false,
  verification_level TEXT DEFAULT 'unverified', -- 'unverified', 'level1', 'level2', 'level3'
  kyc_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  kyc_document_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT,
  two_factor_enabled BOOLEAN DEFAULT false,
  last_login TIMESTAMP,
  login_count INTEGER DEFAULT 0,
  preferred_language TEXT DEFAULT 'en',
  notification_preferences JSONB DEFAULT '{"email": true, "sms": true, "push": true}'::jsonb,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);

-- ============================================================================
-- 2. WALLET & BALANCE MANAGEMENT
-- ============================================================================

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(15, 2) DEFAULT 0,
  bonus_balance DECIMAL(15, 2) DEFAULT 0,
  locked_balance DECIMAL(15, 2) DEFAULT 0, -- Balance in active bets
  total_deposited DECIMAL(15, 2) DEFAULT 0,
  total_withdrawn DECIMAL(15, 2) DEFAULT 0,
  total_wagered DECIMAL(15, 2) DEFAULT 0,
  total_winnings DECIMAL(15, 2) DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_balance ON wallets(balance);

-- ============================================================================
-- 3. PAYMENT METHODS & TRANSACTIONS
-- ============================================================================

-- Payment methods (UPI, Cards, Bank, Wallets)
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL, -- 'upi', 'card', 'bank', 'wallet'
  display_name TEXT,
  is_primary BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  
  -- UPI details
  upi_id TEXT,
  
  -- Card details (stored securely)
  card_last_four TEXT,
  card_brand TEXT, -- 'visa', 'mastercard', 'amex'
  card_expiry TEXT,
  card_holder_name TEXT,
  
  -- Bank details
  bank_name TEXT,
  account_number TEXT, -- masked
  account_holder_name TEXT,
  ifsc_code TEXT,
  
  -- Generic wallet details
  wallet_provider TEXT, -- 'paytm', 'phonepe', 'googlepay'
  wallet_identifier TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_is_primary ON payment_methods(is_primary);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES wallets(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  
  transaction_type TEXT NOT NULL, -- 'deposit', 'withdrawal', 'bet_placed', 'bet_won', 'bet_lost', 'refund', 'bonus', 'reversal'
  transaction_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
  
  amount DECIMAL(15, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  processing_fee DECIMAL(15, 2) DEFAULT 0,
  net_amount DECIMAL(15, 2),
  
  description TEXT,
  reference_number TEXT UNIQUE,
  gateway_reference TEXT, -- Payment gateway transaction ID
  gateway_response JSONB, -- Full response from payment gateway
  
  initiated_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  failure_reason TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_status ON transactions(transaction_status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_reference ON transactions(reference_number);

-- ============================================================================
-- 4. BETTING EVENTS & MARKETS
-- ============================================================================

-- Sports/Events categories
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'cricket', 'football', 'tennis', 'horse_racing', etc
  event_type TEXT, -- 'match', 'tournament', 'series'
  
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  event_date DATE,
  
  location TEXT,
  venue TEXT,
  
  is_live BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'upcoming', -- 'upcoming', 'live', 'completed', 'cancelled'
  
  team_a TEXT,
  team_b TEXT,
  
  result TEXT, -- Final result
  result_declared_at TIMESTAMP,
  
  image_url TEXT,
  featured BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_is_live ON events(is_live);
CREATE INDEX idx_events_event_date ON events(event_date);

-- Betting markets (odds, runs, goals, etc)
CREATE TABLE IF NOT EXISTS markets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  
  market_name TEXT NOT NULL, -- 'match_winner', 'over_under', 'top_scorer', etc
  market_type TEXT NOT NULL, -- 'binary', 'multi', 'odds', 'line'
  
  description TEXT,
  market_status TEXT DEFAULT 'open', -- 'open', 'suspended', 'closed', 'settled'
  
  min_stake DECIMAL(10, 2) DEFAULT 10,
  max_stake DECIMAL(10, 2) DEFAULT 100000,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_markets_event_id ON markets(event_id);
CREATE INDEX idx_markets_status ON markets(market_status);

-- Betting options/selections for each market
CREATE TABLE IF NOT EXISTS market_selections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  
  selection_name TEXT NOT NULL, -- 'Team A', 'Draw', 'Team B' or 'Over 50', 'Under 50'
  selection_value TEXT, -- Numeric value for line bets
  
  current_odds DECIMAL(10, 4) NOT NULL, -- Decimal odds (1.5, 2.0, etc)
  initial_odds DECIMAL(10, 4),
  odds_updated_at TIMESTAMP DEFAULT now(),
  
  implied_probability DECIMAL(5, 2), -- Calculated probability
  
  total_staked DECIMAL(15, 2) DEFAULT 0,
  back_volume DECIMAL(15, 2) DEFAULT 0, -- Money backing this selection
  lay_volume DECIMAL(15, 2) DEFAULT 0, -- Money laying against this selection
  
  is_winner BOOLEAN DEFAULT false,
  
  display_order INTEGER,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_market_selections_market_id ON market_selections(market_id);
CREATE INDEX idx_market_selections_is_winner ON market_selections(is_winner);

-- ============================================================================
-- 5. BETS & BETTING HISTORY
-- ============================================================================

-- User bets table
CREATE TABLE IF NOT EXISTS bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES wallets(id),
  
  event_id UUID NOT NULL REFERENCES events(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  selection_id UUID NOT NULL REFERENCES market_selections(id),
  
  bet_type TEXT NOT NULL, -- 'back', 'lay'
  odds_at_placement DECIMAL(10, 4) NOT NULL,
  stake DECIMAL(15, 2) NOT NULL,
  
  potential_win DECIMAL(15, 2),
  potential_liability DECIMAL(15, 2), -- For lay bets
  
  bet_status TEXT DEFAULT 'active', -- 'active', 'settled', 'cancelled', 'void'
  result TEXT, -- 'won', 'lost', 'void'
  
  win_amount DECIMAL(15, 2),
  loss_amount DECIMAL(15, 2),
  
  placed_at TIMESTAMP DEFAULT now(),
  settled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_event_id ON bets(event_id);
CREATE INDEX idx_bets_status ON bets(bet_status);
CREATE INDEX idx_bets_result ON bets(result);
CREATE INDEX idx_bets_placed_at ON bets(placed_at DESC);

-- Parlay/Accumulator bets (multiple selections)
CREATE TABLE IF NOT EXISTS parlay_bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES wallets(id),
  
  stake DECIMAL(15, 2) NOT NULL,
  odds_multiplier DECIMAL(15, 4) NOT NULL, -- Combined odds
  
  potential_win DECIMAL(15, 2),
  actual_win DECIMAL(15, 2),
  
  status TEXT DEFAULT 'active', -- 'active', 'won', 'lost', 'partial_loss', 'cancelled'
  result TEXT, -- 'won', 'lost', 'void'
  
  placed_at TIMESTAMP DEFAULT now(),
  settled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_parlay_bets_user_id ON parlay_bets(user_id);
CREATE INDEX idx_parlay_bets_status ON parlay_bets(status);

-- Parlay selections
CREATE TABLE IF NOT EXISTS parlay_selections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parlay_bet_id UUID NOT NULL REFERENCES parlay_bets(id) ON DELETE CASCADE,
  
  event_id UUID NOT NULL REFERENCES events(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  selection_id UUID NOT NULL REFERENCES market_selections(id),
  
  odds_at_placement DECIMAL(10, 4),
  status TEXT DEFAULT 'active', -- 'active', 'won', 'lost', 'void'
  
  sequence_order INTEGER,
  
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_parlay_selections_parlay_bet_id ON parlay_selections(parlay_bet_id);

-- ============================================================================
-- 6. NOTIFICATIONS & SUPPORT
-- ============================================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  notification_type TEXT NOT NULL, -- 'bet_placed', 'bet_won', 'bet_lost', 'deposit_confirmed', 'withdrawal_confirmed', 'promo_available', 'account_alert', 'support_response'
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  
  data JSONB, -- Additional data (bet_id, transaction_id, etc)
  
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  
  action_url TEXT, -- Deep link to relevant page
  
  channel TEXT DEFAULT 'in_app', -- 'in_app', 'email', 'sms', 'push'
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(notification_type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Support tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  ticket_number TEXT UNIQUE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  
  category TEXT NOT NULL, -- 'account', 'payment', 'betting', 'technical', 'complaint', 'suggestion'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  
  status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'
  
  assigned_to UUID REFERENCES users(id), -- Admin user
  
  attachment_urls TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_priority ON support_tickets(priority);

-- Support ticket messages
CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  message TEXT NOT NULL,
  attachment_urls TEXT[] DEFAULT '{}',
  
  is_from_admin BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);

-- ============================================================================
-- 7. PROMOTIONS & BONUSES
-- ============================================================================

-- Promotions/Campaigns
CREATE TABLE IF NOT EXISTS promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  name TEXT NOT NULL,
  description TEXT,
  promo_code TEXT UNIQUE,
  
  promotion_type TEXT NOT NULL, -- 'welcome_bonus', 'deposit_bonus', 'free_bet', 'cashback', 'referral'
  
  discount_type TEXT, -- 'percentage', 'fixed_amount', 'free_bet_amount'
  discount_value DECIMAL(10, 2),
  max_discount DECIMAL(10, 2),
  
  min_deposit DECIMAL(10, 2),
  min_odds DECIMAL(10, 4),
  max_uses_per_user INTEGER,
  total_budget DECIMAL(15, 2),
  
  valid_from TIMESTAMP NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  
  terms_and_conditions TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_promotions_is_active ON promotions(is_active);
CREATE INDEX idx_promotions_valid_from ON promotions(valid_from);

-- User promotion usage
CREATE TABLE IF NOT EXISTS user_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id),
  
  times_used INTEGER DEFAULT 1,
  bonus_amount DECIMAL(10, 2),
  
  used_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_user_promotions_user_id ON user_promotions(user_id);

-- ============================================================================
-- 8. ADMIN & REPORTING
-- ============================================================================

-- Admin actions log
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  
  action_type TEXT NOT NULL, -- 'ban_user', 'unban_user', 'verify_kyc', 'reject_kyc', 'manual_refund', 'adjust_balance', 'resolve_ticket'
  
  description TEXT,
  details JSONB,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX idx_admin_actions_target_user_id ON admin_actions(target_user_id);
CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at DESC);

-- ============================================================================
-- 9. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE parlay_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Users
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for Wallets
CREATE POLICY "Users can view own wallet"
  ON wallets FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for Transactions
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for Bets
CREATE POLICY "Users can view own bets"
  ON bets FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for Notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for Support Tickets
CREATE POLICY "Users can view own tickets"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ticket messages"
  ON ticket_messages FOR SELECT
  USING (auth.uid() = sender_id);

-- ============================================================================
-- 10. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- User dashboard summary
CREATE OR REPLACE VIEW user_dashboard_summary AS
SELECT 
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.avatar_url,
  w.balance,
  w.bonus_balance,
  w.locked_balance,
  w.total_wagered,
  w.total_winnings,
  (SELECT COUNT(*) FROM bets WHERE user_id = u.id AND bet_status = 'active') as active_bets_count,
  (SELECT COUNT(*) FROM notifications WHERE user_id = u.id AND is_read = false) as unread_notifications
FROM users u
LEFT JOIN wallets w ON u.id = w.user_id;

-- Bet history summary
CREATE OR REPLACE VIEW bet_summary AS
SELECT 
  b.id,
  b.user_id,
  e.name as event_name,
  m.market_name,
  ms.selection_name,
  b.odds_at_placement,
  b.stake,
  b.potential_win,
  b.result,
  b.win_amount,
  b.placed_at,
  b.settled_at
FROM bets b
JOIN events e ON b.event_id = e.id
JOIN markets m ON b.market_id = m.id
JOIN market_selections ms ON b.selection_id = ms.id;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
