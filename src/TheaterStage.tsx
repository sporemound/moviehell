import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Hls from 'hls.js';
import {
  CANVAS_PRESET_COLORS,
  DEFAULT_CANVAS_LAYERS,
  KRITA_BRUSH_PRESETS,
  formatRefillCountdown,
  paintStroke,
  type DrawableStroke,
} from './canvasUtils';
import type {
  CanvasLayer,
  CanvasPoint,
  CanvasStroke,
  CanvasStrokeDraft,
  CanvasTool,
  CurtainState,
  StreamListing,
} from './types';

export type TheaterStageProps = {
  activeStream: StreamListing | null;
  allStreams: StreamListing[];
  onSelectStream: (stream: StreamListing) => void;
  onCloseTheater: () => void;
  isChatDocked?: boolean;
  onToggleChatDock?: () => void;
  onPopOutChat?: () => void;
  onPopOutCanvas?: () => void;
  // Canvas & Trace Mode Props
  canvasStrokes?: CanvasStroke[];
  canvasEpoch?: number;
  onCanvasStroke?: (stroke: CanvasStrokeDraft) => void;
  canvasActivePage?: number;
  onChangeCanvasPage?: (page: number) => void;
  canvasRefillAt?: number;
  roomName?: string;
  isRoomConnected?: boolean;
  canvasLayers?: CanvasLayer[];
  onChangeCanvasLayers?: (layers: CanvasLayer[]) => void;
  onDeleteCanvasLayerStrokes?: (layerId: number) => void;
};

// Subtle Web Audio sound synthesizer for authentic theater velvet curtain glide and chime
function playTheaterSound(type: 'open' | 'close' | 'chime') {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === 'open' || type === 'close') {
      const bufferSize = ctx.sampleRate * 1.2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(type === 'open' ? 450 : 380, now);
      filter.frequency.exponentialRampToValueAtTime(type === 'open' ? 750 : 250, now + 1.1);
      filter.Q.setValueAtTime(1.8, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 1.2);
    }

    if (type === 'chime' || type === 'open') {
      const osc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.9);

      chimeGain.gain.setValueAtTime(0.001, now + 0.1);
      chimeGain.gain.linearRampToValueAtTime(0.04, now + 0.15);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      osc.connect(chimeGain);
      chimeGain.connect(ctx.destination);

      osc.start(now + 0.1);
      osc.stop(now + 0.95);
    }
  } catch {
    // Audio context may be blocked by browser autoplay policy before gesture
  }
}

