// tools/audit-site.mjs
// Static launch audit for every hand-authored HTML page:
//   - broken internal links (resolved against filesystem + vercel.json cleanUrls/rewrites)
//   - missing local assets (css/js/img referenced but not on disk)
//   - dead same-page anchors (#id with no matching id=)
//   - placeholder/non-functional links (href="#", href="javascript:...")
//   - SEO completeness (title, description, canonical, OG, twitter, lang, viewport, JSON-LD)
//
// Usage:  node tools/audit-site.mjs            (run from project root)
// Exit code is always 0; this is a report, not a gate.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.popcard.me';

// ---- collect pages (root + blog), skip node_modules ----
function htmlIn(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => join(dir, f));
}
const pages = [
  ...htmlIn(ROOT),
  ...(existsSync(join(ROOT, 'blog')) ? htmlIn(join(ROOT, 'blog')) : []),
].filter((p) => !p.includes('node_modules'));

// vercel.json rewrites — clean source paths that resolve even without a file
let rewrites = [];
try {
  const vj = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  rewrites = (vj.rewrites || []).map((r) => r.source);
} catch {}
function matchesRewrite(p) {
  return rewrites.some((src) => {
    // turn "/deck/:id" into a regex
    const re = new RegExp('^' + src.replace(/:[^/]+/g, '[^/]+') + '$');
    return re.test(p);
  });
}

const attrRe = /\b(href|src)\s*=\s*["']([^"']*)["']/gi;
const idRe = /\bid\s*=\s*["']([^"']+)["']/gi;
const nameRe = /\bname\s*=\s*["']([^"']+)["']/gi;

function idsOf(html) {
  const set = new Set();
  let m;
  while ((m = idRe.exec(html))) set.add(m[1]);
  while ((m = nameRe.exec(html))) set.add(m[1]);
  return set;
}

function resolveInternal(linkPath, pageFile) {
  let p = linkPath.split('#')[0].split('?')[0];
  if (p === '') return { ok: true };
  // dynamic deck route + any rewrite source
  if (matchesRewrite(p)) return { ok: true, dynamic: true };
  if (p.startsWith('/api/')) return { ok: true, api: true };
  let fsPath = p.startsWith('/') ? join(ROOT, p.slice(1)) : join(dirname(pageFile), p);
  if (existsSync(fsPath) && statSync(fsPath).isFile()) return { ok: true };
  if (existsSync(fsPath) && statSync(fsPath).isDirectory() && existsSync(join(fsPath, 'index.html')))
    return { ok: true };
  if (existsSync(fsPath + '.html')) return { ok: true, clean: true };
  if (p === '/' && existsSync(join(ROOT, 'index.html'))) return { ok: true };
  return { ok: false, tried: relative(ROOT, fsPath) };
}

function meta(html, re) {
  const m = html.match(re);
  return m ? (m[1] || '').trim() : null;
}

const errors = [];
const warnings = [];
const seoRows = [];
const externals = new Set();
const jsonldErrors = [];

