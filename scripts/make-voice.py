"""把台词合成成 mp3，打进安装包，彻底摆脱对手机系统 TTS 的依赖。

用法：
  python scripts/make-voice.py            # 增量合成（已存在则跳过）
  python scripts/make-voice.py --force    # 全部重录
  VOICE_RATE=-10% python scripts/make-voice.py --force   # 临时换个语速

语音：edge-tts 的 zh-CN-YunxiNeural（青年男声，语速比默认略慢，留出听清尾字的余地）
输出：public/voice/vNNN.mp3 + src/content/voicemap.json（文本 -> 文件名）
"""
import asyncio
import hashlib
import io
import json
import os
import sys

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINES = os.path.join(ROOT, '.tmp', 'voice-lines.json')
OUT_DIR = os.path.join(ROOT, 'public', 'voice')
MAP_PATH = os.path.join(ROOT, 'src', 'content', 'voicemap.json')

VOICE = 'zh-CN-YunxiNeural'
# 语速：原来 +6% 偏赶，听感像在念弹幕；降到 -6%，尾字清楚、仍然利索
RATE = os.environ.get('VOICE_RATE', '-6%')
PITCH = os.environ.get('VOICE_PITCH', '+2Hz')
CONCURRENCY = 4


async def synth_one(sem, text, path, force):
    if not force and os.path.exists(path) and os.path.getsize(path) > 800:
        return 'skip'
    async with sem:
        for attempt in range(3):
            try:
                c = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
                await c.save(path)
                if os.path.getsize(path) > 800:
                    return 'ok'
            except Exception as e:  # 网络抖动重试
                if attempt == 2:
                    print(f'  ! 失败 {text!r}: {e}')
                    return 'fail'
                await asyncio.sleep(1.2)
        return 'fail'


async def main():
    force = '--force' in sys.argv
    texts = json.load(io.open(LINES, encoding='utf-8'))
    os.makedirs(OUT_DIR, exist_ok=True)

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = []
    mapping = {}
    for t in texts:
        name = hashlib.md5(t.encode('utf-8')).hexdigest()[:10] + '.mp3'
        mapping[t] = name
        tasks.append(synth_one(sem, t, os.path.join(OUT_DIR, name), force))

    results = await asyncio.gather(*tasks)

    # 清掉不再被引用的旧音频
    keep = set(mapping.values())
    for f in os.listdir(OUT_DIR):
        if f.endswith('.mp3') and f not in keep:
            os.remove(os.path.join(OUT_DIR, f))
    ok = results.count('ok')
    skip = results.count('skip')
    fail = results.count('fail')

    io.open(MAP_PATH, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(mapping, ensure_ascii=False, indent=2) + '\n'
    )

    total = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR))
    print(f'合成完成: 新录 {ok}, 复用 {skip}, 失败 {fail}')
    print(f'音频总量: {total / 1024:.0f} KB, 平均 {total / max(1, len(texts)) / 1024:.1f} KB/句')
    print(f'映射表 -> {MAP_PATH}')
    if fail:
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