export function openPopOutPlayer(url: string, title = 'Movie Hell Player') {
  const width = Math.min(1120, window.screen.availWidth - 60);
  const height = Math.min(700, window.screen.availHeight - 60);
  const left = Math.max(0, (window.screen.width - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);
  window.open(
    url,
    `MovieHell_${title.replace(/[^a-zA-Z0-9]/g, '')}`,
    `width=${width},height=${height},top=${top},left=${left},status=no,menubar=no,toolbar=no,location=no,resizable=yes`
  );
}

export function streamEmbedUrl(stream: StreamListing): string {
  if (stream.platform === 'owncast') {
    if (stream.embedUrl && stream.embedUrl.trim() !== '') {
      return stream.embedUrl;
    }
    const host = (stream.channel || stream.provenance?.originDomain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (host && host.includes('.')) {
      return `https://${encodeURIComponent(host)}/embed/video`;
    }
    return stream.watchUrl;
  }
  if (stream.embedUrl && stream.embedUrl.trim() !== '') {
    return stream.embedUrl;
  }
  if (stream.platform === 'kick') {
    return `https://player.kick.com/${encodeURIComponent(stream.channel)}?autoplay=true&muted=false`;
  }
  if (stream.platform === 'picarto') {
    return `/api/proxy/picarto?channel=${encodeURIComponent(stream.channel)}`;
  }
  return stream.watchUrl;
}

export default function TheaterStage({
  activeStream,
  allStreams,
  onSelectStream,
  onCloseTheater,
  isChatDocked,
  onToggleChatDock,
  onPopOutChat,
  onPopOutCanvas,
  canvasStrokes = [],
  canvasEpoch = 0,
  onCanvasStroke,
  canvasActivePage = 1,
  onChangeCanvasPage,
  canvasRefillAt,
  roomName = 'Auditorium',
  isRoomConnected = false,
  canvasLayers,
  onChangeCanvasLayers,
  onDeleteCanvasLayerStrokes,
}: TheaterStageProps) {
  const [curtainState, setCurtainState] = useState<CurtainState>('closed');
  const [curtainsEnabled, setCurtainsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mh_theater_curtains_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHud, setShowFullscreenHud] = useState(false);
  const hudTimeoutRef = useRef<number | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [streamLoaded, setStreamLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [projectorFit, setProjectorFit] = useState<'contain' | 'cover'>(() => {
    try {
      return (localStorage.getItem('mh_projector_fit') as 'contain' | 'cover') || 'contain';
    } catch {
      return 'contain';
    }
  });
  const [announcement, setAnnouncement] = useState('');
  const prevStreamIdRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const handleToggleCurtainsEnabled = () => {
    setCurtainsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mh_theater_curtains_enabled', String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleProjectorFit = () => {
    setProjectorFit((prev) => {
      const next = prev === 'contain' ? 'cover' : 'contain';
      try {
        localStorage.setItem('mh_projector_fit', next);
      } catch {}
      return next;
    });
  };

  const handleToggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        if (stageRef.current?.requestFullscreen) {
          await stageRef.current.requestFullscreen();
        }
      } catch (err) {
        console.error('Failed to enter fullscreen:', err);
      }
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch (err) {
        console.error('Failed to exit fullscreen:', err);
      }
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (fs) {
        setShowFullscreenHud(true);
        if (hudTimeoutRef.current) window.clearTimeout(hudTimeoutRef.current);
        hudTimeoutRef.current = window.setTimeout(() => setShowFullscreenHud(false), 3500);
      } else {
        setShowFullscreenHud(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (hudTimeoutRef.current) window.clearTimeout(hudTimeoutRef.current);
    };
  }, []);

  const handleStageMouseMove = () => {
    if (!isFullscreen) return;
    setShowFullscreenHud(true);
    if (hudTimeoutRef.current) window.clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = window.setTimeout(() => {
      setShowFullscreenHud(false);
    }, 3500);
  };

  // Trace Mode & Canvas Overlay State
  const [isTraceMode, setIsTraceMode] = useState(false);
  const [traceOpacity, setTraceOpacity] = useState(0.8);
  const [traceTool, setTraceTool] = useState<CanvasTool>('pen');
  const [traceColor, setTraceColor] = useState('#f3d899');
  const [traceWidth, setTraceWidth] = useState(4);
  const [activeTraceLayerId, setActiveTraceLayerId] = useState(2);
  const [pointerMode, setPointerMode] = useState<'draw' | 'clickthrough'>('draw');
  const [isPeeking, setIsPeeking] = useState(false);

  const traceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<CanvasStroke[]>(canvasStrokes);
  const previewRef = useRef<DrawableStroke | null>(null);
  const pointerRef = useRef<number | null>(null);

  const effectiveLayers = canvasLayers && canvasLayers.length > 0 ? canvasLayers : DEFAULT_CANVAS_LAYERS;

  // Redraw Trace Canvas Layer by Layer with Isolated Offscreen Compositing
  const redrawTrace = () => {
    const canvas = traceCanvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.max(1, Math.round(bounds.width * ratio));
    const backingHeight = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, backingWidth, backingHeight);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    let layerCanvas = layerCanvasRef.current;
    if (!layerCanvas) {
      layerCanvas = document.createElement('canvas');
      layerCanvasRef.current = layerCanvas;
    }
    if (layerCanvas.width !== backingWidth || layerCanvas.height !== backingHeight) {
      layerCanvas.width = backingWidth;
      layerCanvas.height = backingHeight;
    }
    const layerCtx = layerCanvas.getContext('2d');

    for (const layer of effectiveLayers) {
      if (!layer.visible) continue;
      if (!layerCtx) continue;

      layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      layerCtx.clearRect(0, 0, backingWidth, backingHeight);
      layerCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

      for (const stroke of strokesRef.current) {
        if ((stroke.pageIndex || 1) === canvasActivePage) {
          const strokeLayerId = stroke.layerId || 2;
          if (strokeLayerId === layer.id) {
            paintStroke(layerCtx, stroke, bounds.width, bounds.height);
          }
        }
      }
      if (previewRef.current && (previewRef.current.layerId || activeTraceLayerId) === layer.id) {
        paintStroke(layerCtx, previewRef.current, bounds.width, bounds.height);
      }

      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
      if (layer.blendMode && layer.blendMode !== 'source-over') {
        context.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      } else {
        context.globalCompositeOperation = 'source-over';
      }
      context.drawImage(layerCanvas, 0, 0, bounds.width, bounds.height);
      context.restore();
    }
  };

  useEffect(() => {
    strokesRef.current = canvasStrokes;
    redrawTrace();
  }, [canvasStrokes, canvasActivePage, canvasEpoch, canvasLayers]);

  useEffect(() => {
    if (!isTraceMode) return;
    const canvas = traceCanvasRef.current;
    if (!canvas) return;
    const resize = () => redrawTrace();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    redrawTrace();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [isTraceMode, canvasActivePage, canvasLayers]);

  // Pointer event coordinate normalization with pressure
  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): CanvasPoint | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const p = event.pressure !== undefined && event.pressure > 0 ? event.pressure : 0.65;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y, p } : null;
  };

  const appendPoint = (point: CanvasPoint) => {
    const preview = previewRef.current;
    if (!preview) return;
    const last = preview.points[preview.points.length - 1];
    if (last) {
      const distanceSquared = (point.x - last.x) ** 2 + (point.y - last.y) ** 2;
      if (distanceSquared < 0.000004) return;
    }
    if (preview.points.length >= 64) {
      preview.points[preview.points.length - 1] = point;
    } else {
      preview.points.push(point);
    }
    redrawTrace();
  };

  const startTraceStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isRoomConnected || pointerMode !== 'draw' || !event.isPrimary || event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    previewRef.current = {
      tool: traceTool,
      color: traceColor,
      width: traceWidth,
      layerId: activeTraceLayerId,
      points: [point],
    };
    redrawTrace();
  };

  const continueTraceStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    appendPoint(point);
  };

  const finishTraceStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (point) appendPoint(point);
    const preview = previewRef.current;
    if (preview && onCanvasStroke) {
      const points = preview.points.length === 1 ? [preview.points[0], preview.points[0]] : preview.points;
      onCanvasStroke({
        clientId: crypto.randomUUID(),
        pageIndex: canvasActivePage,
        layerId: activeTraceLayerId,
        tool: preview.tool,
        color: preview.color,
        width: Math.min(24, Math.max(1, Math.round(preview.width))),
        points,
      });
    }
    pointerRef.current = null;
    previewRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    redrawTrace();
  };

  const cancelTraceStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    previewRef.current = null;
    redrawTrace();
  };
