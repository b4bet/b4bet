// Country catalog with ISO codes and emoji flags for checkout/admin UIs.
export interface CountryEntry {
  code: string;   // ISO-3166 alpha-2
  name: string;
  flag: string;   // emoji
  dial: string;
  currency: string;
}

export const COUNTRIES: CountryEntry[] = [
  { code: 'IN', name: 'India',          flag: '🇮🇳', dial: '+91', currency: '₹' },
  { code: 'US', name: 'United States',  flag: '🇺🇸', dial: '+1',  currency: '$' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dial: '+44', currency: '£' },
  { code: 'CA', name: 'Canada',         flag: '🇨🇦', dial: '+1',  currency: 'C$' },
  { code: 'AU', name: 'Australia',      flag: '🇦🇺', dial: '+61', currency: 'A$' },
  { code: 'DE', name: 'Germany',        flag: '🇩🇪', dial: '+49', currency: '€' },
  { code: 'FR', name: 'France',         flag: '🇫🇷', dial: '+33', currency: '€' },
  { code: 'BR', name: 'Brazil',         flag: '🇧🇷', dial: '+55', currency: 'R$' },
  { code: 'ZA', name: 'South Africa',   flag: '🇿🇦', dial: '+27', currency: 'R'  },
  { code: 'NG', name: 'Nigeria',        flag: '🇳🇬', dial: '+234', currency: '₦' },
  { code: 'AE', name: 'UAE',            flag: '🇦🇪', dial: '+971', currency: 'د.إ' },
  { code: 'SG', name: 'Singapore',      flag: '🇸🇬', dial: '+65', currency: 'S$' },
  { code: 'JP', name: 'Japan',          flag: '🇯🇵', dial: '+81', currency: '¥' },
  { code: 'BD', name: 'Bangladesh',     flag: '🇧🇩', dial: '+880', currency: '৳' },
  { code: 'PK', name: 'Pakistan',       flag: '🇵🇰', dial: '+92', currency: '₨' },
];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code);
