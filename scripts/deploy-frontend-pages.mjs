import { spawn } from 'node:child_process';

const projectName = process.env.CLOUDFLARE_PAGES_PROJECT;
if (!projectName) {
  console.error('CLOUDFLARE_PAGES_PROJECT is required.');
  process.exit(1);
}

const args = ['pages', 'deploy', '.pages-dist', '--project-name', projectName];

if (process.env.CLOUDFLARE_PAGES_BRANCH) {
  args.push('--branch', process.env.CLOUDFLARE_PAGES_BRANCH);
}

const wrangler = spawn('npx', ['wrangler', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

wrangler.on('exit', (code) => {
  process.exit(code ?? 1);
});
