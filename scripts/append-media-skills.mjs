// append remaining media-skills source
import fs from 'node:fs';

const rest = String.raw`
// ── B 站：WBI + API ─────────────────────────────────────────────────────

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

let wbiKeysCache = null;

function getMixinKey(orig) {
  let s = '';
  for (const i of MIXIN_KEY_ENC_TAB) s += orig[i];
  return s.slice(0, 32);
}

async function biliFetch(url, opts) {
  const cookies = (opts && opts.cookies) || {};
  const params = opts && opts.params;
  const timeoutMs = (opts && opts.timeoutMs) || 20000;
  let full = url;
  if (params) {
    const q = new URLSearchParams(params).toString();
    full += (url.includes('?') ? '&' : '?') + q;
  }
  const headers = {
    'user-agent': UA,
    referer: 'https://www.bilibili.com/'
  };
  const cookie = cookieHeader(cookies);
  if (cookie) headers.cookie = cookie;
  const res = await fetch(full, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('B 站接口返回非 JSON（HTTP ' + res.status + '）');
  }
}

async function getWbiKeys(cookies, timeoutMs) {
  if (wbiKeysCache) return wbiKeysCache;
  const data = await biliFetch('https://api.bilibili.com/x/web-interface/nav', { cookies, timeoutMs });
  const img = data?.data?.wbi_img?.img_url || '';
  const sub = data?.data?.wbi_img?.sub_url || '';
  if (!img || !sub) throw new Error('获取 WBI 签名密钥失败（可能被风控）');
  wbiKeysCache = {
    imgKey: img.split('/').pop().split('.')[0],
    subKey: sub.split('/').pop().split('.')[0]
  };
  return wbiKeysCache;
}

async function encWbi(params, cookies, timeoutMs) {
  const keys = await getWbiKeys(cookies, timeoutMs);
  const mixinKey = getMixinKey(keys.imgKey + keys.subKey);
  const signed = Object.assign({}, params || {}, { wts: Math.round(Date.now() / 1000) });
  const sorted = {};
  for (const k of Object.keys(signed).sort()) {
    sorted[k] = String(signed[k]).replace(/[!'()*]/g, '');
  }
  const query = new URLSearchParams(sorted).toString();
  sorted.w_rid = crypto.createHash('md5').update(query + mixinKey).digest('hex');
  return sorted;
}

async function biliApi(path, opts) {
  const cookies = opts.cookies;
  const timeoutMs = opts.timeoutMs || 20000;
  let params = opts.params || null;
  if (opts.wbi) params = await encWbi(params || {}, cookies, timeoutMs);
  const data = await biliFetch('https://api.bilibili.com' + path, { cookies, params, timeoutMs });
  if (data?.code !== 0) {
    throw new Error(data?.message || ('B 站接口 code=' + data?.code));
  }
  return data.data ?? data;
}

async function biliVideoInfo(bvid, cookies, timeoutMs) {
  const data = await biliApi('/x/web-interface/view?bvid=' + encodeURIComponent(bvid), { cookies, timeoutMs });
  if (!data?.bvid) throw new Error('视频不存在或已失效');
  return data;
}

async function biliHot(limit, cookies, timeoutMs) {
  let items = [];
  try {
    const data = await biliApi('/x/web-interface/search/square', { cookies, params: { limit: 50 }, timeoutMs });
    items = (data?.trending?.list || []).map((item) => ({
      keyword: item.show_name || item.keyword || ''
    }));
  } catch { /* fallthrough */ }
  if (!items.length) {
    const data = await biliFetch('https://s.search.bilibili.com/main/hotword', { cookies, timeoutMs });
    items = (data?.list || []).map((item) => ({
      keyword: item.show_name || item.keyword || ''
    }));
  }
  const top = items.filter((x) => x.keyword).slice(0, Math.min(10, limit || 10));
  const lines = ['B站实时热搜榜', '='.repeat(40)];
  top.forEach((item, i) => {
    lines.push(String(i + 1).padStart(2, ' ') + '. ' + item.keyword);
  });
  if (!top.length) lines.push('[无结果]');
  return lines.join('\n');
}

async function biliTrending(limit, cookies, timeoutMs) {
  const data = await biliApi('/x/web-interface/popular?ps=' + limit + '&pn=1', { cookies, timeoutMs });
  const list = data?.list || [];
  const lines = ['B站全站热门（共 ' + list.length + ' 条）', '='.repeat(50)];
  list.forEach((item, i) => {
    lines.push(String(i + 1).padStart(2, ' ') + '. ' + item.title);
    lines.push('     ' + (item.owner?.name || '') + ' | 播放' + wan(item.stat?.view) + '万 | +' + wan(item.stat?.like) + '万 | https://b23.tv/' + item.bvid);
  });
  if (!list.length) lines.push('[无结果]');
  return lines.join('\n');
}

async function biliRanking(rid, type, cookies, timeoutMs) {
  const data = await biliApi('/x/web-interface/ranking/v2?rid=' + rid + '&type=' + type, { cookies, timeoutMs });
  const list = (data?.list || []).slice(0, 10);
  const lines = ['B站排行榜 rid=' + rid + ' type=' + type + '（Top ' + list.length + '）', '='.repeat(50)];
  list.forEach((item, i) => {
    lines.push((i + 1) + '. ' + item.title);
    lines.push('     ' + (item.owner?.name || '') + ' | 播放' + wan(item.stat?.view) + '万 | https://b23.tv/' + item.bvid);
  });
  if (!list.length) lines.push('[无结果]');
  return lines.join('\n');
}

async function biliSearch(keyword, cookies, timeoutMs) {
  const data = await biliApi('/x/web-interface/search/all/v2?keyword=' + encodeURIComponent(keyword) + '&page=1&pagesize=20', { cookies, timeoutMs });
  const results = [];
  for (const block of data?.result || []) {
    if (block?.result_type !== 'video') continue;
    for (const v of block.data || []) {
      results.push({
        bvid: v.bvid || '',
        title: String(v.title || '').replace(/<\/?em[^>]*>/g, ''),
        author: v.author || '',
        play: v.play || 0
      });
    }
  }
  const lines = ['搜索: ' + keyword + '（共 ' + results.length + ' 条）'];
  results.forEach((item, i) => {
    lines.push((i + 1) + '. ' + item.title);
    lines.push('     ' + item.author + ' | 播放' + (item.play ? wan(item.play) : 0) + '万 | https://b23.tv/' + item.bvid);
  });
  if (!results.length) lines.push('[无结果]');
  return lines.join('\n');
}

async function biliInfo(bvid, cookies, timeoutMs) {
  const info = await biliVideoInfo(bvid, cookies, timeoutMs);
  return [
    info.title,
    'UP: ' + (info.owner?.name || '') + '  (uid=' + (info.owner?.mid || '') + ')',
    'BV: ' + info.bvid + '  AV: ' + info.aid,
    '时长: ' + formatTs(info.duration) + '  分P: ' + (info.pages || []).length,
    '播放:' + wan(info.stat?.view) + '万  弹幕:' + (info.stat?.danmaku ?? 0) + '  点赞:' + wan(info.stat?.like) + '万',
    '链接: https://www.bilibili.com/video/' + info.bvid,
    info.desc ? '简介: ' + String(info.desc).slice(0, 160) : ''
  ].filter(Boolean).join('\n');
}

async function biliTags(bvid, cookies, timeoutMs) {
  const data = await biliApi('/x/web-interface/view/detail/tag?bvid=' + encodeURIComponent(bvid), { cookies, timeoutMs });
  const tags = Array.isArray(data) ? data : [];
  const lines = ['视频 ' + bvid + ' 的标签:'];
  for (const t of tags) lines.push('  - ' + (t.tag_name || t.tagName || '') + ' (' + (t.tag_type || '') + ')');
  if (!tags.length) lines.push('[无标签]');
  return lines.join('\n');
}

async function biliComments(bvid, cookies, timeoutMs) {
  const info = await biliVideoInfo(bvid, cookies, timeoutMs);
  const data = await biliApi('/x/v2/reply?type=1&oid=' + info.aid + '&sort=0&ps=20&pn=1', { cookies, timeoutMs });
  const hots = data?.hots || [];
  const replies = data?.replies || [];
  const total = data?.page?.acount ?? 0;
  const lines = ['评论区共 ' + total + ' 条'];
  if (hots.length) {
    lines.push('', '[热评] (' + hots.length + '条)');
    hots.slice(0, 8).forEach((h, i) => {
      lines.push((i + 1) + '. ' + (h.member?.uname || '') + ': ' + (h.content?.message || ''));
      lines.push('     +' + (h.like ?? 0));
    });
  }
  if (replies.length) {
    lines.push('', '[最新评论]');
    replies.slice(0, 10).forEach((r) => {
      lines.push('  - ' + (r.member?.uname || '') + ': ' + (r.content?.message || ''));
      lines.push('     +' + (r.like ?? 0));
    });
  }
  if (!hots.length && !replies.length) lines.push('[无评论]');
  return lines.join('\n');
}

async function biliSummary(bvid, mode, cookies, timeoutMs) {
  const info = await biliVideoInfo(bvid, cookies, timeoutMs);
  const params = { bvid: bvid, cid: info.cid };
  if (info.aid) params.aid = info.aid;
  let result;
  try {
    result = await biliApi('/x/web-interface/view/conclusion/get', { cookies, params, wbi: true, timeoutMs });
  } catch (error) {
    return '[' + info.title + ']\n[错误] AI 摘要获取失败：' + (error?.message ?? error) + '\n提示：该视频可能没有 AI 摘要，或登录态失效。可先用 info 看基本信息。';
  }
  if (result?.code === -1) return '[' + info.title + ']\n[不支持] 该视频不支持 AI 摘要';
  if (result?.code === 1) return '[' + info.title + ']\n[无摘要] 未识别到语音或未生成';
  const model = result?.model_result || {};
  const lines = ['[' + info.title + ']'];
  if (mode === 'outline') {
    const outline = model.outline || [];
    if (!outline.length) return lines.join('\n') + '\n[无分段提纲]';
    for (const seg of outline) {
      lines.push('[' + formatTs(seg.timestamp) + '] ' + seg.title);
      for (const pt of seg.part_outline || []) {
        lines.push('  ' + formatTs(pt.timestamp) + ' ' + pt.content);
      }
    }
    return lines.join('\n');
  }
  if (model.summary) {
    lines.push('', '[全文摘要]', '  ' + model.summary);
  }
  const outline = model.outline || [];
  if (outline.length) {
    lines.push('', '[分段提纲] (' + outline.length + '段):');
    outline.forEach((seg, i) => {
      lines.push('  [' + (i + 1) + '] [' + formatTs(seg.timestamp) + ']  ' + seg.title);
      for (const pt of seg.part_outline || []) {
        lines.push('       · ' + formatTs(pt.timestamp) + '  ' + pt.content);
      }
    });
  }
  lines.push('', '[赞踩] +' + (result?.like_num ?? 0) + '  -' + (result?.dislike_num ?? 0));
  return lines.join('\n');
}

// ── 网易云 ──────────────────────────────────────────────────────────────

function ncmBase() {
  return String(getConfig().media?.netease?.apiBase || 'https://netease-api.flowmoon.cn').replace(/\/+$/, '');
}

async function ncmGet(apiPath, params, opts) {
  const withCookie = opts && opts.withCookie;
  const timeoutMs = (opts && opts.timeoutMs) || 30000;
  const url = new URL(ncmBase() + apiPath);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers = { 'user-agent': UA, referer: 'https://music.163.com/' };
  if (withCookie) {
    const cookie = cookieHeader(readCookieFile(NCM_COOKIE_FILE));
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  try {
    return await res.json();
  } catch {
    throw new Error('网易云接口返回非 JSON（HTTP ' + res.status + '）');
  }
}

function artistNames(list) {
  return (list || []).map((a) => a.name || '').filter(Boolean).join('/');
}

function formatDurationMs(ms) {
  if (!ms) return '00:00';
  const sec = Math.floor(Number(ms) / 1000);
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

async function ncmHot(_limit, _cookies, timeoutMs) {
  const data = await ncmGet('/search/hot', {}, { timeoutMs });
  const hots = data?.result?.hots || [];
  const lines = ['网易云音乐实时热搜榜', '='.repeat(40)];
  hots.slice(0, 10).forEach((item, i) => {
    lines.push(String(i + 1).padStart(2, ' ') + '. ' + (item.first || item.keyword || ''));
  });
  if (!hots.length) lines.push('[无结果]');
  return lines.join('\n');
}

async function ncmSearch(keyword, limit, timeoutMs) {
  const data = await ncmGet('/search', { keywords: keyword, limit: limit }, { timeoutMs });
  const songs = data?.result?.songs || [];
  const lines = ['搜索: ' + keyword + '（共 ' + songs.length + ' 首）', '='.repeat(50)];
  songs.forEach((song, i) => {
    lines.push(String(i + 1).padStart(2, ' ') + '. ' + song.name);
    lines.push('      ' + artistNames(song.artists || song.ar) + ' | ' + (song.album?.name || song.al?.name || '') + ' | ' + formatDurationMs(song.duration || song.dt) + ' | ID:' + song.id);
  });
  if (!songs.length) lines.push('[无结果]');
  return lines.join('\n');
}

async function ncmSong(id, timeoutMs) {
  const data = await ncmGet('/song/detail', { ids: id }, { timeoutMs });
  const song = (data?.songs || [])[0];
  if (!song) throw new Error('未找到歌曲');
  return [
    song.name,
    '歌手: ' + artistNames(song.ar || song.artists),
    '专辑: ' + (song.al?.name || song.album?.name || ''),
    '时长: ' + formatDurationMs(song.dt || song.duration),
    'ID: ' + song.id,
    'MV: ' + (song.mv || '无'),
    '链接: https://music.163.com/song?id=' + song.id
  ].join('\n');
}

async function ncmUrl(id, level, timeoutMs) {
  const data = await ncmGet('/song/url/v1', { id: id, level: level }, { timeoutMs });
  const item = (data?.data || [])[0];
  if (!item) throw new Error('未找到播放链接');
  if (!item.url) return '歌曲 ID ' + item.id + '\n[错误] 需要 VIP 或版权限制';
  const url = String(item.url);
  return [
    '歌曲 ID: ' + item.id,
    '音质: ' + (item.level || level),
    '格式: ' + (item.type || ''),
    '大小: ' + Math.floor((item.size || 0) / 1024 / 1024) + 'MB',
    '链接: ' + url.slice(0, 120) + (url.length > 120 ? '…' : '')
  ].join('\n');
}

function stripLrc(lrc) {
  return String(lrc || '').split('\n').map((line) => line.replace(/^\[[^\]]+\]/, '').trim()).filter(Boolean).join('\n');
}

async function ncmLyric(id, timeoutMs) {
  const data = await ncmGet('/lyric', { id: id }, { timeoutMs });
  const lrc = data?.lrc?.lyric || '';
  const tlyric = data?.tlyric?.lyric || '';
  if (!lrc) return '[无歌词] ID:' + id;
  const body = stripLrc(lrc);
  const lines = ['歌词 (ID: ' + id + '):', '-'.repeat(30), body];
  const tBody = stripLrc(tlyric);
  if (tBody) lines.push('', '翻译歌词:', '-'.repeat(30), tBody);
  return lines.join('\n');
}

async function ncmComments(id, limit, timeoutMs) {
  const data = await ncmGet('/comment/music', { id: id, limit: limit }, { timeoutMs });
  const hot = data?.hotComments || [];
  const comments = data?.comments || [];
  const total = data?.total || 0;
  const lines = ['评论 (共 ' + formatCount(total) + ' 条)'];
  if (hot.length) {
    lines.push('', '[热评] (' + hot.length + ' 条)', '-'.repeat(30));
    hot.slice(0, 5).forEach((c, i) => {
      lines.push((i + 1) + '. ' + (c.user?.nickname || '') + ': ' + (c.content || ''));
      lines.push('     赞: ' + (c.likedCount ?? 0));
    });
  }
  if (comments.length) {
    lines.push('', '[最新评论]', '-'.repeat(30));
    comments.slice(0, 5).forEach((c) => {
      lines.push('  - ' + (c.user?.nickname || '') + ': ' + (c.content || ''));
    });
  }
  if (!hot.length && !comments.length) lines.push('[无评论]');
  return lines.join('\n');
}

async function ncmPlaylist(id, timeoutMs) {
  const data = await ncmGet('/playlist/detail', { id: id }, { timeoutMs });
  const pl = data?.playlist;
  if (!pl) throw new Error('未找到歌单');
  const tracks = pl.tracks || [];
  const lines = [
    pl.name || '',
    '创建者: ' + (pl.creator?.nickname || ''),
    '歌曲数: ' + (pl.trackCount || tracks.length || 0),
    '播放量: ' + formatCount(pl.playCount || 0),
    '标签: ' + (pl.tags || []).join(', '),
    '描述: ' + String(pl.description || '').slice(0, 120),
    '链接: https://music.163.com/playlist?id=' + pl.id
  ];
  if (tracks.length) {
    lines.push('', '[歌曲列表]（前 ' + Math.min(10, tracks.length) + ' 首）:');
    tracks.slice(0, 10).forEach((t, i) => {
      lines.push(String(i + 1).padStart(2, ' ') + '. ' + t.name + ' - ' + artistNames(t.ar || t.artists));
    });
    if (tracks.length > 10) lines.push('  … 共 ' + (pl.trackCount || tracks.length) + ' 首');
  }
  return lines.join('\n');
}

async function ncmPlaylistTracks(id, limit, timeoutMs) {
  const data = await ncmGet('/playlist/track/all', { id: id, limit: limit }, { timeoutMs });
  const songs = data?.songs || [];
  const lines = ['歌单歌曲（共 ' + songs.length + ' 首）', '='.repeat(50)];
  songs.forEach((song, i) => {
    lines.push(String(i + 1).padStart(3, ' ') + '. ' + song.name + ' - ' + artistNames(song.ar || song.artists) + ' | ID:' + song.id);
  });
  if (!songs.length) lines.push('[无歌曲]');
  return lines.join('\n');
}

async function ncmTopPlaylist(cat, limit, timeoutMs) {
  const params = { limit: limit };
  if (cat) params.cat = cat;
  const data = await ncmGet('/top/playlist', params, { timeoutMs });
  const playlists = data?.playlists || [];
  const lines = ['精品歌单' + (cat ? ' [' + cat + ']' : '') + '（共 ' + playlists.length + ' 个）', '='.repeat(50)];
  playlists.forEach((pl, i) => {
    lines.push(String(i + 1).padStart(2, ' ') + '. ' + pl.name);
    lines.push('      ' + (pl.creator?.nickname || '') + ' | ' + formatCount(pl.playCount || 0) + '播放 | ID:' + pl.id);
  });
  if (!playlists.length) lines.push('[无歌单]');
  return lines.join('\n');
}

async function ncmAlbum(id, timeoutMs) {
  const data = await ncmGet('/album', { id: id }, { timeoutMs });
  const album = data?.album;
  const songs = data?.songs || [];
  if (!album) throw new Error('未找到专辑');
  const lines = [
    album.name || '',
    '歌手: ' + artistNames(album.artists),
    '歌曲数: ' + (album.size || songs.length || 0),
    '发行: ' + (album.publishTime ? new Date(album.publishTime).toISOString().slice(0, 10) : ''),
    '链接: https://music.163.com/album?id=' + album.id
  ];
  songs.slice(0, 10).forEach((s, i) => {
    lines.push(String(i + 1).padStart(2, ' ') + '. ' + s.name + ' | ID:' + s.id);
  });
  if (songs.length > 10) lines.push('  … 共 ' + songs.length + ' 首');
  return lines.join('\n');
}

async function ncmArtist(id, timeoutMs) {
  const data = await ncmGet('/artists', { id: id }, { timeoutMs });
  const artist = data?.artist;
  if (!artist) throw new Error('未找到歌手');
  return [
    artist.name || '',
    'ID: ' + artist.id,
    '粉丝: ' + formatCount(artist.fansCount || 0),
    '简介: ' + (String(artist.briefDesc || '').slice(0, 160) || '无'),
    '链接: https://music.163.com/artist?id=' + artist.id
  ].join('\n');
}

async function ncmArtistSongs(id, limit, timeoutMs) {
  const data = await ncmGet('/artist/songs', { id: id, limit: limit }, { timeoutMs });
  const songs = data?.songs || [];
  const lines = ['歌手热门歌曲（共 ' + songs.length + ' 首）', '='.repeat(50)];
  songs.forEach((song, i) => {
    lines.push(String(i + 1).padStart(2, ' ') + '. ' + song.name + ' - ' + artistNames(song.ar || song.artists) + ' | ID:' + song.id);
  });
  if (!songs.length) lines.push('[无歌曲]');
  return lines.join('\n');
}

// ── 命令分发 ────────────────────────────────────────────────────────────

async function runBili(command, args, cookies, timeoutMs) {
  switch (command) {
    case 'hot': return biliHot(clampInt(args.limit, 1, 30, 10), cookies, timeoutMs);
    case 'trending': return biliTrending(clampInt(args.limit, 1, 30, 10), cookies, timeoutMs);
    case 'ranking': return biliRanking(clampInt(args.rid, 0, 200, 0), pickEnum(args.type, ['all', 'rookie', 'origin'], 'all'), cookies, timeoutMs);
    case 'search': return biliSearch(cleanText(args.keyword, { name: 'keyword' }), cookies, timeoutMs);
    case 'info': return biliInfo(cleanBvid(args.bvid ?? args.keyword ?? args.id), cookies, timeoutMs);
    case 'tags': return biliTags(cleanBvid(args.bvid ?? args.keyword ?? args.id), cookies, timeoutMs);
    case 'comments': return biliComments(cleanBvid(args.bvid ?? args.keyword ?? args.id), cookies, timeoutMs);
    case 'summary': return biliSummary(cleanBvid(args.bvid ?? args.keyword ?? args.id), pickEnum(args.mode, ['summary', 'outline', 'full'], 'summary'), cookies, timeoutMs);
    default: throw new Error('不支持命令「' + command + '」');
  }
}

async function runNcm(command, args, timeoutMs) {
  switch (command) {
    case 'hot': return ncmHot(10, null, timeoutMs);
    case 'search': return ncmSearch(cleanText(args.keyword, { name: 'keyword' }), clampInt(args.limit, 1, 30, 10), timeoutMs);
    case 'song': return ncmSong(requireId(args.id, '歌曲 id'), timeoutMs);
    case 'url': return ncmUrl(requireId(args.id, '歌曲 id'), pickEnum(args.level, ['standard', 'higher', 'exhigh', 'lossless', 'hires', 'jyeffect', 'sky', 'jymaster'], 'exhigh'), timeoutMs);
    case 'lyric': return ncmLyric(requireId(args.id, '歌曲 id'), timeoutMs);
    case 'comments': return ncmComments(requireId(args.id, '歌曲 id'), clampInt(args.limit, 1, 30, 15), timeoutMs);
    case 'playlist': return ncmPlaylist(requireId(args.id, '歌单 id'), timeoutMs);
    case 'playlist-tracks': return ncmPlaylistTracks(requireId(args.id, '歌单 id'), clampInt(args.limit, 1, 100, 30), timeoutMs);
    case 'top-playlist': {
      const cat = String(unquoteJsonString(args.cat) ?? '').trim();
      return ncmTopPlaylist(cat ? cleanText(args.cat, { max: 20, name: 'cat' }) : '', clampInt(args.limit, 1, 50, 10), timeoutMs);
    }
    case 'album': return ncmAlbum(requireId(args.id, '专辑 id'), timeoutMs);
    case 'artist': return ncmArtist(requireId(args.id, '歌手 id'), timeoutMs);
    case 'artist-songs': return ncmArtistSongs(requireId(args.id, '歌手 id'), clampInt(args.limit, 1, 50, 20), timeoutMs);
    default: throw new Error('不支持命令「' + command + '」');
  }
}

const SKILL_LABELS = { bilibili: 'B站', netease: '网易云音乐' };

async function runSkill(skillKey, args, ctx) {
  const cfg = getConfig().media ?? {};
  if (cfg.enabled === false) return { content: '错误：媒体技能工具已在设置中关闭', isError: true };

  const skillCfg = skillKey === 'bilibili' ? (cfg.bilibili ?? {}) : (cfg.netease ?? {});
  if (skillCfg.enabled === false) {
    return { content: '错误：' + SKILL_LABELS[skillKey] + '工具已在设置中关闭', isError: true };
  }

  const allowed = skillKey === 'bilibili'
    ? ['hot', 'trending', 'ranking', 'search', 'info', 'tags', 'summary', 'comments']
    : ['search', 'hot', 'song', 'url', 'lyric', 'comments', 'playlist', 'playlist-tracks', 'top-playlist', 'album', 'artist', 'artist-songs'];
  const command = String(unquoteJsonString(args?.command) ?? '').trim();
  if (!allowed.includes(command)) {
    return {
      content: '错误：' + SKILL_LABELS[skillKey] + '不支持命令「' + command + '」。可用命令：' + allowed.join(' / '),
      isError: true
    };
  }

  const rateError = checkRate(ctx?.chatKey || 'unknown', skillKey);
  if (rateError) return { content: '错误：' + rateError, isError: true };

  const timeoutMs = Math.max(5000, Number(skillCfg.timeoutMs) || (skillKey === 'bilibili' ? 20000 : 30000));
  const startedAt = Date.now();
  try {
    let body;
    if (skillKey === 'bilibili') {
      const cookies = readCookieFile(BILI_COOKIE_FILE);
      body = await runBili(command, args ?? {}, cookies, timeoutMs);
    } else {
      body = await runNcm(command, args ?? {}, timeoutMs);
    }
    body = truncate(redact(body), skillCfg.maxOutputChars);
    if (!body) return { content: '没有拿到内容', isError: true };
    return { content: body };
  } catch (error) {
    const costMs = Date.now() - startedAt;
    if (error?.name === 'TimeoutError' || /timeout|aborted|超时/i.test(String(error?.message))) {
      return { content: '错误：' + SKILL_LABELS[skillKey] + '查询超时（' + Math.round(costMs / 1000) + 's），稍后再试', isError: true };
    }
    return { content: '错误：' + SKILL_LABELS[skillKey] + '执行失败：' + truncate(redact(error?.message ?? String(error)), 800), isError: true };
  }
}

// ── 工具定义 ────────────────────────────────────────────────────────────

function bilibiliDef() {
  return {
    name: 'bilibili',
    description: '查 B 站（哔哩哔哩）。群友发来 B 站链接/问“这视频讲了啥”时：先 info 拿标题，再用 summary 读 AI 摘要，然后自然回话，不要照念提纲。command：hot(热搜榜)｜trending(全站热门)｜ranking(排行榜)｜search(搜视频)｜info(视频信息)｜tags(视频标签)｜summary(AI摘要)｜comments(热门评论)。参数：bvid=视频号(可传完整链接)；keyword=搜索词；limit=条数(1~30)；rid=分区ID(ranking 用，0=全站)；mode=outline 只看分段提纲。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['hot', 'trending', 'ranking', 'search', 'info', 'tags', 'summary', 'comments'],
          description: '要执行的查询'
        },
        bvid: { type: 'string', description: '视频号，形如 BV1xx411c7mD；也可直接给完整链接（info/tags/summary/comments 用）' },
        keyword: { type: 'string', description: '搜索关键词（search 用）' },
        limit: { type: 'integer', description: '返回条数，默认 10，最大 30' },
        rid: { type: 'integer', description: '分区 ID，ranking 用：0=全站 1=动画 3=音乐 4=游戏 5=娱乐 36=科技' },
        mode: { type: 'string', enum: ['summary', 'outline', 'full'], description: 'summary 的详细程度：默认摘要+提纲；outline 只要提纲（最省）' }
      },
      required: ['command']
    },
    async execute(ctx, args) {
      return runSkill('bilibili', args, ctx);
    }
  };
}

function neteaseDef() {
  return {
    name: 'netease_music',
    description: '查网易云音乐。群友点歌/问歌词/问歌单时用；拿到 id 后可再取歌词或播放链接。command：search(搜歌)｜hot(热搜)｜song(歌曲详情)｜url(播放链接)｜lyric(歌词)｜comments(评论)｜playlist(歌单)｜playlist-tracks(歌单曲目)｜top-playlist(精品歌单)｜album(专辑)｜artist(歌手)｜artist-songs(歌手热门歌)。参数：keyword=搜索词；id=数字ID；limit=条数；cat=歌单分类；level=音质。注意：不含账号类功能（我的歌单/VIP/云盘/每日推荐），群友问这些就直说查不了。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['search', 'hot', 'song', 'url', 'lyric', 'comments', 'playlist', 'playlist-tracks', 'top-playlist', 'album', 'artist', 'artist-songs'],
          description: '要执行的查询'
        },
        keyword: { type: 'string', description: '搜索关键词（search 用）' },
        id: { type: ['integer', 'string'], description: '歌曲/歌单/专辑/歌手的数字 ID' },
        limit: { type: 'integer', description: '返回条数，默认 10，最大 30（歌单曲目最多 100）' },
        cat: { type: 'string', description: '精品歌单分类：华语/流行/摇滚/民谣/电子/古风/欧美/日语等' },
        level: { type: 'string', enum: ['standard', 'higher', 'exhigh', 'lossless', 'hires'], description: '音质（url 用，默认 exhigh）' }
      },
      required: ['command']
    },
    async execute(ctx, args) {
      return runSkill('netease', args, ctx);
    }
  };
}

export function mediaToolDefs() {
  return [bilibiliDef(), neteaseDef()];
}

export async function testMediaSkill(skillKey) {
  const startedAt = Date.now();
  const result = await runSkill(skillKey, { command: 'hot', limit: 3 }, { chatKey: '__console_test__' });
  const ms = Date.now() - startedAt;
  const text = String(result.content ?? '');
  return {
    ok: !result.isError,
    ms: ms,
    preview: text.split('\n').filter((l) => l.trim()).slice(0, 8).join('\n').slice(0, 400),
    error: result.isError ? text : ''
  };
}

export async function mediaSkillStatus() {
  const cfg = getConfig().media ?? {};
  const biliCookies = readCookieFile(BILI_COOKIE_FILE);
  const ncmCookies = readCookieFile(NCM_COOKIE_FILE);
  return {
    enabled: cfg.enabled !== false,
    runtime: 'node',
    bilibili: {
      enabled: cfg.bilibili?.enabled !== false,
      hasCookie: Object.keys(biliCookies).length > 0,
      cookieKeys: Object.keys(biliCookies).slice(0, 12),
      cookieFile: BILI_COOKIE_FILE
    },
    netease: {
      enabled: cfg.netease?.enabled !== false,
      apiBase: ncmBase(),
      hasCookie: Object.keys(ncmCookies).length > 0,
      cookieFile: NCM_COOKIE_FILE
    }
  };
}

export function saveBilibiliCookie(raw) {
  const cookies = parseCookieInput(raw);
  if (!Object.keys(cookies).length) throw new Error('cookie 为空或无法解析（支持 JSON 对象或 SESSDATA=...; bili_jct=... 形态）');
  writeCookieFile(BILI_COOKIE_FILE, cookies);
  wbiKeysCache = null;
  return { ok: true, keys: Object.keys(cookies) };
}

export function clearBilibiliCookie() {
  ensureMediaDir();
  try { fs.writeFileSync(BILI_COOKIE_FILE, '{}', 'utf8'); } catch { /* ignore */ }
  wbiKeysCache = null;
  return { ok: true };
}

export const __testing = {
  redact: redact,
  parseCookieInput: parseCookieInput,
  biliCookieFile: function () { return BILI_COOKIE_FILE; },
  ncmCookieFile: function () { return NCM_COOKIE_FILE; },
  readBiliCookies: function () { return readCookieFile(BILI_COOKIE_FILE); }
};
`;

const p = 'D:/Software/QQQ/../QQ-agent/src/media-skills.js';
// use absolute
const target = 'D:/Software/QQ-agent/src/media-skills.js';
const base = fs.readFileSync(target, 'utf8');
fs.writeFileSync(target, base + rest, 'utf8');
console.log('appended', rest.length, 'chars; total', fs.statSync(target).size);
