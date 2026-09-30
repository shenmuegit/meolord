# Wolfcha 源码来源

来源：https://github.com/oil-oil/wolfcha

固定提交：`a5e2a29ef0b923a89f24121a79aa1611d24af0cf`

本目录直接复制该提交中 `src/hooks/useGameLogic.ts` 的游戏依赖及两组原有测试，保留角色分配、阶段控制、提示词、公开发言解析、夜间行动、警长、投票、胜负判断和本地存档实现。许可证以随附的原始 `LICENSE`（Apache-2.0）为准。

为嵌入 Meolord 首页进行的改动：

- `@/` 导入移动至 `@/vendor/wolfcha/`；首页界面在 `src/components/section/wolfcha-*.tsx`。
- `lib/llm.ts` 在服务端 Durable Object 内调用 MiMo 2.6 Pro 与 DeepSeek Flash；浏览器无法直接提交模型消息，`/api/werewolf/chat` 返回 401。
- `types/game.ts` 和 `lib/character-generator.ts` 的可用模型限定为上述两款，保留原随机分配算法；开局角色生成使用 DeepSeek Flash。
- 从游戏 hook 和阶段类移除原站 Supabase 会话统计、付费相关调用和语音播放。游戏规则与提示词沿用原实现。
- `store/game-machine.ts` 的原有检查点恢复改用本地 `gameId`，不再要求原站数据库会话。
- 首页每局只有一名真人和七名 AI。服务端 `src/server/werewolf/engine.ts` 调用原版夜晚、白天发言、投票阶段与发言生成器，负责持久化续接和限制真人行动时机；退出或关闭页面会结束该局。
- 服务端必须替换原版 React Hook 的客户端状态续接：夜晚结算对应 `useSpecialEvents.resolveNight`，警长流程对应 `useBadgePhase`，猎人后续对应 `useSpecialEvents` 与 `hunter-badge-flow`；发言内容仍由原版 `DaySpeechPhase` 提示词和 `StreamingSpeechParser` 处理。
- 警徽竞选没有有效票时直接进入无警长分支，避免全员竞选后停在空的 PK 发言。
- `i18n/config.ts` 默认语言为中文。

检查：项目根目录执行 `pnpm check:wolfcha`，再通过首页实际开局检查模型响应和人类行动。
