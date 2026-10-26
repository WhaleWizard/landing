const fs = require('fs');

let css = fs.readFileSync('src/app/components/service-heroes/consult-studio-hero.css', 'utf8');

// 1. In @media (max-width: 1023px), ensure photo-wrap and content have animation: none and opacity: 1
css = css.replace(
  '  .consult-studio-hero__photo-wrap {\r\n' +
  '    position: relative;\r\n' +
  '    inset: auto;\r\n' +
  '    order: 1;\r\n' +
  '    min-height: 0;\r\n' +
  '    height: clamp(400px, 62vh, 560px);\r\n' +
  '  }',
  '  .consult-studio-hero__photo-wrap {\r\n' +
  '    position: relative;\r\n' +
  '    inset: auto;\r\n' +
  '    order: 1;\r\n' +
  '    min-height: 0;\r\n' +
  '    height: clamp(400px, 62vh, 560px);\r\n' +
  '    opacity: 1;\r\n' +
  '    transform: none;\r\n' +
  '    animation: none;\r\n' +
  '  }'
);
css = css.replace(
  '  .consult-studio-hero__photo-wrap {\n' +
  '    position: relative;\n' +
  '    inset: auto;\n' +
  '    order: 1;\n' +
  '    min-height: 0;\n' +
  '    height: clamp(400px, 62vh, 560px);\n' +
  '  }',
  '  .consult-studio-hero__photo-wrap {\n' +
  '    position: relative;\n' +
  '    inset: auto;\n' +
  '    order: 1;\n' +
  '    min-height: 0;\n' +
  '    height: clamp(400px, 62vh, 560px);\n' +
  '    opacity: 1;\n' +
  '    transform: none;\n' +
  '    animation: none;\n' +
  '  }'
);

css = css.replace(
  '  .consult-studio-hero__content {\r\n' +
  '    order: 2;\r\n' +
  '    justify-content: flex-start;\r\n' +
  '    margin: -96px 0 0;\r\n' +
  '    padding: 104px 24px 44px;\r\n' +
  '    border-radius: 0;',
  '  .consult-studio-hero__content {\r\n' +
  '    order: 2;\r\n' +
  '    justify-content: flex-start;\r\n' +
  '    margin: -96px 0 0;\r\n' +
  '    padding: 104px 24px 44px;\r\n' +
  '    border-radius: 0;\r\n' +
  '    opacity: 1;\r\n' +
  '    transform: none;\r\n' +
  '    animation: none;'
);
css = css.replace(
  '  .consult-studio-hero__content {\n' +
  '    order: 2;\n' +
  '    justify-content: flex-start;\n' +
  '    margin: -96px 0 0;\n' +
  '    padding: 104px 24px 44px;\n' +
  '    border-radius: 0;',
  '  .consult-studio-hero__content {\n' +
  '    order: 2;\n' +
  '    justify-content: flex-start;\n' +
  '    margin: -96px 0 0;\n' +
  '    padding: 104px 24px 44px;\n' +
  '    border-radius: 0;\n' +
  '    opacity: 1;\n' +
  '    transform: none;\n' +
  '    animation: none;'
);

// 2. Also add static prehydrate override for SSR
const prehydrateRule = '\r\n\r\nhtml[data-ww-first-screen="/consult"] .consult-studio-hero__photo-wrap,\r\n' +
  'html[data-ww-first-screen="/consult"] .consult-studio-hero__content {\r\n' +
  '  opacity: 1;\r\n' +
  '  transform: none;\r\n' +
  '  animation: none;\r\n' +
  '}\r\n';

if (!css.includes('html[data-ww-first-screen="/consult"]')) {
  css += prehydrateRule;
}

fs.writeFileSync('src/app/components/service-heroes/consult-studio-hero.css', css, 'utf8');
console.log('Successfully patched consult-studio-hero.css entrance animations');
