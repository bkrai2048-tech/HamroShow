#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const NNRV_BASE_URL = "https://raw.githubusercontent.com/iyamsamrat/nnrv_bible/main";
const KJV_JSON_URL = "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json";
const NCS_BASE_URL = "https://www.nepalichristiansongs.com";

const DEFAULT_OUTPUT_DIR = path.resolve("dist", "nepali-church-pack");

const BOOKS = [
  { slug: "GEN", en: "Genesis", ne: "उत्पत्ति" },
  { slug: "EXO", en: "Exodus", ne: "प्रस्थान" },
  { slug: "LEV", en: "Leviticus", ne: "लेवी" },
  { slug: "NUM", en: "Numbers", ne: "गन्ती" },
  { slug: "DEU", en: "Deuteronomy", ne: "व्यवस्था" },
  { slug: "JOS", en: "Joshua", ne: "यहोशू" },
  { slug: "JDG", en: "Judges", ne: "न्यायकर्ता" },
  { slug: "RUT", en: "Ruth", ne: "रूथ" },
  { slug: "1SA", en: "1 Samuel", ne: "1 शमूएल" },
  { slug: "2SA", en: "2 Samuel", ne: "2 शमूएल" },
  { slug: "1KI", en: "1 Kings", ne: "1 राजा" },
  { slug: "2KI", en: "2 Kings", ne: "2 राजा" },
  { slug: "1CH", en: "1 Chronicles", ne: "1 इतिहास" },
  { slug: "2CH", en: "2 Chronicles", ne: "2 इतिहास" },
  { slug: "EZR", en: "Ezra", ne: "एज्रा" },
  { slug: "NEH", en: "Nehemiah", ne: "नहेम्याह" },
  { slug: "EST", en: "Esther", ne: "एस्तर" },
  { slug: "JOB", en: "Job", ne: "अय्यूब" },
  { slug: "PSA", en: "Psalms", ne: "भजनसंग्रह" },
  { slug: "PRO", en: "Proverbs", ne: "हितोपदेश" },
  { slug: "ECC", en: "Ecclesiastes", ne: "उपदेशक" },
  { slug: "SNG", en: "Song of Songs", ne: "श्रेष्ठगीत" },
  { slug: "ISA", en: "Isaiah", ne: "यशैया" },
  { slug: "JER", en: "Jeremiah", ne: "यर्मिया" },
  { slug: "LAM", en: "Lamentations", ne: "विलाप" },
  { slug: "EZK", en: "Ezekiel", ne: "इजकिएल" },
  { slug: "DAN", en: "Daniel", ne: "दानिएल" },
  { slug: "HOS", en: "Hosea", ne: "होशे" },
  { slug: "JOL", en: "Joel", ne: "योएल" },
  { slug: "AMO", en: "Amos", ne: "आमोस" },
  { slug: "OBA", en: "Obadiah", ne: "ओबदिया" },
  { slug: "JON", en: "Jonah", ne: "योना" },
  { slug: "MIC", en: "Micah", ne: "मीका" },
  { slug: "NAM", en: "Nahum", ne: "नहूम" },
  { slug: "HAB", en: "Habakkuk", ne: "हबकूक" },
  { slug: "ZEP", en: "Zephaniah", ne: "सपन्याह" },
  { slug: "HAG", en: "Haggai", ne: "हाग्गै" },
  { slug: "ZEC", en: "Zechariah", ne: "जकरिया" },
  { slug: "MAL", en: "Malachi", ne: "मलाकी" },
  { slug: "MAT", en: "Matthew", ne: "मत्ती" },
  { slug: "MRK", en: "Mark", ne: "मर्कूस" },
  { slug: "LUK", en: "Luke", ne: "लूका" },
  { slug: "JHN", en: "John", ne: "यूहन्ना" },
  { slug: "ACT", en: "Acts", ne: "प्रेरित" },
  { slug: "ROM", en: "Romans", ne: "रोमी" },
  { slug: "1CO", en: "1 Corinthians", ne: "1 कोरिन्थी" },
  { slug: "2CO", en: "2 Corinthians", ne: "2 कोरिन्थी" },
  { slug: "GAL", en: "Galatians", ne: "गलाती" },
  { slug: "EPH", en: "Ephesians", ne: "एफिसी" },
  { slug: "PHP", en: "Philippians", ne: "फिलिप्पी" },
  { slug: "COL", en: "Colossians", ne: "कलस्सी" },
  { slug: "1TH", en: "1 Thessalonians", ne: "1 थेसलोनिकी" },
  { slug: "2TH", en: "2 Thessalonians", ne: "2 थेसलोनिकी" },
  { slug: "1TI", en: "1 Timothy", ne: "1 तिमोथी" },
  { slug: "2TI", en: "2 Timothy", ne: "2 तिमोथी" },
  { slug: "TIT", en: "Titus", ne: "तीतस" },
  { slug: "PHM", en: "Philemon", ne: "फिलेमोन" },
  { slug: "HEB", en: "Hebrews", ne: "हिब्रू" },
  { slug: "JAS", en: "James", ne: "याकूब" },
  { slug: "1PE", en: "1 Peter", ne: "1 पत्रुस" },
  { slug: "2PE", en: "2 Peter", ne: "2 पत्रुस" },
  { slug: "1JN", en: "1 John", ne: "1 यूहन्ना" },
  { slug: "2JN", en: "2 John", ne: "2 यूहन्ना" },
  { slug: "3JN", en: "3 John", ne: "3 यूहन्ना" },
  { slug: "JUD", en: "Jude", ne: "यहूदा" },
  { slug: "REV", en: "Revelation", ne: "प्रकाश" }
];

