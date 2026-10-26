// npm run dev — запускает сервер (порт 8080) и Vite (порт 5173) одновременно.
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const procs = [
  // Порт API задаётся явно: внешняя среда может передать PORT, предназначенный для интерфейса.
  spawn(npm, ['run', 'dev', '-w', '@pravo/server'], { stdio: 'inherit', shell: isWin, cwd: ROOT, env: { ...process.env, PORT: process.env.API_PORT ?? '8080' } }),
  spawn(npm, ['run', 'dev', '-w', '@pravo/web', '--', '--port', '5173', '--strictPort'], { stdio: 'inherit', shell: isWin, cwd: ROOT, env: { ...process.env, API_URL: 'http://localhost:' + (process.env.API_PORT ?? '8080') } }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) { console.error(`Процесс завершился с кодом ${code}`); stop(); } });
