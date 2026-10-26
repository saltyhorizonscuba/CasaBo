// Generates /fr/ and /es/ pages from the English source pages.
//   node tools/build-i18n.js            build fr/ and es/
//   node tools/build-i18n.js --extract  list English strings with no translation yet
// Translations: tools/i18n/<page>.json (data-i18n keys), tools/i18n/strings.json
// (English text -> {fr, es}), tools/i18n/meta.json (title/description per page).
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://casabotamarindo.com';
const PAGES = ['index', 'the-space', 'services', 'location', 'book'];
const LANGS = ['es', 'fr'];
const LOCALE = { es: 'es_CR', fr: 'fr_FR' };
const INLINE = new Set(['em', 'strong', 'b', 'i', 'br', 'span', 'sup', 'small']);
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', f), 'utf8'));
const strings = read('strings.json');
const meta = read('meta.json');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const urlFor = (page, lang) =>
  lang === 'en'
    ? BASE + (page === 'index' ? '/' : '/' + page + '.html')
    : BASE + '/' + lang + '/' + (page === 'index' ? '' : page + '.html');
const hrefFor = (page, lang) => urlFor(page, lang).slice(BASE.length);

function candidates($) {
  const out = [];
  $('body *').each((_, el) => {
    if (['script', 'style', 'svg', 'noscript'].includes(el.name)) return;
    if ($(el).closest('svg,script,style').length) return;
    if (el.attribs && el.attribs['data-i18n']) return;
    if ($(el).closest('[data-i18n]').length) return;
    if ($(el).closest('.lang-switcher').length) return;
    const kids = $(el).children().toArray();
    if (kids.some((k) => !INLINE.has(k.name))) return;
    if ($(el).find('[data-i18n],span[class]').length) return;
    const html = norm($(el).html() || '');
    const plain = html.replace(/<[^>]*>/g, '').replace(/Casa\s*Bö|Bö/g, '');
    if (!/[A-Za-z]{3}/.test(plain)) return;
    out.push({ el, key: html });
  });
  const set = new Set(out.map((c) => c.el));
  return out.filter((c) => !$(c.el).parents().toArray().some((p) => set.has(p)));
}

