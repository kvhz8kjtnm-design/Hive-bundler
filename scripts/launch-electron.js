// Cross-platform Electron launcher for development.
// Removes ELECTRON_RUN_AS_NODE from the environment before spawning Electron
// so the app starts in GUI mode even when launched from VS Code's terminal.
const { spawn } = require('child_process');
const path      = require('path');
const electron  = require('electron'); // returns the path to the Electron binary

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env,
});

child.on('exit', code => process.exit(code ?? 0));
process.on('SIGINT',  () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
