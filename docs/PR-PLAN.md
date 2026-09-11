# 上游 PR 计划（K0nd1us/QQ-agent）

目标：把 `feat/local-customizations` 上可复用的能力按**小而可合**的粒度拆给上游，避免一个巨型 PR 拖死 review。

基线：`main` @ 72f537f（fork 克隆点）  
工作分支现状：4 个功能 commit，已叠在上游最新之上。

## 拆分原则

1. **一 PR 一件事**：后端逻辑 + 最小 UI + 文档段落一起走，避免「有后端没控件」。
2. **默认关 / 可选开**：新能力不改变默认行为（thinking 默认开、budget 默认 0、voice 默认开但工具本就不打扰、media 默认开但匿名可用）。
3. **不绑自用数据**：不带 `data/`、不带个人白名单/人设/cookie。
4. **每个 PR 自带 selftest 片段**，并在描述里写清「关掉后行为与 main 一致」。
5. **依赖顺序**：PR-A/B 无依赖可并行；媒体技能独立；分会话人设依赖 persona 基础设施（上游已有）。

## PR 清单

### PR-1 · 成本与风控三件套（优先合）

**标题**：`feat: thinking toggle, daily budget fuse, ban/risk cooldown`

| 项 | 内容 |
|---|---|
| 范围 | `api.thinking`；`budget.dailyCostYuan` + overBudget 暂停；`send.banCooldownMs` + clear-ban API |
| 涉及文件 | `config.js` `llm.js` `orchestrator.js` `sender.js` `app.js` `ui/app.js` |
| UI | 模型 API：思考开关、预算输入；聊天设置：熔断分钟；横幅：预算暂停提示 |
| 默认 | thinking=true；budget=0 不限；banCooldown=30min |
| 测试 | selftest 已有重试/暂停路径；补：关 thinking 时请求体含 `enable_thinking=false`；预算超限 pauseReason=budget；ban 错误进入冷却且可 clear |
| 作者话术 | 「运维向：帮用户省 token、防烧钱、防风控撞墙。互不耦合但都是成本/稳定性，合成一 PR 更好 review。」 |

### PR-2 · QQ 语音转文字

**标题**：`feat: optional get_voice_text via SnowLuma fetch_ptt_text`

| 项 | 内容 |
|---|---|
| 范围 | `voice.enabled`；工具 `get_voice_text`；语音占位带 `#mid`；提示词规则 |
| 涉及文件 | `config.js` `tools.js` `onebot.js` `orchestrator.js` `prompt.js` `app.js`（若需状态）`ui/app.js` |
| 默认 | voice.enabled=true；关掉后移除工具 |
| 依赖 | SnowLuma `fetch_ptt_text`；协议端不支持时工具报错即可，不影响主流程 |
| 测试 | mock fetch_ptt_text：有字/无字/开关关掉不注册工具 |
| 作者话术 | 「纯增量工具，开关默认跟随上游哲学：关掉零影响。」 |

### PR-3 · QQ 官方表情混排

**标题**：`feat: QQ official face markers in send_message`

| 项 | 内容 |
|---|---|
| 范围 | `src/qq-faces.js`；`onebot.js` 入站 formatQqFace / 出站 textToMessageSegments；send_message 描述补充 |
| 涉及文件 | `qq-faces.js`（新增）`onebot.js` `tools.js` |
| 兼容 | 无表情标记时行为与 main 完全一致；目录文件缺失时用内置官方表兜底 |
| 测试 | 单测：`[QQ表情:流泪(#5)]` → text+face 段；入站 id→名称 |
| 作者话术 | 「模型可用更自然的官方表情，而不只是收藏表情包。零配置。」 |

### PR-4 · 分会话人设覆盖

**标题**：`feat: per-chat persona overrides (chatPersonas)`

