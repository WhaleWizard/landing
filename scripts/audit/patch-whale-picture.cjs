const fs = require('fs');
let s = fs.readFileSync('src/app/components/CosmicHeroScene.tsx', 'utf8');

const target = `        <div className="cosmic-obj cosmic-whale">
          <span className="cosmic-swim">
            <img
              src="/images/cosmic/whale.webp"
              alt=""
              width={1195}
              height={697}
              loading="eager"
              fetchpriority="high"
              decoding="async"
            />
          </span>
        </div>`;

const replacement = `        <div className="cosmic-obj cosmic-whale">
          <span className="cosmic-swim">
            <picture>
              <source
                media={\`(max-width: \${compactImages.maxViewportWidth}px)\`}
                srcSet="/images/cosmic/whale-compact.webp"
              />
              <img
                src="/images/cosmic/whale.webp"
                alt=""
                width={1195}
                height={697}
                loading="eager"
                fetchpriority="high"
                decoding="async"
              />
            </picture>
          </span>
        </div>`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(target)) {
  console.error('Target not found in CosmicHeroScene.tsx');
  process.exit(1);
}
fs.writeFileSync('src/app/components/CosmicHeroScene.tsx', normalized.replace(target, replacement).replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched CosmicHeroScene.tsx');
