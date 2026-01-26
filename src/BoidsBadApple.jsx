import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

const BOID_COUNT = 5000;
const SAMPLE_RATE = 8;
const WASM_PATH = '/boids.wasm';

const BoidsBadApple = () => {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const lookaheadVideoRef = useRef(null);
  const animationRef = useRef(null);
  const wasmRef = useRef(null);
  const memoryRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [wasmLoaded, setWasmLoaded] = useState(false);

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

        instance.exports.init_boids(BOID_COUNT, 800, 600);
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

    // Disable smoothing for performance
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(video, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = [];

    for (let y = 0; y < height; y += SAMPLE_RATE) {
      for (let x = 0; x < width; x += SAMPLE_RATE) {
        const i = (y * width + x) * 4;
        const brightness = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;

        if (brightness > 128) {
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

      // Verify sync - Prediction engine
      // Only process pixels if predictions are running
      if (wasmLoaded && wasmRef.current && !lookahead.paused) {

        // Ensure lookahead stays ahead by ~0.6s
        const diff = lookahead.currentTime - video.currentTime;
        if (Math.abs(diff - 0.6) > 0.2) {
          lookahead.currentTime = video.currentTime + 0.6;
        }

        const whitePixels = getWhitePixels(lookahead, canvas.width, canvas.height);

        // Send only if we found targets, otherwise keep flocking
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

        // Draw boids
        const boidPtr = wasmRef.current.get_boids();
        const boidOffset = boidPtr / 4;
        const memFloats = new Float32Array(memoryRef.current.buffer);

        ctx.beginPath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';

        for (let i = 0; i < BOID_COUNT; i++) {
          const x = memFloats[boidOffset + i * 8];
          const y = memFloats[boidOffset + i * 8 + 1];
          ctx.rect(x, y, 2, 2);
        }
        ctx.fill();
      }

      // Draw video thumbnail from main video
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
      // Sync prediction start
      lookahead.currentTime = video.currentTime + 0.6;
      lookahead.play().catch(() => { }); // ghost might fail autoplay if not muted
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-white mb-2">Bad Apple × Boids (Wasm)</h1>
        <p className="text-gray-400 text-center">
          {BOID_COUNT.toLocaleString()} boids flocking (Rust + WebAssembly)
        </p>
      </div>

      <canvas
        ref={canvasRef}
        className="border-2 border-gray-700 rounded-lg shadow-2xl"
      />

      {/* Main Video - Visible (sound & thumbnail) */}
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

      {/* Lookahead Video - Hidden (prediction source) */}
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

      <div className="flex gap-4 mt-6">
        <button
          onClick={togglePlay}
          disabled={!videoLoaded || !wasmLoaded}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:bg-gray-600 disabled:text-gray-400"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        <button
          onClick={reset}
          className="flex items-center gap-2 px-6 py-3 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-600 transition-colors"
        >
          <RotateCcw size={20} />
          Reset
        </button>
      </div>
      {!wasmLoaded && <p className="text-yellow-400 mt-2">Loading Wasm...</p>}
    </div>
  );
};

export default BoidsBadApple;
