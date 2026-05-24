import { useState, useEffect, useCallback, useRef } from 'react';
import FileUploader from './components/FileUploader';
import ProgressPanel from './components/ProgressPanel';
import CodeViewer from './components/CodeViewer';

function App() {
  const [taskId, setTaskId] = useState(null);
  const [stages, setStages] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const uploadingRef = useRef(false);

  const reset = useCallback(() => {
    setTaskId(null);
    setStages({});
    setResult(null);
    setError(null);
    setLoading(false);
    setFileName('');
    uploadingRef.current = false;
  }, []);

  const handleUpload = useCallback(async (file) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;

    reset();
    setLoading(true);
    setError(null);
    setFileName(file.name);

    if (!file.name.endsWith('.pyc')) {
      setError('仅支持 .pyc 文件');
      setLoading(false);
      setFileName('');
      uploadingRef.current = false;
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `上传失败 (HTTP ${res.status})`);
      }
      const data = await res.json();
      setTaskId(data.task_id);
    } catch (err) {
      setError(err.message || '上传失败');
      setLoading(false);
      setFileName('');
      uploadingRef.current = false;
    }
  }, [reset]);

  useEffect(() => {
    if (!taskId) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/${taskId}`);

    ws.onopen = () => setLoading(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'progress':
            setStages((prev) => ({
              ...prev,
              [msg.stage]: { current: msg.current, total: msg.total ?? prev[msg.stage]?.total },
            }));
            break;
          case 'complete':
            setResult(msg);
            setError(null);
            uploadingRef.current = false;
            break;
          case 'error':
            setError(msg.message);
            uploadingRef.current = false;
            break;
          default:
            break;
        }
      } catch {
      }
    };

    ws.onerror = () => {
      setError('WebSocket 连接失败，请确认后端服务已启动');
      setLoading(false);
      uploadingRef.current = false;
    };

    ws.onclose = () => {
      setLoading(false);
      uploadingRef.current = false;
    };

    return () => {
      try { ws.close(); } catch { }
    };
  }, [taskId]);

  const isProcessing = loading || (taskId && !result && !error);

  return (
    <div className={`app${isProcessing ? ' processing' : ''}`}>
      <header className="header">
        <div className="header-top">
          <h1 className="logo">PYXRAY</h1>
          <span className="version-badge">v1.0 · py3.6–3.13</span>
        </div>
        <p className="subtitle">// 字节码反编译器 · 实时进度追踪 · 源码高亮输出</p>
      </header>

      <main className="main">
        {!isProcessing && (
          <FileUploader onUpload={handleUpload} disabled={false} />
        )}

        {loading && !result && (
          <div className="card connecting">
            <div className="connecting-dots">
              <span></span><span></span><span></span>
            </div>
            <p className="connecting-text">
              {taskId ? `正在反编译 ${fileName}` : '上传中...'}
            </p>
          </div>
        )}

        {taskId && !result && !error && (
          <ProgressPanel stages={stages} fileName={fileName} />
        )}

        {error && (
          <div className="card error-card">
            <h3>反编译失败</h3>
            <pre className="error-msg">{error}</pre>
            <button className="btn-retry" onClick={reset}>重试</button>
          </div>
        )}

        {result && (
          <CodeViewer
            sourceCode={result.source_code}
            successRate={result.success_rate}
            version={result.version}
          />
        )}
      </main>

      <footer className="footer">
        <a href="https://github.com/SkychenLee/pylingual" target="_blank" rel="noopener noreferrer">github.com/SkychenLee/pylingual</a>
        {' · '}
        <span>PyXray Web</span>
      </footer>

      {isProcessing && <div className="scan-beam" />}
    </div>
  );
}

export default App;
