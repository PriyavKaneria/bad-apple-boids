#!/bin/bash
set -e

# Create public directory if it doesn't exist
mkdir -p public

# Check for rustup
if ! command -v rustup &> /dev/null; then
    echo "Error: 'rustup' is not installed or not in PATH."
    echo "Please install Rust using 'curl --proto \"=https\" --tlsv1.2 -sSf https://sh.rustup.rs | sh'"
    echo "Or ensure it is in your PATH."
    exit 1
fi

echo "Ensuring wasm32 target is installed..."
rustup target add wasm32-unknown-unknown

echo "Building Rust project..."
cd boids-wasm
cargo build --target wasm32-unknown-unknown --release
cd ..

echo "Copying wasm file to public/..."
cp boids-wasm/target/wasm32-unknown-unknown/release/boids_wasm.wasm public/boids.wasm

echo "Build complete! You can now run 'npm run dev'."
