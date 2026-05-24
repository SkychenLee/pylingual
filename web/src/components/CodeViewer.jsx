import { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

export default function CodeViewer({ sourceCode, successRate, version }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sourceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = sourceCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const lines = sourceCode.split('\n');

  return (
    <div className="card code-viewer">
      <div className="result-header">
        <div className="result-meta">
          <span>版本: <strong>{version}</strong></span>
          <span>匹配率: <strong>{successRate}</strong></span>
          <span>行数: <strong>{lines.length}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? '已复制!' : '复制代码'}
          </button>
        </div>
      </div>

      <div className="code-container">
        <Highlight code={sourceCode} language="python" theme={themes.nightOwl}>
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre className="code-block" style={{ ...style, background: 'transparent' }}>
              {tokens.map((line, i) => {
                const lineProps = getLineProps({ line, key: i });
                return (
                  <div {...lineProps} key={i} className="code-line">
                    <span className="line-number">{i + 1}</span>
                    <span className="line-content">
                      {line.map((token, j) => (
                        <span {...getTokenProps({ token, key: j })} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}
