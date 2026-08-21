/**
 * Built-in Chinese display fonts (bundled CJK display fonts) - runtime.
 *
 * Runtime consumption method:
 * `new FontFace(family, url(<path>), { display:'swap', weight })` → document.fonts.
 * The binary is located in assets/fonts/<slug>/<file>.woff2 and the URL is /fonts/....
 *
 * Loading strategy: registerLocalFonts() only registers FontFace(unloaded) - browser and
 * @font-face has the same semantics. Woff2 will be pulled only when the family is actually used for typesetting, not at startup.
 * Full download; ensureLocalFont(family) is an explicit await version (resolved only after load is completed).
 * Headless rendering: render bundle overlay assets/, the same source /fonts path can also be loaded.
 */

/** Normalized matching key (case/whitespace/punctuation insensitive). */
export function normalizeFontKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s_\-\u00b7.,'"`]+/g, '');
}

export interface LocalCjkFont {
  /** CSS font-family canonical name (MG/caption fontFamily uses this). */
  family: string;
  /** importName, also serves as a searchable alias. */
  importName: string;
  /** Chinese alias. */
  aliasZh: string[];
  /** weight → same-origin URL (/fonts/… ← assets/fonts product static). */
  files?: Record<number, string>;
  /** Same-origin stylesheet for unicode-range variable-font shards. */
  stylesheet?: string;
  /** Inclusive CSS variable-font weight range. */
  weightRange?: readonly [number, number];
}

// License by style (all are public and free licensed fonts):
export const LOCAL_CJK_FONTS: readonly LocalCjkFont[] = [
  // Noto Sans SC v40 — SIL Open Font License 1.1. The Fontsource package
  // preserves Google Fonts' unicode-range variable WOFF2 shards, so existing
  // project weights from 100 through 900 stay offline without synthetic aliases.
  { family: 'Noto Sans SC', importName: 'NotoSansSC', aliasZh: ['Noto Sans CJK SC', '\u601d\u6e90\u9ed1\u4f53'], // aliasZh: "Source Han Sans" — Chinese font-alias lookup key
    stylesheet: '/fonts/noto-sans-sc/noto-sans-sc.css', weightRange: [100, 900] },
  // Deyihei — SIL Open Font License 1.1(github.com/atelier-anchor/smiley-sans, v2.0.1)
  { family: 'Smiley Sans', importName: 'SmileySans', aliasZh: ['\u5f97\u610f\u9ed1'], // aliasZh: "Deyihei" (Smiley Sans) — Chinese font-alias lookup key
    files: { 400: '/fonts/smiley-sans/SmileySans-Oblique.woff2' } },
  // Easy Handwriting 1 — Free for commercial use (Easy Handwriting Series; subject to the original publisher’s authorization page)
  { family: 'Qingsong Shouxie Ti Yi', importName: 'QingsongShouxieTiYi', aliasZh: ['\u8f7b\u677e\u624b\u5199\u4f53\u4e00', '\u8f7b\u677e\u624b\u5199\u4f53'], // aliasZh: "Qingsong Handwriting One", "Qingsong Handwriting"
    files: { 400: '/fonts/qingsong-shouxieti-yi/QingsongShouxietiYi-Regular.woff2' } },
  // Easy handwriting three - free for commercial use (same as the above series; subject to the original publisher’s authorization page)
  { family: 'Qingsong Shouxie Ti San P', importName: 'QingsongShouxieTiSanP', aliasZh: ['\u8f7b\u677e\u624b\u5199\u4f53\u4e09', '\u8f7b\u677e\u624b\u5199\u4f53'], // aliasZh: "Qingsong Handwriting Three", "Qingsong Handwriting"
    files: { 400: '/fonts/qingsong-shouxieti-san-p/QingsongShouxietiSanP-Regular.woff2' } },
  // Pangmen Zhengdao title style — Pangmen Zhengdao free commercial license
  { family: 'Pangmen Zhengdao Biaoti Ti', importName: 'PangmenZhengdaoBiaotiTi', aliasZh: ['\u5e9e\u95e8\u6b63\u9053\u6807\u9898\u4f53', '\u5e9e\u95e8\u6b63\u9053'], // aliasZh: "Pangmen Zhengdao Title", "Pangmen Zhengdao"
    files: { 400: '/fonts/pangmen-zhengdao-biaotiti/PangmenZhengdaoBiaotiti-Regular.woff2' } },
  // Pangmen Zhengdao Relaxation Body - Pangmen Zhengdao free commercial license
  { family: 'Pangmen Zhengdao Qingsong Ti', importName: 'PangmenZhengdaoQingsongTi', aliasZh: ['\u5e9e\u95e8\u6b63\u9053\u8f7b\u677e\u4f53'], // aliasZh: "Pangmen Zhengdao Qingsong"
    files: { 400: '/fonts/pangmen-zhengdao-qingsongti/PangmenZhengdaoQingsongti-Regular.woff2' } },
  // Hu Xiaobo Male God Body — Hu Xiaobo font free commercial license
  { family: 'Huxiaobo Nanshen Ti', importName: 'HuxiaoboNanshenTi', aliasZh: ['\u80e1\u6653\u6ce2\u7537\u795e\u4f53'], // aliasZh: "Huxiaobo Nanshen"
    files: { 400: '/fonts/huxiaobo-nanshenti/HuxiaoboNanshenti-Regular.woff2' } },
  // Hu Xiaobo's Sao Bao Body - Hu Xiaobo Font Free Commercial License
  { family: 'Huxiaobo Saobao Ti', importName: 'HuxiaoboSaobaoTi', aliasZh: ['\u80e1\u6653\u6ce2\u9a9a\u5305\u4f53'], // aliasZh: "Huxiaobo Saobao"
    files: { 400: '/fonts/huxiaobo-saobaoti/HuxiaoboSaobaoti-Regular.woff2' } },
  // Hu Xiaobo is really handsome — Hu Xiaobo font is licensed for free commercial use
  { family: 'Huxiaobo Zhenshuai Ti', importName: 'HuxiaoboZhenshuaiTi', aliasZh: ['\u80e1\u6653\u6ce2\u771f\u5e05\u4f53'], // aliasZh: "Huxiaobo Zhenshuai"
    files: { 400: '/fonts/huxiaobo-zhenshuaiti/HuxiaoboZhenshuaiti-Regular.woff2' } },
  // Douyin Beauty — Douyin Beauty Authorization (ByteDance, free for commercial use); charge 400+700 for the same Bold file
  { family: 'Douyin Meihao Ti', importName: 'DouyinMeihaoTi', aliasZh: ['\u6296\u97f3\u7f8e\u597d\u4f53'], // aliasZh: "Douyin Meihao"
    files: { 400: '/fonts/douyin-meihaoti/DouyinMeihaoti-Bold.woff2',
             700: '/fonts/douyin-meihaoti/DouyinMeihaoti-Bold.woff2' } },
];

