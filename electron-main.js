// Electron entry point.
// In development: registers ts-node so TypeScript files run directly.
// In production (packaged): loads the pre-compiled dist-server/electron/main.js.
const path = require('path');

if (process.defaultApp) {
  // Development — process.defaultApp is true when launched via `electron .`
  require('ts-node').register({
    project:      path.join(__dirname, 'tsconfig.json'),
    transpileOnly: true,
  });
  require('./electron/main.ts');
} else {
  // Production — load compiled JavaScript
  require('./dist-server/electron/main.js');
}
