# 象棋学堂 · XiangQi Academy

像多邻国一样学中国象棋：章节式关卡、与奥斯卡对战、体力与宝石经济、等级成就，还有一位嘴很干的教练——**奥斯卡**（一块被削成「帅」的老木头）。

- 网页版：`npm run dev` → http://127.0.0.1:5288
- 安卓版：`dist-apk/xiangqi-academy-v1.3.0.apk`（已签名，可直接安装）

---

## 一、功能

### 1. 章节教学
5 个单元 · 20 节课 · 80 个步骤：认识棋子（车/马/炮/兵/相/仕）→ 子力与吃子 → 将军与应将 → 五大基本杀法（双车错、马后炮、重炮、闪将、马将）→ 开局原则。

四种题型全部在棋盘上作答：走子练习、吃子练习、实战题（引擎判定「是否真的将军 / 将死」）、概念选择题。答错可重试，连错两次自动给提示，结算按失误数给 1–3 星。

### 2. 游戏化系统（多邻国式）
| 系统 | 规则 |
| --- | --- |
| ❤️ 体力 | 上限 5 点；答错一题 -1，输一局 -1；每 18 分钟自然恢复 1 点；60 💎 补满 |
| 💎 宝石 | 课程结算 10（完美 +10，首次 +15）、任务 15–30、宝箱 35、成就 20–120、胜局 25 |
| ⚡ 经验 / 等级 | 每级所需经验递增，Lv.1 棋童 → Lv.25 棋圣；升级额外 +30 💎 |
| 🎯 每日任务 | 每天 3 条（上课 / 答对 / 赢棋），按日期种子生成，可领宝石 |
| 🏅 成就 | 9 个成就，达成即自动发放并庆祝 |
| 🎁 每日宝箱 | 每天一次，体力见底时额外多给 |
| 🔥 连续打卡 | 记录连续学习天数，火苗状态会改变奥斯卡的表情 |

### 3. 奥斯卡（吉祥物 + 语音）
- 纯 SVG 绘制的「帅」棋子：单片眼镜、八字胡、五种表情（idle / happy / sad / smug / think）。
- 台词库约 80 句，按场景抽取：问候（分早/中/晚/深夜）、答对、答错、完美通关、体力耗尽、升级、成就、胜/负/和、吃子、将军、提醒。
- 语音是**随包分发的音频**（104 句、约 1.9 MB，edge-tts 合成后打进 APK/assets），不依赖手机有没有中文 TTS 引擎，也不联网；只有少数动态句子（含数字/称号）才会退回系统 `TextToSpeech` / Web Speech。可在「我的 → 奥斯卡语音」开关，并支持试听。
- **对局反馈**：每一步落子都有木质落子音效（吃子更沉）；**走子有 320ms 滑动动画**，落点会短暂高亮，不用靠猜知道它走了哪；
  吃子时落点炸开一圈红环；**将军、吃子会震动**（将军是双击，吃子是单记，普通落子刻意不震）。
- **对手就是奥斯卡**：对战页标题、头像、进度文案都换成奥斯卡本人，难度仍是入门 / 进阶 / 高手三档。
- **悔棋有价**：对战页的「悔棋」按钮**默认不显示**，要在「我的 → 设置 → 对局显示悔棋」里打开；每次悔棋消耗 1 点 ❤️ 体力，体力为 0 时不能悔。
- **对战实时插话**：开局招呼、走子违规（「这个子走不到那儿」）、你将军它（「将军，别高兴太早」）、它将军你（「将军，听见了没有」）、
  你吃它的子（按兵种吐槽，如「我的马，你居然吃我的马」）、它吃你的子（「这个我收下了」）、它走了软手（「我让了你一手，别谢我」）。
  插话有 4 秒节流，避免变成单口相声。
- 关键操作带震动反馈。

### 4. 每日提醒
「我的 → 每日提醒」可开关并选择时间（8/12/18/19/20/21/22 点）。安卓端用 `AlarmManager` 每日重复闹钟 + 通知渠道推送，文案每次启动重新抽一句；重启后由 `BOOT_COMPLETED` 广播重新挂上。

### 5. 对局复盘
一局结束后点「🔍 复盘本局」：逐手用引擎评估（深度 2），把每一手标成 **好棋 / 正着 / 稍亏 / 失误 / 漏着**，给出准确度、各类着法计数、最可惜的一手，可一键跳到那一步。还会反查本局用的是哪条开局，并由奥斯卡给一句总结。

### 6. 开局库
6 条常见开局（中炮对屏风马、顺手炮、列手炮、仙人指路、飞相局、起马局），逐手演示 + 思路/要点讲解。
- 全部 33 手都经引擎校验：合法、中文记谱与引擎一致。
- 与奥斯卡对战时 AI 有 80% 概率从开局库出招，所以每局前半段不会千篇一律。

