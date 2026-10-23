import fs from 'node:fs';

console.log('--- Applying Visual Quality Fixes ---');

// 1. Services.tsx: Mobile card uniform height & button alignment
{
  const filePath = 'src/app/components/Services.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  const target1 = 'className="relative p-[1.125rem] rounded-2xl bg-card/70 backdrop-blur-md border border-primary/25 shadow-xl shadow-primary/10 overflow-hidden flex flex-col"';
  const replace1 = 'className="relative min-h-[490px] h-full p-[1.125rem] rounded-2xl bg-card/70 backdrop-blur-md border border-primary/25 shadow-xl shadow-primary/10 overflow-hidden flex flex-col justify-between"';
  
  const target2 = 'className="mt-6 pt-4 border-t border-border/50"';
  const replace2 = 'className="mt-auto pt-4 border-t border-border/50"';

  if (content.includes(target1) && content.includes(target2)) {
    content = content.replace(target1, replace1).replace(target2, replace2);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Applied VIS-RESP-001 to Services.tsx');
  } else {
    console.warn('⚠️ Could not match target in Services.tsx');
  }
}

// 2. MarketingGlossaryPage.tsx: H1 heading wrapping on mobile
{
  const filePath = 'src/app/pages/MarketingGlossaryPage.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  const target = '<h1\r\n              ref={staticTitleFit}\r\n              data-ww-title-fit={`${STATIC_TITLE_LINES.titleMaxLinesMobile}/0`}\r\n              data-ww-title-fit-min={STATIC_TITLE_MIN_FONT_SIZE}\r\n              className="text-balance text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight"\r\n            >\r\n              Словарь маркетинга <span className="text-primary">без лишнего жаргона</span>\r\n            </h1>';
  const replace = '<h1\r\n              ref={staticTitleFit}\r\n              data-ww-title-fit={`${STATIC_TITLE_LINES.titleMaxLinesMobile}/0`}\r\n              data-ww-title-fit-min={STATIC_TITLE_MIN_FONT_SIZE}\r\n              className="text-balance text-[clamp(1.75rem,7.5vw,2.5rem)] sm:text-4xl md:text-5xl font-bold mb-4 leading-tight"\r\n            >\r\n              Словарь маркетинга <span className="text-primary inline-block">без лишнего жаргона</span>\r\n            </h1>';

  // Normalize CRLF/LF for matching
  const normContent = content.replace(/\r\n/g, '\n');
  const normTarget = target.replace(/\r\n/g, '\n');
  const normReplace = replace.replace(/\r\n/g, '\n');

  if (normContent.includes(normTarget)) {
    const updated = normContent.replace(normTarget, normReplace).replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log('✅ Applied VIS-TYPO-001 to MarketingGlossaryPage.tsx');
  } else {
    console.warn('⚠️ Could not match target in MarketingGlossaryPage.tsx');
  }
}

// 3. ServiceLandingPage.tsx: Google Ads cases and services non-breaking space
{
  const filePath = 'src/app/pages/ServiceLandingPage.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const target1 = "titleAccent: 'настраиваю и веду',";
  const replace1 = "titleAccent: 'настраиваю\\u00A0и\\u00A0веду',";
  if (content.includes(target1)) {
    content = content.replace(target1, replace1);
    changed = true;
    console.log('✅ Applied VIS-TYPO-003 to ServiceLandingPage.tsx');
  }

  const target2 = "titleAccent: 'Google Ads',";
  const replace2 = "titleAccent: 'Google\\u00A0Ads',";
  if (content.includes(target2)) {
    content = content.replace(target2, replace2);
    changed = true;
    console.log('✅ Applied VIS-TYPO-002 to ServiceLandingPage.tsx');
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

// 4. CallToAction.tsx: non-breaking space
{
  const filePath = 'src/app/components/CallToAction.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  const target = "title: 'Расскажите, что продвигаете',";
  const replace = "title: 'Расскажите, что\\u00A0продвигаете',";
  if (content.includes(target)) {
    content = content.replace(target, replace);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Applied VIS-TYPO-004 to CallToAction.tsx');
  } else {
    console.warn('⚠️ Could not match target in CallToAction.tsx');
  }
}

// 5. Blog.tsx: text-balance on article card titles
{
  const filePath = 'src/app/components/Blog.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  const target = 'className="text-base md:text-lg lg:text-xl font-bold text-white group-hover:text-primary transition-colors"';
  const replace = 'className="text-balance text-base md:text-lg lg:text-xl font-bold text-white group-hover:text-primary transition-colors"';
  if (content.includes(target)) {
    content = content.replace(target, replace);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Applied VIS-TYPO-005 to Blog.tsx');
  } else {
    console.warn('⚠️ Could not match target in Blog.tsx');
  }
}

// 6. BlogPage.tsx: leading-[1.14] on list H1
{
  const filePath = 'src/app/pages/BlogPage.tsx';
  let content = fs.readFileSync(filePath, 'utf8');
  const target = 'className="text-balance text-[clamp(1.9rem,9.6vw,2.6rem)] font-bold leading-[1.05] tracking-[-0.038em] md:text-[3.25rem]"';
  const replace = 'className="text-balance text-[clamp(1.9rem,9.6vw,2.6rem)] font-bold leading-[1.14] tracking-[-0.038em] md:text-[3.25rem]"';
  if (content.includes(target)) {
    content = content.replace(target, replace);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Applied VIS-TYPO-006 to BlogPage.tsx');
  } else {
    console.warn('⚠️ Could not match target in BlogPage.tsx');
  }
}
