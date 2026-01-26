# Bad Apple × Boids (Rust/Wasm)

Real-time flocking simulation where 3,500 boids form the silhouette of "Bad Apple".

## 🚀 Quick Start

1. **Install Prerequisites**:
   ```bash
   # Install Rust & Wasm target
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add wasm32-unknown-unknown
   
   # Install JS dependencies
   npm install
   ```

2. **Build & Run**:
   ```bash
   # 1. Compile Rust to WebAssembly
   ./build_wasm.sh
   
   # 2. Start the Dev Server
   npm run dev
   ```

---

## ⚙️ Configuration Guide

### 1. Frontend Settings (Instant Updates)
*Located in `src/BoidsBadApple.jsx` (Top of file)*
These changes apply immediately when you save the file (Hot Reloading).

- **`BOID_COUNT`** (default: `3500`): 
  - Number of particles. 
  - ⬆️ Higher = Denser image, more CPU usage.
  - ⬇️ Lower = Sparse image, faster performance.
- **`SAMPLE_RATE`** (default: `8`):
  - pixel skipping when analyzing video.
  - ⬆️ Higher = Less precise targets, faster.

*Located in `src/BoidsBadApple.jsx` (Line ~87)*
- **Lookahead Time** (`0.6`):
  - `lookahead.currentTime = video.currentTime + 0.6;`
  - Adjust `0.6` to change how far in the future the boids "see". Increase if boids are lagging behind the shape.

### 2. Physics Engine (Requires Rebuild)
*Located in `boids-wasm/src/lib.rs` (Top of file)*
These control the flocking behavior. **You must run `./build_wasm.sh` after changing these.**

- **`MAX_SPEED`** (`6.0`): How fast boids move normally.
- **`MAX_FORCE`** (`0.4`): How sharp they can turn.
- **`TARGET_FORCE`** (`1.2`): Attraction to the shape. Higher = sharper edges.
- **`SEPARATION`** (`20.0`): Personal space bubble. Higher = less clumping.
- **`PERCEPTION`** (`25.0`): Vision radius for flocking with neighbors.

**Sprint Logic** (Line ~168 in `lib.rs`):
The code currently boosts speed by **3x** if a boid is >100 pixels away from its target. You can tune these multipliers in the `if dist_sq > 100.0 * 100.0` block.

---

## 🛠 Troubleshooting
- **Boids are just jumping around?** 
  - Reduce `MAX_SPEED` or `TARGET_FORCE`.
- **Boids are too slow to form the shape?**
  - Increase the Lookahead time in JS (e.g. to `1.0`).
  - Or increase `MAX_SPEED` in Rust (don't forget to `./build_wasm.sh`).
