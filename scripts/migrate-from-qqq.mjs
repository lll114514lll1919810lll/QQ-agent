// 从本地定制版（D:/Software/QQQ）迁移运行配置到上游 fork 自用。
// 用法：node scripts/migrate-from-qqq.mjs [--source D:/Software/QQQ] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const si = argv.indexOf('--source');
const SRC = si >= 0 ? argv[si + 1] : 'D:/Software/QQQ';
const SRC_DATA = path.join(SRC, 'data');
const DST_DATA = path.join(ROOT, 'data');
const DST_FILE = path.join(DST_DATA, 'config.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const local = readJson(path.join(SRC_DATA, 'config.json'));

  // 提供商 Key：上游优先 dshProviderKeys，providers[] 里不再依赖明文
  const dshProviderKeys = {};
  const providers = (local.providers || []).map((p) => {
    const key = String(p.apiKey ?? '').trim();
    if (key) dshProviderKeys[p.id] = key;
    const { apiKey: _drop, ...rest } = p;
    return rest;
  });

  const next = {
    api: {
      baseUrl: local.api?.baseUrl ?? '',
      // 顶层 apiKey 保留给「手动模式」；选了目录提供商时 resolveApiKey 优先 dshProviderKeys
      apiKey: local.api?.apiKey ?? '',
      model: local.api?.model ?? '',
      provider: local.api?.provider ?? '',
      vision: local.api?.vision !== false,
      thinking: local.api?.thinking !== false,
      temperature: local.api?.temperature ?? 0.8,
      maxRounds: local.api?.maxRounds ?? 12,
      timeoutMs: local.api?.timeoutMs ?? 180000,
      priceInputPerM: local.api?.priceInputPerM ?? 0,
      priceOutputPerM: local.api?.priceOutputPerM ?? 0,
      priceCachedPerM: 0,
      useOfficialPrice: true
    },
    providers,
    dshProviderKeys,
    webSearch: {
      enabled: local.webSearch?.enabled !== false,
      searchUrl: local.webSearch?.searchUrl || 'https://cn.bing.com/search',
      maxResults: local.webSearch?.maxResults ?? 6,
      provider: 'bing'
    },
    voice: {
      enabled: local.voice?.enabled !== false
    },
    security: {
      allowPrivateImageHosts: local.security?.allowPrivateImageHosts === true
    },
    snowluma: {
      dir: local.snowluma?.dir ?? '',
      autoLaunch: local.snowluma?.autoLaunch === true,
      wsUrl: local.snowluma?.wsUrl || 'ws://127.0.0.1:3001',
      httpUrl: local.snowluma?.httpUrl || 'http://127.0.0.1:3000',
      accessToken: local.snowluma?.accessToken ?? '',
      httpAccessToken: local.snowluma?.httpAccessToken ?? ''
    },
    persona: {
      botName: local.persona?.botName ?? '小鲸鱼',
      selfNickname: local.persona?.selfNickname ?? '',
      roleText: local.persona?.roleText ?? '',
      participation: local.persona?.participation ?? 'medium',
      customRules: local.persona?.customRules ?? ''
    },
    customPersonas: local.customPersonas ?? [],
    chatPersonas: local.chatPersonas ?? {},
    allow: local.allow ?? { groups: [], private: [] },
    deny: local.deny ?? { groups: [], private: [] },
    allowAllWhenEmpty: local.allowAllWhenEmpty === true,
    wakeDelayMs: local.wakeDelayMs ?? 2000,
    drainDelayMs: local.drainDelayMs ?? 1200,
    maxConcurrentRuns: local.maxConcurrentRuns ?? 2,
    send: {
      minGapMs: local.send?.minGapMs ?? 1000,
      maxGapMs: local.send?.maxGapMs ?? 3000,
      byLengthMs: local.send?.byLengthMs ?? 20,
      maxPerMinute: local.send?.maxPerMinute ?? 80,
      maxPerHour: local.send?.maxPerHour ?? 500,
      banCooldownMs: local.send?.banCooldownMs ?? 1800000,
      hardSplitAt: local.send?.hardSplitAt ?? 4000
    },
    proactive: local.proactive ?? {
      enabled: false,
      checkIntervalMinMs: 1800000,
      checkIntervalMaxMs: 5400000,
      idleThresholdMs: 1800000,
      probability: 0.25
    },
    sticker: {
      enabled: local.sticker?.enabled !== false,
      promptMaxStickers: local.sticker?.promptMaxStickers ?? 10,
      collectEnabled: local.sticker?.collectEnabled !== false,
      maxCollectPerHour: local.sticker?.maxCollectPerHour ?? 10,
      encourage: local.sticker?.encourage ?? 1
    },
    store: {
      maxMessagesPerChat: local.store?.maxMessagesPerChat ?? 0,
      // 本地用 pastStateLimit；上游用档位。迁到 4 档全读，条数沿用旧上限
      contextTier: 4,
      atCount: local.store?.pastStateLimit ?? 20,
      keywordCount: Math.min(15, local.store?.pastStateLimit ?? 15),
      keywords: [],
      randomPercent: 10,
      randomCount: Math.min(8, local.store?.pastStateLimit ?? 8),
      allCount: local.store?.pastStateLimit ?? 80,
      unifiedTier: true,
      groupSliderPos: {},
      keepSessionFiles: local.store?.keepSessionFiles ?? 0
    },
    blocklist: {},
    budget: {
      dailyCostYuan: local.budget?.dailyCostYuan ?? 0
    },
    memory: {
      consolidateEnabled: local.memory?.consolidateEnabled !== false,
      consolidateMinIntervalMs: local.memory?.consolidateMinIntervalMs ?? 21600000,
      useChatModel: true
    },
    server: {
      port: local.server?.port ?? 3210,
      token: local.server?.token ?? '',
      autoStart: local.server?.autoStart === true,
      closeToTray: local.server?.closeToTray !== false
    },
    // 自用副本默认关掉匿名遥测
    telemetry: { enabled: false },
    ui: {
      theme: 'dark',
      showVision: true,
      refreshMs: 15000
    }
  };

  if (dryRun) {
    console.log(JSON.stringify({
      model: next.api.model,
      provider: next.api.provider,
      groups: next.allow.groups,
      private: next.allow.private,
      providers: next.providers.map((p) => p.displayName || p.id),
      dshKeys: Object.keys(next.dshProviderKeys).length,
      chatPersonas: Object.keys(next.chatPersonas || {}),
      thinking: next.api.thinking,
      voice: next.voice.enabled,
      budget: next.budget.dailyCostYuan,
      banCooldownMs: next.send.banCooldownMs,
      telemetry: next.telemetry.enabled,
      wakeDelayMs: next.wakeDelayMs
    }, null, 2));
    return;
  }

  fs.mkdirSync(DST_DATA, { recursive: true });
  if (fs.existsSync(DST_FILE)) {
    fs.copyFileSync(DST_FILE, `${DST_FILE}.bak.${Date.now()}`);
  }
  fs.writeFileSync(DST_FILE, JSON.stringify(next, null, 2), 'utf8');
  console.log(`已写入 ${DST_FILE}`);

  // 可选：把消息存档 / 记忆 / 会话也带过来（不覆盖已有目标文件之外的策略：整目录覆盖）
  for (const dir of ['messages', 'memory', 'sessions']) {
    const src = path.join(SRC_DATA, dir);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(DST_DATA, dir);
    fs.mkdirSync(dst, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(src)) {
      const sp = path.join(src, f);
      const st = fs.statSync(sp);
      if (!st.isFile()) continue;
      fs.copyFileSync(sp, path.join(dst, f));
      n += 1;
    }
    console.log(`已复制 ${dir}/：${n} 个文件`);
  }
}

main();
