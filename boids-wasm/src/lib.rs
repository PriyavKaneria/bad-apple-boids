use std::collections::VecDeque;

#[repr(C)]
pub struct Boid {
    x: f32, y: f32,
    vx: f32, vy: f32,
    ax: f32, ay: f32,
    // Padding to match JS 32-byte stride (8 floats)
    pad1: f32, pad2: f32, 
}

#[derive(Clone, Copy)]
struct GridCell {
    has_pixels: bool,
    center_x: f32,
    center_y: f32,
    pixel_count: i32,
    flow_x: f32,
    flow_y: f32,
    boid_count: i32,
}

// Physics Constants
const MAX_SPEED: f32 = 6.0;
const MAX_FORCE: f32 = 0.4;
const TARGET_FORCE: f32 = 1.0;   

// Dynamic Physics State
static mut CURRENT_PERCEPTION: f32 = 20.0;
static mut CURRENT_SEPARATION: f32 = 10.0;

// Dynamic Boid Count
const MIN_BOIDS: i32 = 500;
const MAX_BOIDS: i32 = 5000;
const MAX_PIXELS: f32 = 7500.0; // 800x600 @ sample rate 8
static mut ACTIVE_BOID_COUNT: i32 = 3000;

// Grid Configuration
const CELL_SIZE: f32 = 20.0;
const COLS: usize = 40; // 800 / 20
const ROWS: usize = 30; // 600 / 20
const DENSITY_LIMIT: i32 = 5; 

static mut BOIDS: Vec<Boid> = Vec::new();
static mut PIXELS: Vec<f32> = Vec::new();
static mut GRID: Vec<GridCell> = Vec::new();

// Spatial Map for fast neighbors
static mut GRID_HEADS: Vec<i32> = Vec::new(); 
static mut BOID_NEXT: Vec<i32> = Vec::new();

static mut WIDTH: f32 = 800.0;
static mut HEIGHT: f32 = 600.0;
static mut RNG_SEED: u32 = 12345;

fn rand() -> f32 {
    unsafe {
        RNG_SEED = RNG_SEED.wrapping_mul(1103515245).wrapping_add(12345);
        let val = (RNG_SEED / 65536) % 32768;
        val as f32 / 32768.0
    }
}

fn rand_range(min: f32, max: f32) -> f32 {
    min + rand() * (max - min)
}

#[no_mangle]
pub extern "C" fn init_boids(count: i32, w: f32, h: f32) {
    unsafe {
        WIDTH = w;
        HEIGHT = h;
        BOIDS.clear();
        BOIDS.reserve(count as usize);
        
        // Initialize Spatial Map Vectors
        GRID_HEADS.resize(COLS * ROWS, -1);
        BOID_NEXT.resize(count as usize, -1);
        
        // Initialize Grid
        GRID.clear();
        GRID.resize(COLS * ROWS, GridCell {
            has_pixels: false, center_x: 0.0, center_y: 0.0, pixel_count: 0, flow_x: 0.0, flow_y: 0.0, boid_count: 0
        });

        for _ in 0..count {
            BOIDS.push(Boid {
                x: rand() * w,
                y: rand() * h,
                vx: rand_range(-2.0, 2.0),
                vy: rand_range(-2.0, 2.0),
                ax: 0.0,
                ay: 0.0,
                pad1: 0.0,
                pad2: 0.0,
            });
        }
    }
}

#[no_mangle]
pub extern "C" fn resize_pixels(count: i32) -> *mut f32 {
    unsafe {
        PIXELS.resize((count * 2) as usize, 0.0);
        PIXELS.as_mut_ptr()
    }
}

fn limit(x: &mut f32, y: &mut f32, max: f32) {
    let mag_sq = *x * *x + *y * *y;
    if mag_sq > max * max {
        let mag = mag_sq.sqrt();
        if mag > 0.0 {
            *x = (*x / mag) * max;
            *y = (*y / mag) * max;
        }
    }
}

