import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const E = process.env;
const PORT = +E.PORT || 3000;
const SITE = (E.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const NAME = E.SITE_NAME || 'Goalline';
const MAIL = E.CONTACT_EMAIL || 'contact@example.com';
const GAP = +E.GAP_MS || 6500;
const EVERY = +E.POLL_MS || 30000;
const LANGS = ['en', 'fr', 'ar'];

// code = football-data.org competition code
const LEAGUES = {
  premier: { code: 'PL', rel: 3, table: 1, n: { en: 'Premier League', fr: 'Premier League', ar: 'الدوري الإنجليزي' } },
  laliga: { code: 'PD', rel: 3, table: 1, n: { en: 'La Liga', fr: 'La Liga', ar: 'الدوري الإسباني' } },
  ligue1: { code: 'FL1', rel: 2, table: 1, n: { en: 'Ligue 1', fr: 'Ligue 1', ar: 'الدوري الفرنسي' } },
  seriea: { code: 'SA', rel: 3, table: 1, n: { en: 'Serie A', fr: 'Serie A', ar: 'الدوري الإيطالي' } },
  bundesliga: { code: 'BL1', rel: 2, table: 1, n: { en: 'Bundesliga', fr: 'Bundesliga', ar: 'الدوري الألماني' } },
  champions: { code: 'CL', rel: 0, table: 0, n: { en: 'Champions League', fr: 'Ligue des champions', ar: 'دوري أبطال أوروبا' } },
  worldcup: { code: 'WC', rel: 0, table: 0, n: { en: 'World Cup (national teams)', fr: 'Coupe du monde (sélections)', ar: 'كأس العالم (المنتخبات)' } },
};

const S = {
  en: { dir: 'ltr', live: 'Live now', next: 'Upcoming matches', res: 'Latest results', tbl: 'Standings', cols: ['#', 'Club', 'P', 'W', 'D', 'L', 'GD', 'Pts'], none: 'No matches to show right now.', upd: 'Updated', tag: 'Live football scores, fixtures and standings', about: 'About', contact: 'Contact', privacy: 'Privacy policy' },
  fr: { dir: 'ltr', live: 'En direct', next: 'Prochains matchs', res: 'Derniers résultats', tbl: 'Classement', cols: ['#', 'Club', 'J', 'G', 'N', 'P', 'Diff', 'Pts'], none: 'Aucun match à afficher pour le moment.', upd: 'Mis à jour', tag: 'Scores, calendrier et classements en direct', about: 'À propos', contact: 'Contact', privacy: 'Confidentialité' },
  ar: { dir: 'rtl', live: 'مباشر الآن', next: 'المباريات القادمة', res: 'آخر النتائج', tbl: 'الترتيب', cols: ['#', 'النادي', 'لعب', 'فاز', 'تعادل', 'خسر', 'فارق', 'نقاط'], none: 'لا توجد مباريات للعرض حاليًا.', upd: 'آخر تحديث', tag: 'نتائج ومباريات وترتيب مباشر', about: 'من نحن', contact: 'اتصل بنا', privacy: 'سياسة الخصوصية' },
};

// ---------- data cache ----------
const DB = {};
for (const k in LEAGUES) DB[k] = { matches: [], table: [], updated: 0, tbl: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function api(p) {
  const r = await fetch('https://api.football-data.org/v4' + p, { headers: { 'X-Auth-Token': E.FOOTBALL_DATA_TOKEN || '' } });
  await sleep(GAP); // stay under the provider's rate limit
  if (!r.ok) throw new Error(r.status + ' ' + p);
  return r.json();
}
const side = (t) => ({ n: t.shortName || t.name || '?', t: t.tla || (t.name || '?').slice(0, 3).toUpperCase() });
function normMatch(m) {
  const s = m.status;
  return { id: m.id, utc: m.utcDate, st: s === 'IN_PLAY' || s === 'PAUSED' ? 'live' : s === 'FINISHED' ? 'ft' : 'ns',
    min: m.minute || null, h: side(m.homeTeam), a: side(m.awayTeam), hs: m.score?.fullTime?.home ?? null, as: m.score?.fullTime?.away ?? null };
}
async function poll() {
  for (const [k, L] of Object.entries(LEAGUES)) {
    try {
      const d = await api(`/competitions/${L.code}/matches?dateFrom=${day(-4)}&dateTo=${day(8)}`);
      DB[k].matches = d.matches.map(normMatch);
      DB[k].updated = Date.now();
      if (L.table && Date.now() - DB[k].tbl > 15 * 60e3) {
        const t = await api(`/competitions/${L.code}/standings`);
        const tot = (t.standings || []).find((x) => x.type === 'TOTAL') || t.standings?.[0];
        DB[k].table = (tot?.table || []).map((x) => ({ r: x.position, n: side(x.team).n, t: side(x.team).t, p: x.playedGames, w: x.won, d: x.draw, l: x.lost, gd: x.goalDifference, pts: x.points }));
        DB[k].tbl = Date.now();
      }
    } catch (e) { console.error('[poll]', k, e.message); }
  }
  setTimeout(poll, EVERY);
}
function mock() {
  const T = [['ARS', 'Arsenal'], ['BAR', 'Barcelona'], ['PSG', 'Paris SG'], ['MIL', 'Milan'], ['BAY', 'Bayern'], ['RMA', 'Real Madrid'], ['INT', 'Inter'], ['LIV', 'Liverpool']];
  const t = (i) => ({ t: T[i][0], n: T[i][1] });
  for (const k in LEAGUES) {
    const now = Date.now();
    const mk = (i, st, h, a, hs, as, off) => ({ id: k + i, utc: new Date(now + off * 36e5).toISOString(), st, min: st === 'live' ? 63 : null, h: t(h), a: t(a), hs, as });
    DB[k] = { updated: now, tbl: now,
      matches: [mk(1, 'ft', 0, 1, 3, 1, -30), mk(2, 'ft', 2, 3, 0, 0, -28), mk(3, 'live', 4, 5, 1, 1, -1), mk(4, 'ns', 6, 7, 0, 0, 30), mk(5, 'ns', 1, 0, 0, 0, 52)],
      table: T.slice(0, 6).map((x, i) => ({ r: i + 1, t: x[0], n: x[1], p: 10, w: 7 - i, d: 1, l: 2 + i, gd: 12 - 3 * i, pts: (7 - i) * 3 + 1 })) };
  }
}

// ---------- rendering ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let NM = {};
try { NM = JSON.parse(fs.readFileSync(path.join(here, 'names.json'), 'utf8')); } catch (e) {}
const nm = (t, lang) => (NM[lang] || {})[t.n] || t.n;
// Original generated badge (no club logos, so no trademark problems)
function badge(t, n = 28) {
  const h = [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return `<svg width="${n}" height="${Math.round(n * 1.14)}" viewBox="0 0 28 32" aria-hidden="true"><path d="M2.5 3h23v13c0 7-5.5 11.5-11.5 13.5C8 27.5 2.5 23 2.5 16z" fill="hsl(${h} 55% 38%)"/><text x="14" y="19" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="9.5" fill="#fff">${esc(t)}</text></svg>`;
}
function row(m, s, lang, k) {
  const tl = (t) => `<a href="/${lang}/team/${k}/${encodeURIComponent(t.t)}">${esc(nm(t, lang))}</a>`;
  const mid = m.st === 'ns'
    ? `<time data-utc="${m.utc}">${m.utc.slice(5, 10)} ${m.utc.slice(11, 16)} UTC</time>`
    : `<b>${m.hs ?? 0} – ${m.as ?? 0}</b><small class="${m.st === 'live' ? 'lv' : ''}">${m.st === 'live' ? s.live + (m.min ? ' ' + m.min + '’' : '') : 'FT'}</small>`;
  return `<div class="m"><span class="tm h">${tl(m.h)}${badge(m.h.t)}</span><a class="sc" href="/${lang}/match/${k}/${m.id}">${mid}</a><span class="tm">${badge(m.a.t)}${tl(m.a)}</span></div>`;
}
function body(k, lang) {
  const s = S[lang], d = DB[k], L = LEAGUES[k];
  const live = d.matches.filter((m) => m.st === 'live');
  const next = d.matches.filter((m) => m.st === 'ns').sort((a, b) => a.utc.localeCompare(b.utc)).slice(0, 10);
  const res = d.matches.filter((m) => m.st === 'ft').sort((a, b) => b.utc.localeCompare(a.utc)).slice(0, 10);
  const sec = (t, a) => (a.length ? `<section class="box"><h2>${t}</h2>${a.map((m) => row(m, s, lang, k)).join('')}</section>` : '');
  const left = (sec(s.live, live) + sec(s.next, next) + sec(s.res, res)) || `<p class="box pad">${s.none}</p>`;
  const n = d.table.length;
  const table = L.table && n
    ? `<section class="box"><h2>${s.tbl}</h2><table><tr>${s.cols.map((c) => `<th>${c}</th>`).join('')}</tr>${d.table.map((r, i) => `<tr class="${i < 4 ? 'top' : n - i <= L.rel ? 'bot' : ''}"><td>${r.r}</td><td class="c">${badge(r.t, 18)}<a href="/${lang}/team/${k}/${encodeURIComponent(r.t)}">${esc(nm(r, lang))}</a></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd}</td><td>${r.pts}</td></tr>`).join('')}</table></section>` : '';
  const up = d.updated ? new Date(d.updated).toISOString().slice(11, 16) + ' UTC' : '—';
  return `<div class="grid"><div>${left}</div><aside>${table}</aside></div><p class="upd">${s.upd}: ${up}</p>`;
}
// Original text written from the data (helps with the "unique content" rule)
function summary(k, lang) {
  const d = DB[k], L = LEAGUES[k], t = d.table, out = [];
  if (t.length > 1) {
    const g = t[0].pts - t[1].pts;
    out.push({ en: `${t[0].n} lead the ${L.n.en} with ${t[0].pts} points from ${t[0].p} matches, ${g} ahead of ${t[1].n}.`,
      fr: `${t[0].n} mène la ${L.n.fr} avec ${t[0].pts} points en ${t[0].p} matchs, ${g} d’avance sur ${t[1].n}.`,
      ar: `يتصدر ${t[0].n} ${L.n.ar} برصيد ${t[0].pts} نقطة من ${t[0].p} مباراة، بفارق ${g} عن ${t[1].n}.` }[lang]);
  }
  const best = d.matches.filter((m) => m.st === 'ft').sort((a, b) => (b.hs + b.as) - (a.hs + a.as))[0];
  if (best && best.hs + best.as > 0) out.push({ en: `The highest-scoring recent match was ${best.h.n} ${best.hs}–${best.as} ${best.a.n}.`,
    fr: `Le match le plus prolifique récemment : ${best.h.n} ${best.hs}–${best.as} ${best.a.n}.`,
    ar: `أكثر المباريات الأخيرة تسجيلًا للأهداف: ${best.h.n} ${best.hs}–${best.as} ${best.a.n}.` }[lang]);
  return out.join(' ');
}
const trow = (k, t) => DB[k].table.find((r) => r.t === t);
function matchText(k, m, lang) {
  const L = LEAGUES[k].n[lang], h = nm(m.h, lang), a = nm(m.a, lang), d = m.utc.slice(0, 10), x = m.hs, y = m.as;
  let t;
  if (m.st === 'ns') t = { en: `${h} host ${a} in the ${L} on ${d}.`, fr: `${h} reçoit ${a} en ${L} le ${d}.`, ar: `يستضيف ${h} فريق ${a} في ${L} بتاريخ ${d}.` }[lang];
  else if (m.st === 'live') t = { en: `${h} and ${a} are playing now in the ${L}. The score is ${x}–${y}.`, fr: `${h} et ${a} s’affrontent en ce moment en ${L}. Score : ${x}–${y}.`, ar: `${h} و${a} يلعبان الآن في ${L}. النتيجة ${x}–${y}.` }[lang];
  else if (x === y) t = { en: `${h} and ${a} drew ${x}–${y} in the ${L}.`, fr: `${h} et ${a} font match nul (${x}–${y}) en ${L}.`, ar: `تعادل ${h} و${a} بنتيجة ${x}–${y} في ${L}.` }[lang];
  else { const w = x > y ? h : a, l = x > y ? a : h, hi = Math.max(x, y), lo = Math.min(x, y);
    t = { en: `${w} beat ${l} ${hi}–${lo} in the ${L}.`, fr: `${w} bat ${l} ${hi}–${lo} en ${L}.`, ar: `فاز ${w} على ${l} ${hi}–${lo} في ${L}.` }[lang]; }
  const r1 = trow(k, m.h.t), r2 = trow(k, m.a.t);
  if (r1 && r2) t += ' ' + { en: `${h}: position ${r1.r} (${r1.pts} points). ${a}: position ${r2.r} (${r2.pts} points).`, fr: `${h} : ${r1.r}e (${r1.pts} points). ${a} : ${r2.r}e (${r2.pts} points).`, ar: `${h}: المركز ${r1.r} (${r1.pts} نقطة). ${a}: المركز ${r2.r} (${r2.pts} نقطة).` }[lang];
  return t;
}
function matchBody(k, m, lang) {
  return `<section class="box">${row(m, S[lang], lang, k)}</section><p class="lead">${esc(matchText(k, m, lang))}</p><p><a href="/${lang}/${k}">${esc(LEAGUES[k].n[lang])}</a></p>`;
}
function matchPage(k, m, lang) {
  const v = m.st === 'ns' ? 'vs' : `${m.hs ?? 0}–${m.as ?? 0}`, ti = `${nm(m.h, lang)} ${v} ${nm(m.a, lang)}`;
  return page({ lang, p: `/match/${k}/${m.id}`, title: `${ti} | ${LEAGUES[k].n[lang]} | ${NAME}`, desc: matchText(k, m, lang),
    main: `<h1>${esc(ti)}</h1><div id="live" data-src="/${lang}/match/${k}/${m.id}/live">${matchBody(k, m, lang)}</div>` });
}
function teamOf(k, t) {
  const r = trow(k, t); if (r) return r;
  const m = DB[k].matches.find((x) => x.h.t === t || x.a.t === t);
  return m ? (m.h.t === t ? m.h : m.a) : null;
}
function teamText(k, tm, lang) {
  const r = trow(k, tm.t), L = LEAGUES[k].n[lang], n = nm(tm, lang);
  if (!r) return '';
  return { en: `${n} are in position ${r.r} of the ${L} with ${r.pts} points from ${r.p} matches (${r.w} wins, ${r.d} draws, ${r.l} defeats).`,
    fr: `${n} est ${r.r}e de la ${L} avec ${r.pts} points en ${r.p} matchs (${r.w} victoires, ${r.d} nuls, ${r.l} défaites).`,
    ar: `${n} في المركز ${r.r} في ${L} برصيد ${r.pts} نقطة من ${r.p} مباراة (${r.w} فوز، ${r.d} تعادل، ${r.l} خسارة).` }[lang];
}
function teamBody(k, t, lang) {
  const s = S[lang], ms = DB[k].matches.filter((m) => m.h.t === t || m.a.t === t);
  const sec = (h, a) => (a.length ? `<section class="box"><h2>${h}</h2>${a.map((m) => row(m, s, lang, k)).join('')}</section>` : '');
  return (sec(s.live, ms.filter((m) => m.st === 'live')) + sec(s.next, ms.filter((m) => m.st === 'ns').sort((a, b) => a.utc.localeCompare(b.utc))) + sec(s.res, ms.filter((m) => m.st === 'ft').sort((a, b) => b.utc.localeCompare(a.utc)))) || `<p class="box pad">${s.none}</p>`;
}
function teamPage(k, t, lang) {
  const tm = teamOf(k, t), ti = `${nm(tm, lang)} – ${LEAGUES[k].n[lang]}`;
  return page({ lang, p: `/team/${k}/${encodeURIComponent(t)}`, title: `${ti} | ${NAME}`, desc: teamText(k, tm, lang) || ti,
    main: `<h1>${esc(ti)}</h1><p class="lead">${esc(teamText(k, tm, lang))}</p><div id="live" data-src="/${lang}/team/${k}/${encodeURIComponent(t)}/live">${teamBody(k, t, lang)}</div>` });
}
const ad = (slot) => (E.ADSENSE_CLIENT && slot ? `<div class="ad"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(E.ADSENSE_CLIENT)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>` : '');

function page({ lang, title, desc, p, main }) {
  const s = S[lang];
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}/${l}${p}">`).join('');
  return `<!doctype html><html lang="${lang}" dir="${s.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}/${lang}${p}">${alts}<link rel="stylesheet" href="/static/style.css">${E.ADSENSE_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(E.ADSENSE_CLIENT)}" crossorigin="anonymous"></script>` : ''}</head><body>
<header><div class="bar"><a class="logo" href="/${lang}/premier">${esc(NAME)}</a><nav class="lang">${LANGS.map((l) => `<a href="/${l}${p}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('')}</nav></div>
<nav class="lgs">${Object.keys(LEAGUES).map((k) => `<a href="/${lang}/${k}"${p === '/' + k ? ' aria-current="page"' : ''}>${esc(LEAGUES[k].n[lang])}</a>`).join('')}</nav></header>
<main>${main}</main>
<footer><a href="/${lang}/about">${s.about}</a><a href="/${lang}/contact">${s.contact}</a><a href="/${lang}/privacy">${s.privacy}</a><p>${esc(NAME)} · ${s.tag}</p></footer>
<script src="/static/app.js" defer></script></body></html>`;
}
function leaguePage(k, lang) {
  const L = LEAGUES[k], s = S[lang];
  const main = `<h1>${esc(L.n[lang])}</h1><p class="lead">${esc(summary(k, lang))}</p>${ad(E.ADSLOT_1)}<div id="live" data-src="/${lang}/${k}/live">${body(k, lang)}</div>${ad(E.ADSLOT_2)}`;
  return page({ lang, p: '/' + k, main, title: `${L.n[lang]} – ${s.tag} | ${NAME}`, desc: `${L.n[lang]}: ${s.tag}.` });
}
function legal(kind, lang) {
  const n = esc(NAME), m = `<a href="mailto:${esc(MAIL)}">${esc(MAIL)}</a>`, u = esc(SITE);
  const T = {
    en: {
      about: ['About', `<p>${n} publishes live football scores, fixtures and league tables for the Premier League, La Liga, Ligue 1, Serie A, Bundesliga, the Champions League and the World Cup. Scores refresh automatically from a licensed football data provider.</p><p>The short summaries on league, team and match pages are written automatically from that data. ${n} is an independent site and is not affiliated with any club, league or federation.</p>`],
      contact: ['Contact', `<p>Questions, corrections or business enquiries: ${m}.</p>`],
      privacy: ['Privacy policy', `<p>This policy explains what ${n} (${u}) collects when you visit.</p><h2>Information we collect</h2><p>Our servers log standard technical data such as IP address, browser type and the pages requested. We do not ask you to create an account.</p><h2>Cookies and advertising</h2><p>We use third-party advertising, including Google AdSense. Google and its partners use cookies to show ads based on your prior visits to this and other sites. You can manage personalised ads in <a href="https://adssettings.google.com">Google Ads Settings</a> or opt out at <a href="https://www.aboutads.info">aboutads.info</a>. Where required, we ask for your consent before ads are personalised.</p><h2>Your rights</h2><p>Depending on where you live you may ask us to access or delete data we hold about you. Write to ${m}.</p>`],
    },
    fr: {
      about: ['À propos', `<p>${n} publie les scores en direct, les calendriers et les classements de la Premier League, de la Liga, de la Ligue 1, de la Serie A, de la Bundesliga, de la Ligue des champions et de la Coupe du monde. Les scores se mettent à jour automatiquement à partir d’un fournisseur de données sous licence.</p><p>Les résumés des pages de championnat, d’équipe et de match sont rédigés automatiquement à partir de ces données. ${n} est un site indépendant, non affilié à un club, une ligue ou une fédération.</p>`],
      contact: ['Contact', `<p>Questions, corrections ou demandes commerciales : ${m}.</p>`],
      privacy: ['Politique de confidentialité', `<p>Cette politique explique les données que ${n} (${u}) collecte lors de votre visite.</p><h2>Données collectées</h2><p>Nos serveurs enregistrent des données techniques courantes : adresse IP, type de navigateur et pages demandées. Aucun compte n’est requis.</p><h2>Cookies et publicité</h2><p>Nous utilisons de la publicité tierce, notamment Google AdSense. Google et ses partenaires utilisent des cookies pour afficher des annonces selon vos visites précédentes sur ce site et d’autres. Vous pouvez gérer la personnalisation dans les <a href="https://adssettings.google.com">paramètres des annonces Google</a> ou vous désinscrire sur <a href="https://www.aboutads.info">aboutads.info</a>. Lorsque la loi l’exige, nous demandons votre consentement avant de personnaliser les annonces.</p><h2>Vos droits</h2><p>Selon votre pays, vous pouvez demander l’accès à vos données ou leur suppression. Écrivez à ${m}.</p>`],
    },
    ar: {
      about: ['من نحن', `<p>يقدّم ${n} نتائج مباريات كرة القدم المباشرة والجداول والترتيب للدوري الإنجليزي الممتاز والدوري الإسباني والدوري الفرنسي والدوري الإيطالي والدوري الألماني ودوري أبطال أوروبا وكأس العالم. تتحدث النتائج تلقائيًا من مزوّد بيانات مرخّص.</p><p>الملخصات القصيرة في صفحات الدوريات والفرق والمباريات تُكتب تلقائيًا من هذه البيانات. ${n} موقع مستقل وغير تابع لأي نادٍ أو دوري أو اتحاد.</p>`],
      contact: ['اتصل بنا', `<p>للاستفسارات والتصحيحات والطلبات التجارية: ${m}.</p>`],
      privacy: ['سياسة الخصوصية', `<p>توضح هذه السياسة ما يجمعه ${n} (${u}) عند زيارتك.</p><h2>المعلومات التي نجمعها</h2><p>تسجّل خوادمنا بيانات تقنية معتادة مثل عنوان IP ونوع المتصفح والصفحات المطلوبة. لا نطلب منك إنشاء حساب.</p><h2>ملفات تعريف الارتباط والإعلانات</h2><p>نستخدم إعلانات من جهات خارجية، منها Google AdSense. تستخدم Google وشركاؤها ملفات تعريف الارتباط لعرض إعلانات بناءً على زياراتك السابقة لهذا الموقع ومواقع أخرى. يمكنك إدارة الإعلانات المخصّصة من <a href="https://adssettings.google.com">إعدادات إعلانات Google</a> أو إلغاء الاشتراك عبر <a href="https://www.aboutads.info">aboutads.info</a>. وعند اشتراط القانون، نطلب موافقتك قبل تخصيص الإعلانات.</p><h2>حقوقك</h2><p>بحسب بلد إقامتك يمكنك طلب الاطلاع على بياناتك أو حذفها. راسلنا على ${m}.</p>`],
    },
  }[lang][kind];
  return page({ lang, p: '/' + kind, main: `<h1>${T[0]}</h1><div class="text">${T[1]}</div><p class="upd">${new Date().toISOString().slice(0, 10)}</p>`, title: `${T[0]} | ${NAME}`, desc: `${T[0]} – ${NAME}` });
}

// ---------- server ----------
const send = (r, code, type, data, extra = {}) => { r.writeHead(code, { 'Content-Type': type + '; charset=utf-8', ...extra }); r.end(data); };
const MIME = { '.css': 'text/css', '.js': 'text/javascript' };
function route(q, r) {
  const u = new URL(q.url, SITE);
  const p = u.pathname.replace(/\/+$/, '') || '/';
  const seg = p.split('/').filter(Boolean);
  if (p === '/') return send(r, 302, 'text/plain', '', { Location: '/en/premier' });
  if (p === '/healthz') return send(r, 200, 'text/plain', 'ok');
  if (p === '/robots.txt') return send(r, 200, 'text/plain', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  if (p === '/ads.txt') return E.ADSENSE_PUB ? send(r, 200, 'text/plain', `google.com, ${E.ADSENSE_PUB}, DIRECT, f08c47fec0942fa0\n`) : send(r, 404, 'text/plain', 'Not set');
  if (p === '/sitemap.xml') {
    const dyn = [];
    for (const k in LEAGUES) {
      const ts = new Set(DB[k].table.map((x) => x.t));
      for (const m of DB[k].matches) { dyn.push(`/match/${k}/${m.id}`); ts.add(m.h.t); ts.add(m.a.t); }
      for (const t of ts) dyn.push(`/team/${k}/${encodeURIComponent(t)}`);
    }
    const urls = LANGS.flatMap((l) => [...Object.keys(LEAGUES).map((x) => '/' + x), '/about', '/contact', '/privacy', ...dyn].map((x) => `${SITE}/${l}${x}`));
    return send(r, 200, 'application/xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((x) => `<url><loc>${x}</loc></url>`).join('')}</urlset>`);
  }
  if (seg[0] === 'static' && seg[1]) {
    const f = path.join(here, 'public', path.basename(seg[1]));
    if (!fs.existsSync(f)) return send(r, 404, 'text/plain', 'Not found');
    return send(r, 200, MIME[path.extname(f)] || 'text/plain', fs.readFileSync(f), { 'Cache-Control': 'public, max-age=3600' });
  }
  if (seg[0] === 'api' && LEAGUES[seg[1]]) return send(r, 200, 'application/json', JSON.stringify(DB[seg[1]]), { 'Cache-Control': 'public, max-age=15', 'Access-Control-Allow-Origin': '*' });
  if (LANGS.includes(seg[0]) && seg[1]) {
    const lang = seg[0];
    if (seg[1] === 'match' && seg.length >= 4 && LEAGUES[seg[2]]) {
      const k = seg[2], m = DB[k].matches.find((x) => String(x.id) === seg[3]);
      if (m) return seg[4] === 'live' ? send(r, 200, 'text/html', matchBody(k, m, lang), { 'Cache-Control': 'public, max-age=15' }) : send(r, 200, 'text/html', matchPage(k, m, lang), { 'Cache-Control': 'public, max-age=15' });
    }
    if (seg[1] === 'team' && seg.length >= 4 && LEAGUES[seg[2]]) {
      const k = seg[2], t = decodeURIComponent(seg[3]);
      if (teamOf(k, t)) return seg[4] === 'live' ? send(r, 200, 'text/html', teamBody(k, t, lang), { 'Cache-Control': 'public, max-age=15' }) : send(r, 200, 'text/html', teamPage(k, t, lang), { 'Cache-Control': 'public, max-age=15' });
    }
    if (['about', 'contact', 'privacy'].includes(seg[1]) && seg.length === 2) return send(r, 200, 'text/html', legal(seg[1], lang));
    if (LEAGUES[seg[1]]) {
      if (seg.length === 2) return send(r, 200, 'text/html', leaguePage(seg[1], lang), { 'Cache-Control': 'public, max-age=15' });
      if (seg[2] === 'live' && seg.length === 3) return send(r, 200, 'text/html', body(seg[1], lang), { 'Cache-Control': 'public, max-age=15' });
    }
  }
  send(r, 404, 'text/html', page({ lang: 'en', p: '/premier', main: '<h1>Page not found</h1><p><a href="/en/premier">Go to the Premier League scores</a></p>', title: 'Not found', desc: 'Not found' }));
}
http.createServer((q, r) => { try { route(q, r); } catch (e) { console.error(e); send(r, 500, 'text/plain', 'Server error'); } })
  .listen(PORT, () => console.log(`${NAME} on ${SITE} (${E.MOCK ? 'MOCK data' : 'live data'})`));
if (E.MOCK) mock();
else if (!E.FOOTBALL_DATA_TOKEN) console.error('Set FOOTBALL_DATA_TOKEN (or run with MOCK=1 to try the site with sample data).');
else poll();
