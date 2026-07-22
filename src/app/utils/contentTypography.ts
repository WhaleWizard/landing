export type ContentTypography = {
  titleDesktop?: 'compact' | 'standard' | 'large';
  titleMobile?: 'compact' | 'standard' | 'large';
  body?: 'compact' | 'standard' | 'large';
};

export function managedTitleClasses(
  typography: ContentTypography | undefined,
  variant: 'hero' | 'section' | 'cta' | 'contact' = 'section',
): string {
  const mobile = typography?.titleMobile || 'standard';
  const desktop = typography?.titleDesktop || 'standard';
  const mobileClass = variant === 'hero'
    ? mobile === 'compact' ? '!text-[17px] min-[360px]:!text-[19px] sm:!text-[23px]' : mobile === 'large' ? '!text-[22px] min-[360px]:!text-[24px] sm:!text-[29px]' : ''
    : variant === 'cta'
      ? mobile === 'compact' ? '!text-lg' : mobile === 'large' ? '!text-2xl' : ''
      : mobile === 'compact' ? '!text-2xl' : mobile === 'large' ? '!text-[2rem]' : '';
  const desktopClass = variant === 'hero'
    ? desktop === 'compact' ? 'md:!text-[28px] lg:!text-[29px] xl:!text-[32px]' : desktop === 'large' ? 'md:!text-[36px] lg:!text-[38px] xl:!text-[43px]' : ''
    : variant === 'cta'
      ? desktop === 'compact' ? 'md:!text-xl lg:!text-2xl' : desktop === 'large' ? 'md:!text-3xl lg:!text-4xl' : ''
      : desktop === 'compact' ? 'md:!text-3xl lg:!text-[38px]' : desktop === 'large' ? 'md:!text-[42px] lg:!text-[50px]' : '';
  return `${mobileClass} ${desktopClass}`.trim();
}

export function managedBodyClasses(typography: ContentTypography | undefined): string {
  if (typography?.body === 'compact') return '!text-sm md:!text-base';
  if (typography?.body === 'large') return '!text-base md:!text-xl';
  return '';
}
