'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sliders,
  Sparkles,
  Undo2,
  Redo2,
  RotateCcw as ResetIcon,
  ZoomIn,
  Check,
  X,
  Sun,
  Contrast,
  Palette,
} from 'lucide-react';

export interface EditorState {
  zoom: number;
  panX: number;
  panY: number;
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  brightness: number; // -100 to 100 (0 default)
  contrast: number; // -100 to 100 (0 default)
  saturation: number; // -100 to 100 (0 default)
  filter: string; // 'none', 'golden', 'noir', 'vintage', 'vivid', 'cool', 'moody'
}

const DEFAULT_STATE: EditorState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  filter: 'none',
};

const PRESET_FILTERS = [
  { id: 'none', name: 'Original', color: '#FFFFFF' },
  { id: 'golden', name: 'Golden Hour', color: '#FFB703' },
  { id: 'noir', name: 'Noir B&W', color: '#9CA3AF' },
  { id: 'vintage', name: 'Film 90s', color: '#D4A373' },
  { id: 'vivid', name: 'Vivid Pop', color: '#FF007F' },
  { id: 'cool', name: 'Cool Breeze', color: '#00B4D8' },
  { id: 'moody', name: 'Moody Dark', color: '#6B7280' },
];

interface ImageEditorProps {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (exportedBlob: Blob, previewUrl: string) => void;
}