---

## 二、技术栈与结构

Vite 6 + React 19 + TypeScript，**无 UI 库、无图片资源**（棋盘与棋子全是 SVG，音效由 WebAudio 合成）。生产包约 350 KB JS + 29 KB CSS。

```
src/
  game/        types / board / rules / notation / ai / ai.worker / review
  content/     curriculum（20 课） / openings（开局库） / oscar（台词）
  state/       progress（经济与进度） / game（hook 封装） / engine（Worker 调度）
               native（原生桥） / celebrate（庆祝事件） / sound
  components/  Board / Oscar / TopBar / Sheet / CelebrationHost
  views/       Home / LessonView / Play / ReviewView / Openings / Profile
android/       原生 WebView 壳（Java），无 Gradle
scripts/       校验、图标生成、单文件内联、APK 构建
```

关键取舍：
- **规则引擎自研**，坐标 `index = row*9+col`（row0 = 黑方底线）；AI 用 negamax + alpha-beta + 位置价值表 + 静态搜索，跑在 Worker 里。
- **Worker 内联**（`?worker&inline`），整套前端可打成单个 `index.html`，在安卓 `file://` 下没有模块跨域问题。
- **复盘用同一套引擎**，不引入第二个评估器，评分单位与子力价值一致（车 900 / 炮 450 / 马 400 / 兵 100）。

---

## 三、开发与构建

```bash
npm install
npm run dev              # 开发服务器 :5288
npm run build            # 网页版构建（tsc + vite）
npm run validate         # 校验 20 节课 + 6 条开局（合法性/可解性/记谱）
npm run voice            # 重新合成奥斯卡语音包（改台词后跑一次）
npm run build:apk        # 出安卓包 → dist-apk/xiangqi-academy-v1.3.0.apk
```

`npm run build:apk` 不依赖 Gradle，链路是：
`vite(单文件内联) → aapt2 compile/link → javac(JDK8, bootclasspath=android.jar) → d8 → 组装 → zipalign → apksigner`。

环境要求（本机已满足）：
- Android SDK：`platforms/android-34` + `build-tools/34.0.0`（默认路径 `E:/Dev/SDK/Android/sdk`，可用 `ANDROID_SDK_ROOT` 覆盖）
- JDK 8 用于 `javac`，JDK 11 用于 `d8` / `apksigner`（脚本内已指定）
- 签名文件首次构建时自动生成：`android/keystore/xiangqi.jks`（口令 `xiangqi2026`，自签名，仅适合自用分发；上架请换正式证书）

APK 信息：包名 `com.oscar.xiangqi`，minSdk 23（Android 6.0），targetSdk 34，竖屏，约 1.7 MB（其中约 1.9 MB 是语音包，压缩后约 1.6 MB）。

### 白屏排查（v1.1.1 起）

APK 内的网页已带「启动守卫」：脚本报错、Promise 未捕获、或加载 5 秒后 `#root` 仍为空，会直接在屏幕上显示错误信息与设备 UA，不再是无信息的白屏。

发版前建议先跑一次产物自检（不用装机）：

```bash
chrome --headless=new --enable-logging=stderr --virtual-time-budget=8000 \
  --dump-dom "file:///<项目路径>/android/app/assets/www/index.html" > dom.html 2> console.log
# dom.html 里 <div id="root"> 有内容 = 正常；console.log 里的 CONSOLE 行就是报错原文
```

真机排障：`adb logcat -s XQWeb`（网页控制台已转发到 logcat），或 `chrome://inspect` 远程调试（已开启 WebView 调试）。

v1.1.0 曾在真机白屏，原因是内联脚本被放进 `<head>` 同步执行，早于 `<div id="root">` 解析，React 抛 #299。v1.1.1 已把内联脚本移到 `</body>` 前。

---

## 四、已知限制

- 语音包覆盖全部固定台词；升级/打卡等含数字的句子按固定句式播报（不念具体数字），保证任何机器都有声音。
- 语音包由 `npm run voice` 生成，需要联网调用 edge-tts（只在开发机执行，产物随包离线运行）。
- 复盘深度为 2，快速但对复杂战术的判断会有噪声，标注是「参考」而非判定。
- 安卓包用自签名证书，不是 Play 商店分发包。
- 未做云同步：进度存在本机 `localStorage`。

---

## 五、验证记录

- `tsc --noEmit` 零错误；网页版与 APK 版均构建通过。
- `npm run validate`：20 节课 / 80 步全部可解且合法；6 条开局 33 手全部合法、记谱一致。
- 复盘链路用真实对局着法跑通：着法分级、汇总、开局识别均符合预期。
