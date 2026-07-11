export type CountryPhoneOption = {
  code: string;
  dial: string;
  label: string;
};

// Sorted alphabetically by display label.
// Includes several NANP territories/states-like regions that use distinct area ecosystems under +1.
export const COUNTRY_PHONE_OPTIONS: CountryPhoneOption[] = [
  { code: 'AR', dial: '+54', label: '🇦🇷 Argentina (+54)' },
  { code: 'AM', dial: '+374', label: '🇦🇲 Armenia (+374)' },
  { code: 'AU', dial: '+61', label: '🇦🇺 Australia (+61)' },
  { code: 'AT', dial: '+43', label: '🇦🇹 Austria (+43)' },
  { code: 'AZ', dial: '+994', label: '🇦🇿 Azerbaijan (+994)' },
  { code: 'BD', dial: '+880', label: '🇧🇩 Bangladesh (+880)' },
  { code: 'BY', dial: '+375', label: '🇧🇾 Belarus (+375)' },
  { code: 'BE', dial: '+32', label: '🇧🇪 Belgium (+32)' },
  { code: 'BR', dial: '+55', label: '🇧🇷 Brazil (+55)' },
  { code: 'BG', dial: '+359', label: '🇧🇬 Bulgaria (+359)' },
  { code: 'CA', dial: '+1', label: '🇨🇦 Canada (+1)' },
  { code: 'CL', dial: '+56', label: '🇨🇱 Chile (+56)' },
  { code: 'CN', dial: '+86', label: '🇨🇳 China (+86)' },
  { code: 'CO', dial: '+57', label: '🇨🇴 Colombia (+57)' },
  { code: 'HR', dial: '+385', label: '🇭🇷 Croatia (+385)' },
  { code: 'CZ', dial: '+420', label: '🇨🇿 Czechia (+420)' },
  { code: 'DK', dial: '+45', label: '🇩🇰 Denmark (+45)' },
  { code: 'EG', dial: '+20', label: '🇪🇬 Egypt (+20)' },
  { code: 'EE', dial: '+372', label: '🇪🇪 Estonia (+372)' },
  { code: 'FI', dial: '+358', label: '🇫🇮 Finland (+358)' },
  { code: 'FR', dial: '+33', label: '🇫🇷 France (+33)' },
  { code: 'GE', dial: '+995', label: '🇬🇪 Georgia (+995)' },
  { code: 'DE', dial: '+49', label: '🇩🇪 Germany (+49)' },
  { code: 'GR', dial: '+30', label: '🇬🇷 Greece (+30)' },
  { code: 'HK', dial: '+852', label: '🇭🇰 Hong Kong (+852)' },
  { code: 'HU', dial: '+36', label: '🇭🇺 Hungary (+36)' },
  { code: 'IN', dial: '+91', label: '🇮🇳 India (+91)' },
  { code: 'ID', dial: '+62', label: '🇮🇩 Indonesia (+62)' },
  { code: 'IE', dial: '+353', label: '🇮🇪 Ireland (+353)' },
  { code: 'IL', dial: '+972', label: '🇮🇱 Israel (+972)' },
  { code: 'IT', dial: '+39', label: '🇮🇹 Italy (+39)' },
  { code: 'JP', dial: '+81', label: '🇯🇵 Japan (+81)' },
  { code: 'KZ', dial: '+7', label: '🇰🇿 Kazakhstan (+7)' },
  { code: 'KG', dial: '+996', label: '🇰🇬 Kyrgyzstan (+996)' },
  { code: 'LV', dial: '+371', label: '🇱🇻 Latvia (+371)' },
  { code: 'LT', dial: '+370', label: '🇱🇹 Lithuania (+370)' },
  { code: 'LU', dial: '+352', label: '🇱🇺 Luxembourg (+352)' },
  { code: 'MY', dial: '+60', label: '🇲🇾 Malaysia (+60)' },
  { code: 'MX', dial: '+52', label: '🇲🇽 Mexico (+52)' },
  { code: 'MD', dial: '+373', label: '🇲🇩 Moldova (+373)' },
  { code: 'NL', dial: '+31', label: '🇳🇱 Netherlands (+31)' },
  { code: 'NZ', dial: '+64', label: '🇳🇿 New Zealand (+64)' },
  { code: 'NG', dial: '+234', label: '🇳🇬 Nigeria (+234)' },
  { code: 'NO', dial: '+47', label: '🇳🇴 Norway (+47)' },
  { code: 'PK', dial: '+92', label: '🇵🇰 Pakistan (+92)' },
  { code: 'PE', dial: '+51', label: '🇵🇪 Peru (+51)' },
  { code: 'PH', dial: '+63', label: '🇵🇭 Philippines (+63)' },
  { code: 'PL', dial: '+48', label: '🇵🇱 Poland (+48)' },
  { code: 'PT', dial: '+351', label: '🇵🇹 Portugal (+351)' },
  { code: 'PR', dial: '+1', label: '🇵🇷 Puerto Rico (+1)' },
  { code: 'RO', dial: '+40', label: '🇷🇴 Romania (+40)' },
  { code: 'RU', dial: '+7', label: '🇷🇺 Russia (+7)' },
  { code: 'SA', dial: '+966', label: '🇸🇦 Saudi Arabia (+966)' },
  { code: 'RS', dial: '+381', label: '🇷🇸 Serbia (+381)' },
  { code: 'SG', dial: '+65', label: '🇸🇬 Singapore (+65)' },
  { code: 'SK', dial: '+421', label: '🇸🇰 Slovakia (+421)' },
  { code: 'SI', dial: '+386', label: '🇸🇮 Slovenia (+386)' },
  { code: 'ZA', dial: '+27', label: '🇿🇦 South Africa (+27)' },
  { code: 'KR', dial: '+82', label: '🇰🇷 South Korea (+82)' },
  { code: 'ES', dial: '+34', label: '🇪🇸 Spain (+34)' },
  { code: 'SE', dial: '+46', label: '🇸🇪 Sweden (+46)' },
  { code: 'CH', dial: '+41', label: '🇨🇭 Switzerland (+41)' },
  { code: 'TW', dial: '+886', label: '🇹🇼 Taiwan (+886)' },
  { code: 'TJ', dial: '+992', label: '🇹🇯 Tajikistan (+992)' },
  { code: 'TH', dial: '+66', label: '🇹🇭 Thailand (+66)' },
  { code: 'TR', dial: '+90', label: '🇹🇷 Turkey (+90)' },
  { code: 'TM', dial: '+993', label: '🇹🇲 Turkmenistan (+993)' },
  { code: 'UA', dial: '+380', label: '🇺🇦 Ukraine (+380)' },
  { code: 'AE', dial: '+971', label: '🇦🇪 United Arab Emirates (+971)' },
  { code: 'GB', dial: '+44', label: '🇬🇧 United Kingdom (+44)' },
  { code: 'US', dial: '+1', label: '🇺🇸 United States (+1)' },
  { code: 'UZ', dial: '+998', label: '🇺🇿 Uzbekistan (+998)' },
  { code: 'VN', dial: '+84', label: '🇻🇳 Vietnam (+84)' },
];

export const COUNTRY_DIAL_CODES: Record<string, string> = COUNTRY_PHONE_OPTIONS.reduce((acc, item) => {
  acc[item.code] = item.dial;
  return acc;
}, {} as Record<string, string>);

// Пользователь мог ввести номер сразу с кодом страны («+7 926…») —
// тогда код из селектора не добавляем, иначе он задвоится.
export function buildFullPhone(code: string, rawPhone: string): string {
  const trimmed = rawPhone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return trimmed.startsWith('+') ? `+${digits}` : `${code}${digits}`;
}