function build(page, lang) {
  const dict = fs.existsSync(path.join(__dirname, 'i18n', page + '.json')) ? read(page + '.json') : null;
  const $ = cheerio.load(fs.readFileSync(path.join(ROOT, page + '.html'), 'utf8'));
  const missing = [];
  const tr = (key) => (strings[key] && strings[key][lang]) || null;

  // data-i18n keys
  $('[data-i18n]').each((_, el) => {
    const k = el.attribs['data-i18n'];
    const v = dict && dict[lang] && dict[lang][k];
    if (v === undefined) return missing.push('data-i18n:' + k);
    if (el.namespace && el.namespace.includes('svg')) $(el).text(v.toUpperCase());
    else $(el).html(v);
  });
  // stray text next to translated children, e.g. "The <em data-i18n=...>Kitchen</em>"
  $('*:has(> [data-i18n])').each((_, el) => {
    for (const n of el.children) {
      if (n.type !== 'text' || !/[A-Za-z]{2}/.test(n.data)) continue;
      const t = norm(n.data);
      const next = $(n).next()[0];
      const ctx = next && next.attribs && next.attribs['data-i18n'];
      const v = (ctx && tr(t + '|' + ctx)) || tr(t);
      if (!v) { missing.push('text:' + t); continue; }
      n.data = next ? v + (v.endsWith("'") ? '' : ' ') : ' ' + v;
    }
  });
  // plain text elements
  for (const { el, key } of candidates($)) {
    const v = tr(key);
    if (v) $(el).html(v);
    else missing.push(key);
  }
  // attributes
  $('*').each((_, el) => {
    for (const a of ATTRS) {
      const val = el.attribs && el.attribs[a];
      if (!val || !/[A-Za-z]{2}/.test(val)) continue;
      const v = tr(norm(val));
      if (v) $(el).attr(a, v.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&'));
      else if (a !== 'title' || !/^https?:/.test(val)) missing.push('@' + a + ':' + norm(val));
    }
  });
  // language switcher
  $('.lang-switcher a.lang-btn').each((_, el) => {
    const l = el.attribs.hreflang;
    $(el).attr('href', hrefFor(page, l)).toggleClass('active', l === lang);
  });
  // links between translated pages
  $('a[href]').each((_, el) => {
    const m = /^(index|the-space|services|location|book)\.html(#.*)?$/.exec(el.attribs.href);
    if (m) $(el).attr('href', hrefFor(m[1], lang) + (m[2] || ''));
    else if (/^blog\.html/.test(el.attribs.href)) $(el).attr('href', '/' + el.attribs.href);
  });
  // head
  const m = meta[page] && meta[page][lang];
  if (!m) missing.push('meta:' + page);
  else {
    $('title').text(m.title);
    $('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]').attr('content', m.description);
    $('meta[property="og:title"],meta[name="twitter:title"]').attr('content', m.title);
    $('meta[property="og:image:alt"],meta[name="twitter:image:alt"]').each((_, el) => {
      const v = tr(norm(el.attribs.content));
      if (v) $(el).attr('content', v);
    });
  }
  $('html').attr('lang', lang);
  $('link[rel="canonical"]').attr('href', urlFor(page, lang));
  $('meta[property="og:url"]').attr('content', urlFor(page, lang));
  $('meta[property="og:locale"]').attr('content', LOCALE[lang]);
  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    let j;
    try { j = JSON.parse($(el).contents().text()); } catch (e) { return; }
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (o['@type'] === 'VacationRental') { o.url = urlFor(page, lang); o.inLanguage = lang; }
      if (o['@type'] === 'WebSite') o.inLanguage = lang;
      if (o['@type'] === 'ListItem' && typeof o.item === 'string') {
        const mm = /casabotamarindo\.com\/?([\w-]*)(\.html)?$/.exec(o.item);
        if (mm) o.item = urlFor(mm[1] || 'index', lang);
      }
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string' && ['name', 'text', 'description'].includes(k) && tr(norm(o[k]))) o[k] = tr(norm(o[k]));
        else walk(o[k]);
      }
    };
    walk(j);
    $(el).text(JSON.stringify(j));
  });
  // inline script strings
  $('script:not([type="application/ld+json"])').each((_, el) => {
    let t = $(el).html();
    if (!t) return;
    for (const k of Object.keys(strings)) {
      if (k.startsWith('js:') && t.includes(k.slice(3))) t = t.split(k.slice(3)).join(strings[k][lang]);
    }
    $(el).html(t);
  });

  let html = $.html();
  // root-relative assets (pages live in a subfolder)
  html = html.replace(/(["'(])(assets\/)/g, '$1/$2');
  const out = path.join(ROOT, lang, page + '.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return missing;
}

if (process.argv.includes('--extract')) {
  const all = new Map();
  for (const page of PAGES) {
    const $ = cheerio.load(fs.readFileSync(path.join(ROOT, page + '.html'), 'utf8'));
    const add = (k) => { if (!strings[k]) all.set(k, true); };
    candidates($).forEach((c) => add(c.key));
    $('*').each((_, el) => ATTRS.forEach((a) => {
      const v = el.attribs && el.attribs[a];
      if (v && /[A-Za-z]{2}/.test(v) && !/^https?:/.test(v)) add(norm(v));
    }));
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        JSON.parse($(el).contents().text(), function (k, v) {
          if (['name', 'text', 'description'].includes(k) && typeof v === 'string') add(norm(v));
          return v;
        });
      } catch (e) {}
    });
  }
  const o = {};
  for (const k of all.keys()) o[k] = { fr: '', es: '' };
  fs.writeFileSync(path.join(__dirname, 'i18n', 'todo.json'), JSON.stringify(o, null, 1));
  console.log(all.size, 'strings to translate -> tools/i18n/todo.json');
} else {
  let bad = 0;
  for (const lang of LANGS) {
    for (const page of PAGES) {
      const miss = [...new Set(build(page, lang))];
      if (miss.length) { bad += miss.length; console.log(lang + '/' + page, 'missing:', miss.length, miss.slice(0, 5)); }
    }
  }
  console.log(bad ? bad + ' untranslated strings' : 'all translated');
}
