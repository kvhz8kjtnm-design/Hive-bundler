// Server entry point — spawned by electron/main.ts as a child process
// with ELECTRON_RUN_AS_NODE=1.
// In development: registers ts-node and runs server.ts directly.
// In production: loads the pre-compiled dist-server/server.js.
const path = require('path');
const fs   = require('fs');

const compiledServer = path.join(__dirname, 'dist-server', 'server.js');

if (fs.existsSync(compiledServer)) {
  // Production
  require(compiledServer);
} else {
  // Development
  require('ts-node').register({
    project:      path.join(__dirname, 'tsconfig.json'),
    transpileOnly: true,
  });
  require('./server.ts');
}
