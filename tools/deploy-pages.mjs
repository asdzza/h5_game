// 备用部署通道：不依赖 GitHub Actions，把静态站点推到 gh-pages 分支。
//
// 为什么需要它：2026-11-07 起本仓库的 Actions 全部在"分配 runner"阶段就失败，
// 注解原文是 "The job was not started because your account is locked due to a
// billing issue."。账单解冻前 Actions 一条都跑不了，但分支部署走的是 Pages 自己的
// 构建系统，不受影响。
//
// 用法：
//   npm run deploy:pages                  # 真推
//   设 DEPLOY_DRY=1 再跑，或加 --no-push  # 只构建 + 试连，不推
//   （别用 --dry / --dry-run：npm 自己会吃掉这两个参数）
//
// 首次使用需要把 Pages 的 Source 从 "GitHub Actions" 改成
// "Deploy from a branch → gh-pages / (root)"（仓库 Settings → Pages）。

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRIES = ['index.html', 'styles.css', 'src'];
const BRANCH = 'gh-pages';
const DRY = process.env.DEPLOY_DRY === '1' || process.argv.includes('--no-push');

function git(args, opts = {}) {
  const out = execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return typeof out === 'string' ? out.trim() : out;
}

// 1. 把要发布的文件复制到临时目录（保持仓库工作区干净）
const staging = mkdtempSync(join(tmpdir(), 'zgz-deploy-'));
let indexFile = '';
try {
  let staged = 0;
  for (const entry of ENTRIES) {
    const from = join(ROOT, entry);
    if (!existsSync(from)) throw new Error(`缺少待发布文件：${entry}`);
    const to = join(staging, entry);
    cpSync(from, to, { recursive: true });
    staged++;
  }
  writeFileSync(join(staging, '.nojekyll'), '');
  console.log(`· 暂存 ${staged} 个条目 + .nojekyll`);

  // 2. 用独立的 index 文件写一棵树，不动当前分支
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  indexFile = join(gitDir, 'deploy-index.tmp');
  rmSync(indexFile, { force: true });
  mkdirSync(gitDir, { recursive: true });

  const env = {
    ...process.env,
    GIT_DIR: gitDir,
    GIT_WORK_TREE: staging,
    GIT_INDEX_FILE: indexFile,
  };
  git(['read-tree', '--empty'], { env });
  git(['add', '-A', '--force', '.'], { env });
  const tree = git(['write-tree'], { env });

  // 3. 以 gh-pages 现有提交为父，保证是干净的快进历史
  let parent = '';
  try {
    git(['fetch', '--quiet', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]);
  } catch {
    // 远端还没有这个分支，第一次部署属于正常情况
  }
  try {
    parent = git(['rev-parse', '--verify', `origin/${BRANCH}`]);
  } catch {
    parent = '';
  }
  const headShort = git(['rev-parse', '--short', 'HEAD']);
  const message = `deploy: ${headShort} (${new Date().toISOString().slice(0, 16)}Z)`;
  const commit = git(
    ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message],
    {
      env: {
        ...env,
        GIT_AUTHOR_NAME: git(['config', 'user.name']) || 'deploy-bot',
        GIT_AUTHOR_EMAIL: git(['config', 'user.email']) || 'deploy-bot@users.noreply.github.com',
        GIT_COMMITTER_NAME: git(['config', 'user.name']) || 'deploy-bot',
        GIT_COMMITTER_EMAIL: git(['config', 'user.email']) || 'deploy-bot@users.noreply.github.com',
      },
    },
  );
  console.log(`· 生成提交 ${commit.slice(0, 7)} → ${BRANCH}`);

  if (DRY) {
    console.log('· 试推（--dry-run）…');
    git(['push', '--force', '--dry-run', 'origin', `${commit}:refs/heads/${BRANCH}`], {
      stdio: 'inherit',
    });
    console.log('干跑通过，未改动远端。');
  } else {
    git(['push', '--force', 'origin', `${commit}:refs/heads/${BRANCH}`], { stdio: 'inherit' });
    console.log(`已推送。若 Pages 的 Source 仍是 "GitHub Actions"，请改成 gh-pages 分支。`);
  }
} finally {
  if (indexFile) rmSync(indexFile, { force: true });
  rmSync(staging, { recursive: true, force: true });
}