const NCS_LETTERS = [
  "a", "aa", "i", "ii", "u", "uu", "R_", "e", "ai", "o", "au",
  "k", "kh", "g", "gh", "Ng",
  "ch", "chh", "j", "jh", "Nj",
  "T_", "T_h", "D_", "D_h", "N_",
  "t", "th", "d", "dh", "n",
  "p", "ph", "b", "bh", "m",
  "y", "r", "l", "w",
  "sh", "S_h", "s", "h",
  "kSh", "tr", "Gy"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "setup";

  if (!["build", "install", "setup"].includes(command)) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve(args.outDir || DEFAULT_OUTPUT_DIR);
  const dataRoot = path.resolve(args.dataRoot || defaultHamroShowDataRoot());

  if (command === "build" || command === "setup") {
    const result = await buildPack({ outDir, letters: getLetters(args.letters) });
    console.log(`[build] bibles: ${result.bibleCount}, hymns: ${result.hymnCount}`);
    console.log(`[build] output: ${outDir}`);
  }

  if (command === "install" || command === "setup") {
    const result = await installPack({ outDir, dataRoot, includeShows: !args["skip-shows"] });
    console.log(`[install] data root: ${dataRoot}`);
    console.log(`[install] bibles copied: ${result.bibles}`);
    console.log(`[install] shows copied: ${result.shows}`);
    console.log(`[install] scriptures updated: ${result.scriptures}`);
  }
}

function printHelp() {
  console.log(`Nepali Church Pack for HamroShow

Usage:
  node scripts/nepal-pack.mjs build [--outDir dist/nepali-church-pack] [--letters all|a,aa,...]
  node scripts/nepal-pack.mjs install [--outDir dist/nepali-church-pack] [--dataRoot <HamroShow data root>] [--skip-shows]
  node scripts/nepal-pack.mjs setup [--outDir dist/nepali-church-pack] [--dataRoot <HamroShow data root>] [--letters all|a,aa,...]
`);
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }

    const keyValue = token.slice(2).split("=");
    const key = keyValue[0];
    if (keyValue.length > 1) {
      out[key] = keyValue.slice(1).join("=");
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }

  return out;
}