for (const page of pages) {
  const rel = relative(ROOT, page).replace(/\\/g, '/');
  const html = readFileSync(page, 'utf8');
  // Strip HTML comments before scanning links/anchors so commented-out
  // TODO examples don't register as broken assets.
  const scan = html.replace(/<!--[\s\S]*?-->/g, '');
  const ids = idsOf(scan);

  // ---- links / assets ----
  let m;
  attrRe.lastIndex = 0;
  while ((m = attrRe.exec(scan))) {
    const val = m[2].trim();
    if (!val) { warnings.push(`${rel}: empty ${m[1]}=""`); continue; }
    if (/^(mailto:|tel:|data:)/i.test(val)) continue;
    if (/^https?:\/\//i.test(val)) { externals.add(val.split('#')[0]); continue; }
    if (val === '#') { warnings.push(`${rel}: placeholder href="#" (non-functional link)`); continue; }
    if (/^javascript:/i.test(val)) { warnings.push(`${rel}: href="javascript:..." (non-functional link)`); continue; }
    if (val.startsWith('#')) {
      const id = val.slice(1);
      if (id && !ids.has(id)) errors.push(`${rel}: dead anchor ${val} (no id="${id}" on page)`);
      continue;
    }
    const r = resolveInternal(val, page);
    if (!r.ok) errors.push(`${rel}: BROKEN ${m[1]}="${val}" -> ${r.tried} not found`);
    else if (r.clean && /\.html$/.test(val.split('#')[0])) warnings.push(`${rel}: ${m[1]}="${val}" uses .html (cleanUrls prefers extensionless)`);
  }

  // ---- SEO ----
  const title = meta(html, /<title>([^<]*)<\/title>/i);
  const desc = meta(html, /<meta\s+name=["']description["']\s+content="([^"]*)"/i);
  const canonical = meta(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i);
  const ogTitle = meta(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i);
  const ogDesc = meta(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i);
  const ogImage = meta(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i);
  const ogUrl = meta(html, /<meta\s+property=["']og:url["']\s+content=["']([^"']*)["']/i);
  const twitter = meta(html, /<meta\s+name=["']twitter:card["']\s+content=["']([^"']*)["']/i);
  const lang = meta(html, /<html[^>]*\blang=["']([^"']*)["']/i);
  const viewport = /<meta\s+name=["']viewport["']/i.test(html);
  const jsonld = /<script[^>]*type=["']application\/ld\+json["']/i.test(html);
  const robots = meta(html, /<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i);

  seoRows.push({ rel, title, desc, canonical, ogTitle, ogDesc, ogImage, ogUrl, twitter, lang, viewport, jsonld, robots });

  // Validate every JSON-LD block parses as JSON
  const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  ldBlocks.forEach((block, i) => {
    const inner = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    try { JSON.parse(inner); } catch (e) { jsonldErrors.push(`${rel}: JSON-LD block #${i + 1} does not parse — ${e.message}`); }
  });
}

// ---- SEO problem detection (skip app pages where noindex is fine) ----
const APP_PAGES = new Set([
  'account.html','settings.html','deck.html','practice.html','quizzes.html',
  'decks.html','calendar.html','casual.html','onboarding.html','success.html',
]);
const seoErrors = [];
const seoWarn = [];
for (const r of seoRows) {
  // noindex pages (404, login, app pages) don't need canonical/OG for SEO
  const isApp = APP_PAGES.has(r.rel) || /noindex/i.test(r.robots || '');
  if (!r.title) seoErrors.push(`${r.rel}: missing <title>`);
  else if (r.title.length > 65) seoWarn.push(`${r.rel}: title ${r.title.length} chars (>60 may truncate in SERP): "${r.title}"`);
  if (!isApp) {
    if (!r.desc) seoErrors.push(`${r.rel}: missing meta description`);
    else if (r.desc.length > 165) seoWarn.push(`${r.rel}: description ${r.desc.length} chars (>160 truncates): "${r.desc.slice(0,60)}..."`);
    if (!r.canonical) seoWarn.push(`${r.rel}: no canonical link`);
    else if (!r.canonical.startsWith(SITE)) seoErrors.push(`${r.rel}: canonical not on ${SITE}: ${r.canonical}`);
    if (!r.ogTitle) seoWarn.push(`${r.rel}: no og:title`);
    if (!r.ogImage) seoWarn.push(`${r.rel}: no og:image`);
    if (!r.ogUrl) seoWarn.push(`${r.rel}: no og:url`);
    else if (!r.ogUrl.startsWith(SITE)) seoErrors.push(`${r.rel}: og:url not on ${SITE}: ${r.ogUrl}`);
    if (!r.twitter) seoWarn.push(`${r.rel}: no twitter:card`);
  }
  if (!r.lang) seoWarn.push(`${r.rel}: <html> missing lang=`);
  if (!r.viewport) seoErrors.push(`${r.rel}: missing viewport meta`);
}

// ---- print ----
const line = (s) => console.log(s);
line('================  POPCARD LAUNCH AUDIT  ================');
line(`pages scanned: ${pages.length}`);
line('');
line(`---- LINK / ASSET / ANCHOR ERRORS (${errors.length}) ----`);
errors.length ? errors.forEach((e) => line('  ✗ ' + e)) : line('  (none)');
line('');
line(`---- LINK WARNINGS (${warnings.length}) ----`);
warnings.length ? warnings.forEach((w) => line('  • ' + w)) : line('  (none)');
line('');
line(`---- JSON-LD PARSE ERRORS (${jsonldErrors.length}) ----`);
jsonldErrors.length ? jsonldErrors.forEach((e) => line('  ✗ ' + e)) : line('  (none)');
line('');
line(`---- SEO ERRORS (${seoErrors.length}) ----`);
seoErrors.length ? seoErrors.forEach((e) => line('  ✗ ' + e)) : line('  (none)');
line('');
line(`---- SEO WARNINGS (${seoWarn.length}) ----`);
seoWarn.length ? seoWarn.forEach((w) => line('  • ' + w)) : line('  (none)');
line('');
line(`---- EXTERNAL LINKS (${externals.size}) — spot-check these ----`);
[...externals].sort().forEach((u) => line('  → ' + u));
line('');
line('---- SEO TABLE (page | title len | desc len | canonical? | og? | jsonld?) ----');
for (const r of seoRows) {
  line(
    `  ${r.rel.padEnd(34)} t:${String(r.title ? r.title.length : 0).padStart(3)} ` +
    `d:${String(r.desc ? r.desc.length : 0).padStart(3)} ` +
    `can:${r.canonical ? 'Y' : '-'} og:${r.ogTitle ? 'Y' : '-'} img:${r.ogImage ? 'Y' : '-'} ` +
    `tw:${r.twitter ? 'Y' : '-'} ld:${r.jsonld ? 'Y' : '-'} robots:${r.robots || '-'}`
  );
}
line('=======================================================');
