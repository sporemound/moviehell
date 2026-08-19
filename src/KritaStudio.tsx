import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  CANVAS_PRESET_COLORS,
  DEFAULT_CANVAS_LAYERS,
  DEFAULT_CINEMA_SWATCHES,
  KRITA_BRUSH_PRESETS,
  floodFillCanvas,
  formatRefillCountdown,
  hexToRgb,
  hsvToHex,
  paintStroke,
  rgbToHsv,
  smoothPoints,
  type BrushPresetInfo,
  type DrawableStroke,
} from './canvasUtils';
import type {
  CanvasAspectRatio,
  CanvasBlendMode,
  CanvasLayer,
  CanvasPoint,
  CanvasStabilizerMode,
  CanvasStroke,
  CanvasStrokeDraft,
  CanvasSymmetryMode,
  CanvasTool,
} from './types';

export interface KritaStudioProps {
  roomName: string;
  strokes: CanvasStroke[];
  epoch: number;
  connected: boolean;
  activePage: number;
  refillAt?: number;
  onChangePage: (page: number) => void;
  onStroke: (stroke: CanvasStrokeDraft) => void;
  aspectRatio: CanvasAspectRatio;
  setAspectRatio: (ratio: CanvasAspectRatio) => void;
  notice?: string;
  onPopOut?: () => void;
  isPopout?: boolean;
  layers?: CanvasLayer[];
  onChangeLayers?: (layers: CanvasLayer[]) => void;
  onDeleteLayerStrokes?: (layerId: number) => void;
}