| 项 | 内容 |
|---|---|
| 范围 | `chatPersonas` 配置；`personaForChat()`；orchestrator 用覆盖人设；配置 POST `__replace__`；设置页编辑器 |
| 涉及文件 | `config.js` `orchestrator.js` `prompt.js`（若需）`app.js` `ui/app.js` |
| 默认 | `{}` 空映射 = 全局人设，行为不变 |
| 测试 | 覆盖/回落/清除；配置整体替换删掉条目 |
| 作者话术 | 「多群用户常见需求：A 群正经、B 群嘴臭，不必开两个实例。」 |

### PR-5 · 媒体技能（B 站 / 网易云）

**标题**：`feat: built-in bilibili & netease_music tools (pure Node)`

| 项 | 内容 |
|---|---|
| 范围 | `src/media-skills.js`；tools 接入；media 配置；`/api/media/*`；设置「媒体技能」页 |
| 凭据 | cookie **只**读 `data/media/*.json`，控制台只回 hasCookie/keys |
| 默认 | media.enabled=true，但匿名也能用热搜/搜索；建议上游默认 **enabled=true** 或 **false** 由作者定——PR 里写两案 |
| 测试 | mock HTTP：命令白名单、限频、cookie 不出现在工具结果、redact |
| 风险 | 依赖第三方 NCM 公开 API 可能不稳定；文档标明可换自建 |
| 作者话术 | 「群友发 B 站链接/点歌是高频场景；纯 Node 无 Python 依赖，适合桌面分发。」 |

### 可选 PR-6 · 遥测开关

**标题**：`feat: telemetry.enabled opt-out`

| 项 | 内容 |
|---|---|
| 范围 | `telemetry.enabled` 默认 true；false 时不 `startTelemetryLoop` |
| 文件 | `config.js` `app.js` + 设置页一行复选框 |
| 说明 | 一行为改动，也可并入 PR-1 若作者不介意 |

## 建议提交顺序

```text
时间线 ──────────────────────────────────────────────►
  PR-1 成本风控 ──┐
  PR-2 语音      ─┼─► 作者 merge 后 rebase 下一个
  PR-3 官方表情  ─┘
  PR-4 分会话人设（依赖已合的 persona UI 习惯）
  PR-5 媒体技能（体量最大，放最后，或单独 issue 先讨论）
  PR-6 遥测开关（顺手）
```

## 从工作分支拆 commit 的操作建议

当前 4 个 commit 是叠的，**不要直接 4 个 PR 都从同一分支开**。建议：

```bash
# 以 main 为基，每个 PR 一条干净分支
git fetch origin
git checkout -b feat/thinking-budget-ban origin/main
# 只挑 PR-1 涉及文件（手工 cherry-pick / 分块 apply）
# 自测 → push fork → gh pr create --repo K0nd1us/QQ-agent --base main --head 你的用户名:分支名
```

每个 PR 的 body 模板：

```markdown
## Summary
- 做什么 / 为什么需要
## Default behavior
- 默认配置下与 main 行为差异（应为「无」或可选）
## Testing
- node test/selftest.mjs
- 手动 UI 步骤
## Screenshots（UI 相关）
```

## 提 PR 前检查清单

- [ ] 不含 `data/`、cookie、API Key、个人 QQ 号/群号
- [ ] 不含自用 `wakeDelayMs=100` 等偏好
- [ ] `node test/selftest.mjs` 全绿
- [ ] README 该 PR 段落只写通用能力，不写「本分支」
- [ ] 新配置键在 `DEFAULT_CONFIG` 有默认值
- [ ] UI 改动与对应 `collectConfig` 同步
- [ ] 先开 Issue 引用 PR-5（媒体技能体量大，先听作者意见）

## 与上游已沟通点（建议 Issue 列表）

1. **媒体技能是否接受** + NCM 第三方依赖是否可接受  
2. **thinking 开关**是否愿意进默认 UI（很多用户用 Qwen/GLM 混合推理）  
3. **预算保险丝**是否要和上游用量页联动（未来可显示「距上限还剩 ¥x」）

---

维护说明：本文档只服务 fork → 上游 提交策略；自用分支可继续直接跑 `feat/local-customizations`，不必等上游合并。
