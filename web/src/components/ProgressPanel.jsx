const STAGES = [
  { key: 'Segmentation',   label: '字节码分析',  icon: '#9966ff' },
  { key: 'Translation',    label: '语句翻译',  icon: '#58a6ff' },
  { key: 'Control Flow',   label: '控制流分析',  icon: '#3fb950' },
  { key: 'Error Correction', label: '错误修正',     icon: '#d29922' },
];

function pct(current, total) {
  if (total == null || total === 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

export default function ProgressPanel({ stages }) {
  return (
    <div className="card progress-panel">
      <ul className="progress-stages">
        {STAGES.map(({ key, label, icon }) => {
          const s = stages[key];
          const percent = s ? pct(s.current, s.total) : 0;

          return (
            <li key={key} className="progress-stage">
              <div className="progress-stage-header">
                <span className="stage-name">
                  <span style={{ color: icon, marginRight: '0.5rem' }}>&#9654;</span>
                  {label}
                </span>
                <span className="stage-pct">{percent}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