function getLetters(input) {
  if (!input || input === "all") return [...NCS_LETTERS];
  const list = String(input)
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  return list.length ? list : [...NCS_LETTERS];
}

function defaultHamroShowDataRoot() {
  const home = os.homedir();
  return path.join(home, "Documents", "HamroShow");
}

async function buildPack({ outDir, letters }) {
  const biblesDir = path.join(outDir, "Bibles");
  const showsDir = path.join(outDir, "Shows");
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(biblesDir, { recursive: true });
  await fs.mkdir(showsDir, { recursive: true });

  const nepaliBible = await buildNnrvBible();
  const kjvBible = await buildKjvBible();

  await fs.writeFile(path.join(biblesDir, "NNRV Nepali.fsb"), JSON.stringify(["ne_np_nnrv", nepaliBible]));
  await fs.writeFile(path.join(biblesDir, "KJV English.fsb"), JSON.stringify(["en_kjv", kjvBible]));

  const hymns = await buildNcsHymns(letters);

  let writtenShows = 0;
  for (const hymn of hymns) {
    const id = hymn.id;
    const show = toHamroShowSong(hymn);
    const fileName = `${safeFileName(hymn.title)}__${hymn.sourceId}.show`;
    await fs.writeFile(path.join(showsDir, fileName), JSON.stringify([id, show]));
    writtenShows += 1;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    bibleFiles: ["NNRV Nepali.fsb", "KJV English.fsb"],
    hymnCount: writtenShows,
    letters
  };

  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await fs.writeFile(
    path.join(outDir, "README_IMPORT.txt"),
    [
      "HamroShow Nepali Church Pack",
      "",
      "1) Close HamroShow before install.",
      "2) Run: node scripts/nepal-pack.mjs install",
      "3) Start HamroShow again.",
      "",
      "Pack contents:",
      "- Bibles: NNRV Nepali + KJV English (.fsb)",
      "- Shows: Nepali hymns from nepalichristiansongs.com (.show)"
    ].join("\n")
  );

  return { bibleCount: 2, hymnCount: writtenShows };
}

async function installPack({ outDir, dataRoot, includeShows }) {
  const sourceBibles = path.join(outDir, "Bibles");
  const sourceShows = path.join(outDir, "Shows");

  const targetBibles = path.join(dataRoot, "Bibles");
  const targetShows = path.join(dataRoot, "Shows");
  const configDir = path.join(dataRoot, "Config");

  await fs.mkdir(targetBibles, { recursive: true });
  await fs.mkdir(targetShows, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });

  const bibleFiles = await safeReadDir(sourceBibles);
  let copiedBibles = 0;
  for (const name of bibleFiles.filter((a) => a.toLowerCase().endsWith(".fsb"))) {
    await fs.copyFile(path.join(sourceBibles, name), path.join(targetBibles, name));
    copiedBibles += 1;
  }

  let copiedShows = 0;
  if (includeShows) {
    const showFiles = await safeReadDir(sourceShows);
    for (const name of showFiles.filter((a) => a.toLowerCase().endsWith(".show"))) {
      await fs.copyFile(path.join(sourceShows, name), path.join(targetShows, name));
      copiedShows += 1;
    }
  }

  const scriptureCount = await upsertScriptures(path.join(configDir, "settings_synced.json"));

  return { bibles: copiedBibles, shows: copiedShows, scriptures: scriptureCount };
}

async function upsertScriptures(settingsPath) {
  let settings = {};
  try {
    settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  } catch {
    settings = {};
  }

  if (!settings.scriptures || typeof settings.scriptures !== "object") settings.scriptures = {};

  settings.scriptures.ne_np_nnrv = { id: "ne_np_nnrv", name: "NNRV Nepali" };
  settings.scriptures.en_kjv = { id: "en_kjv", name: "KJV English" };

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  return Object.keys(settings.scriptures).length;
}

