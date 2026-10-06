// 半荘の成績を GitHub リポジトリの data ブランチに保存する（環境変数 GITHUB_TOKEN があるとき）
// ファイルは records/YYYY-MM.json（月ごと）。中身は加工しない生の結果で、表の形は成績ページ（public/stats.html）で作る
"use strict";

const TOKEN = (process.env.GITHUB_TOKEN || "").trim();
const REPO = (process.env.GITHUB_REPO || "murth12317-dot/tomodachi-mahjong").trim();
const BRANCH = (process.env.DATA_BRANCH || "data").trim();
const DIR = "records";
const API = (process.env.GITHUB_API || "https://api.github.com") + "/repos/" + REPO;
const enabled = !!TOKEN;

let cache = [], loadedAt = 0, loading = null;
const pending = []; // まだ GitHub に書けていない記録
let saving = false;

async function gh(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : API + url, {
    method, headers: { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json", "User-Agent": "tomodachi-records", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

// data ブランチがなければ main から作る（data ブランチへの書き込みでは Render は再デプロイされない）
async function ensureBranch() {
  const r = await gh("GET", `/git/ref/heads/${BRANCH}`);
  if (r.status === 200) return;
  if (r.status !== 404) throw new Error(`branch check ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  const repo = await gh("GET", "");
  const main = await gh("GET", `/git/ref/heads/${repo.data.default_branch || "main"}`);
  const c = await gh("POST", "/git/refs", { ref: `refs/heads/${BRANCH}`, sha: main.data.object.sha });
  if (c.status !== 201) throw new Error(`branch create ${c.status} ${JSON.stringify(c.data).slice(0, 200)}`);
  console.log(`records: created branch ${BRANCH}`);
}

async function readFile(path) {
  const r = await gh("GET", `/contents/${path}?ref=${BRANCH}`);
  if (r.status === 404) return { list: [], sha: null };
  if (r.status !== 200) throw new Error(`read ${path} ${r.status}`);
  const text = Buffer.from(r.data.content || "", "base64").toString("utf8");
  return { list: text.trim() ? JSON.parse(text) : [], sha: r.data.sha };
}

// 全部の月のファイルを読む（Claude が GitHub で直接直した分もここで読み直される）
async function loadAll() {
  if (!enabled) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      await ensureBranch();
      const r = await gh("GET", `/contents/${DIR}?ref=${BRANCH}`);
      const files = r.status === 200 ? r.data.filter(f => /\.json$/.test(f.name)).map(f => f.path).sort() : [];
      const all = [];
      for (const f of files) all.push(...(await readFile(f)).list);
      cache = all; loadedAt = Date.now();
      return cache;
    } finally { loading = null; }
  })();
  return loading;
}

const monthOf = iso => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 7); // 日本時間の年月

// たまった記録を、月のファイルに書き足す（同じ id は二重に書かない。ぶつかったら読み直してやり直す）
async function flush() {
  if (!enabled || saving || !pending.length) return;
  saving = true;
  try {
    await ensureBranch();
    while (pending.length) {
      const rec = pending[0], path = `${DIR}/${monthOf(rec.at)}.json`;
      let done = false;
      for (let i = 0; i < 4 && !done; i++) {
        const { list, sha } = await readFile(path);
        if (list.some(x => x.id === rec.id)) { done = true; break; }
        list.push(rec);
        const body = { message: `記録 ${rec.id}`, branch: BRANCH, content: Buffer.from(JSON.stringify(list, null, 1) + "\n").toString("base64"), ...(sha ? { sha } : {}) };
        const w = await gh("PUT", `/contents/${path}`, body);
        if (w.status === 200 || w.status === 201) done = true;
        else if (w.status !== 409 && w.status !== 422) throw new Error(`write ${path} ${w.status} ${JSON.stringify(w.data).slice(0, 200)}`);
      }
      if (!done) throw new Error(`write ${path} conflict`);
      pending.shift();
      if (!cache.some(x => x.id === rec.id)) cache.push(rec);
      console.log(`records: saved ${rec.id}`);
    }
  } catch (e) {
    console.log("records failed", e.message, "(あとでもう一度書きます)");
    setTimeout(flush, 60000);
  } finally { saving = false; }
}

function add(rec) {
  if (!enabled) return;
  pending.push(rec);
  flush();
}

// 成績ページ用。1分より古ければ GitHub から読み直す（読めなければ手元の分を返す）
async function list() {
  if (enabled && Date.now() - loadedAt > 60000) { try { await loadAll(); } catch (e) { console.log("records load failed", e.message); } }
  const ids = new Set(cache.map(x => x.id));
  return cache.concat(pending.filter(x => !ids.has(x.id)));
}

if (enabled) loadAll().then(l => console.log(`records ok (${REPO}@${BRANCH}, ${l.length} games)`)).catch(e => console.log("records load failed", e.message));
else console.log("records off (GITHUB_TOKEN not set)");

module.exports = { enabled, add, list };
