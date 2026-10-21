/** 把 vite 产物内联成一个自包含的 index.html，供安卓 WebView 以 file:// 加载 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist-mobile');
const OUT = join(ROOT, 'android', 'app', 'assets', 'www', 'index.html');

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

/* ---------- 1. CSS 内联 ---------- */
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, (tag) => {
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  if (!href) return tag;
  const css = readFileSync(join(DIST, href.replace(/^\.?\//, '')), 'utf8');
  return `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`;
});

/* ---------- 2. JS 内联：先从 head 里摘出来，稍后插到 </body> 前 ----------
 * 关键：vite 把脚本放在 <head> 且带 type="module"（模块脚本天然 defer）。
 * 内联成普通 <script> 后会变成同步阻塞执行，此时 <div id="root"> 尚未解析，
 * React 会抛 #299（目标容器不是 DOM 元素）并整页白屏。
 * 因此必须把内联脚本移到 body 末尾。
 */
const scripts = [];
html = html.replace(/<script[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi, (_tag, src) => {
  const js = readFileSync(join(DIST, String(src).replace(/^\.?\//, '')), 'utf8');
  scripts.push(js);
  return '';
});

// 顺带清掉 modulepreload（单文件下无意义，且 file:// 下会 404 打日志）
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/gi, '');

/* ---------- 3. 启动失败可见化 ----------
 * 任何未捕获异常 / Promise 拒绝 / 5 秒后 #root 仍为空，都直接在页面画出提示，
 * 免得用户只看到白屏（安卓 WebView 没有控制台可看）。
 */
const guard = `<script>
(function () {
  var shown = false;
  function panel(title, detail) {
    if (shown) return;
    shown = true;
    try {
      var d = document.createElement('div');
      d.setAttribute('style', 'position:fixed;inset:0;z-index:999999;background:#fff;color:#3c3c3c;' +
        'font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px 18px;overflow:auto;' +
        '-webkit-user-select:text;user-select:text');
      d.innerHTML = '<div style="font-size:17px;font-weight:800;margin-bottom:10px">启动失败了</div>' +
        '<div style="color:#b3261e;font-weight:700;margin-bottom:12px">' + title + '</div>' +
        '<pre style="white-space:pre-wrap;word-break:break-all;background:#f6f7f9;border-radius:10px;padding:10px;font-size:11px;color:#555">' +
        String(detail || '').replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) +
        '</pre><div style="margin-top:12px;font-size:11px;color:#8a8f98">设备：' +
        (navigator.userAgent || '-') + '</div>';
      (document.body || document.documentElement).appendChild(d);
    } catch (e) {}
  }
  window.__xqFail = panel;
  window.addEventListener('error', function (e) {
    panel('脚本错误',
      (e && e.message ? e.message : '未知错误') + '\\n' +
      (e && e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : '') + '\\n' +
      (e && e.error && e.error.stack ? e.error.stack : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    panel('未处理的 Promise 拒绝', (r && (r.stack || r.message)) || String(r));
  });
  window.addEventListener('load', function () {
    setTimeout(function () {
      var root = document.getElementById('root');
      if (root && root.childElementCount === 0 && !shown) {
        panel('界面没有渲染出来', '页面加载完成 5 秒后 #root 仍然是空的。\\n可能是脚本语法不受当前 WebView 支持。');
      }
    }, 5000);
  });
})();
<\/script>`;

/* 注意：替换值必须用函数返回，不能直接传字符串。
 * String.replace 会把替换串里的 $& / $' / $` / $$ 当成特殊模式，
 * 而打包后的 JS 里确实存在 `$&&g[$]` 这种写法 —— 直接传串会把 $& 展开成 "</body>"，
 * 内联后就成了 `g=</body>&g[$]`，WebView 直接语法错误白屏。 */
html = html.replace(/<head>/i, () => `<head>\n${guard}`);

/* ---------- 4. 内联脚本挂到 body 末尾 ---------- */
const tag = scripts
  .map((js) => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .join('\n');

if (html.includes('</body>')) {
  html = html.replace(/<\/body>/i, () => `${tag}\n</body>`);
} else {
  html += tag;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');

/* ---------- 5. 语音包：把 dist-mobile/voice 原样搬到 assets（音频没法内联） ---------- */
const VOICE_SRC = join(DIST, 'voice');
const VOICE_DST = join(ROOT, 'android', 'app', 'assets', 'www', 'voice');
let voiceCount = 0;
let voiceBytes = 0;
if (existsSync(VOICE_SRC)) {
  const clips = readdirSync(VOICE_SRC).filter((f) => /\.(mp3|ogg|m4a|wav)$/i.test(f));
  const keep = new Set(clips);
  mkdirSync(VOICE_DST, { recursive: true });
  // 清掉过期音频：逐个 unlink（整目录 rm 会被安全删除钩子拦下）
  for (const f of existsSync(VOICE_DST) ? readdirSync(VOICE_DST) : []) {
    if (keep.has(f)) continue;
    try {
      unlinkSync(join(VOICE_DST, f));
    } catch {
      /* 只读文件等情况，忽略 */
    }
  }
  for (const f of clips) {
    copyFileSync(join(VOICE_SRC, f), join(VOICE_DST, f));
    voiceCount += 1;
    voiceBytes += statSync(join(VOICE_DST, f)).size;
  }
}

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(
  `inlined -> android/app/assets/www/index.html (${kb} KB, ${scripts.length} script)\n` +
    `voice   -> ${voiceCount} clips (${(voiceBytes / 1024).toFixed(0)} KB)`,
);
