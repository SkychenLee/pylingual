import { useState, useEffect, useRef } from 'react';

const STAGES = [
  { key: 'Segmentation', label: '字节码分析', color: '#af52de' },
  { key: 'Translation', label: '语句翻译', color: '#007aff' },
  { key: 'Control Flow', label: '控制流分析', color: '#34c759' },
  { key: 'Error Correction', label: '错误修正', color: '#ff9500' },
];

function pct(current, total) {
  if (total == null || total === 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m > 0) return `${m}分${rem.toString().padStart(2, '0')}秒`;
  return `${rem}秒`;
}

export default function ProgressPanel({ stages, fileName }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const stageKeys = STAGES.map(s => s.key);
  const activeIndex = stageKeys.findIndex(key => {
    const d = stages[key];
    if (!d) return false;
    return d.current < d.total;
  });
  const allDone = stageKeys.every(key => {
    const d = stages[key];
    return d && d.current >= d.total && d.total > 0;
  });
  const overallPct = (() => {
    let totalCur = 0, totalAll = 0;
    for (const d of Object.values(stages)) {
      if (d && d.total > 0) {
        totalCur += d.current;
        totalAll += d.total;
      }
    }
    return totalAll > 0 ? Math.round((totalCur / totalAll) * 100) : 0;
  })();

  return (
    <div className="card progress-panel">
      <div className="progress-header">
        <div className="progress-header-left">
          <span className="progress-file-name">{fileName}</span>
        </div>
        <div className="progress-header-right">
          <span className="progress-elapsed">{formatElapsed(elapsed)}</span>
          <span className="progress-overall">{overallPct}%</span>
        </div>
      </div>

      <div className="progress-overall-bar">
        <div className="progress-overall-fill" style={{ width: `${overallPct}%` }} />
      </div>

      <ul className="progress-stages">
        {STAGES.map(({ key, label, color }, idx) => {
          const d = stages[key];
          const percent = d ? pct(d.current, d.total) : 0;
          const isActive = idx === activeIndex && !allDone;
          const isDone = d && d.current >= d.total && d.total > 0;
          const isPending = !d || d.total === 0;

          let statusClass = 'pending';
          if (isActive) statusClass = 'active';
          else if (isDone) statusClass = 'done';

          return (
            <li key={key} className={`progress-stage stage-${statusClass}`}>
              <div className="progress-stage-header">
                <span className="stage-indicator" style={{ color }}>
                  {isDone ? '✓' : isActive ? <span className="stage-dot-pulse" /> : '○'}
                </span>
                <span className="stage-name" style={isActive ? { color } : undefined}>{label}</span>
                <span className="stage-detail">
                  {d && d.total > 0 ? `${d.current}/${d.total}` : '--'}
                </span>
                <span className="stage-pct" style={isDone ? { color } : undefined}>{percent}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${percent}%`,
                    background: isDone
                      ? color
                      : `linear-gradient(90deg, ${color}, ${color}88)`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