const isKickStream =
  activeStream?.platform === 'kick' ||
  activeStream?.id?.toLowerCase().startsWith('kick:');
  const isOwncastStream = activeStream?.platform === 'owncast' ||
    activeStream?.id?.toLowerCase().startsWith('owncast:');

  const effectiveHlsUrl = activeStream?.hlsUrl || (
    isOwncastStream && activeStream?.watchUrl
      ? `${activeStream.watchUrl.replace(/\/$/, '')}/hls/stream.m3u8`
      : null
  );

  // Handle HLS stream mounting
  useEffect(() => {
    const stream = activeStream;
    const hlsUrl = effectiveHlsUrl;
    if (!stream || !hlsUrl) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamLoaded(true);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.addEventListener('loadedmetadata', () => {
        setStreamLoaded(true);
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeStream]);

  // Handle activeStream changes to trigger opening/closing curtain transitions
  useEffect(() => {
    if (activeStream) {
      const isNewStream = prevStreamIdRef.current !== activeStream.id;
      prevStreamIdRef.current = activeStream.id;
      setStreamLoaded(false);
      const loadTimer = setTimeout(() => setStreamLoaded(true), 1200);

      if (curtainState === 'closed' || isNewStream) {
        setCurtainState('opening');
        setAnnouncement(`Curtains opening for ${activeStream.name} on ${activeStream.platform}`);
        if (soundEnabled) playTheaterSound('open');

        const timer = window.setTimeout(() => {
          setCurtainState('open');
        }, 1300);
        return () => window.clearTimeout(timer);
      }
    } else if (curtainState !== 'closed') {
      prevStreamIdRef.current = null;
      setCurtainState('closing');
      setAnnouncement('Curtains drawing closed. Screening ended.');
      if (soundEnabled) playTheaterSound('close');

      const timer = window.setTimeout(() => {
        setCurtainState('closed');
      }, 1300);
      return () => window.clearTimeout(timer);
    }
  }, [activeStream]);

  const handleToggleCurtains = () => {
    if (curtainState === 'open' || curtainState === 'opening') {
      setCurtainState('closing');
      setAnnouncement('Curtains drawing closed.');
      if (soundEnabled) playTheaterSound('close');
      window.setTimeout(() => {
        setCurtainState('closed');
      }, 1300);
    } else {
      setCurtainState('opening');
      setAnnouncement(activeStream ? `Curtains opening for ${activeStream.name}` : 'Curtains opening.');
      if (soundEnabled) playTheaterSound('open');
      window.setTimeout(() => {
        setCurtainState('open');
      }, 1300);
    }
  };

  const handleLeaveScreening = () => {
    setCurtainState('closing');
    setAnnouncement('Curtains drawing shut. Leaving screening.');
    if (soundEnabled) playTheaterSound('close');
    window.setTimeout(() => {
      setCurtainState('closed');
      onCloseTheater();
    }, 1250);
  };

  const handlePopOut = () => {
    if (activeStream) {
      openPopOutPlayer(activeStream.watchUrl, activeStream.name);
    }
  };

  const embedUrl = activeStream ? streamEmbedUrl(activeStream) : null;
  const isCurtainOpen = curtainState === 'open';
  const isCurtainActive = curtainState === 'opening' || curtainState === 'open';

  return (
    <section
      id="theater-stage"
      ref={stageRef}
      className={`panel theater-stage ${isTraceMode ? 'theater-trace-active' : ''} ${isFullscreen ? 'theater-stage-fullscreen' : ''} ${!curtainsEnabled ? 'curtains-disabled' : ''}`}
      aria-label="Movie Hell Cinema Stage"
      data-curtain-state={curtainState}
      onPointerMove={handleStageMouseMove}
      onMouseMove={handleStageMouseMove}
    >
      {/* Screen Reader Live Announcement */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {/* Marquee Header & Controls */}
      <div className="theater-marquee-header">
        <div className="theater-marquee-info">
          <div className="theater-marquee-lights" aria-hidden="true">
            <span className="marquee-bulb" />
            <span className="marquee-bulb" />
            <span className="marquee-bulb" />
          </div>
          <div className="theater-title-group">
            <p className="panel-kicker theater-kicker">
              {activeStream?.status === 'offline' ? 'Cinema Stage' : '● Live on Stage'}
            </p>
            <h2 className="theater-stream-title">
              {activeStream ? activeStream.name : 'The Grand Auditorium'}
            </h2>
          </div>
        </div>

        {/* Channel Selector on Stage */}
        <div className="theater-channel-switch" role="group" aria-label="Select channel on stage">
          <label htmlFor="theater-channel-select" className="sr-only">
            Select Channel
          </label>
          <select
            id="theater-channel-select"
            className="theater-channel-dropdown"
            value={activeStream?.id ?? ''}
            onChange={(e) => {
              const target = allStreams.find((s) => s.id === e.target.value);
              if (target) {
                if (curtainState === 'open') {
                  setCurtainState('closing');
                  if (soundEnabled) playTheaterSound('close');
                  window.setTimeout(() => {
                    onSelectStream(target);
                  }, 650);
                } else {
                  onSelectStream(target);
                }
              }
            }}
          >
            <option value="" disabled>
              {allStreams.length > 0 ? '— Select a stream to project —' : 'No streams available'}
            </option>
            {allStreams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.status === 'offline' ? '⚪ ' : '🔴 '}
                {s.name} ({s.platform.toUpperCase()})
                {s.viewers != null ? ` - ${s.viewers.toLocaleString()} viewers` : ''}
              </option>
            ))}
          </select>

          {activeStream?.provenance && (
            <div
              className={`theater-stage-guild-badge ${activeStream.provenance.guild}`}
              title={`Origin: ${activeStream.provenance.originDomain || activeStream.platform} • ${activeStream.provenance.attestationNotes || 'Verified Guild Stream'}`}
            >
              <span className="guild-icon">
                {activeStream.provenance.guild === 'guild_projectionist'
                  ? '🏛️'
                  : activeStream.provenance.guild === 'guild_community'
                    ? '🛡️'
                    : activeStream.provenance.guild === 'guild_archivist'
                      ? '📼'
                      : '⚠️'}
              </span>
              <span className="guild-name">
                {activeStream.provenance.guild === 'guild_projectionist'
                  ? 'Projectionist Guild'
                  : activeStream.provenance.guild === 'guild_community'
                    ? 'Community Guild'
                    : activeStream.provenance.guild === 'guild_archivist'
                      ? 'Archivist Guild'
                      : 'Unboundarized'}
              </span>
            </div>
          )}
        </div>

        {/* Theater Control Buttons */}
        <div className="theater-controls">
          <button
            type="button"
            className="theater-btn theater-btn-fullscreen"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen Cinema Stage'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Cinema Stage'}
          >
            {isFullscreen ? '🗗 Exit Fullscreen' : '⛶ Fullscreen'}
          </button>

          <button
            type="button"
            className={`theater-btn theater-btn-curtains-toggle ${curtainsEnabled ? 'curtains-on' : 'curtains-off'}`}
            onClick={handleToggleCurtainsEnabled}
            title={curtainsEnabled ? 'Disable theater curtains for clean edge-to-edge video' : 'Enable velvet theater curtains'}
            aria-label={curtainsEnabled ? 'Curtains Enabled' : 'Curtains Disabled'}
          >
            {curtainsEnabled ? '🎭 Curtains: On' : '🎭 Curtains: Off'}
          </button>

          <button
            type="button"
            className={`theater-btn theater-btn-trace ${isTraceMode ? 'trace-on' : ''}`}
            onClick={() => setIsTraceMode((prev) => !prev)}
            title={isTraceMode ? 'Exit movie trace overlay mode' : 'Overlay shared drawing canvas over cinema screen to trace frames'}
            aria-pressed={isTraceMode}
          >
            {isTraceMode ? '🎨 Trace Mode: On' : '🎨 Trace Mode'}
          </button>

          <button
            type="button"
            className="theater-btn theater-btn-curtain"
            onClick={handleToggleCurtains}
            title={curtainState === 'open' || curtainState === 'opening' ? 'Draw curtains shut' : 'Part curtains open'}
            aria-label={curtainState === 'open' || curtainState === 'opening' ? 'Draw curtains shut' : 'Part curtains open'}
          >
            {curtainState === 'open' || curtainState === 'opening' ? '🎭 Draw Curtains' : '🎬 Open Curtains'}
          </button>

          {activeStream && (
            <button
              type="button"
              className="theater-btn theater-btn-popout"
              onClick={handlePopOut}
              title={`Open ${activeStream.name} in a borderless companion cinema window`}
              aria-label="Open companion player window"
            >
              🪟 Pop-Out Video
            </button>
          )}

          {onPopOutChat && (
            <button
              type="button"
              className="theater-btn theater-btn-popout-chat"
              onClick={onPopOutChat}
              title="Open chat room in a standalone companion window"
              aria-label="Open chat room in a standalone companion window"
            >
              🗗 Pop-Out Chat
            </button>
          )}

          {onPopOutCanvas && (
            <button
              type="button"
              className="theater-btn theater-btn-popout-canvas"
              onClick={onPopOutCanvas}
              title="Open Cinema Atelier art tools and canvas in a standalone companion window"
              aria-label="Open Cinema Atelier art tools in a standalone companion window"
            >
              🎨 Pop-Out Canvas
            </button>
          )}

          {onToggleChatDock && (
            <button
              type="button"
              className={`theater-btn theater-btn-chat ${isChatDocked ? 'chat-docked' : 'chat-undocked'}`}
              onClick={onToggleChatDock}
              title={isChatDocked ? 'Hide side-by-side screening chat' : 'Dock screening chat alongside stage'}
              aria-label={isChatDocked ? 'Hide side-by-side screening chat' : 'Dock screening chat alongside stage'}
            >
              {isChatDocked ? '💬 Chat Docked' : '💬 Dock Chat'}
            </button>
          )}

          <button
            type="button"
            className={`theater-btn theater-btn-fit ${projectorFit === 'cover' ? 'fit-cover' : 'fit-contain'}`}
            onClick={handleToggleProjectorFit}
            title={projectorFit === 'contain' ? '35mm Format: Switch to Full-Aperture Fill (fills entire screen)' : '35mm Format: Switch to Letterbox/Pillarbox Fit'}
            aria-label={projectorFit === 'contain' ? '35mm Format: Pillarbox Fit' : '35mm Format: Full-Aperture Fill'}
          >
            {projectorFit === 'contain' ? '🎞️ 35mm Fit' : '🎞️ 35mm Fill'}
          </button>

          <button
            type="button"
            className={`theater-btn theater-btn-sound ${soundEnabled ? 'sound-on' : 'sound-off'}`}
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={soundEnabled ? 'Mute theater curtain audio cues' : 'Enable theater curtain audio cues'}
            aria-label={soundEnabled ? 'Curtain audio enabled' : 'Curtain audio muted'}
          >
            {soundEnabled ? '🔔 Sound On' : '🔕 Muted'}
          </button>

          {activeStream && (
            <>
              <button
                type="button"
                className="theater-btn theater-btn-reload"
                onClick={() => setReloadKey((k) => k + 1)}
                title="Force refresh the video player"
                aria-label="Force refresh the video player"
              >
                🔄 Reload Feed
              </button>
              <button
                type="button"
                className="theater-btn theater-btn-popout"
                onClick={handlePopOut}
                title="Open stream in dedicated pop-out window"
                aria-label="Open stream in dedicated pop-out window"
              >
                🪟 Pop-Out
              </button>
              <button
                type="button"
                className="theater-btn theater-btn-leave"
                onClick={handleLeaveScreening}
                title="Close curtains and leave screening"
              >
                🚪 Leave Screening
              </button>
            </>
          )}
        </div>
      </div>

      {/* Proscenium Stage Frame */}
      <div className="proscenium-stage">
        {/* Overhead Projector Spotlight Cone */}
        <div className={`stage-projector-beam ${isCurtainOpen ? 'beam-active' : ''}`} aria-hidden="true" />

        {/* Grand Velvet Valance */}
        <div className="velvet-valance" aria-hidden="true">
          <div className="valance-swags">
            <div className="valance-swag swag-1" />
            <div className="valance-swag swag-2" />
            <div className="valance-swag swag-3" />
            <div className="valance-swag swag-4" />
            <div className="valance-swag swag-5" />
          </div>
          <div className="valance-gold-fringe" />
          <div className="valance-gold-rope" />
          <div className="valance-medallion">
            <span className="medallion-crest">📽️</span>
          </div>
        </div>

        {/* Proscenium Pillars */}
        <div className="proscenium-pillar pillar-left" aria-hidden="true">
          <div className="pillar-carving" />
        </div>
        <div className="proscenium-pillar pillar-right" aria-hidden="true">
          <div className="pillar-carving" />
        </div>

        {/* Screen / Stage Area */}
        <div className="cinema-screen-container">
          {activeStream && (effectiveHlsUrl || embedUrl) ? (
            <div className="cinema-screen">
              {effectiveHlsUrl ? (
                <video
                  ref={videoRef}
                  className={`stage-embed-video fit-${projectorFit}`}
                  style={{ objectFit: projectorFit }}
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <iframe
                  src={embedUrl ?? ''}
                  title={`Live stream from ${activeStream.name} on ${activeStream.platform}`}
                  className="stage-embed-iframe"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  loading="eager"
                />
              )}

              {/* TRACE MODE CANVAS OVERLAY */}
              {isTraceMode && (
                <div
                  className={`theater-trace-overlay-frame ${pointerMode === 'clickthrough' ? 'pointer-clickthrough' : 'pointer-draw'}`}
                  style={{ opacity: isPeeking ? 0 : traceOpacity }}
                >
                  <canvas
                    ref={traceCanvasRef}
                    className="stage-trace-canvas"
                    tabIndex={0}
                    role="img"
                    aria-label={`Cinema Screen Trace Overlay for Page ${canvasActivePage} in ${roomName}`}
                    onPointerDown={startTraceStroke}
                    onPointerMove={continueTraceStroke}
                    onPointerUp={finishTraceStroke}
                    onPointerCancel={cancelTraceStroke}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="cinema-screen cinema-screen-intermission">
              <div className="intermission-card">
                <div className="intermission-icon">🍿</div>
                <h3 className="intermission-title">Intermission & Preview</h3>
                <p className="intermission-subtitle">
                  Choose an active stream from the marquee above or the directory below to raise the stage curtains.
                </p>
                {allStreams.length > 0 && (
                  <div className="intermission-quick-picks">
                    <p className="quick-picks-label">Available Screenings:</p>
                    <div className="quick-picks-grid">
                      {allStreams.slice(0, 4).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="quick-pick-btn"
                          onClick={() => onSelectStream(s)}
                        >
                          <span className="quick-pick-status">{s.status === 'offline' ? '⚪' : '🔴 LIVE'}</span>
                          <span className="quick-pick-name">{s.name}</span>
                          <span className="quick-pick-platform">{s.platform}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Red Velvet Curtains Overlay */}
          <div
            className={`velvet-curtains-curtain-layer state-${curtainState}`}
            aria-hidden="true"
          >
            <div className="velvet-curtain curtain-left">
              <div className="curtain-fabric-pleats">
                <div className="pleat pleat-1" />
                <div className="pleat pleat-2" />
                <div className="pleat pleat-3" />
                <div className="pleat pleat-4" />
                <div className="pleat pleat-5" />
                <div className="pleat pleat-6" />
                <div className="pleat pleat-7" />
                <div className="pleat pleat-8" />
              </div>
              <div className="curtain-bottom-gold-fringe" />
            </div>

            <div className="velvet-curtain curtain-right">
              <div className="curtain-fabric-pleats">
                <div className="pleat pleat-1" />
                <div className="pleat pleat-2" />
                <div className="pleat pleat-3" />
                <div className="pleat pleat-4" />
                <div className="pleat pleat-5" />
                <div className="pleat pleat-6" />
                <div className="pleat pleat-7" />
                <div className="pleat pleat-8" />
              </div>
              <div className="curtain-bottom-gold-fringe" />
            </div>

            <div className="curtains-center-crease" />

            <div className={`curtain-tieback tieback-left ${isCurtainActive ? 'tieback-active' : ''}`}>
              <div className="tieback-cord" />
              <div className="tieback-knot" />
              <div className="tieback-tassel" />
            </div>

            <div className={`curtain-tieback tieback-right ${isCurtainActive ? 'tieback-active' : ''}`}>
              <div className="tieback-cord" />
              <div className="tieback-knot" />
              <div className="tieback-tassel" />
            </div>
          </div>
        </div>

        {/* Stage Apron & Footlights */}
        <div className="stage-apron" aria-hidden="true">
          <div className="stage-footlights-row">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                className={`footlight-bulb ${isCurtainOpen ? 'footlight-lit' : ''}`}
                style={{ animationDelay: `${(i % 4) * 0.15}s` }}
              />
            ))}
          </div>
          <div className="stage-wood-grain" />
        </div>
      </div>

      {/* FLOATING CINEMA TRACE TOOLBAR */}
      {isTraceMode && (
        <div className="theater-trace-toolbar" role="toolbar" aria-label="Cinema screen trace controls">
          <div className="trace-toolbar-top-row">
            <div className="trace-status-pill">
              <span className="trace-dot">●</span>
              <strong>Trace Mode</strong>
              <span className="trace-subtext">Page {canvasActivePage} of 5</span>
            </div>

            {/* 5-Page Film Cell Flipper */}
            <div className="trace-page-flipper" role="group" aria-label="Select sketchpad page">
              <span className="flipper-label">Reel Page:</span>
              {[1, 2, 3, 4, 5].map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  className={`trace-page-btn ${canvasActivePage === pageNum ? 'active' : ''}`}
                  onClick={() => onChangeCanvasPage?.(pageNum)}
                  title={`Flip to Canvas Page ${pageNum} of 5`}
                  aria-pressed={canvasActivePage === pageNum}
                >
                  🎞️ {pageNum}
                </button>
              ))}
            </div>

            {/* Trace Layer Selector & Deletion Quick-Bar */}
            <div className="trace-page-flipper trace-layer-flipper" role="group" aria-label="Select drawing layer">
              <span className="flipper-label">Layer:</span>
              <select
                className="trace-select-tool trace-select-layer"
                value={activeTraceLayerId}
                onChange={(e) => setActiveTraceLayerId(Number(e.target.value))}
                title="Active tracing layer"
              >
                {effectiveLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {!l.visible ? '(Hidden)' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="trace-page-btn"
                onClick={() => {
                  onChangeCanvasLayers?.(
                    effectiveLayers.map((l) => (l.id === activeTraceLayerId ? { ...l, visible: !l.visible } : l)),
                  );
                }}
                title={effectiveLayers.find((l) => l.id === activeTraceLayerId)?.visible !== false ? 'Hide Layer' : 'Show Layer'}
                aria-label="Toggle active layer visibility"
              >
                {effectiveLayers.find((l) => l.id === activeTraceLayerId)?.visible !== false ? '👁️' : '🕶️'}
              </button>

              <button
                type="button"
                className="trace-page-btn"
                disabled={effectiveLayers.length <= 1}
                onClick={() => {
                  if (effectiveLayers.length <= 1) return;
                  const layerToDelete = activeTraceLayerId;
                  onDeleteCanvasLayerStrokes?.(layerToDelete);
                  const remaining = effectiveLayers.filter((l) => l.id !== layerToDelete);
                  onChangeCanvasLayers?.(remaining);
                  setActiveTraceLayerId(remaining[0]?.id || 1);
                }}
                title="Delete active layer and clear its strokes from screen overlay"
                aria-label="Delete active layer"
              >
                🗑️
              </button>

              <button
                type="button"
                className="trace-page-btn"
                disabled={effectiveLayers.length >= 6}
                onClick={() => {
                  if (effectiveLayers.length >= 6) return;
                  const nextId = Math.max(...effectiveLayers.map((l) => l.id), 0) + 1;
                  const next = [
                    ...effectiveLayers,
                    {
                      id: nextId,
                      name: `Layer ${nextId}`,
                      visible: true,
                      locked: false,
                      opacity: 1,
                      blendMode: 'source-over' as const,
                    },
                  ];
                  onChangeCanvasLayers?.(next);
                  setActiveTraceLayerId(nextId);
                }}
                title="Add new drawing layer"
                aria-label="Add new drawing layer"
              >
                ➕
              </button>
            </div>

            {canvasRefillAt && (
              <span className="trace-refill-pill" title="5-page canvas cycle refills every 24 hours">
                ⏳ 24h Refill: {formatRefillCountdown(canvasRefillAt)}
              </span>
            )}
          </div>

          <div className="trace-toolbar-bottom-row">
            {/* Opacity Slider */}
            <div className="trace-control-item trace-opacity-item">
              <label htmlFor="trace-opacity-range">
                🔍 Trace Opacity: <strong>{Math.round(traceOpacity * 100)}%</strong>
              </label>
              <input
                id="trace-opacity-range"
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={traceOpacity}
                onChange={(e) => setTraceOpacity(Number(e.target.value))}
                title="Adjust transparency of trace drawing layer over the video"
              />
            </div>

            {/* Krita Brush Preset Selector */}
            <div className="trace-tool-toggle">
              <select
                id="trace-brush-engine-select"
                className="trace-select-tool"
                value={traceTool}
                onChange={(e) => {
                  const t = e.target.value as CanvasTool;
                  setTraceTool(t);
                  const found = KRITA_BRUSH_PRESETS.find((p) => p.id === t);
                  if (found) setTraceWidth(found.defaultWidth);
                }}
                title="Select Krita brush engine preset"
              >
                {KRITA_BRUSH_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Color Swatches */}
            <div className="trace-color-palette" role="radiogroup" aria-label="Ink color palette">
              {CANVAS_PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`trace-swatch ${traceColor === c.value ? 'selected' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => {
                    setTraceColor(c.value);
                    if (traceTool === 'eraser' || traceTool === 'eraser_soft') setTraceTool('pen');
                  }}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
              <input
                type="color"
                className="trace-custom-color-input"
                value={traceColor}
                onInput={(e) => {
                  setTraceColor(e.currentTarget.value);
                  if (traceTool === 'eraser' || traceTool === 'eraser_soft') setTraceTool('pen');
                }}
                onChange={(e) => {
                  setTraceColor(e.currentTarget.value);
                  if (traceTool === 'eraser' || traceTool === 'eraser_soft') setTraceTool('pen');
                }}
                title="Custom color picker"
              />
            </div>

            {/* Brush Width */}
            <div className="trace-control-item trace-width-item">
              <label htmlFor="trace-brush-width">
                📏 Width: <strong>{traceWidth}px</strong>
              </label>
              <input
                id="trace-brush-width"
                type="range"
                min="1"
                max="64"
                step="1"
                value={traceWidth}
                onChange={(e) => setTraceWidth(Number(e.target.value))}
                title="Brush thickness"
              />
            </div>

            {/* Pointer Mode Toggle (Draw vs Click-Through to Player) */}
            <div className="trace-pointer-mode">
              <button
                type="button"
                className={`trace-mode-toggle-btn ${pointerMode === 'draw' ? 'mode-draw' : 'mode-click'}`}
                onClick={() => setPointerMode((prev) => (prev === 'draw' ? 'clickthrough' : 'draw'))}
                title={pointerMode === 'draw' ? 'Switch to Click-Through to click video player controls' : 'Switch to Draw Mode to sketch on the screen'}
              >
                {pointerMode === 'draw' ? '✏️ Draw Mode' : '🖱️ Click Video'}
              </button>
            </div>

            {/* Peek Button (Hold or toggle to hide trace temporarily) */}
            <button
              type="button"
              className={`trace-peek-btn ${isPeeking ? 'peeking' : ''}`}
              onPointerDown={() => setIsPeeking(true)}
              onPointerUp={() => setIsPeeking(false)}
              onPointerLeave={() => setIsPeeking(false)}
              title="Hold to momentarily peek at clean video frame underneath"
            >
              👁️ Peek Video
            </button>
          </div>
        </div>
      )}

      {/* Under-Stage Stream Metadata & Links */}
      {activeStream && (
        <div className="theater-stage-footer">
          <div className="stage-footer-meta">
            <span className="stage-platform-tag">{activeStream.platform.toUpperCase()}</span>
            <span className={`stage-status-pill status-${activeStream.status}`}>
              {activeStream.status === 'offline' ? 'OFFLINE' : '● LIVE'}
              {activeStream.viewers != null ? ` • ${activeStream.viewers.toLocaleString()} viewers` : ''}
            </span>
            {activeStream.currentTitle && (
              <span className="stage-stream-topic">
                <strong>Title:</strong> {activeStream.currentTitle}
              </span>
            )}
          </div>
          <div className="stage-footer-actions">
            <button
              type="button"
              onClick={handlePopOut}
              className="stage-provider-popout-btn"
              title={`Open ${activeStream.name} pop-out player`}
            >
              🪟 Pop-Out Window
            </button>
            <a
              href={activeStream.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="stage-provider-popout"
              title={`Open ${activeStream.name} directly on ${activeStream.platform}`}
            >
              Open on {activeStream.platform} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      )}

      {/* FULLSCREEN HOVER-ACTIVE MODAL DIALOG / HUD */}
      {isFullscreen && (
        <div
          className={`fullscreen-stage-hud ${showFullscreenHud ? 'hud-visible' : 'hud-hidden'}`}
          role="dialog"
          aria-label="Fullscreen Theater Controls"
          onMouseEnter={() => {
            if (hudTimeoutRef.current) window.clearTimeout(hudTimeoutRef.current);
            setShowFullscreenHud(true);
          }}
          onMouseLeave={() => {
            if (hudTimeoutRef.current) window.clearTimeout(hudTimeoutRef.current);
            hudTimeoutRef.current = window.setTimeout(() => setShowFullscreenHud(false), 2000);
          }}
        >
          <div className="fullscreen-hud-content">
            <div className="fullscreen-hud-left">
              <span className="fullscreen-hud-live-pill">
                {activeStream?.status === 'offline' ? '🍿 STAGE' : '🔴 LIVE'}
              </span>
              <strong className="fullscreen-hud-title">
                {activeStream ? activeStream.name : 'Grand Cinema'}
              </strong>
              <span className="fullscreen-hud-room">({roomName})</span>
            </div>

            <div className="fullscreen-hud-controls">
              {/* Enable / Disable Theater Curtains in Fullscreen */}
              <button
                type="button"
                className={`hud-btn hud-curtains-toggle ${curtainsEnabled ? 'active' : ''}`}
                onClick={handleToggleCurtainsEnabled}
                title={curtainsEnabled ? 'Disable curtains for clean edge-to-edge video' : 'Enable velvet theater curtains'}
              >
                {curtainsEnabled ? '🎭 Curtains: On' : '🎭 Curtains: Off (Edge-to-Edge)'}
              </button>

              {/* Draw / Part Curtains if curtains enabled */}
              {curtainsEnabled && (
                <button
                  type="button"
                  className="hud-btn"
                  onClick={handleToggleCurtains}
                  title={curtainState === 'open' || curtainState === 'opening' ? 'Draw curtains shut' : 'Open curtains'}
                >
                  {curtainState === 'open' || curtainState === 'opening' ? '🚪 Draw Shut' : '🎬 Open Curtains'}
                </button>
              )}

              {/* 35mm Fit / Fill toggle */}
              <button
                type="button"
                className={`hud-btn ${projectorFit === 'cover' ? 'active' : ''}`}
                onClick={handleToggleProjectorFit}
                title={projectorFit === 'contain' ? '35mm Format: Switch to Full-Aperture Fill' : '35mm Format: Switch to Letterbox/Pillarbox Fit'}
              >
                {projectorFit === 'contain' ? '🎞️ 35mm Fit' : '🎞️ 35mm Fill'}
              </button>

              {/* Trace Mode */}
              <button
                type="button"
                className={`hud-btn ${isTraceMode ? 'active' : ''}`}
                onClick={() => setIsTraceMode((prev) => !prev)}
                title="Toggle screen trace drawing overlay"
              >
                {isTraceMode ? '🎨 Trace: On' : '🎨 Trace'}
              </button>

              {/* Sound toggle */}
              <button
                type="button"
                className="hud-btn"
                onClick={() => setSoundEnabled((prev) => !prev)}
                title={soundEnabled ? 'Mute curtain sound cues' : 'Enable curtain sound cues'}
              >
                {soundEnabled ? '🔔 Sound' : '🔕 Muted'}
              </button>

              {/* Channel Selector */}
              {allStreams.length > 0 && (
                <select
                  className="hud-select"
                  value={activeStream?.id ?? ''}
                  aria-label="Change stream in fullscreen"
                  onChange={(e) => {
                    const found = allStreams.find((s) => s.id === e.target.value);
                    if (found) onSelectStream(found);
                  }}
                >
                  {allStreams.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.status === 'live' ? '🔴 ' : ''}{s.name} ({s.platform})
                    </option>
                  ))}
                </select>
              )}

              {/* Exit Fullscreen */}
              <button
                type="button"
                className="hud-btn hud-exit-btn"
                onClick={handleToggleFullscreen}
                title="Exit Fullscreen (Esc)"
              >
                🗗 Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