/** family / importName / Chinese alias → entry (normalized matching). */
export function findLocalFont(name: string): LocalCjkFont | undefined {
  const key = normalizeFontKey(name);
  if (!key) return undefined;
  return LOCAL_CJK_FONTS.find(
    (f) =>
      normalizeFontKey(f.family) === key ||
      normalizeFontKey(f.importName) === key ||
      f.aliasZh.some((a) => normalizeFontKey(a) === key),
  );
}

const hasDom = (): boolean => typeof FontFace !== 'undefined' && typeof document !== 'undefined';

// family → FontFace instance registered in document.fonts (single instance, preventing repeated registration).
const registeredFaces = new Map<string, FontFace[]>();

function facesOf(font: LocalCjkFont): FontFace[] {
  let faces = registeredFaces.get(font.family);
  if (!faces) {
    faces = Object.entries(font.files ?? {}).map(
      ([weight, url]) =>
        new FontFace(font.family, `url(${url}) format('woff2')`, {
          weight,
          style: 'normal',
          display: 'swap',
        }),
    );
    for (const face of faces) document.fonts.add(face);
    registeredFaces.set(font.family, faces);
  }
  return faces;
}

const stylesheetPromises = new Map<string, Promise<void>>();

function registerStylesheet(font: LocalCjkFont): Promise<void> {
  if (!font.stylesheet) return Promise.resolve();
  const cached = stylesheetPromises.get(font.family);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = font.stylesheet!;
    link.dataset.localFontFamily = font.family;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => {
      link.remove();
      reject(new Error(`font stylesheet failed: ${font.family}`));
    }, { once: true });
    document.head.append(link);
  });
  stylesheetPromises.set(font.family, promise);
  void promise.catch(() => { stylesheetPromises.delete(font.family); });
  return promise;
}

async function loadFaces(font: LocalCjkFont): Promise<void> {
  if (!font.stylesheet) {
    await Promise.all(facesOf(font).map((face) => face.load()));
    return;
  }
  await registerStylesheet(font);
  const faces: FontFace[] = [];
  document.fonts.forEach((face) => {
    if (face.family === font.family) faces.push(face);
  });
  if (faces.length === 0) throw new Error(`font stylesheet registered no faces: ${font.family}`);
  await Promise.all(faces.map((face) => face.load()));
}

/**
 * Register all local fonts (unloaded FontFace, the browser pulls bytes on demand). Idempotent.
 * Called by googleFonts.loadProjectFonts() → The preview and headless rendering take effect in the same path.
 */
export function registerLocalFonts(): void {
  if (!hasDom()) return;
  for (const font of LOCAL_CJK_FONTS) {
    if (font.stylesheet) void registerStylesheet(font).catch(() => undefined);
    else facesOf(font);
  }
}

// family → Explicit loading in progress/completed (Promise cache, idempotent).
const loadPromises = new Map<string, Promise<void>>();

/**
 * Explicitly load a local font (accept family/importName/Chinese alias).
 * Resolve after loading all weights; non-local fonts or no DOM environment resolve directly.
 * Failures are removed from the cache for retry and thrown to the caller.
 */
export function ensureLocalFont(family: string): Promise<void> {
  const font = findLocalFont(family);
  if (!font) return Promise.resolve();
  const cached = loadPromises.get(font.family);
  if (cached) return cached;
  const promise = hasDom()
    ? loadFaces(font).catch((err: unknown) => {
        loadPromises.delete(font.family);
        throw err instanceof Error ? err : new Error(`font load failed: ${font.family}`);
      })
    : Promise.resolve();
  loadPromises.set(font.family, promise);
  return promise;
}
