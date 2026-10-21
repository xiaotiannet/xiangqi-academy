import { useState } from 'react';
import { CURRICULUM } from '../content/curriculum';
import {
  ACHIEVEMENTS,
  ENERGY_MAX,
  achievementClaimed,
  achievementDone,
  completedCount,
  starCount,
} from '../state/progress';
import type { Game } from '../state/game';
import { Oscar } from '../components/Oscar';
import { Sheet } from '../components/Sheet';
import { sfx } from '../state/sound';
import { isNative, requestNotificationPermission, voice } from '../state/native';
import { pick, GREET } from '../content/oscar';

interface Props {
  game: Game;
}

const HOURS = [8, 12, 18, 19, 20, 21, 22];

export function Profile({ game }: Props) {
  const { progress, level } = game;
  const total = CURRICULUM.reduce((s, u) => s + u.lessons.length, 0);
  const done = completedCount(progress);
  const stars = starCount(progress);
  const maxStars = total * 3;
  const played = progress.vsAi.win + progress.vsAi.lose + progress.vsAi.draw;
  /** 点开的成就详情：存成就 id，null 表示没点 */
  const [selAch, setSelAch] = useState<string | null>(null);

  const patch = (k: keyof typeof progress.settings, v: boolean | number) => {
    game.patchSettings({ [k]: v } as never);
    sfx.tap();
  };

  const testVoice = () => {
    const line = pick('test', GREET.fresh);
    voice.say(line.v ?? line.t, { force: true });
  };

  return (
    <div className="screen profile">
      <header className="screen-head">
        <h1>我的</h1>
        <p>等级、成就，以及奥斯卡的唠叨开关</p>
      </header>

      <section className="level-card">
        <div className="level-ring">
          <span>Lv.{level.level}</span>
          <small>{level.title}</small>
        </div>
        <div className="level-info">
          <div className="level-bar">
            <div className="level-bar-fill" style={{ width: `${level.pct}%` }} />
          </div>
          <p>
            {level.into} / {level.need} XP · 距「{level.nextTitle}」
          </p>
        </div>
      </section>

      <div className="stat-grid">
        <div className="stat-card">
          <b>{progress.xp}</b>
          <span>总经验</span>
        </div>
        <div className="stat-card">
          <b>🔥 {progress.streak}</b>
          <span>连续天数</span>
        </div>
        <div className="stat-card">
          <b>
            {done}/{total}
          </b>
          <span>完成课程</span>
        </div>
        <div className="stat-card">
          <b>
            {stars}/{maxStars}
          </b>
          <span>获得星星</span>
        </div>
        <div className="stat-card">
          <b>💎 {progress.gems}</b>
          <span>宝石</span>
        </div>
        <div className="stat-card">
          <b>
            ❤️ {progress.energy}/{ENERGY_MAX}
          </b>
          <span>体力</span>
        </div>
      </div>

      <div className="card">
        <div className="card-eyebrow">对战胜负</div>
        <div className="vs-row">
          <div>
            <b className="win">{progress.vsAi.win}</b>
            <span>胜</span>
          </div>
          <div>
            <b className="draw">{progress.vsAi.draw}</b>
            <span>和</span>
          </div>
          <div>
            <b className="lose">{progress.vsAi.lose}</b>
            <span>负</span>
          </div>
          <div>
            <b>{played}</b>
            <span>总局数</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-eyebrow">成就 · {Object.keys(progress.claimedAch).length}/{ACHIEVEMENTS.length}</div>
        <div className="ach-row">
          {ACHIEVEMENTS.map((a) => {
            const claimed = achievementClaimed(progress, a);
            const ready = achievementDone(progress, a);
            return (
              <button
                className={`ach-ico ${claimed ? 'is-done' : ''} ${ready && !claimed ? 'is-ready' : ''}`}
                key={a.id}
                onClick={() => {
                  sfx.tap();
                  setSelAch(a.id);
                }}
              >
                <span className="ach-ico-emoji">{a.emoji}</span>
                {claimed ? (
                  <i className="ach-ico-check">✓</i>
                ) : ready ? (
                  <i className="ach-ico-dot" />
                ) : (
                  <i className="ach-ico-lock">🔒</i>
                )}
              </button>
            );
          })}
        </div>
        <p className="ach-tip">点一下图标，看看这项成就的进度。</p>
      </div>

      <div className="card">
        <div className="card-eyebrow">设置</div>
        <button className="toggle-row" onClick={() => patch('sound', !progress.settings.sound)}>
          <span>🔊 音效</span>
          <span className={`switch ${progress.settings.sound ? 'on' : ''}`} />
        </button>
        <button className="toggle-row" onClick={() => patch('voice', !progress.settings.voice)}>
          <span>🗣️ 奥斯卡语音</span>
          <span className={`switch ${progress.settings.voice ? 'on' : ''}`} />
        </button>
        <button className="toggle-row sub" onClick={testVoice}>
          <span>试听一句</span>
          <span className="mini-link">🔊 播放</span>
        </button>
        <button className="toggle-row" onClick={() => patch('showLegalMoves', !progress.settings.showLegalMoves)}>
          <span>🟢 显示可落子点</span>
          <span className={`switch ${progress.settings.showLegalMoves ? 'on' : ''}`} />
        </button>
        <button className="toggle-row" onClick={() => patch('showNotation', !progress.settings.showNotation)}>
          <span>📜 对局记录（中文记谱）</span>
          <span className={`switch ${progress.settings.showNotation ? 'on' : ''}`} />
        </button>
        <button className="toggle-row" onClick={() => patch('undo', !progress.settings.undo)}>
          <span>↩️ 对局显示「悔棋」</span>
          <span className={`switch ${progress.settings.undo ? 'on' : ''}`} />
        </button>
        {progress.settings.undo ? (
          <p className="setting-note">
            悔棋每次消耗 1 点 ❤️ 体力。奥斯卡认为这是对你手滑的合理收费。
          </p>
        ) : (
          <p className="setting-note">
            默认关闭：落子不悔，才对得起被你吃掉的马。需要用的时候在这里打开。
          </p>
        )}
        <button
          className="toggle-row"
          onClick={() => {
            const next = !progress.settings.reminder;
            if (next) requestNotificationPermission();
            patch('reminder', next);
          }}
        >
          <span>⏰ 每日提醒</span>
          <span className={`switch ${progress.settings.reminder ? 'on' : ''}`} />
        </button>
        {progress.settings.reminder && (
          <div className="hour-row">
            <span>提醒时间</span>
            <div className="hour-chips">
              {HOURS.map((h) => (
                <button
                  key={h}
                  className={`hour-chip ${progress.settings.reminderHour === h ? 'on' : ''}`}
                  onClick={() => patch('reminderHour', h)}
                >
                  {h}:00
                </button>
              ))}
            </div>
          </div>
        )}
        {progress.settings.reminder && !isNative() && (
          <p className="setting-note">
            网页版只能读到设置，真正弹通知要装安卓 APK。奥斯卡记下了，但它没权限。
          </p>
        )}
      </div>

      <div className="oscar-footer">
        <Oscar mood="smug" size={54} />
        <p>「清空进度前想清楚，我记性比你好。」</p>
      </div>

      <button
        className="btn btn-ghost danger"
        onClick={() => {
          if (window.confirm('确定要清空所有学习进度吗？此操作不可撤销。')) {
            game.reset();
          }
        }}
      >
        清空学习进度
      </button>

      <p className="version">象棋学堂 v1.1 · 离线可用 · 规则引擎内置</p>

      {selAch &&
        (() => {
          const a = ACHIEVEMENTS.find((x) => x.id === selAch);
          if (!a) return null;
          const claimed = achievementClaimed(progress, a);
          const got = Math.min(a.goal, a.value(progress));
          const pct = Math.min(100, Math.round((got / a.goal) * 100));
          return (
            <Sheet
              open
              title={
                <span className="ach-sheet-title">
                  <span className="ach-sheet-emoji">{a.emoji}</span>
                  {a.name}
                </span>
              }
              onClose={() => setSelAch(null)}
              closeLabel={null}
            >
              <p className="sheet-note">{a.desc}</p>
              <div className="ach-sheet-bar">
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className="ach-sheet-meta">
                <span>
                  进度 {got}/{a.goal}
                </span>
                <span className={claimed ? 'claimed' : ''}>
                  {claimed ? '✓ 已达成' : `💎 奖励 ${a.gems}`}
                </span>
              </div>
              <button className="btn btn-primary" onClick={() => setSelAch(null)}>
                知道了
              </button>
            </Sheet>
          );
        })()}
    </div>
  );
}