fn set_mag(x: &mut f32, y: &mut f32, m: f32) {
    let mag_sq = *x * *x + *y * *y;
    if mag_sq > 0.0 {
        let mag = mag_sq.sqrt();
        *x = (*x / mag) * m;
        *y = (*y / mag) * m;
    }
}

#[no_mangle]
pub extern "C" fn update_boids() {
    unsafe {
        let count = BOIDS.len();

        // 1. Refresh Spatial Map (O(N))
        for i in 0..GRID_HEADS.len() { GRID_HEADS[i] = -1; }
        for i in 0..count { BOID_NEXT[i] = -1; }
        
        // Reset grid boid counts
        for cell in GRID.iter_mut() { cell.boid_count = 0; }

        for (i, b) in BOIDS.iter().enumerate() {
            let col = (b.x / CELL_SIZE) as usize;
            let row = (b.y / CELL_SIZE) as usize;
            
            if col < COLS && row < ROWS {
                let idx = row * COLS + col;
                
                // Add to linked list
                BOID_NEXT[i] = GRID_HEADS[idx];
                GRID_HEADS[idx] = i as i32;

                // Update density count
                GRID[idx].boid_count += 1;
            }
        }

        // 2. Main Loop
        for i in 0..count {
            let (ix, iy, ivx, ivy) = {
                let b = &BOIDS[i];
                (b.x, b.y, b.vx, b.vy)
            };

            let mut sep_x = 0.0; let mut sep_y = 0.0; let mut sep_c = 0;

            // Spatial Separation Logic
            let col = (ix / CELL_SIZE) as i32;
            let row = (iy / CELL_SIZE) as i32;

            // Check 3x3 neighbor cells
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let nx = col + dx;
                    let ny = row + dy;
                    
                    if nx >= 0 && nx < COLS as i32 && ny >= 0 && ny < ROWS as i32 {
                        let idx = (ny as usize) * COLS + (nx as usize);
                        let mut neighbor_idx = GRID_HEADS[idx];
                        
                        // Traverse list in this cell
                        while neighbor_idx != -1 {
                            let idx_u = neighbor_idx as usize;
                            if idx_u != i {
                                let b = &BOIDS[idx_u];
                                let dist_sq = (ix - b.x).powi(2) + (iy - b.y).powi(2);
                                
                                if dist_sq < CURRENT_SEPARATION * CURRENT_SEPARATION && dist_sq > 0.001 {
                                    let dist = dist_sq.sqrt();
                                    let push_x = (ix - b.x) / dist; // Normalize
                                    let push_y = (iy - b.y) / dist;
                                    sep_x += push_x / dist; // Weight by distance (closer = stronger)
                                    sep_y += push_y / dist;
                                    sep_c += 1;
                                }
                            }
                            neighbor_idx = BOID_NEXT[idx_u];
                        }
                    }
                }
            }

            // Apply Separation
            if sep_c > 0 {
                set_mag(&mut sep_x, &mut sep_y, MAX_SPEED);
                sep_x -= ivx;
                sep_y -= ivy;
                limit(&mut sep_x, &mut sep_y, MAX_FORCE * 2.0); // Strong separation
            }

            // Target Steering via Flow Field
            let mut tgt_x = 0.0; let mut tgt_y = 0.0;
            
            if col >= 0 && col < COLS as i32 && row >= 0 && row < ROWS as i32 {
                let cell_idx = (row * COLS as i32 + col) as usize;
                let cell = &GRID[cell_idx];
                
                if cell.has_pixels {
                    // We are IN a white area. Target the specific center of mass of this cell.
                    // DENSITY CHECK: If too crowded, seek a neighbor
                    if cell.boid_count > DENSITY_LIMIT {
                        let mut found = false;
                        let mut best_x = cell.center_x;
                        let mut best_y = cell.center_y;

                        // Search expanding rings (radius 1 to 4)
                        for r in 1..=4 {
                            for dy in -r..=r {
                                for dx in -r..=r {
                                    // Cast to i32 for safe abs() and arithmetic
                                    let dx: i32 = dx;
                                    let dy: i32 = dy;
                                    let r: i32 = r;

                                    // Only check the perimeter of the box (ring)
                                    if dx.abs() != r && dy.abs() != r { continue; }

                                    let nx = col + dx;
                                    let ny = row + dy;

                                    if nx >= 0 && nx < COLS as i32 && ny >= 0 && ny < ROWS as i32 {
                                        let n_idx = (ny as usize) * COLS + (nx as usize);
                                        let n_cell = &GRID[n_idx];
                                        
                                        // Found a white cell with space?
                                        if n_cell.has_pixels && n_cell.boid_count < DENSITY_LIMIT {
                                            best_x = n_cell.center_x;
                                            best_y = n_cell.center_y;
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                                if found { break; }
                            }
                            if found { break; }
                        }

                        if found {
                            let dx = best_x - ix;
                            let dy = best_y - iy;
                            tgt_x = dx;
                            tgt_y = dy;
                        } else {
                            // No free space found nearby
                            // Jitter to prevent stacking
                            let dx = (cell.center_x + rand_range(-10.0, 10.0)) - ix;
                            let dy = (cell.center_y + rand_range(-10.0, 10.0)) - iy;
                            tgt_x = dx;
                            tgt_y = dy;
                        }
                    } else {
                         let dx = cell.center_x - ix;
                         let dy = cell.center_y - iy;
                         tgt_x = dx;
                         tgt_y = dy;
                    }
                } else {
                    // We are in the dark. Follow the flow field.
                    tgt_x = cell.flow_x;
                    tgt_y = cell.flow_y;
                    
                    // Add some random jitter if flow is small (stuck)
                    if tgt_x == 0.0 && tgt_y == 0.0 {
                         tgt_x = rand_range(-1.0, 1.0);
                         tgt_y = rand_range(-1.0, 1.0);
                    }
                }
            } else {
                // Out of bounds, steer to center
                tgt_x = WIDTH/2.0 - ix;
                tgt_y = HEIGHT/2.0 - iy;
            }

            // Normalize and apply
            if tgt_x != 0.0 || tgt_y != 0.0 {
                set_mag(&mut tgt_x, &mut tgt_y, MAX_SPEED);
                tgt_x -= ivx;
                tgt_y -= ivy;
                limit(&mut tgt_x, &mut tgt_y, MAX_FORCE);
            }

            // Apply
            let b = &mut BOIDS[i];
            b.ax += sep_x * 1.5;
            b.ay += sep_y * 1.5;
            b.ax += tgt_x * TARGET_FORCE;
            b.ay += tgt_y * TARGET_FORCE;
        }

        // Update Physics
        for b in BOIDS.iter_mut() {
            b.vx += b.ax;
            b.vy += b.ay;
            limit(&mut b.vx, &mut b.vy, MAX_SPEED);
            
            b.x += b.vx;
            b.y += b.vy;
            
            // Edges (Wrap)
            if b.x > WIDTH { b.x = 0.0; }
            else if b.x < 0.0 { b.x = WIDTH; }
            if b.y > HEIGHT { b.y = 0.0; }
            else if b.y < 0.0 { b.y = HEIGHT; }
            
            b.ax = 0.0;
            b.ay = 0.0;
        }
    }
}

#[no_mangle]
pub extern "C" fn assign_targets() {
    unsafe {
        // 0. Dynamic Parameter Adjustment
        let pixel_total = PIXELS.len() / 2;
        let ratio = (pixel_total as f32) / MAX_PIXELS;
        
        // Dynamic Boid Count: Scale linearly with pixel density
        ACTIVE_BOID_COUNT = MIN_BOIDS + ((ratio * (MAX_BOIDS - MIN_BOIDS) as f32) as i32);
        ACTIVE_BOID_COUNT = ACTIVE_BOID_COUNT.clamp(MIN_BOIDS, MAX_BOIDS);
        
        // Dynamic Separation/Perception based on density
        // if pixel_total > 3500 {
        //     // Majority White / Dense Scene -> Standard flocking
        //     CURRENT_SEPARATION = 6.0;
        //     CURRENT_PERCEPTION = 12.0;
        // } else {
        //     // Majority Black / Sparse Scene -> Tighter packing
        //     CURRENT_SEPARATION = 3.0;
        //     CURRENT_PERCEPTION = 10.0;
        // }
        CURRENT_SEPARATION = 3.0 + ratio * (6.0 - 3.0);
        CURRENT_PERCEPTION = 10.0 + ratio * (12.0 - 10.0);
    
        // 1. Reset Grid
        for cell in GRID.iter_mut() {
            cell.has_pixels = false;
            cell.center_x = 0.0;
            cell.center_y = 0.0;
            cell.pixel_count = 0;
            cell.flow_x = 0.0;
            cell.flow_y = 0.0;
            // Don't reset boid_count here, update_boids does it per frame
        }
        
        // 2. Populate Grid with Pixels
        let pixel_count = PIXELS.len() / 2;
        let mut occupied_queue: VecDeque<usize> = VecDeque::new();
        
        for i in 0..pixel_count {
            let px = PIXELS[i*2];
            let py = PIXELS[i*2+1];
            
            let col = (px / CELL_SIZE) as usize;
            let row = (py / CELL_SIZE) as usize;
            
            if col < COLS && row < ROWS {
                let idx = row * COLS + col;
                let cell = &mut GRID[idx];
                
                cell.has_pixels = true;
                cell.center_x += px;
                cell.center_y += py;
                cell.pixel_count += 1;
            }
        }
        
        // Average the centers
        for (idx, cell) in GRID.iter_mut().enumerate() {
            if cell.has_pixels {
                cell.center_x /= cell.pixel_count as f32;
                cell.center_y /= cell.pixel_count as f32;
                occupied_queue.push_back(idx);
            }
        }
        
        // 3. Generate Flow Field (BFS)
        // Propagate distance field from occupied cells
        let mut visited = vec![false; COLS * ROWS];
        for &idx in &occupied_queue {
            visited[idx] = true;
        }
        
        while let Some(current_idx) = occupied_queue.pop_front() {
            let cx = current_idx % COLS;
            let cy = current_idx / COLS;
            let _current_flow = (GRID[current_idx].flow_x, GRID[current_idx].flow_y); 
            
            // Allow diagonals for smoother flow
            let neighbors = [
                (0, -1), (0, 1), (-1, 0), (1, 0),
                (-1, -1), (-1, 1), (1, -1), (1, 1)
            ];
            
            for (dx, dy) in neighbors.iter() {
                let nx = cx as i32 + dx;
                let ny = cy as i32 + dy;
                
                if nx >= 0 && nx < COLS as i32 && ny >= 0 && ny < ROWS as i32 {
                    let neighbor_idx = (ny as usize) * COLS + (nx as usize);
                    
                    if !visited[neighbor_idx] {
                        visited[neighbor_idx] = true;
                        
                        let mut fx = -(*dx as f32);
                        let mut fy = -(*dy as f32);
                        
                        set_mag(&mut fx, &mut fy, 1.0);
                        
                        GRID[neighbor_idx].flow_x = fx;
                        GRID[neighbor_idx].flow_y = fy;
                        
                        occupied_queue.push_back(neighbor_idx);
                    }
                }
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn get_boids() -> *const Boid {
    unsafe { BOIDS.as_ptr() }
}

#[no_mangle]
pub extern "C" fn get_active_boid_count() -> i32 {
    unsafe { ACTIVE_BOID_COUNT }
}
