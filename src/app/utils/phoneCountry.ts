export type CountryPhoneOption = {
  code: string;
  dial: string;
  label: string;
};

export const COUNTRY_PHONE_OPTIONS: CountryPhoneOption[] = [
  { code: 'US', dial: '+1', label: '🇺🇸 United States (+1)' },
  { code: 'CA', dial: '+1', label: '🇨🇦 Canada (+1)' },
  { code: 'MX', dial: '+52', label: '🇲🇽 Mexico (+52)' },
  { code: 'BR', dial: '+55', label: '🇧🇷 Brazil (+55)' },
  { code: 'AR', dial: '+54', label: '🇦🇷 Argentina (+54)' },
  { code: 'GB', dial: '+44', label: '🇬🇧 United Kingdom (+44)' },
  { code: 'DE', dial: '+49', label: '🇩🇪 Germany (+49)' },
  { code: 'FR', dial: '+33', label: '🇫🇷 France (+33)' },
  { code: 'ES', dial: '+34', label: '🇪🇸 Spain (+34)' },
  { code: 'IT', dial: '+39', label: '🇮🇹 Italy (+39)' },
  { code: 'NL', dial: '+31', label: '🇳🇱 Netherlands (+31)' },
  { code: 'PL', dial: '+48', label: '🇵🇱 Poland (+48)' },
  { code: 'PT', dial: '+351', label: '🇵🇹 Portugal (+351)' },
  { code: 'TR', dial: '+90', label: '🇹🇷 Turkey (+90)' },
  { code: 'UA', dial: '+380', label: '🇺🇦 Ukraine (+380)' },
  { code: 'RU', dial: '+7', label: '🇷🇺 Russia (+7)' },
  { code: 'KZ', dial: '+7', label: '🇰🇿 Kazakhstan (+7)' },
  { code: 'UZ', dial: '+998', label: '🇺🇿 Uzbekistan (+998)' },
  { code: 'KG', dial: '+996', label: '🇰🇬 Kyrgyzstan (+996)' },
  { code: 'TJ', dial: '+992', label: '🇹🇯 Tajikistan (+992)' },
  { code: 'TM', dial: '+993', label: '🇹🇲 Turkmenistan (+993)' },
  { code: 'AZ', dial: '+994', label: '🇦🇿 Azerbaijan (+994)' },
  { code: 'GE', dial: '+995', label: '🇬🇪 Georgia (+995)' },
  { code: 'AM', dial: '+374', label: '🇦🇲 Armenia (+374)' },
  { code: 'IN', dial: '+91', label: '🇮🇳 India (+91)' },
  { code: 'PK', dial: '+92', label: '🇵🇰 Pakistan (+92)' },
  { code: 'BD', dial: '+880', label: '🇧🇩 Bangladesh (+880)' },
  { code: 'CN', dial: '+86', label: '🇨🇳 China (+86)' },
  { code: 'JP', dial: '+81', label: '🇯🇵 Japan (+81)' },
  { code: 'KR', dial: '+82', label: '🇰🇷 South Korea (+82)' },
  { code: 'ID', dial: '+62', label: '🇮🇩 Indonesia (+62)' },
  { code: 'TH', dial: '+66', label: '🇹🇭 Thailand (+66)' },
  { code: 'VN', dial: '+84', label: '🇻🇳 Vietnam (+84)' },
  { code: 'MY', dial: '+60', label: '🇲🇾 Malaysia (+60)' },
  { code: 'SG', dial: '+65', label: '🇸🇬 Singapore (+65)' },
  { code: 'AE', dial: '+971', label: '🇦🇪 UAE (+971)' },
  { code: 'SA', dial: '+966', label: '🇸🇦 Saudi Arabia (+966)' },
  { code: 'IL', dial: '+972', label: '🇮🇱 Israel (+972)' },
  { code: 'EG', dial: '+20', label: '🇪🇬 Egypt (+20)' },
  { code: 'ZA', dial: '+27', label: '🇿🇦 South Africa (+27)' },
  { code: 'NG', dial: '+234', label: '🇳🇬 Nigeria (+234)' },
  { code: 'AU', dial: '+61', label: '🇦🇺 Australia (+61)' },
  { code: 'NZ', dial: '+64', label: '🇳🇿 New Zealand (+64)' },
];

export const COUNTRY_DIAL_CODES: Record<string, string> = COUNTRY_PHONE_OPTIONS.reduce((acc, item) => {
  acc[item.code] = item.dial;
  return acc;
}, {} as Record<string, string>);
