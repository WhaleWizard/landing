# Visual audit: Whale Wizard landing

Date: 2026-07-05  
Source: local Vite render at `http://127.0.0.1:5173/`  
Scope: homepage desktop, homepage mobile, services, cases, calculators/social block, lead form, mobile menu.

## Captured screens

1. `01-home-desktop-hero.png` - desktop hero, acceptable but visually busy.
2. `02-home-desktop-services.png` - services section, structurally clear.
3. `03-home-desktop-cases.png` - cases section, risky because image dependency failed.
4. `04-home-desktop-contact.png` - social/calculator area before form, visually sparse.
5. `05-home-mobile-top.png` - mobile top, weak because visual block appears before value proposition.
6. `06-home-mobile-contact.png` - mobile form, usable but dense.
7. `07-home-desktop-form.png` - desktop form, strong structure.
8. `08-home-mobile-menu.png` - mobile menu, clear and readable.

## Evidence limits

- External images from `i.ibb.co` did not load in the audit browser due network restrictions. The screenshots therefore show broken image placeholders in hero and cases. This is still useful evidence because production depends on the same external host; if it fails, the first screen and case cards lose their main visual support.
- I did not run a full keyboard, screen-reader, or automated contrast audit. Accessibility notes below are visual risks from screenshots and code references.
- I did not place this in Figma because a new Figma file requires a `planKey`; local screenshots and notes were saved instead.

## Strengths

- The site already has a recognizable dark neon identity: purple/blue gradient, glass cards, glow, and performance dashboard language.
- The desktop hero has a clear promise, visible CTA, proof stats, and a sticky navigation CTA.
- Services and form sections use consistent spacing, icon style, rounded cards, and dark surface tokens.
- Mobile menu is clean: large rows, clear icons, and a persistent consultation CTA.
- Lead form has labels, required fields, budget choices, and contact-method choices; the structure is understandable.

## UX risks

1. **Mobile first screen starts with decoration before meaning.**  
   In `05-home-mobile-top.png`, users see the large visual/dashboard block first, while the headline and CTA are pushed below. On a landing page, this delays the core offer and can hurt conversion. The cause is visible in `Hero.tsx`: text is `order-2 lg:order-1`, visual is `order-1 lg:order-2`.

2. **Hero visual competes with the headline.**  
   On desktop, the right panel has multiple floating KPI cards, rings, gradients, scan lines, and a portrait area. It feels high-energy, but the proof cards compete with the actual sales message. The hierarchy would be stronger if the visual had one main idea, not four simultaneous KPI objects.

3. **Broken external images create a premium-trust failure mode.**  
   The hero portrait and case images are loaded from `i.ibb.co` in `Hero.tsx` and `Cases.tsx`. When blocked or slow, the UI shows alt text at the top-left of large dark panels. This makes the site look unfinished exactly where trust matters most.

4. **Cases lose business proof without images.**  
   In `03-home-desktop-cases.png`, large card image areas become mostly empty. Even with working images, the section would benefit from stronger visible outcomes near the top: industry, spend, leads, ROI, and one sentence outcome before the decorative image field.

5. **There is a long quiet zone before conversion.**  
   `04-home-desktop-contact.png` shows a sparse social/calculator area before the final form. It is clean, but visually low urgency. Users who reached this point should feel a stronger next step: audit offer, expected deliverable, time cost, and reassurance.

6. **Cookie chip visually collides with mobile content.**  
   The small fixed chip appears over content in mobile screenshots. It is not catastrophic, but it adds noise near the form and may cover lower-left text on small devices.

## Accessibility risks

1. **Reduced-motion support needs verification.**  
   The hero relies on animated glows, particles, scan lines, pulse shadows, and moving cards. Some motion is gated in code, but the visual system should be checked across all animated sections with `prefers-reduced-motion`.

2. **Muted text may be too low contrast in dense sections.**  
   Secondary copy in cards and form helper text uses low-contrast gray on dark purple/black surfaces. It looks refined, but some text may fall below comfortable readability on mobile.

3. **Consent checkbox target may still be small.**  
   The checkbox itself is `h-5 w-5`; the label area may be clickable, but the visual target is small. On touch devices, make the hit area feel like a 44px row.

4. **Broken image fallback is not user-friendly.**  
   Large image areas should render a designed fallback: gradient, blurred local placeholder, or branded proof panel. Alt text alone is visually weak and can also create awkward reading order.

## Recommendations

### P0 - Fix image reliability and fallback states

- Move hero and case images into controlled local/public assets or a managed CDN.
- Keep `srcset`, but avoid hard dependency on `i.ibb.co` for first-screen visuals.
- Add a designed fallback state for hero and cases: branded gradient, neutral portrait placeholder, or KPI proof panel.

Relevant files:
- `src/app/components/Hero.tsx`
- `src/app/components/Cases.tsx`
- `src/app/pages/ServiceLandingPage.tsx`

### P1 - Reorder mobile hero

- Put the text block first on mobile: badge, H1, short proof line, primary CTA, then visual.
- Reduce mobile visual height from 360px to around 260-300px, or show a compact proof-card strip instead.
- Keep the rich dashboard visual for tablet/desktop where there is space.

Relevant file:
- `src/app/components/Hero.tsx`

### P1 - Simplify the desktop hero visual hierarchy

- Pick one main visual story: portrait plus two proof cards, or dashboard without portrait, but not everything at once.
- Make the strongest proof card visually primary: `240% ROI` or `$2M+ budget`.
- Reduce ambient rings/scanline intensity so the hero feels premium, not noisy.

### P2 - Strengthen case cards as proof, not decoration

- Move key metrics closer to the card title.
- Add a short result statement: "65k+ leads for premium service" instead of only category labels.
- Ensure image failure never leaves large empty space.

Relevant file:
- `src/app/components/Cases.tsx`

### P2 - Tighten the conversion section

- Bring the form offer higher or add a stronger CTA bridge before it.
- Replace the sparse social/calculator gap with a compact "what you get in the free audit" panel.
- On desktop, the form section is strong; the path into it needs more urgency.

Relevant file:
- `src/app/components/ContactForm.tsx`

### P3 - Polish mobile form and fixed cookie UI

- Keep budget choices as two columns on 390px, but test 320px; labels like `$10k-100k` can get tight.
- Make consent checkbox hit area visually larger.
- Move the cookie settings chip away from form content or collapse it after consent.

### P3 - Clean copy and polish details

- Fix typo: `Perfomance` should be `Performance`.
- Consider replacing mixed English/Russian labels in KPI cards with one consistent language style.
- Keep the purple/blue identity, but reduce repeated glows where they do not add meaning.

## Suggested design direction

Keep the current cyber-performance identity, but make it calmer and more trustworthy:

- Dark background stays.
- Purple/blue gradient stays as accent, not every surface.
- Hero becomes: strong headline first, one clear portrait/proof visual second.
- Case cards become evidence-first.
- Form becomes the visual endpoint of the page, not just another glass card.

This would preserve the brand while making the site feel more expensive, faster to understand, and less dependent on decorative motion.