async function buildNnrvBible() {
  const books = [];

  for (let i = 0; i < BOOKS.length; i++) {
    const bookMeta = BOOKS[i];
    const url = `${NNRV_BASE_URL}/${bookMeta.slug}.json`;
    const payload = await fetchJson(url);
    const chapters = [];

    for (const chapterRaw of payload.chapters || []) {
      const chapterNumber = Number(chapterRaw?.id ?? 0);
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) continue;

      const verses = [];
      for (let vi = 0; vi < (chapterRaw.verses || []).length; vi++) {
        const verseRaw = chapterRaw.verses[vi] || {};
        const verseNumber = Number(verseRaw.id ?? vi + 1);
        const text = normalizeWhitespace(String(verseRaw.text || ""));
        if (!text) continue;
        verses.push({ number: verseNumber > 0 ? verseNumber : vi + 1, text });
      }

      if (verses.length) chapters.push({ number: chapterNumber, verses });
    }

    books.push({
      number: i + 1,
      name: bookMeta.ne,
      abbreviation: bookMeta.slug,
      chapters
    });
  }

  return {
    name: "NNRV Nepali",
    metadata: {
      language: "ne",
      translation: "NNRV",
      source: "iyamsamrat/nnrv_bible"
    },
    books
  };
}

async function buildKjvBible() {
  const payload = await fetchJson(KJV_JSON_URL);
  if (!Array.isArray(payload) || payload.length < 66) {
    throw new Error("Unexpected KJV JSON payload shape");
  }

  const books = payload.slice(0, 66).map((book, bookIndex) => {
    const chapters = (book.chapters || []).map((chapter, chapterIndex) => ({
      number: chapterIndex + 1,
      verses: (chapter || [])
        .map((verseText, verseIndex) => ({
          number: verseIndex + 1,
          text: normalizeWhitespace(String(verseText || ""))
        }))
        .filter((verse) => Boolean(verse.text))
    }));

    return {
      number: bookIndex + 1,
      name: BOOKS[bookIndex]?.en || String(book.name || `Book ${bookIndex + 1}`),
      abbreviation: String(book.abbrev || "").toUpperCase() || BOOKS[bookIndex]?.slug,
      chapters
    };
  });

  return {
    name: "KJV English",
    metadata: {
      language: "en",
      translation: "KJV",
      source: "thiagobodruk/bible"
    },
    books
  };
}

async function buildNcsHymns(letters) {
  const hymns = [];
  for (const letter of letters) {
    const url = `${NCS_BASE_URL}/${letter}.php`;
    const html = await fetchText(url);
    hymns.push(...parseNcsPage(html, letter));
  }

  // Deduplicate by canonical source id.
  const unique = new Map();
  for (const hymn of hymns) {
    if (!unique.has(hymn.id)) unique.set(hymn.id, hymn);
  }

  return Array.from(unique.values());
}