export default function ImageEditor({
  imageSrc,
  onCancel,
  onComplete,
}: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const [state, setState] = useState<EditorState>(DEFAULT_STATE);
  const [history, setHistory] = useState<EditorState[]>([DEFAULT_STATE]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [activeTab, setActiveTab] = useState<'crop' | 'adjust' | 'filters'>('crop');
  const [isExporting, setIsExporting] = useState(false);

  // Dragging state for pan
  const isDraggingRef = useRef(false);
  const startDragPos = useRef({ x: 0, y: 0 });

  // Load image element
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      setState(DEFAULT_STATE);
      setHistory([DEFAULT_STATE]);
      setHistoryIndex(0);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Update state with history tracking
  const pushState = useCallback(
    (newState: EditorState) => {
      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        next.push(newState);
        return next;
      });
      setHistoryIndex((prev) => prev + 1);
      setState(newState);
    },
    [historyIndex],
  );

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setState(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setState(history[historyIndex + 1]);
    }
  };

  const reset = () => {
    pushState(DEFAULT_STATE);
  };

  // Render on canvas
  const renderCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement, renderState: EditorState, size: number) => {
      if (!image) return;

      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      targetCanvas.width = size;
      targetCanvas.height = size;

      ctx.clearRect(0, 0, size, size);

      // Background fill
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);

      ctx.save();

      // Transform origin to center
      ctx.translate(size / 2, size / 2);

      // Apply Pan (scaled to canvas size)
      ctx.translate(renderState.panX * (size / 400), renderState.panY * (size / 400));

      // Apply Rotation
      ctx.rotate((renderState.rotation * Math.PI) / 180);

      // Apply Flip
      ctx.scale(renderState.flipH ? -1 : 1, renderState.flipV ? -1 : 1);

      // Apply Filter & Adjustments
      let filterString = '';

      // Brightness: default 100%
      const bVal = 100 + renderState.brightness;
      filterString += `brightness(${Math.max(0, bVal)}%) `;

      // Contrast: default 100%
      const cVal = 100 + renderState.contrast;
      filterString += `contrast(${Math.max(0, cVal)}%) `;

      // Saturation: default 100%
      let sVal = 100 + renderState.saturation;
      if (renderState.filter === 'noir') sVal = 0;
      if (renderState.filter === 'vivid') sVal += 40;
      if (renderState.filter === 'vintage') sVal -= 20;
      if (renderState.filter === 'golden') sVal += 25;
      filterString += `saturate(${Math.max(0, sVal)}%) `;

      // Preset filter specifics
      if (renderState.filter === 'vintage') {
        filterString += 'sepia(35%) hue-rotate(-10deg) ';
      } else if (renderState.filter === 'golden') {
        filterString += 'sepia(20%) hue-rotate(10deg) ';
      } else if (renderState.filter === 'cool') {
        filterString += 'hue-rotate(180deg) saturate(90%) ';
      } else if (renderState.filter === 'moody') {
        filterString += 'contrast(125%) brightness(85%) ';
      }

      ctx.filter = filterString.trim();

      // Calculate 1:1 aspect fill scale
      const imgAspect = image.width / image.height;
      let drawWidth = size;
      let drawHeight = size;

      if (imgAspect > 1) {
        // Landscape: scale height to fit, width will overflow
        drawHeight = size;
        drawWidth = size * imgAspect;
      } else {
        // Portrait: scale width to fit, height will overflow
        drawWidth = size;
        drawHeight = size / imgAspect;
      }

      // Apply user zoom
      drawWidth *= renderState.zoom;
      drawHeight *= renderState.zoom;

      ctx.drawImage(
        image,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight,
      );

      ctx.restore();
    },
    [image],
  );

  // Render preview canvas whenever state changes
  useEffect(() => {
    if (canvasRef.current && image) {
      renderCanvas(canvasRef.current, state, 400);
    }
  }, [state, image, renderCanvas]);

  // Handle Pan dragging on preview canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startDragPos.current = { x: e.clientX - state.panX, y: e.clientY - state.panY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const newPanX = e.clientX - startDragPos.current.x;
    const newPanY = e.clientY - startDragPos.current.y;
    setState((prev) => ({ ...prev, panX: newPanX, panY: newPanY }));
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      pushState(state);
    }
  };

  // Export final image (1080x1080 WebP)
  const handleExport = () => {
    if (!image) return;
    setIsExporting(true);

    const exportCanvas = document.createElement('canvas');
    const exportSize = 1080; // Standard 1:1 HD resolution
    renderCanvas(exportCanvas, state, exportSize);

    exportCanvas.toBlob(
      (blob) => {
        setIsExporting(false);
        if (blob) {
          const previewUrl = URL.createObjectURL(blob);
          onComplete(blob, previewUrl);
        }
      },
      'image/webp',
      0.88,
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-4 px-2 sm:px-4">
      <div className="bg-[#16181F] border border-[#242731] rounded-3xl p-4 sm:p-6 shadow-2xl">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#242731]">
          <div className="flex items-center space-x-2">
            <button
              onClick={undo}
              disabled={historyIndex === 0}
              className="p-2 rounded-xl bg-[#1F222B] text-neutral-300 hover:text-white disabled:opacity-30 transition-all"
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex === history.length - 1}
              className="p-2 rounded-xl bg-[#1F222B] text-neutral-300 hover:text-white disabled:opacity-30 transition-all"
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <button
              onClick={reset}
              className="p-2 rounded-xl bg-[#1F222B] text-neutral-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-medium"
              title="Reset All"
            >
              <ResetIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center bg-[#1F222B] p-1 rounded-2xl border border-[#2D313E]">
            <button
              onClick={() => setActiveTab('crop')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'crop'
                  ? 'bg-yellow-400 text-black shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Crop & Transform</span>
            </button>
            <button
              onClick={() => setActiveTab('adjust')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'adjust'
                  ? 'bg-yellow-400 text-black shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Adjust</span>
            </button>
            <button
              onClick={() => setActiveTab('filters')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'filters'
                  ? 'bg-yellow-400 text-black shadow-md'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onCancel}
              className="p-2 rounded-xl bg-[#1F222B] hover:bg-red-500/20 text-neutral-400 hover:text-red-300 transition-all"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Canvas Viewport (1:1 Square Locket Widget replica) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <div className="relative group p-2 bg-[#121318] rounded-4xl border border-[#242731] shadow-2xl">
              {/* Gold ring accent */}
              <div className="absolute inset-0 rounded-4xl border-2 border-yellow-400/20 pointer-events-none" />

              <canvas
                ref={canvasRef}
                width={400}
                height={400}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="w-[300px] h-[300px] sm:w-[360px] sm:h-[360px] rounded-3xl object-cover cursor-grab active:cursor-grabbing shadow-lg"
              />

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[11px] text-neutral-300 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                Drag to adjust crop
              </div>
            </div>
          </div>

          {/* Controls Sidebar */}
          <div className="lg:col-span-5 space-y-6">
            {/* Tab 1: Crop & Transform */}
            {activeTab === 'crop' && (
              <div className="space-y-5 bg-[#1A1D26] p-5 rounded-3xl border border-[#282C37]">
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">
                  Transform & Rotation
                </h4>

                {/* Zoom Slider */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-300 mb-1.5 font-medium">
                    <span>Zoom Scale</span>
                    <span className="text-yellow-400 font-bold">
                      {state.zoom.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={state.zoom}
                    onChange={(e) => {
                      const zoom = parseFloat(e.target.value);
                      setState((s) => ({ ...s, zoom }));
                    }}
                    onMouseUp={() => pushState(state)}
                    className="w-full accent-yellow-400 bg-[#252834] rounded-lg h-2"
                  />
                </div>

                {/* Rotate & Flip Buttons */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  <button
                    onClick={() =>
                      pushState({
                        ...state,
                        rotation: (state.rotation - 90 + 360) % 360,
                      })
                    }
                    className="p-3 bg-[#252834] hover:bg-[#2F3342] text-neutral-300 hover:text-white rounded-2xl flex flex-col items-center gap-1 text-[11px] font-medium transition-all"
                  >
                    <RotateCcw className="w-4 h-4 text-yellow-400" />
                    <span>-90°</span>
                  </button>
                  <button
                    onClick={() =>
                      pushState({
                        ...state,
                        rotation: (state.rotation + 90) % 360,
                      })
                    }
                    className="p-3 bg-[#252834] hover:bg-[#2F3342] text-neutral-300 hover:text-white rounded-2xl flex flex-col items-center gap-1 text-[11px] font-medium transition-all"
                  >
                    <RotateCw className="w-4 h-4 text-yellow-400" />
                    <span>+90°</span>
                  </button>
                  <button
                    onClick={() =>
                      pushState({
                        ...state,
                        flipH: !state.flipH,
                      })
                    }
                    className={`p-3 rounded-2xl flex flex-col items-center gap-1 text-[11px] font-medium transition-all ${
                      state.flipH
                        ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/40'
                        : 'bg-[#252834] hover:bg-[#2F3342] text-neutral-300 hover:text-white'
                    }`}
                  >
                    <FlipHorizontal className="w-4 h-4" />
                    <span>Flip H</span>
                  </button>
                  <button
                    onClick={() =>
                      pushState({
                        ...state,
                        flipV: !state.flipV,
                      })
                    }
                    className={`p-3 rounded-2xl flex flex-col items-center gap-1 text-[11px] font-medium transition-all ${
                      state.flipV
                        ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/40'
                        : 'bg-[#252834] hover:bg-[#2F3342] text-neutral-300 hover:text-white'
                    }`}
                  >
                    <FlipVertical className="w-4 h-4" />
                    <span>Flip V</span>
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Adjustments */}
            {activeTab === 'adjust' && (
              <div className="space-y-4 bg-[#1A1D26] p-5 rounded-3xl border border-[#282C37]">
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">
                  Lighting & Tone
                </h4>

                {/* Brightness */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-300 mb-1.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-yellow-400" /> Brightness
                    </span>
                    <span className="font-semibold">{state.brightness}</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={state.brightness}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        brightness: parseInt(e.target.value),
                      }))
                    }
                    onMouseUp={() => pushState(state)}
                    className="w-full accent-yellow-400 bg-[#252834] rounded-lg h-2"
                  />
                </div>

                {/* Contrast */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-300 mb-1.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Contrast className="w-3.5 h-3.5 text-yellow-400" /> Contrast
                    </span>
                    <span className="font-semibold">{state.contrast}</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={state.contrast}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        contrast: parseInt(e.target.value),
                      }))
                    }
                    onMouseUp={() => pushState(state)}
                    className="w-full accent-yellow-400 bg-[#252834] rounded-lg h-2"
                  />
                </div>

                {/* Saturation */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-300 mb-1.5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-yellow-400" /> Saturation
                    </span>
                    <span className="font-semibold">{state.saturation}</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={state.saturation}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        saturation: parseInt(e.target.value),
                      }))
                    }
                    onMouseUp={() => pushState(state)}
                    className="w-full accent-yellow-400 bg-[#252834] rounded-lg h-2"
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Presets & Filters */}
            {activeTab === 'filters' && (
              <div className="space-y-4 bg-[#1A1D26] p-5 rounded-3xl border border-[#282C37]">
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">
                  Color Presets
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {PRESET_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() =>
                        pushState({
                          ...state,
                          filter: f.id,
                        })
                      }
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                        state.filter === f.id
                          ? 'border-yellow-400 bg-yellow-400/15 shadow-md shadow-yellow-400/10'
                          : 'border-[#2D313E] bg-[#222530] hover:border-neutral-500'
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-full mb-2"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="text-xs font-bold text-white">
                        {f.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Continue Action */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-black font-extrabold py-3.5 px-6 rounded-2xl transition-all shadow-xl shadow-yellow-400/20 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Continue to Post</span>
                  <Check className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
