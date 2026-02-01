import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Twitter } from 'lucide-react';

const BOID_POOL_SIZE = 6000;
const SAMPLE_RATE = 8;
const WASM_PATH = '/boids.wasm';

// Background boids configuration
const BG_BOID_COUNT = 60;
const BG_MAX_SPEED = 2;
const BG_MAX_FORCE = 0.05;

const BoidsBadApple = () => {
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const videoRef = useRef(null);
  const lookaheadVideoRef = useRef(null);
  const animationRef = useRef(null);
  const bgAnimationRef = useRef(null);
  const wasmRef = useRef(null);
  const memoryRef = useRef(null);
  const bgBoidsRef = useRef([]);
  const mouseRef = useRef({ x: 0, y: 0, isOverMain: false });
  const mainCanvasRectRef = useRef(null);
  const debugModeRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [activeBoidCount, setActiveBoidCount] = useState(1500);
  const [debugMode, setDebugMode] = useState(false);

  // Keep debugModeRef in sync with state
  useEffect(() => {
    debugModeRef.current = debugMode;
  }, [debugMode]);

  const [params, setParams] = useState({
    maxSpeed: 6.0,
    maxForce: 0.4,
    perception: 20.0,
    separation: 10.0,
    targetForce: 1.0
  });

  // Initialize background boids
  useEffect(() => {
    const boids = [];
    for (let i = 0; i < BG_BOID_COUNT; i++) {
      boids.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2
      });
    }
    bgBoidsRef.current = boids;
  }, []);

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;

      // Check if mouse is over main canvas
      if (mainCanvasRectRef.current) {
        const rect = mainCanvasRectRef.current;
        mouseRef.current.isOverMain = (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Update main canvas rect on resize
  useEffect(() => {
    const updateRect = () => {
      if (canvasRef.current) {
        mainCanvasRectRef.current = canvasRef.current.getBoundingClientRect();
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, []);

  // Background boids animation
  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return;

    const ctx = bgCanvas.getContext('2d');

    const resizeCanvas = () => {
      bgCanvas.width = window.innerWidth;
      bgCanvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const animateBg = () => {
      ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

      const boids = bgBoidsRef.current;
      const mouse = mouseRef.current;

      for (let i = 0; i < boids.length; i++) {
        const b = boids[i];

        // If mouse is NOT over main canvas, follow/curl around mouse
        if (!mouse.isOverMain) {
          const dx = mouse.x - b.x;
          const dy = mouse.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 0 && dist < 300) {
            // Curl effect - perpendicular to direction
            const perpX = -dy / dist;
            const perpY = dx / dist;

            // Attract towards mouse + curl
            const attractStrength = 0.02;
            const curlStrength = 0.03;

            b.vx += (dx / dist) * attractStrength + perpX * curlStrength;
            b.vy += (dy / dist) * attractStrength + perpY * curlStrength;
          }
        } else {
          // Normal random wandering
          b.vx += (Math.random() - 0.5) * 0.1;
          b.vy += (Math.random() - 0.5) * 0.1;
        }

        // Separation from other boids
        for (let j = 0; j < boids.length; j++) {
          if (i === j) continue;
          const other = boids[j];
          const sepDx = b.x - other.x;
          const sepDy = b.y - other.y;
          const sepDist = Math.sqrt(sepDx * sepDx + sepDy * sepDy);

          if (sepDist > 0 && sepDist < 30) {
            b.vx += (sepDx / sepDist) * 0.05;
            b.vy += (sepDy / sepDist) * 0.05;
          }
        }

        // Limit speed
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > BG_MAX_SPEED) {
          b.vx = (b.vx / speed) * BG_MAX_SPEED;
          b.vy = (b.vy / speed) * BG_MAX_SPEED;
        }

        // Update position
        b.x += b.vx;
        b.y += b.vy;

        // Wrap edges
        if (b.x < 0) b.x = bgCanvas.width;
        if (b.x > bgCanvas.width) b.x = 0;
        if (b.y < 0) b.y = bgCanvas.height;
        if (b.y > bgCanvas.height) b.y = 0;

        // Draw triangle pointing in direction of velocity
        const angle = Math.atan2(b.vy, b.vx);
        const size = 6;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.6, -size * 0.5);
        ctx.lineTo(-size * 0.6, size * 0.5);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
        ctx.restore();
      }

      bgAnimationRef.current = requestAnimationFrame(animateBg);
    };

    animateBg();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (bgAnimationRef.current) {
        cancelAnimationFrame(bgAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    async function loadWasm() {
      try {
        const response = await fetch(WASM_PATH);
        if (!response.ok) {
          console.error("Wasm fetch failed. Make sure boids.wasm is in public/");
          return;
        }

        const { instance } = await WebAssembly.instantiateStreaming(response);
        wasmRef.current = instance.exports;
        memoryRef.current = instance.exports.memory;

        instance.exports.init_boids(BOID_POOL_SIZE, 800, 600);
        setWasmLoaded(true);
        console.log("Wasm loaded and initialized");
      } catch (e) {
        console.error("Wasm initialization failed:", e);
      }
    }
    loadWasm();
  }, []);

  const getWhitePixels = (video, width, height) => {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = width;
    tempCanvas.height = height;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(video, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = [];

    const MARGIN = 0;

    for (let y = MARGIN; y < height - MARGIN; y += SAMPLE_RATE) {
      for (let x = MARGIN; x < width - MARGIN; x += SAMPLE_RATE) {
        const i = (y * width + x) * 4;
        const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;

        if (brightness > 110) {
          pixels.push(x, y);
        }
      }
    }
    return pixels;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const lookahead = lookaheadVideoRef.current;

    if (!canvas || !video || !lookahead) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 600;

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (wasmLoaded && wasmRef.current && !lookahead.paused) {
        const diff = lookahead.currentTime - video.currentTime;
        if (Math.abs(diff - 0.3) > 0.2) {
          lookahead.currentTime = video.currentTime + 0.3;
        }

        const whitePixels = getWhitePixels(lookahead, canvas.width, canvas.height);

        if (whitePixels.length > 0) {
          const ptr = wasmRef.current.resize_pixels(whitePixels.length / 2);
          const memBytes = new Float32Array(memoryRef.current.buffer);
          const offset = ptr / 4;
          memBytes.set(whitePixels, offset);
          wasmRef.current.assign_targets();
        }
      }

      if (wasmLoaded && wasmRef.current) {
        wasmRef.current.update_boids();

        const currentActive = wasmRef.current.get_active_boid_count();
        setActiveBoidCount(currentActive);

        // Update params
        setParams({
          maxSpeed: wasmRef.current.get_max_speed(),
          maxForce: wasmRef.current.get_max_force(),
          perception: wasmRef.current.get_perception(),
          separation: wasmRef.current.get_separation(),
          targetForce: wasmRef.current.get_target_force()
        });

        const boidPtr = wasmRef.current.get_boids();
        const boidOffset = boidPtr / 4;
        const memFloats = new Float32Array(memoryRef.current.buffer);

        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';

        const drawCount = Math.min(currentActive, BOID_POOL_SIZE);
        for (let i = 0; i < drawCount; i++) {
          const x = memFloats[boidOffset + i * 8];
          const y = memFloats[boidOffset + i * 8 + 1];
          ctx.rect(x, y, 2, 2);
        }
        ctx.fill();

        // Debug mode: Draw grid overlay
        if (debugModeRef.current) {
          const cols = wasmRef.current.get_grid_cols();
          const rows = wasmRef.current.get_grid_rows();
          const cellSize = wasmRef.current.get_cell_size();
          const gridPtr = wasmRef.current.get_grid_boid_counts();
          const gridData = new Int32Array(memoryRef.current.buffer, gridPtr, cols * rows);

          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const idx = row * cols + col;
              const count = gridData[idx];

              if (count > 0) {
                // Opacity based on boid count (max 0.5)
                const opacity = Math.min(count / 10, 0.4);
                ctx.fillStyle = `rgba(119, 221, 119, ${opacity})`;
                ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
              }

              // Draw grid lines
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
              ctx.strokeRect(col * cellSize, row * cellSize, cellSize, cellSize);
            }
          }
        }
      }

      if (video && video.readyState >= 2) {
        const videoWidth = 160;
        const videoHeight = 120;
        ctx.drawImage(
          video,
          canvas.width - videoWidth - 10,
          canvas.height - videoHeight - 10,
          videoWidth,
          videoHeight
        );
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [wasmLoaded]);

  const togglePlay = () => {
    const video = videoRef.current;
    const lookahead = lookaheadVideoRef.current;
    if (!video || !lookahead) return;

    if (video.paused) {
      lookahead.currentTime = video.currentTime + 0.6;
      lookahead.play().catch(() => { });
      video.play().catch(e => console.error("Play error", e));
      setIsPlaying(true);
    } else {
      video.pause();
      lookahead.pause();
      setIsPlaying(false);
    }
  };

  const reset = () => {
    const video = videoRef.current;
    const lookahead = lookaheadVideoRef.current;
    if (!video || !lookahead) return;

    video.currentTime = 0;
    video.pause();

    lookahead.currentTime = 0;
    lookahead.pause();

    setIsPlaying(false);
  };

  return (
    <>
      {/* Background boids canvas */}
      <canvas
        ref={bgCanvasRef}
        className="bg-canvas"
      />

      <div className="main-container">
        {/* Left side - Algorithm */}
        <div className="algo-panel">
          <h2 className="algo-title">ALGORITHM</h2>
          <pre className="algo-code">
            {`for each boid:
  // Spatial separation
  for neighbor in grid[cell]:
    if dist < SEPARATION:
      push away

  // Target steering
  if cell.has_pixels:
    if cell.density > LIMIT:
      find nearby free cell
    steer to cell.center
  else:
    follow flow_field

  // Apply forces
  velocity += separation
  velocity += target * FORCE
  limit(velocity, MAX_SPEED)
  position += velocity`}
          </pre>
        </div>

        {/* Center - Main content */}
        <div className="content-area">
          <h1 className="retro-title">BAD APPLE!! But it's dynamic boids simulation</h1>

          <canvas
            ref={canvasRef}
            className="canvas-retro"
          />

          <div className="controls">
            <button
              onClick={togglePlay}
              disabled={!videoLoaded || !wasmLoaded}
              className="btn-retro"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>

            <button
              onClick={reset}
              className="btn-retro-outline"
            >
              <RotateCcw size={18} />
              RESET
            </button>
          </div>

          {!wasmLoaded && <p className="loading-text">LOADING...</p>}
        </div>

        {/* Right side - Parameters panel */}
        <div className="params-panel">
          <h2 className="params-title">PARAMETERS</h2>
          <div className="params-list">
            <div className="param-row">
              <span className="param-label">BOIDS</span>
              <span className="param-value">{activeBoidCount.toLocaleString()}</span>
            </div>
            <div className="param-row">
              <span className="param-label">MAX SPEED</span>
              <span className="param-value">{params.maxSpeed.toFixed(1)}</span>
            </div>
            <div className="param-row">
              <span className="param-label">MAX FORCE</span>
              <span className="param-value">{params.maxForce.toFixed(2)}</span>
            </div>
            <div className="param-row">
              <span className="param-label">PERCEPTION</span>
              <span className="param-value">{params.perception.toFixed(1)}</span>
            </div>
            <div className="param-row">
              <span className="param-label">SEPARATION</span>
              <span className="param-value">{params.separation.toFixed(1)}</span>
            </div>
            <div className="param-row">
              <span className="param-label">TARGET FORCE</span>
              <span className="param-value">{params.targetForce.toFixed(1)}</span>
            </div>
          </div>

          {/* Debug toggle */}
          <div className="debug-toggle">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="toggle-input"
              />
              <span className="toggle-text">DEBUG MODE</span>
            </label>
            <div className={`debug-subtext-wrapper ${debugMode ? 'open' : ''}`}>
              <p className="debug-subtext">Shows grid density for <br /> boid regulation</p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden videos */}
      <video
        ref={videoRef}
        crossOrigin="anonymous"
        className="hidden"
        onLoadedData={() => setVideoLoaded(true)}
        loop
        playsInline
      >
        <source src="/badapple.mp4" type="video/mp4" />
      </video>

      <video
        ref={lookaheadVideoRef}
        crossOrigin="anonymous"
        className="hidden"
        muted
        loop
        playsInline
      >
        <source src="/badapple.mp4" type="video/mp4" />
      </video>

      {/* Twitter link */}
      <a
        href="https://twitter.com/_diginova"
        target="_blank"
        rel="noopener noreferrer"
        className="twitter-link"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span>_diginova</span>
      </a>
    </>
  );
};

export default BoidsBadApple;