function parseNcsPage(html, letter) {
  const meta = new Map();
  const list = [];

  const linkRegex = /<a[^>]*class="(nepali|hindi)"[^>]*onclick="ddToggle\((?:\\?')song(\d+)(?:\\?')\)">([\s\S]*?)<\/a>\s*<span class="songDetails">(\[[^\]]*\])?<\/span>/giu;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const lang = String(match[1] || "").toLowerCase();
    const id = String(match[2] || "");
    const title = normalizeWhitespace(decodeHtml(stripTags(match[3] || "")));
    const details = normalizeWhitespace(String(match[4] || "").replace(/^\[/, "").replace(/\]$/, ""));
    meta.set(id, { lang, title, details });
  }

  const lyricsRegex = /<dd[^>]*id="song(\d+)"[^>]*>\s*<pre>([\s\S]*?)<\/pre>(?:\s*<span class=['"]authors['"]>(\[[^\]]*\])<\/span>)?\s*<\/dd>/giu;
  while ((match = lyricsRegex.exec(html)) !== null) {
    const songId = String(match[1] || "");
    const info = meta.get(songId);
    if (!info || info.lang === "hindi") continue;

    const title = normalizeWhitespace(info.title || "");
    const lyrics = normalizeLyrics(decodeHtml(stripTags(match[2] || "")));
    const authors = normalizeWhitespace(String(match[3] || "").replace(/^\[/, "").replace(/\]$/, ""));

    if (!title || !lyrics) continue;
    if (!/\p{Script=Devanagari}/u.test(title) && !/\p{Script=Devanagari}/u.test(lyrics)) continue;

    list.push({
      id: `ncs_song_${songId}`,
      sourceId: `song${songId}`,
      sourceLetter: letter,
      title,
      lyrics,
      details: info.details || "",
      authors
    });
  }

  return list;
}

function toHamroShowSong(hymn) {
  const now = Date.now();
  const layoutId = shortId(`layout:${hymn.id}`);

  const stanzas = splitStanzas(hymn.lyrics);
  const slides = {};
  const layoutSlides = [];

  for (let i = 0; i < stanzas.length; i++) {
    const lines = stanzas[i]
      .split("\n")
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
      .map((line) => ({ align: "", text: [{ style: "", value: line }], chords: [] }));

    if (!lines.length) continue;

    const slideId = shortId(`${hymn.id}:slide:${i + 1}`);
    slides[slideId] = {
      group: `V${i + 1}`,
      color: null,
      settings: {},
      notes: "",
      items: [
        {
          style: "default",
          align: "",
          textFit: "shrinkToFit",
          lines
        }
      ]
    };
    layoutSlides.push({ id: slideId });
  }

  // Fallback to one empty slide when parsing produced no stanza blocks.
  if (!layoutSlides.length) {
    const slideId = shortId(`${hymn.id}:slide:1`);
    slides[slideId] = {
      group: "V1",
      color: null,
      settings: {},
      notes: "",
      items: [
        {
          style: "default",
          align: "",
          textFit: "shrinkToFit",
          lines: [{ align: "", text: [{ style: "", value: hymn.title }], chords: [] }]
        }
      ]
    };
    layoutSlides.push({ id: slideId });
  }

  const notes = [
    `source: ${NCS_BASE_URL}`,
    `source_id: ${hymn.sourceId}`,
    hymn.sourceLetter ? `letter: ${hymn.sourceLetter}` : "",
    hymn.details ? `details: ${hymn.details}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  return {
    name: hymn.title,
    origin: "ncs_nepal",
    category: null,
    quickAccess: { number: hymn.sourceId.replace(/^song/i, "") },
    settings: { activeLayout: layoutId, template: null },
    timestamps: { created: now, modified: now, used: null },
    meta: {
      title: hymn.title,
      author: hymn.authors || "",
      copyright: "Nepali Christian Songs (NCS)"
    },
    slides,
    layouts: {
      [layoutId]: {
        name: "Default",
        notes,
        slides: layoutSlides
      }
    },
    media: {}
  };
}

function splitStanzas(lyrics) {
  const blocks = String(lyrics || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.length ? blocks : [String(lyrics || "").trim()];
}

function normalizeLyrics(input) {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeWhitespace(input) {
  return String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function stripTags(input) {
  return String(input || "").replace(/<[^>]*>/g, "");
}

function decodeHtml(input) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return String(input || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
    const key = String(entity || "");
    if (key.startsWith("#x") || key.startsWith("#X")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    return named[key] ?? _;
  });
}

function shortId(seed) {
  return crypto.createHash("sha1").update(String(seed)).digest("hex").slice(0, 12);
}

function safeFileName(value) {
  return String(value || "")
    .replace(/[<>:\"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "untitled";
}

async function safeReadDir(dirPath) {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JSON: ${url} (${res.status})`);
  }
  return await res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch text: ${url} (${res.status})`);
  }
  return await res.text();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
