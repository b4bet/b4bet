import { generateAccountId } from './accountId';
import { getDeviceToken, getClientIP } from './security';

export interface SeedUser {
  id: string;
  account: string;
  accountId: string;
  mobile: string;
  deviceToken: string;
  ip: string;
  balance: number;
  status: 'active' | 'flagged';
  joined: number;
}

export const SEED_USERS: SeedUser[] = [
  { id: 'u1', account: 'player_a1b2', accountId: generateAccountId(), mobile: '9876543210', deviceToken: 'dev_' + getDeviceToken().slice(4, 12), ip: getClientIP(), balance: 4820.5, status: 'active', joined: Date.now() - 86400000 },
  { id: 'u2', account: 'highroller_99', accountId: generateAccountId(), mobile: '9123456789', deviceToken: 'dev_7f3a9c21', ip: '10.0.45.12', balance: 28400.0, status: 'active', joined: Date.now() - 172800000 },
  { id: 'u3', account: 'newbie_x7', accountId: generateAccountId(), mobile: '9988776655', deviceToken: 'dev_2b8e1f04', ip: '10.0.45.12', balance: 320.0, status: 'flagged', joined: Date.now() - 3600000 },
  { id: 'u4', account: 'crash_king', accountId: generateAccountId(), mobile: '9001122334', deviceToken: 'dev_9c4d2a77', ip: '10.0.88.4', balance: 12450.75, status: 'active', joined: Date.now() - 432000000 },
  { id: 'u5', account: 'mines_pro', accountId: generateAccountId(), mobile: '9554433221', deviceToken: 'dev_2b8e1f04', ip: '10.0.45.99', balance: 890.25, status: 'flagged', joined: Date.now() - 7200000 },
];