export function KritaStudio({
  roomName,
  strokes,
  epoch,
  connected,
  activePage,
  refillAt,
  onChangePage,
  onStroke,
  aspectRatio,
  setAspectRatio,
  notice,
  onPopOut,
  isPopout,
  layers: externalLayers,
  onChangeLayers,
  onDeleteLayerStrokes,
}: KritaStudioProps) {
  // Primary Tool State
  const [activeTool, setActiveTool] = useState<CanvasTool>('pen');
  const [color, setColor] = useState('#f3d899');
  const [fillColor, setFillColor] = useState('transparent');
  const [brushWidth, setBrushWidth] = useState(4);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [blendMode, setBlendMode] = useState<CanvasBlendMode>('source-over');
  const [symmetry, setSymmetry] = useState<CanvasSymmetryMode>('none');
  const [stabilizer, setStabilizer] = useState<CanvasStabilizerMode>('basic');
  const [customSwatches, setCustomSwatches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mh_custom_swatches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const unique = Array.from(new Set(parsed.map((c: string) => String(c).toLowerCase())));
          // If the user's storage was corrupted by duplicate color floods, restore default
          if (unique.length >= 4) {
            return parsed;
          }
        }
      }
    } catch {}
    return DEFAULT_CINEMA_SWATCHES;
  });
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mh_recent_colors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['#f3d899', '#00e5ff', '#e23b3b', '#39ff14', '#ff2d75', '#ffffff', '#1a1815', '#6b7280'];
  });

  useEffect(() => {
    try {
      localStorage.setItem('mh_custom_swatches', JSON.stringify(customSwatches));
    } catch {}
  }, [customSwatches]);

  useEffect(() => {
    try {
      localStorage.setItem('mh_recent_colors', JSON.stringify(recentColors));
    } catch {}
  }, [recentColors]);

  // Layers State (Synchronized with external or local state)
  const [localLayers, setLocalLayers] = useState<CanvasLayer[]>(DEFAULT_CANVAS_LAYERS);
  const layers = externalLayers && externalLayers.length > 0 ? externalLayers : localLayers;
  const [activeLayerId, setActiveLayerId] = useState(2);

  const updateLayers = (updater: CanvasLayer[] | ((prev: CanvasLayer[]) => CanvasLayer[])) => {
    const nextLayers = typeof updater === 'function' ? updater(layers) : updater;
    setLocalLayers(nextLayers);
    onChangeLayers?.(nextLayers);
  };

  // Viewport Navigation (Zoom, Pan, Rotate, Flip)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isFlippedH, setIsFlippedH] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);

  // Radial Pop-up HUD Palette
  const [hudPos, setHudPos] = useState<{ x: number; y: number } | null>(null);
  const [activeDocker, setActiveDocker] = useState<'color' | 'presets' | 'layers' | 'history'>('color');
  const [dockersOpen, setDockersOpen] = useState(true);

  // History Stack for Local Undo / Redo
  const [historyStrokes, setHistoryStrokes] = useState<CanvasStrokeDraft[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasStrokeDraft[]>([]);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<number | null>(null);
  const previewRef = useRef<DrawableStroke | null>(null);
  const polygonPointsRef = useRef<CanvasPoint[]>([]);
  const isSpacePressedRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        isSpacePressedRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Push recent color
  const pushRecentColor = (newColor: string) => {
    const trimmed = newColor.trim();
    if (!trimmed) return;
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== trimmed.toLowerCase());
      return [trimmed, ...filtered].slice(0, 16);
    });
  };

  // Primary color selection helper - updates active drawing color & tool without corrupting custom swatches
  const selectColor = (newColor: string, shouldPushRecent = true) => {
    let formatted = newColor.trim();
    if (!formatted.startsWith('#') && /^[0-9a-f]{6}$/i.test(formatted)) {
      formatted = '#' + formatted;
    }
    setColor(formatted);
    if (shouldPushRecent && /^#[0-9a-f]{6}$/i.test(formatted)) {
      pushRecentColor(formatted);
    }
    // If active tool was eraser, hand, or eyedropper, automatically switch back to drawing pen
    if (
      activeTool === 'eraser' ||
      activeTool === 'eraser_soft' ||
      activeTool === 'hand' ||
      activeTool === 'eyedropper'
    ) {
      setActiveTool('pen');
    }
    if (blendMode === 'destination-out') {
      setBlendMode('source-over');
    }
  };

  // Add current active color to palette swatches
  const addCurrentColorToSwatches = () => {
    const hex = color.trim();
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
    setCustomSwatches((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== hex.toLowerCase());
      return [hex, ...filtered].slice(0, 36);
    });
  };

  // Reset to default Cinema House Palette
  const resetToDefaultSwatches = () => {
    setCustomSwatches(DEFAULT_CINEMA_SWATCHES);
    try {
      localStorage.setItem('mh_custom_swatches', JSON.stringify(DEFAULT_CINEMA_SWATCHES));
    } catch {}
  };

  // Remove swatch on right click
  const removeSwatch = (swatchColor: string, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCustomSwatches((prev) => {
      const remaining = prev.filter((c) => c.toLowerCase() !== swatchColor.toLowerCase());
      return remaining.length > 0 ? remaining : DEFAULT_CINEMA_SWATCHES;
    });
  };

  // Select brush preset
  const selectBrushPreset = (preset: BrushPresetInfo) => {
    setActiveTool(preset.id);
    setBrushWidth(preset.defaultWidth);
    setBrushOpacity(preset.defaultOpacity);
    if (preset.id === 'neon') setBlendMode('screen');
    else if (preset.id === 'watercolor') setBlendMode('multiply');
    else if (preset.id === 'eraser' || preset.id === 'eraser_soft') setBlendMode('destination-out');
    else setBlendMode('source-over');
  };

  // Filter strokes for current page
  const pageStrokes = strokes.filter((s) => (s.pageIndex || 1) === activePage);

  // Redraw canvas with high-DPI and isolated multi-layer compositing
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(10, Math.floor(rect.width * dpr));
    const displayHeight = Math.max(10, Math.floor(rect.height * dpr));

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Draw background texture (classic subtle dark canvas)
    ctx.fillStyle = 'rgba(18, 16, 14, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines if in Pixel mode
    if (activeTool === 'pixel' && zoom >= 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.5;
      const step = 8 * zoom;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Prepare offscreen canvas buffer for isolated layer rendering
    let layerCanvas = layerCanvasRef.current;
    if (!layerCanvas) {
      layerCanvas = document.createElement('canvas');
      layerCanvasRef.current = layerCanvas;
    }
    if (layerCanvas.width !== displayWidth || layerCanvas.height !== displayHeight) {
      layerCanvas.width = displayWidth;
      layerCanvas.height = displayHeight;
    }
    const layerCtx = layerCanvas.getContext('2d');

    // Render strokes layer-by-layer with isolated composite bounds
    for (const layer of layers) {
      if (!layer.visible) continue;
      if (!layerCtx) continue;

      layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      layerCtx.clearRect(0, 0, displayWidth, displayHeight);
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Render room strokes on this layer
      for (const stroke of pageStrokes) {
        const strokeLayerId = stroke.layerId || 2;
        if (strokeLayerId === layer.id) {
          paintStroke(layerCtx, stroke, w, h);
        }
      }

      // Render local preview stroke on active layer
      if (previewRef.current && (previewRef.current.layerId || activeLayerId) === layer.id) {
        paintStroke(layerCtx, previewRef.current, w, h);
      }

      // Composite the layer onto the main canvas
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
      if (layer.blendMode && layer.blendMode !== 'source-over') {
        ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      } else {
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(layerCanvas, 0, 0, w, h);
      ctx.restore();
    }

    // Render symmetry guide lines if active
    if (symmetry !== 'none') {
      ctx.save();
      ctx.strokeStyle = 'rgba(243, 216, 153, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      if (symmetry === 'mirror-h' || symmetry === 'radial-4' || symmetry === 'radial-8') {
        ctx.beginPath();
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        ctx.stroke();
      }

      if (symmetry === 'mirror-v' || symmetry === 'radial-4' || symmetry === 'radial-8') {
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      if (symmetry === 'radial-8') {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, h);
        ctx.moveTo(w, 0);
        ctx.lineTo(0, h);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  };

  useEffect(() => {
    redraw();
  }, [pageStrokes, activePage, layers, activeLayerId, symmetry, activeTool, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => redraw();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    redraw();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [aspectRatio, activePage]);

  // Coordinate Conversion with Viewport Transforms
  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): CanvasPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;

    let x = (event.clientX - bounds.left) / bounds.width;
    let y = (event.clientY - bounds.top) / bounds.height;

    if (isFlippedH) x = 1 - x;

    const clampedX = Math.min(1, Math.max(0, x));
    const clampedY = Math.min(1, Math.max(0, y));
    const pressure = event.pressure !== undefined && event.pressure > 0 ? event.pressure : 0.65;

    return Number.isFinite(clampedX) && Number.isFinite(clampedY)
      ? { x: clampedX, y: clampedY, p: pressure }
      : null;
  };

  const appendPoint = (point: CanvasPoint) => {
    const preview = previewRef.current;
    if (!preview) return;
    const last = preview.points[preview.points.length - 1];
    if (last) {
      const distanceSquared = (point.x - last.x) ** 2 + (point.y - last.y) ** 2;
      if (distanceSquared < 0.000002) return;
    }

    const currentPoints = [...preview.points, point];
    const smoothed = smoothPoints(currentPoints, stabilizer);

    let finalPoints = smoothed;
    if (finalPoints.length > 120) {
      const step = Math.ceil(finalPoints.length / 100);
      const reduced: CanvasPoint[] = [finalPoints[0]];
      for (let i = step; i < finalPoints.length - 1; i += step) {
        reduced.push(finalPoints[i]);
      }
      reduced.push(finalPoints[finalPoints.length - 1]);
      finalPoints = reduced;
    }

    preview.points = finalPoints;
    redraw();
  };

  // Pointer Handlers
  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Check for middle click or Spacebar pan
    if (event.button === 1 || activeTool === 'hand' || isSpacePressedRef.current) {
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!connected || !event.isPrimary || event.button !== 0) return;

    // Check layer lock
    const currentLayer = layers.find((l) => l.id === activeLayerId);
    if (currentLayer?.locked) {
      alert('This layer is locked. Unlock it in the Layers docker to paint.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Eyedropper Tool
    if (activeTool === 'eyedropper' || event.altKey) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const bounds = canvas.getBoundingClientRect();
        const px = Math.floor((event.clientX - bounds.left) * (canvas.width / bounds.width));
        const py = Math.floor((event.clientY - bounds.top) * (canvas.height / bounds.height));
        const pixel = ctx.getImageData(px, py, 1, 1).data;
        const sampledHex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
        selectColor(sampledHex);
      }
      return;
    }

    // Flood Fill Tool
    if (activeTool === 'bucket') {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const bounds = canvas.getBoundingClientRect();
        const px = Math.floor((event.clientX - bounds.left) * (canvas.width / bounds.width));
        const py = Math.floor((event.clientY - bounds.top) * (canvas.height / bounds.height));
        floodFillCanvas(ctx, px, py, color, 32);
        pushRecentColor(color);
      }
      return;
    }

    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();

    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);

    // Polygon Multi-point Mode
    if (activeTool === 'polygon') {
      polygonPointsRef.current.push(point);
      previewRef.current = {
        tool: 'polygon',
        color,
        fillColor: fillColor !== 'transparent' ? fillColor : undefined,
        width: brushWidth,
        opacity: brushOpacity,
        blendMode,
        symmetry,
        points: [...polygonPointsRef.current],
      };
      redraw();
      return;
    }

    previewRef.current = {
      tool: activeTool,
      color,
      fillColor: fillColor !== 'transparent' ? fillColor : undefined,
      width: brushWidth,
      opacity: brushOpacity,
      blendMode,
      symmetry,
      points: [point],
    };
    redraw();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (isPanning && panStartRef.current) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      setPan({
        x: panStartRef.current.startPanX + dx,
        y: panStartRef.current.startPanY + dy,
      });
      return;
    }

    if (pointerRef.current !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();

    // Geometric Shapes (Line, Rect, Ellipse)
    if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'ellipse') {
      const preview = previewRef.current;
      if (preview && preview.points.length > 0) {
        let finalPoint = point;
        // Shift constraint: snap to 45 deg or 1:1 box
        if (event.shiftKey) {
          const origin = preview.points[0];
          const dx = Math.abs(point.x - origin.x);
          const dy = Math.abs(point.y - origin.y);
          const maxD = Math.max(dx, dy);
          finalPoint = {
            x: origin.x + Math.sign(point.x - origin.x) * maxD,
            y: origin.y + Math.sign(point.y - origin.y) * maxD,
            p: point.p,
          };
        }
        preview.points = [preview.points[0], finalPoint];
        redraw();
      }
      return;
    }

    if (activeTool !== 'polygon') {
      appendPoint(point);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (pointerRef.current !== event.pointerId) return;

    if (activeTool !== 'polygon') {
      const point = pointFromEvent(event);
      if (point) appendPoint(point);
      const preview = previewRef.current;
      if (preview && preview.points.length > 0) {
        let points = preview.points.length === 1 ? [preview.points[0], preview.points[0]] : preview.points;
        if (points.length > 120) {
          const step = Math.ceil(points.length / 100);
          const reduced: CanvasPoint[] = [points[0]];
          for (let i = step; i < points.length - 1; i += step) {
            reduced.push(points[i]);
          }
          reduced.push(points[points.length - 1]);
          points = reduced;
        }
        const draft: CanvasStrokeDraft = {
          clientId: crypto.randomUUID(),
          pageIndex: activePage,
          layerId: activeLayerId,
          tool: preview.tool,
          color: preview.color,
          fillColor: preview.fillColor,
          width: Math.min(120, Math.max(1, Math.round(preview.width))),
          opacity: preview.opacity,
          blendMode: preview.blendMode,
          symmetry: preview.symmetry,
          points,
        };
        onStroke(draft);
        setHistoryStrokes((prev) => [...prev, draft]);
        setRedoStack([]);
        pushRecentColor(preview.color);
      }
      pointerRef.current = null;
      previewRef.current = null;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    redraw();
  };

  // Finish Polygon on Double Click
  const handleDoubleClick = () => {
    if (activeTool === 'polygon' && polygonPointsRef.current.length >= 3) {
      const draft: CanvasStrokeDraft = {
        clientId: crypto.randomUUID(),
        pageIndex: activePage,
        layerId: activeLayerId,
        tool: 'polygon',
        color,
        fillColor: fillColor !== 'transparent' ? fillColor : undefined,
        width: brushWidth,
        opacity: brushOpacity,
        blendMode,
        symmetry,
        points: [...polygonPointsRef.current],
      };
      onStroke(draft);
      polygonPointsRef.current = [];
      previewRef.current = null;
      redraw();
    }
  };

  // Zoom with Wheel
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const zoomFactor = event.deltaY < 0 ? 1.15 : 0.85;
      setZoom((z) => Math.min(4, Math.max(0.25, z * zoomFactor)));
    }
  };

  // Right-click Radial HUD Palette
  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    setHudPos({ x: event.clientX, y: event.clientY });
  };

  // Close HUD on click outside
  useEffect(() => {
    const closeHud = () => setHudPos(null);
    window.addEventListener('click', closeHud);
    return () => window.removeEventListener('click', closeHud);
  }, []);

  // Keyboard Shortcuts (Ctrl+Z Undo, Ctrl+Y Redo, B Brush, E Eraser, Space Pan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        // Undo
        if (historyStrokes.length > 0) {
          const last = historyStrokes[historyStrokes.length - 1];
          setHistoryStrokes((prev) => prev.slice(0, -1));
          setRedoStack((prev) => [...prev, last]);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        // Redo
        if (redoStack.length > 0) {
          const next = redoStack[redoStack.length - 1];
          setRedoStack((prev) => prev.slice(0, -1));
          onStroke(next);
        }
      } else if (e.key === 'b' || e.key === 'B') {
        setActiveTool('pen');
      } else if (e.key === 'e' || e.key === 'E') {
        setActiveTool('eraser');
      } else if (e.key === 'i' || e.key === 'I') {
        setActiveTool('eyedropper');
      } else if (e.key === 'g' || e.key === 'G') {
        setActiveTool('bucket');
      } else if (e.key === '[' && brushWidth > 1) {
        setBrushWidth((w) => Math.max(1, w - 2));
      } else if (e.key === ']' && brushWidth < 120) {
        setBrushWidth((w) => Math.min(120, w + 2));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyStrokes, redoStack, brushWidth]);

  // Export Artwork as PNG
  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `cinema-atelier-${roomName.toLowerCase().replace(/\s+/g, '-')}-reel${activePage}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Color Wheel Drag Calculations
  const handleWheelClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    const h = Math.round(angle);
    const hex = hsvToHex(h, 85, 95);
    selectColor(hex);
  };

  return (
    <div id="krita-studio-workbench" className="krita-studio" onWheel={handleWheel}>
      {/* TOP HEADER: Reel Pages, 24h Countdown & Aspect Ratio */}
      <header className="krita-top-header">
        <div className="krita-reel-tabs" role="tablist" aria-label="Reel Pages">
          <span className="krita-header-title">🎨 Cinema Atelier</span>
          <div className="krita-film-strip">
            {[1, 2, 3, 4, 5].map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={`krita-reel-btn ${activePage === pageNum ? 'active' : ''}`}
                onClick={() => onChangePage(pageNum)}
                aria-pressed={activePage === pageNum}
                title={`Switch to collaborative canvas Reel Page ${pageNum} of 5`}
              >
                🎞️ Reel {pageNum}
              </button>
            ))}
          </div>
        </div>

        {refillAt && (
          <div className="krita-refill-badge" title="All 5 pages refill automatically every 24 hours">
            ⏳ Daily Refill in: <strong>{formatRefillCountdown(refillAt)}</strong>
          </div>
        )}

        <div className="krita-header-actions">
          <select
            id="krita-aspect-ratio"
            className="krita-select-sm"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as CanvasAspectRatio)}
            title="Screen canvas aspect ratio"
          >
            <option value="16:9">📺 16:9 Widescreen</option>
            <option value="4:3">📼 4:3 35mm Academy</option>
            <option value="2.39:1">🎬 2.39:1 Panavision</option>
            <option value="1:1">⏹️ 1:1 Square Art</option>
          </select>

          <button
            type="button"
            className="krita-btn-header"
            onClick={handleExportPng}
            title="Download high-resolution PNG artwork"
          >
            💾 Export PNG
          </button>

          {onPopOut && !isPopout && (
            <button
              type="button"
              className="krita-btn-header krita-btn-popout"
              onClick={onPopOut}
              title="Open Cinema Atelier in a detached companion pop-out window"
              aria-label="Open Cinema Atelier in a detached companion window"
            >
              🪟 Pop-Out Atelier
            </button>
          )}

          {isPopout && (
            <span className="krita-popout-badge" title="Standalone Window Mode">
              🗗 Standalone Studio
            </span>
          )}
        </div>
      </header>

      {/* TOP TOOL OPTIONS BAR */}
      <div className="krita-options-bar">
        <div className="krita-opt-group">
          <span className="krita-tool-badge">
            {KRITA_BRUSH_PRESETS.find((p) => p.id === activeTool)?.icon || '✏️'}{' '}
            {KRITA_BRUSH_PRESETS.find((p) => p.id === activeTool)?.name || activeTool.toUpperCase()}
          </span>
        </div>

        {/* Size Slider & Input */}
        <div className="krita-opt-group">
          <label htmlFor="krita-brush-size">Size:</label>
          <input
            id="krita-brush-size"
            type="range"
            min="1"
            max="120"
            value={brushWidth}
            onChange={(e) => setBrushWidth(Number(e.target.value))}
            className="krita-slider"
          />
          <span className="krita-val-pill">{brushWidth}px</span>
          <div className="krita-quick-sizes">
            {[2, 4, 8, 16, 32, 64].map((sz) => (
              <button
                key={sz}
                type="button"
                className={`krita-size-dot ${brushWidth === sz ? 'selected' : ''}`}
                onClick={() => setBrushWidth(sz)}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        {/* Opacity Slider */}
        <div className="krita-opt-group">
          <label htmlFor="krita-brush-opacity">Opacity:</label>
          <input
            id="krita-brush-opacity"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={brushOpacity}
            onChange={(e) => setBrushOpacity(Number(e.target.value))}
            className="krita-slider"
          />
          <span className="krita-val-pill">{Math.round(brushOpacity * 100)}%</span>
        </div>

        {/* Stabilizer Selector */}
        <div className="krita-opt-group">
          <label htmlFor="krita-stabilizer">Smoothing:</label>
          <select
            id="krita-stabilizer"
            value={stabilizer}
            onChange={(e) => setStabilizer(e.target.value as CanvasStabilizerMode)}
            className="krita-select-sm"
          >
            <option value="off">Off (Raw)</option>
            <option value="basic">Basic Average</option>
            <option value="weighted">Weighted Smooth</option>
            <option value="krita">Krita Leash Delay</option>
          </select>
        </div>

        {/* Symmetry Guide Selector */}
        <div className="krita-opt-group">
          <label htmlFor="krita-symmetry">Symmetry:</label>
          <select
            id="krita-symmetry"
            value={symmetry}
            onChange={(e) => setSymmetry(e.target.value as CanvasSymmetryMode)}
            className="krita-select-sm"
          >
            <option value="none">None</option>
            <option value="mirror-h">🪞 Horizontal Mirror (X)</option>
            <option value="mirror-v">🪞 Vertical Mirror (Y)</option>
            <option value="radial-4">❄️ 4-Way Radial</option>
            <option value="radial-8">❄️ 8-Way Mandala</option>
          </select>
        </div>

        {/* Viewport Reset / Flip Buttons & Dockers Toggle */}
        <div className="krita-opt-group right-aligned">
          <button
            type="button"
            className={`krita-btn-icon ${isFlippedH ? 'active' : ''}`}
            onClick={() => setIsFlippedH((f) => !f)}
            title="Mirror / Flip Canvas Horizontally (Artist Sanity Check)"
          >
            🪞 Flip
          </button>
          <button
            type="button"
            className="krita-btn-icon"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setRotation(0);
              setIsFlippedH(false);
            }}
            title="Reset View / Fit to Screen"
          >
            🎯 100%
          </button>
          <button
            type="button"
            className={`krita-btn-icon ${dockersOpen ? 'active' : ''}`}
            onClick={() => setDockersOpen((d) => !d)}
            title={dockersOpen ? 'Collapse side dockers panel' : 'Expand side dockers panel (Color, Layers, Brushes)'}
            aria-label="Toggle studio dockers panel"
          >
            📑 Dockers
          </button>
        </div>
      </div>

      {/* MAIN WORKBENCH LAYOUT: Tools (Left), Canvas (Center), Dockers (Right) */}
      <div className="krita-main-deck">
        {/* LEFT TOOL SHELF */}
        <aside className="krita-tool-shelf" aria-label="Painting Tools">
          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[0])}
            title="G-Pen Inker (B)"
          >
            ✒️
            <span>Inker</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'pencil' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[1])}
            title="2B Graphite Pencil"
          >
            ✏️
            <span>Pencil</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'airbrush' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[2])}
            title="Soft Airbrush"
          >
            💨
            <span>Airbrush</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'watercolor' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[3])}
            title="Wet Watercolor"
          >
            💧
            <span>Wash</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'neon' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[4])}
            title="Neon Saber Bloom"
          >
            🌟
            <span>Neon</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'chalk' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[5])}
            title="Rough Pastel Chalk"
          >
            🖍️
            <span>Chalk</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'marker' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[6])}
            title="Chisel Highlighter"
          >
            🪚
            <span>Marker</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'pixel' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[7])}
            title="1px Pixel Art"
          >
            🟨
            <span>Pixel</span>
          </button>

          <div className="krita-tool-sep" />

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'line' ? 'active' : ''}`}
            onClick={() => setActiveTool('line')}
            title="Straight Line (Hold Shift for angles)"
          >
            📏
            <span>Line</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setActiveTool('rectangle')}
            title="Rectangle Tool"
          >
            🔲
            <span>Rect</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'ellipse' ? 'active' : ''}`}
            onClick={() => setActiveTool('ellipse')}
            title="Ellipse / Circle Tool"
          >
            ⭕
            <span>Circle</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'polygon' ? 'active' : ''}`}
            onClick={() => setActiveTool('polygon')}
            title="Polygon Tool (Double click to finish)"
          >
            📐
            <span>Poly</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'bucket' ? 'active' : ''}`}
            onClick={() => setActiveTool('bucket')}
            title="Flood Fill Bucket (G)"
          >
            🪣
            <span>Fill</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'eyedropper' ? 'active' : ''}`}
            onClick={() => setActiveTool('eyedropper')}
            title="Color Eyedropper (I / Alt+Click)"
          >
            🔍
            <span>Pipette</span>
          </button>

          <div className="krita-tool-sep" />

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[8])}
            title="Hard Vinyl Eraser (E)"
          >
            🧹
            <span>Eraser</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'eraser_soft' ? 'active' : ''}`}
            onClick={() => selectBrushPreset(KRITA_BRUSH_PRESETS[9])}
            title="Soft Kneaded Eraser"
          >
            🧽
            <span>Soft Erase</span>
          </button>

          <button
            type="button"
            className={`krita-tool-btn ${activeTool === 'hand' ? 'active' : ''}`}
            onClick={() => setActiveTool('hand')}
            title="Pan / Hand Tool (Spacebar + Drag)"
          >
            🖐️
            <span>Pan</span>
          </button>
        </aside>

        {/* CENTER CANVAS VIEWPORT WITH DUAL SCROLLBARS */}
        <main className="krita-viewport" aria-label="Studio Canvas Viewport">
          <div className="krita-viewport-scroll-area">
            <div
              className="krita-canvas-transform-wrapper"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) ${isFlippedH ? 'scaleX(-1)' : ''}`,
                transformOrigin: 'center center',
              }}
            >
              <div className={`canvas-frame canvas-ratio-${aspectRatio.replace(':', '-').replace('.', '_')}`}>
                <canvas
                  ref={canvasRef}
                  className="krita-canvas-surface"
                  tabIndex={0}
                  role="img"
                  aria-label={`Cinema Atelier Digital Studio for ${roomName} - Reel ${activePage}`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onDoubleClick={handleDoubleClick}
                  onContextMenu={handleContextMenu}
                />
              </div>
            </div>
          </div>
        </main>

        {/* RIGHT DOCKERS DOCK */}
        <aside className={`krita-dockers-dock ${dockersOpen ? 'open' : 'closed'}`} aria-label="Studio Dockers">
          <nav className="krita-docker-tabs">
            <button
              type="button"
              className={`krita-docker-tab-btn ${activeDocker === 'color' ? 'active' : ''}`}
              onClick={() => setActiveDocker('color')}
            >
              🎨 Color
            </button>
            <button
              type="button"
              className={`krita-docker-tab-btn ${activeDocker === 'presets' ? 'active' : ''}`}
              onClick={() => setActiveDocker('presets')}
            >
              🖌️ Brushes
            </button>
            <button
              type="button"
              className={`krita-docker-tab-btn ${activeDocker === 'layers' ? 'active' : ''}`}
              onClick={() => setActiveDocker('layers')}
            >
              📑 Layers ({layers.length})
            </button>
            <button
              type="button"
              className={`krita-docker-tab-btn ${activeDocker === 'history' ? 'active' : ''}`}
              onClick={() => setActiveDocker('history')}
            >
              📜 History
            </button>
          </nav>

          <div className="krita-docker-content">
            {/* DOCKER 1: COLOR WHEEL & PALETTE */}
            {activeDocker === 'color' && (
              <div className="krita-docker-panel">
                <div className="krita-color-wheel-wrapper" onClick={handleWheelClick}>
                  <div className="krita-color-wheel-ring" />
                  <div
                    className="krita-color-wheel-center"
                    style={{ backgroundColor: color }}
                    title="Active Color"
                  />
                </div>

                <div className="krita-color-inputs">
                  <div className="krita-hex-row">
                    <label htmlFor="krita-hex-input">HEX:</label>
                    <input
                      id="krita-hex-input"
                      type="text"
                      value={color}
                      onChange={(e) => selectColor(e.target.value)}
                      className="krita-hex-input"
                      placeholder="#ffffff"
                    />
                    <input
                      type="color"
                      value={color.startsWith('#') && color.length === 7 ? color : '#f3d899'}
                      onInput={(e) => selectColor(e.currentTarget.value)}
                      onChange={(e) => selectColor(e.currentTarget.value)}
                      className="krita-native-picker"
                      title="Screen Color Picker"
                    />
                    <button
                      type="button"
                      className="krita-mini-add-btn add-swatch-btn"
                      onClick={addCurrentColorToSwatches}
                      title="Save active color to Palette Swatches"
                    >
                      ➕ Add Swatch
                    </button>
                  </div>

                  <div className="krita-swatches-section">
                    <div className="krita-swatches-header">
                      <span className="krita-section-label" style={{ margin: 0 }}>Palette Swatches ({customSwatches.length}):</span>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="krita-mini-add-btn"
                          onClick={addCurrentColorToSwatches}
                          title="Save active color to palette swatches"
                        >
                          ➕ Add
                        </button>
                        <button
                          type="button"
                          className="krita-mini-add-btn"
                          onClick={resetToDefaultSwatches}
                          title="Reset to default 16-color Cinema House Palette"
                          style={{ color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                        >
                          ↺ Reset
                        </button>
                      </div>
                    </div>
                    <div className="krita-swatch-matrix" role="radiogroup" aria-label="Palette Swatches">
                      {customSwatches.map((c, i) => (
                        <button
                          key={`swatch-${c}-${i}`}
                          type="button"
                          className={`krita-swatch-cell ${color.toLowerCase() === c.toLowerCase() ? 'selected' : ''}`}
                          style={{ backgroundColor: c }}
                          onClick={() => selectColor(c)}
                          onContextMenu={(e) => removeSwatch(c, e)}
                          title={`Color: ${c} (Right-click to remove)`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="krita-swatches-section">
                    <span className="krita-section-label">Recent Colors:</span>
                    <div className="krita-swatch-matrix" role="radiogroup" aria-label="Recent Swatches">
                      {recentColors.map((c, i) => (
                        <button
                          key={`recent-${c}-${i}`}
                          type="button"
                          className={`krita-swatch-cell ${color.toLowerCase() === c.toLowerCase() ? 'selected' : ''}`}
                          style={{ backgroundColor: c }}
                          onClick={() => selectColor(c)}
                          title={`Recent: ${c}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="krita-preset-palette">
                    <span className="krita-section-label">Cinema House Palette:</span>
                    <div className="krita-palette-grid">
                      {CANVAS_PRESET_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          className={`krita-swatch-chip ${color.toLowerCase() === c.value.toLowerCase() ? 'selected' : ''}`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => selectColor(c.value)}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DOCKER 2: BRUSH PRESETS */}
            {activeDocker === 'presets' && (
              <div className="krita-docker-panel">
                <div className="krita-presets-list">
                  {KRITA_BRUSH_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`krita-preset-card ${activeTool === preset.id ? 'active' : ''}`}
                      onClick={() => selectBrushPreset(preset)}
                    >
                      <span className="krita-preset-icon">{preset.icon}</span>
                      <div className="krita-preset-info">
                        <strong>{preset.name}</strong>
                        <p>{preset.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DOCKER 3: MULTI-LAYER DOCKER */}
            {activeDocker === 'layers' && (
              <div className="krita-docker-panel">
                <div className="krita-layer-tools">
                  <button
                    type="button"
                    className="krita-btn-sm"
                    onClick={() => {
                      if (layers.length >= 6) return;
                      const nextId = Math.max(...layers.map((l) => l.id), 0) + 1;
                      updateLayers((prev) => [
                        ...prev,
                        {
                          id: nextId,
                          name: `Layer ${nextId}`,
                          visible: true,
                          locked: false,
                          opacity: 1,
                          blendMode: 'source-over',
                        },
                      ]);
                      setActiveLayerId(nextId);
                    }}
                  >
                    ➕ Add Layer
                  </button>
                  <button
                    type="button"
                    className="krita-btn-sm"
                    disabled={layers.length <= 1}
                    onClick={() => {
                      if (layers.length <= 1) return;
                      const layerToDelete = activeLayerId;
                      onDeleteLayerStrokes?.(layerToDelete);
                      const remaining = layers.filter((l) => l.id !== layerToDelete);
                      updateLayers(remaining);
                      setActiveLayerId(remaining[0]?.id || 1);
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>

                <div className="krita-layer-stack">
                  {[...layers].reverse().map((layer) => (
                    <div
                      key={layer.id}
                      className={`krita-layer-row ${activeLayerId === layer.id ? 'active' : ''}`}
                      onClick={() => setActiveLayerId(layer.id)}
                    >
                      <div className="krita-layer-controls">
                        <button
                          type="button"
                          className="krita-layer-icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateLayers((prev) =>
                              prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)),
                            );
                          }}
                          title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                        >
                          {layer.visible ? '👁️' : '🕶️'}
                        </button>
                        <button
                          type="button"
                          className="krita-layer-icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateLayers((prev) =>
                              prev.map((l) => (l.id === layer.id ? { ...l, locked: !l.locked } : l)),
                            );
                          }}
                          title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                        >
                          {layer.locked ? '🔒' : '🔓'}
                        </button>
                      </div>

                      <div className="krita-layer-meta">
                        <span className="krita-layer-name">{layer.name}</span>
                        <div className="krita-layer-blend">
                          <select
                            value={layer.blendMode}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const mode = e.target.value as CanvasBlendMode;
                              updateLayers((prev) =>
                                prev.map((l) => (l.id === layer.id ? { ...l, blendMode: mode } : l)),
                              );
                            }}
                            className="krita-select-xs"
                          >
                            <option value="source-over">Normal</option>
                            <option value="multiply">Multiply</option>
                            <option value="screen">Screen</option>
                            <option value="overlay">Overlay</option>
                            <option value="color-dodge">Color Dodge</option>
                            <option value="darken">Darken</option>
                            <option value="lighten">Lighten</option>
                            <option value="difference">Difference</option>
                          </select>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={layer.opacity}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const op = Number(e.target.value);
                              updateLayers((prev) =>
                                prev.map((l) => (l.id === layer.id ? { ...l, opacity: op } : l)),
                              );
                            }}
                            className="krita-layer-slider"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DOCKER 4: HISTORY */}
            {activeDocker === 'history' && (
              <div className="krita-docker-panel">
                <div className="krita-history-list">
                  <div className="krita-history-item active">
                    <span>🎬 Initial Canvas State (Epoch {epoch})</span>
                  </div>
                  {pageStrokes.map((s, idx) => {
                    const authorName = typeof s.author === 'string' ? s.author : (s.author?.nickname || 'Artist');
                    return (
                      <div key={s.id || idx} className="krita-history-item">
                        <span>
                          #{idx + 1} {s.tool.toUpperCase()} ({authorName})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* FLOATING RADIAL POP-UP HUD PALETTE (RIGHT-CLICK) */}
      {hudPos && (
        <div
          className="krita-radial-hud"
          style={{
            left: `${Math.min(window.innerWidth - 260, Math.max(10, hudPos.x - 120))}px`,
            top: `${Math.min(window.innerHeight - 260, Math.max(10, hudPos.y - 120))}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Circular Brush Presets Ring */}
          <div className="krita-hud-brushes-ring">
            {KRITA_BRUSH_PRESETS.slice(0, 8).map((p, idx) => {
              const angle = (idx * 45 * Math.PI) / 180;
              const radius = 95;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`krita-hud-brush-btn ${activeTool === p.id ? 'active' : ''}`}
                  style={{
                    transform: `translate(${x}px, ${y}px)`,
                  }}
                  onClick={() => {
                    selectBrushPreset(p);
                    setHudPos(null);
                  }}
                  title={p.name}
                >
                  {p.icon}
                </button>
              );
            })}
          </div>

          {/* Center Color Selector */}
          <div
            className="krita-hud-center-wheel"
            style={{ backgroundColor: color }}
            title="Click to randomize or sample"
          >
            <input
              type="color"
              value={color.startsWith('#') && color.length === 7 ? color : '#f3d899'}
              onInput={(e) => selectColor(e.currentTarget.value)}
              onChange={(e) => selectColor(e.currentTarget.value)}
              className="krita-hud-color-picker"
            />
          </div>
        </div>
      )}

      {/* FOOTER STATUS BAR */}
      <footer className="krita-status-bar">
        <span>
          Reel Page {activePage}/5 • {pageStrokes.length} Strokes • Zoom: {Math.round(zoom * 100)}% •
          Rotation: {rotation}° {isFlippedH ? '• Flipped X' : ''}
        </span>
        <span className="krita-status-right">
          {connected ? '⚡ Live WebSocket Synced' : '⚠️ Offline'} • Right-click anywhere for Radial Palette
        </span>
      </footer>
    </div>
  );
}
