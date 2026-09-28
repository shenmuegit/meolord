<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **portfolio** (381 symbols, 615 relationships, 16 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/portfolio/context` | Codebase overview, check index freshness |
| `gitnexus://repo/portfolio/clusters` | All functional areas |
| `gitnexus://repo/portfolio/processes` | All execution flows |
| `gitnexus://repo/portfolio/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

# 网站更新与发布 SOP

本仓库是 `meolord.com` 的站点源码：个人资料与作品在 `src/data/resume.tsx`，文章在 `content/*.mdx`，图片和视频在 `public/`。部署目标由 `wrangler.jsonc` 指定为 Cloudflare Worker `meolord-portfolio`，域名为 `meolord.com`。Git 提交或推送不会自动更新线上站点，修改后需要重新构建并发布。

## 1. 修改与本地验收

1. 在项目根目录运行 `git status --short`，确认已有改动；只修改本次要求涉及的文件，保留其他未提交内容。修改代码符号前遵守上面的 GitNexus 影响分析规则。
2. 使用 `pnpm.cmd dev --hostname 127.0.0.1 --port 3010` 本地预览；如果服务已在运行，刷新页面即可。按改动范围检查首页、`/#projects`、`/blog`，在桌面和手机宽度下核对文字、布局与交互；涉及作品视频时确认它能持续循环播放。
3. 运行 `pnpm.cmd exec eslint src` 和 `git diff --check`。发布前再次核对 `git status --short` 及相关文件差异：下方流程会复制整个当前工作目录，不能把无关的未提交内容一起上线。文章或资源的构建正确性在下一步的生产构建中确认。

## 2. 生产构建与发布

当前 Windows 环境直接运行 `pnpm.cmd run build:cloudflare` 会在 OpenNext 创建符号链接时遇到 `EPERM`；在 Debian WSL 的 Linux 文件系统中构建。WSL 需要 Linux 版 Node.js 24 和 pnpm 10，不能复用 Windows 的 `node_modules`。当前已验证的临时工具路径写在下方；如果路径已被清理，先在 Debian 安装对应工具，再执行发布。发布前先用 `pnpm.cmd exec wrangler deployments list --name meolord-portfolio` 记录当前版本 ID，供回滚使用。

在项目根目录的 PowerShell 执行以下命令。它将包含未提交修改与新增资源的当前工作目录复制到 WSL 临时目录，安装锁定依赖，构建成功后才发布；Cloudflare 令牌只在本次进程中传递，不写入仓库。

```powershell
$token = (wrangler.cmd auth token --json 2>$null | ConvertFrom-Json).token
if (-not $token) { throw "请先在 Windows Wrangler 登录 Cloudflare" }
$previousWSLENV = $env:WSLENV
try {
  $env:CLOUDFLARE_API_TOKEN = $token
  $env:CLOUDFLARE_ACCOUNT_ID = "460e729611dde5de38f3a1c1e9a26c93"
  $env:WSLENV = (($previousWSLENV, "CLOUDFLARE_API_TOKEN/u", "CLOUDFLARE_ACCOUNT_ID/u") | Where-Object { $_ }) -join ":"
  $releaseScript = @'
set -euo pipefail
export PATH="/tmp/meolord-deploy-EOoXqd/tools/node_modules/.bin:/tmp/node-v24.12.0-linux-x64/bin:$PATH"
node --version
pnpm --version
stage=$(mktemp -d /tmp/meolord-release.XXXXXX)
tar -C /mnt/code/meolord/product/meolord \
  --exclude='./.git' --exclude='./.gitnexus' --exclude='./node_modules' \
  --exclude='./.next' --exclude='./.open-next' --exclude='./.wrangler' \
  --exclude='./.content-collections' --exclude='./.env' --exclude='./.env.*' \
  -cf - . | tar -xf - -C "$stage"
cd "$stage"
pnpm install --frozen-lockfile
pnpm run build:cloudflare
pnpm exec wrangler deploy
printf '发布源目录：%s\n' "$stage"
'@
  $releaseScript | wsl.exe -d Debian -- bash -s
  if ($LASTEXITCODE -ne 0) { throw "构建或发布失败，线上版本未视为已更新" }
} finally {
  Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
  if ($previousWSLENV) { $env:WSLENV = $previousWSLENV }
  else { Remove-Item Env:WSLENV -ErrorAction SilentlyContinue }
  $token = $null
}
```

## 3. 线上验收与回滚

发布命令应输出 `meolord.com (custom domain)` 和新的 Worker Version ID。打开 `https://meolord.com/?verify=<随机值>`，在桌面和手机宽度下检查本次改动及相关交互；同时核对 `https://meolord.com/blog` 可访问。不要只凭构建或上传成功宣布完成。

若线上验收失败，在项目根目录的 PowerShell 运行 `pnpm.cmd exec wrangler deployments list --name meolord-portfolio`，找到发布前记录的版本 ID，然后执行 `pnpm.cmd exec wrangler rollback <上一版本ID> --name meolord-portfolio --yes`，重新检查 `meolord.com`。修复源码后按本 SOP 再次构建和发布。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
