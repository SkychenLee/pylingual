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
  const uploadingRef = useRef(false);

  const reset = useCallback(() => {
    setTaskId(null);
    setStages({});
    setResult(null);
    setError(null);
    setLoading(false);
    uploadingRef.current = false;
  }, []);

  const handleUpload = useCallback(async (file) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;

    reset();
    setLoading(true);
    setError(null);

    if (!file.name.endsWith('.pyc')) {
      setError('仅支持 .pyc 文件');
      setLoading(false);
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
        // ignore parse errors on ping frames
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection failed. Make sure the backend is running.');
      setLoading(false);
      uploadingRef.current = false;
    };

    ws.onclose = () => {
      setLoading(false);
      uploadingRef.current = false;
    };

    return () => {
      try { ws.close(); } catch { /* noop */ }
    };
  }, [taskId]);

  return (
    <div className="app">
      <header className="header">
        <h1>Py大星</h1>
        <p className="subtitle">Python 字节码反编译器  |  支持 Python 3.6 – 3.13</p>
      </header>

      <main className="main">
        {!result && !error && (
          <FileUploader onUpload={handleUpload} disabled={loading} />
        )}

        {loading && !result && (
          <div className="card connecting">
            <div className="spinner" />
            <p>{taskId ? '正在连接反编译器...' : '上传中...'}</p>
          </div>
        )}

        {taskId && !result && !error && (
          <ProgressPanel stages={stages} />
        )}

        {error && (
          <div className="card error-card">
            <h3>反编译失败</h3>
            <pre className="error-msg">{error}</pre>
            <button className="btn btn-retry" onClick={reset}>重试</button>
          </div>
        )}

        {result && (
          <CodeViewer
            sourceCode={result.source_code}
            successRate={result.success_rate}
            version={result.version}
            onReset={reset}
          />
        )}
      </main>

      <footer className="footer">
        <a href="https://pylingual.io" target="_blank" rel="noopener noreferrer">pylingual.io</a>
        {' | '}
        <a href="https://github.com/syssec-utd/pylingual" target="_blank" rel="noopener noreferrer">GitHub</a>
        {' | '}
        <span>Py大星 Web 版</span>
      </footer>
    </div>
  );
}

export default App;
