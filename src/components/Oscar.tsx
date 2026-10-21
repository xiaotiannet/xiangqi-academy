export type Mood = 'idle' | 'happy' | 'sad' | 'smug' | 'think' | 'wow';

interface Props {
  mood?: Mood;
  size?: number;
  className?: string;
}

/**
 * 奥斯卡：一块被削成「帅」的老木头，单片眼镜 + 八字胡。
 * 纯 SVG，跟着主题色走，不依赖任何图片资源。
 */
export function Oscar({ mood = 'idle', size = 92, className = '' }: Props) {
  const lid = mood === 'smug' || mood === 'think';
  const happy = mood === 'happy';
  const sad = mood === 'sad';

  const eye = (cx: number) => {
    if (mood === 'wow')
      return (
        <>
          <circle cx={cx} cy="58" r="6" fill="#fff" stroke="#3c3c3c" strokeWidth="2" />
          <circle cx={cx} cy="58" r="2.6" fill="#3c3c3c" />
        </>
      );
    if (happy) return <path d={`M${cx - 5} 59 q5 -6 10 0`} stroke="#3c3c3c" strokeWidth="3.2" fill="none" strokeLinecap="round" />
    if (lid) return <path d={`M${cx - 5} 58 h10`} stroke="#3c3c3c" strokeWidth="3.2" strokeLinecap="round" />;
    return (
      <>
        <circle cx={cx} cy="58" r="4.1" fill="#3c3c3c" />
        <circle cx={cx + 1.4} cy="56.4" r="1.3" fill="#fff" opacity=".85" />
      </>
    );
  };

  const brow = (cx: number, dir: number) => {
    const dy = sad ? 2.5 : mood === 'smug' ? -1.5 : 0;
    return (
      <path
        d={`M${cx - 6} ${47 + dy} q6 ${-3 * dir} 12 ${1 + dy * 0.4}`}
        stroke="#3c3c3c"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity=".85"
      />
    );
  };

  return (
    <svg
      className={`oscar ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="奥斯卡"
    >
      <defs>
        <linearGradient id="oscarFace" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#FFF9EA" />
          <stop offset="1" stopColor="#F0DDB8" />
        </linearGradient>
        <linearGradient id="oscarRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E24B42" />
          <stop offset="1" stopColor="#B3261E" />
        </linearGradient>
      </defs>

      <ellipse cx="60" cy="112" rx="29" ry="4.6" fill="#1b1b1b" opacity=".1" />
      <circle cx="60" cy="61" r="45" fill="url(#oscarFace)" stroke="#E0C79B" strokeWidth="2.5" />
      <circle cx="60" cy="61" r="37" fill="#FFFDF6" stroke="url(#oscarRim)" strokeWidth="3.4" />

      {/* 木纹 */}
      <path d="M31 84 q14 7 29 6" stroke="#E7D3AC" strokeWidth="1.6" fill="none" opacity=".8" />
      <path d="M34 91 q13 5 26 4" stroke="#E7D3AC" strokeWidth="1.4" fill="none" opacity=".6" />

      {brow(50, 1)}
      {brow(70, -1)}
      {eye(50)}
      {eye(70)}

      {/* 单片眼镜 */}
      <g>
        <circle cx="71" cy="58" r="11.5" fill="#CFEFFF" opacity=".35" />
        <circle cx="71" cy="58" r="11.5" fill="none" stroke="#E8A400" strokeWidth="2.6" />
        <path d="M82 62 q7 7 4 15" stroke="#E8A400" strokeWidth="1.6" fill="none" />
        <circle cx="86" cy="78" r="1.8" fill="#E8A400" />
        <path d="M64 50 q4 -3 8 -2" stroke="#fff" strokeWidth="2" opacity=".8" fill="none" />
      </g>

      {/* 鼻子 */}
      <path d="M60 62 q3 6 -0.5 8" stroke="#C79E63" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      {/* 八字胡 */}
      <path
        d={sad ? 'M49 74 q11 -4 22 0' : 'M49 72 q9 7 11 1 q2 6 11 -1'}
        stroke="#4a3728"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* 嘴 */}
      {happy && <path d="M55 82 q5 5 10 0" stroke="#B3261E" strokeWidth="2.6" fill="none" strokeLinecap="round" />}
      {sad && <path d="M55 84 q5 -5 10 0" stroke="#B3261E" strokeWidth="2.6" fill="none" strokeLinecap="round" />}
      {!happy && !sad && (
        <path d="M56 82 h8" stroke="#B3261E" strokeWidth="2.6" strokeLinecap="round" opacity=".85" />
      )}

      {/* 腮红 */}
      <ellipse cx="41" cy="71" rx="5.6" ry="3.6" fill="#FFB6A8" opacity={mood === 'happy' ? 0.55 : 0.28} />
      <ellipse cx="79" cy="71" rx="5.6" ry="3.6" fill="#FFB6A8" opacity={mood === 'happy' ? 0.55 : 0.28} />

      {mood === 'think' && (
        <g opacity=".9">
          <circle cx="96" cy="34" r="4" fill="#fff" stroke="#D8D8D8" />
          <circle cx="103" cy="25" r="2.6" fill="#fff" stroke="#D8D8D8" />
        </g>
      )}
    </svg>
  );
}
