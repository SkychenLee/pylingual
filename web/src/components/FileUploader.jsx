import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

export default function FileUploader({ onUpload, disabled }) {
  const onDrop = useCallback(
    (accepted) => {
      if (accepted.length > 0) {
        onUpload(accepted[0]);
      }
    },
    [onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/octet-stream': ['.pyc'] },
    disabled,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`uploader-area${isDragActive ? ' drag-active' : ''}${disabled ? ' disabled' : ''}`}
    >
      <input {...getInputProps()} />
      <span className="uploader-icon">&#128230;</span>
      {isDragActive ? (
        <p>松开鼠标即可上传文件...</p>
      ) : (
        <>
          <p><strong>拖拽</strong> <code>.pyc</code> 文件到此处</p>
          <p className="uploader-hint">请先使用 <code>python -m py_compile your_file.py</code> 编译文件</p>
          <button type="button" className="btn-browse">选择文件</button>
        </>
      )}
    </div>
  );
}
