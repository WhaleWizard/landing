// Network/first-screen diagnostic with actual DevTools throttling.
// Lighthouse 13.4.1 forces CPU/network quiet windows >=5.25s in this mode
// (core/config/config.js overrideThrottlingWindows). cpuQuietThresholdMs:0
// cannot bypass that floor. Keep incomplete runs marked incomplete and inspect
// their traces, not their score; do not disable site effects to end the run.
module.exports = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['performance'],
    throttlingMethod: 'devtools',
    cpuQuietThresholdMs: 5250,
    pauseAfterFcpMs: 5250,
    pauseAfterLoadMs: 5250,
    networkQuietThresholdMs: 5250,
  },
};
