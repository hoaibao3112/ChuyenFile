'use client';

import { useCallback, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

// ─── Types ───────────────────────────────────────────────────────────────────
type ConvertStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface ConvertResult {
  fileName: string;
  pagesProcessed: number;
  rowsExtracted: number;
  downloadUrl: string;
  downloadName: string;
}

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

// ─── Icons (inline SVG to avoid extra deps) ──────────────────────────────────
function IconUpload({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconFile({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function IconCheck({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconDownload({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconX({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconSparkles({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

function IconShield({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconZap({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Home() {
  const [status, setStatus] = useState<ConvertStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection ──────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Chỉ chấp nhận file PDF.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File quá lớn. Tối đa 50MB.');
      return;
    }
    setSelectedFile(file);
    setError(null);
    setResult(null);
    setStatus('idle');
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => setIsDragOver(false);

  // ── Conversion ──────────────────────────────────────────────────────────────
  const handleConvert = async () => {
    if (!selectedFile) return;

    setStatus('uploading');
    setProgress(10);
    setProgressLabel('Đang tải file lên...');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Fake progress animation
      const progressTimer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            clearInterval(progressTimer);
            return 85;
          }
          return prev + 5;
        });
      }, 400);

      setStatus('processing');
      setProgressLabel('Đang trích xuất văn bản CJK...');

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressTimer);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(errData.error ?? `Lỗi server: ${response.status}`);
      }

      setProgress(95);
      setProgressLabel('Đang tạo file Excel...');

      // Get filename from headers
      const disposition = response.headers.get('content-disposition') ?? '';
      const fileNameMatch = disposition.match(/filename\*=UTF-8''(.+)/);
      const downloadName = fileNameMatch
        ? decodeURIComponent(fileNameMatch[1])
        : `${selectedFile.name.replace('.pdf', '')}_converted.xlsx`;

      const pagesProcessed = Number(response.headers.get('x-pages-processed') ?? 1);
      const rowsExtracted = Number(response.headers.get('x-rows-extracted') ?? 0);

      // Download the Excel file
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      setProgress(100);
      setProgressLabel('Hoàn tất!');
      setResult({
        fileName: selectedFile.name,
        pagesProcessed,
        rowsExtracted,
        downloadUrl,
        downloadName,
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setProgress(0);
      setError(err instanceof Error ? err.message : 'Lỗi không xác định. Vui lòng thử lại.');
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.downloadUrl;
    a.download = result.downloadName;
    a.click();
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (result?.downloadUrl) URL.revokeObjectURL(result.downloadUrl);
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    setProgress(0);
    setProgressLabel('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isConverting = status === 'uploading' || status === 'processing';

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* ── Header ── */}
      <div className="flex flex-col items-center gap-4 mb-12 text-center">
        {/* Logo icon */}
        <div className="relative">
          <div
            className="float-animation w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, oklch(0.6 0.18 280) 0%, oklch(0.5 0.2 250) 100%)',
              boxShadow: '0 0 40px oklch(0.6 0.18 280 / 0.4)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          </div>
        </div>

        <h1 className="text-4xl font-bold tracking-tight">
          <span className="gradient-text">PDF → Excel</span>
        </h1>
        <p className="text-lg text-[oklch(0.65_0.05_280)] max-w-md leading-relaxed">
          Chuyển đổi PDF sang Excel chính xác, không lỗi chữ.{' '}
          <span style={{ color: 'oklch(0.7 0.2 180)' }}>Hỗ trợ tiếng Trung, Nhật, Hàn.</span>
        </p>

        {/* Feature badges */}
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          <span className="feature-badge">
            <IconSparkles className="w-3 h-3" style={{ color: 'oklch(0.75 0.18 280)' }} />
            CJK Unicode
          </span>
          <span className="feature-badge">
            <IconZap className="w-3 h-3" style={{ color: 'oklch(0.75 0.18 85)' }} />
            Tốc độ cao
          </span>
          <span className="feature-badge">
            <IconShield className="w-3 h-3" style={{ color: 'oklch(0.7 0.18 145)' }} />
            Bảo mật
          </span>
          <span className="feature-badge">
            <IconFile className="w-3 h-3" />
            Đến 50MB
          </span>
        </div>
      </div>

      {/* ── Main Card ── */}
      <div className="w-full max-w-xl">
        <div className="glass-card p-8 flex flex-col gap-6">

          {/* ── Drop Zone ── */}
          {status !== 'done' && (
            <div
              id="pdf-drop-zone"
              className={`drop-zone p-10 flex flex-col items-center gap-4 cursor-pointer select-none ${isDragOver ? 'drag-over' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => !isConverting && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                id="pdf-file-input"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={onInputChange}
                disabled={isConverting}
              />

              {!selectedFile ? (
                <>
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'oklch(0.6 0.18 280 / 0.15)', border: '1px solid oklch(0.6 0.18 280 / 0.3)' }}
                  >
                    <IconUpload className="w-8 h-8" style={{ color: 'oklch(0.6 0.18 280)' }} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-base text-[oklch(0.9_0.02_280)]">
                      Kéo thả file PDF vào đây
                    </p>
                    <p className="text-sm text-[oklch(0.55_0.03_280)] mt-1">
                      hoặc <span style={{ color: 'oklch(0.65 0.15 280)' }}>click để chọn file</span>
                    </p>
                  </div>
                  <p className="text-xs text-[oklch(0.45_0.03_280)]">
                    Hỗ trợ PDF văn bản, tối đa 50MB
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{ background: 'oklch(0.6 0.22 25 / 0.15)', border: '1px solid oklch(0.6 0.22 25 / 0.3)' }}
                  >
                    <IconFile className="w-7 h-7" style={{ color: 'oklch(0.6 0.22 25)' }} />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-sm text-[oklch(0.9_0.02_280)] break-all max-w-xs">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-[oklch(0.55_0.03_280)] mt-1">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  {!isConverting && (
                    <button
                      id="change-file-btn"
                      className="text-xs text-[oklch(0.55_0.08_280)] underline underline-offset-2 hover:text-[oklch(0.7_0.12_280)] transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    >
                      Đổi file khác
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Progress ── */}
          {isConverting && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[oklch(0.65_0.05_280)]">{progressLabel}</span>
                <span style={{ color: 'oklch(0.6 0.18 280)' }} className="font-mono font-medium">
                  {progress}%
                </span>
              </div>
              <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'oklch(0.15 0.02 280)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, oklch(0.6 0.18 280) 0%, oklch(0.7 0.2 180) 100%)',
                    boxShadow: '0 0 10px oklch(0.6 0.18 280 / 0.6)',
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: 'oklch(0.6 0.18 280)',
                        animation: `bounce 1s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-[oklch(0.5_0.04_280)]">
                  Đang xử lý, vui lòng chờ...
                </span>
              </div>
            </div>
          )}

          {/* ── Success State ── */}
          {status === 'done' && result && (
            <div className="flex flex-col gap-5">
              {/* Success banner */}
              <div
                className="flex items-center gap-3 p-4 rounded-xl"
                style={{ background: 'oklch(0.65 0.18 145 / 0.12)', border: '1px solid oklch(0.65 0.18 145 / 0.3)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'oklch(0.65 0.18 145 / 0.2)' }}
                >
                  <IconCheck className="w-5 h-5" style={{ color: 'oklch(0.65 0.18 145)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'oklch(0.75 0.15 145)' }}>
                    Chuyển đổi thành công!
                  </p>
                  <p className="text-xs text-[oklch(0.55_0.05_280)] mt-0.5">
                    {result.pagesProcessed} trang • {result.rowsExtracted} dòng dữ liệu
                  </p>
                </div>
              </div>

              {/* File info */}
              <div
                className="flex items-center gap-3 p-4 rounded-xl"
                style={{ background: 'oklch(0.1 0.02 280 / 0.6)', border: '1px solid oklch(0.2 0.03 280)' }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'oklch(0.5 0.18 145 / 0.15)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" style={{ color: 'oklch(0.65 0.18 145)' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[oklch(0.9_0.02_280)] truncate">
                    {result.downloadName}
                  </p>
                  <p className="text-xs text-[oklch(0.5_0.03_280)] mt-0.5">
                    Excel Workbook (.xlsx)
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                <button
                  id="download-excel-btn"
                  onClick={handleDownload}
                  className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, oklch(0.6 0.18 280) 0%, oklch(0.5 0.2 250) 100%)',
                    color: 'white',
                    boxShadow: '0 4px 20px oklch(0.6 0.18 280 / 0.35)',
                  }}
                >
                  <IconDownload className="w-4 h-4" />
                  Tải về Excel
                </button>

                <button
                  id="convert-another-btn"
                  onClick={handleReset}
                  className="w-full h-11 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-80"
                  style={{
                    background: 'oklch(0.15 0.02 280)',
                    color: 'oklch(0.65 0.06 280)',
                    border: '1px solid oklch(0.22 0.03 280)',
                  }}
                >
                  Chuyển đổi file khác
                </button>
              </div>
            </div>
          )}

          {/* ── Error State ── */}
          {error && status === 'error' && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'oklch(0.6 0.22 25 / 0.1)', border: '1px solid oklch(0.6 0.22 25 / 0.3)' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'oklch(0.6 0.22 25 / 0.2)' }}
              >
                <IconX className="w-4 h-4" style={{ color: 'oklch(0.65 0.22 25)' }} />
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: 'oklch(0.72 0.18 25)' }}>
                  Không thể chuyển đổi
                </p>
                <p className="text-xs mt-1 text-[oklch(0.55_0.05_280)]">{error}</p>
              </div>
            </div>
          )}

          {/* ── Convert Button ── */}
          {selectedFile && status === 'idle' && (
            <button
              id="convert-btn"
              onClick={handleConvert}
              disabled={isConverting}
              className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              style={{
                background: 'linear-gradient(135deg, oklch(0.6 0.18 280) 0%, oklch(0.5 0.2 250) 100%)',
                color: 'white',
                boxShadow: '0 4px 20px oklch(0.6 0.18 280 / 0.35)',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-4 h-4">
                <path d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6L16 6a5 5 0 0 1 1 9.9M9 19l3 3m0 0 3-3m-3 3V10" />
              </svg>
              Chuyển đổi sang Excel
            </button>
          )}

          {status === 'error' && selectedFile && (
            <button
              id="retry-btn"
              onClick={handleConvert}
              className="w-full h-12 rounded-xl font-semibold text-sm transition-all duration-200 hover:opacity-80"
              style={{
                background: 'oklch(0.15 0.02 280)',
                color: 'oklch(0.65 0.1 280)',
                border: '1px solid oklch(0.22 0.03 280)',
              }}
            >
              Thử lại
            </button>
          )}
        </div>

        {/* ── Info Cards ── */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { icon: <IconSparkles className="w-4 h-4" />, label: 'CJK Support', desc: 'Trung / Nhật / Hàn', color: 'oklch(0.6 0.18 280)' },
            { icon: <IconZap className="w-4 h-4" />, label: 'Nhanh', desc: 'Xử lý tức thì', color: 'oklch(0.75 0.18 85)' },
            { icon: <IconShield className="w-4 h-4" />, label: 'An toàn', desc: 'Không lưu file', color: 'oklch(0.65 0.18 145)' },
          ].map((item) => (
            <div
              key={item.label}
              className="glass-card p-4 flex flex-col items-center gap-2 text-center"
            >
              <span style={{ color: item.color }}>{item.icon}</span>
              <span className="text-xs font-semibold text-[oklch(0.85_0.03_280)]">{item.label}</span>
              <span className="text-xs text-[oklch(0.5_0.03_280)]">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <p className="mt-12 text-xs text-[oklch(0.4_0.03_280)] text-center">
        File được xử lý trực tiếp trên server — không lưu trữ sau khi download
      </p>

      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </main>
  );
}
