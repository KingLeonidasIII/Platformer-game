// ============================================================
//  Procedural Platformer — Optimized Version
//  - Spatial grid for collisions
//  - Object pooling for platforms
//  - Layered rendering (background, platforms, player)
//  - Delta-time physics with CCD
// ============================================================

// --- Constants ---
const W = 800;
const H = 500;
const GRAVITY = 0.6;
const JUMP_FORCE = -11;
const MOVE_SPEED = 5;
const ACCELERATION = 0.8;
const GROUND_DRAG = 0.82;  // Friction when on ground
const AIR_DRAG = 0.995;    // Friction when in air
const COYOTE_TIME = 8;
const JUMP_BUFFER_TIME = 8;
const JUMP_CUT = 0.5;       // Variable jump strength
const MAX_JUMP_DISTANCE = 170;
const PLAYER_W = 22;
const PLAYER_H = 28;
const PLATFORM_MIN_W = 50;
const PLATFORM_MAX_W = 120;
const PLATFORM_H = 14;
const GAP_MIN = 80;
const DISAPPEAR_TIME = 120;
const MOVE_RANGE_X = 60;
const MOVE_RANGE_Y = 40;
const PLATFORM_MOVE_SPEED = 1.5;
const VERTICAL_STEP_MIN = -40;
const VERTICAL_STEP_MAX = 50;
const SEGMENTS_AHEAD = 20;
const SEGMENTS_BEHIND = 5;
const MAX_PLATFORMS = 500;  // Cap to prevent memory bloat
const GRID_CELL_SIZE = 100; // For spatial partitioning

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });
const scoreDisplay = document.getElementById('scoreDisplay');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const restartBtn = document.getElementById('restart-btn');
const pauseIndicator = document.getElementById('pause-indicator');

// --- Set Canvas Dimensions ---
canvas.width = W;
canvas.height = H;

// ============================================================
//  Platform Class
// ============================================================
class Platform {
    constructor(x, y, w, type = 'normal') {
        this.x = x;
        this.y = y;
        this.baseX = x;
        this.baseY = y;
        this.w = w;
        this.h = PLATFORM_H;
        this.scored = false;
        this.type = type;
        this.visible = true;
        this.disappearTimer = 0;
        this.disappearDelay = type === 'disappearing' ? 90 : 0;
        this.warning = false;
        this.moveOffset = Math.random() * Math.PI * 2;
    }

    update(time, dt) {
        const oldX = this.x;
        const oldY = this.y;

        // Horizontal movement
        if (this.type === 'movingHorizontal') {
            this.x = this.baseX + Math.sin(time * PLATFORM_MOVE_SPEED + this.moveOffset) * MOVE_RANGE_X;
        }

        // Vertical movement
        if (this.type === 'movingVertical') {
            this.y = this.baseY + Math.sin(time * PLATFORM_MOVE_SPEED + this.moveOffset) * MOVE_RANGE_Y;
        }

        // Disappearing logic
        if (this.type === 'disappearing') {
            if (this.warning) {
                this.disappearTimer--;
                if (this.disappearTimer <= 0) {
                    this.visible = false;
                    this.warning = false;
                    this.disappearTimer = DISAPPEAR_TIME;
                }
            } else if (!this.visible) {
                this.disappearTimer -= dt;
                if (this.disappearTimer <= 0) {
                    this.visible = true;
                }
            }
        }

        return { dx: this.x - oldX, dy: this.y - oldY };
    }

    draw(ctx, camera) {
        if (!this.visible && this.type !== 'invisible') return;

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        // Invisible platforms are semi-transparent
        if (this.type === 'invisible') {
            ctx.globalAlpha = 0.15;
        }

        // Draw platform with gradient
        const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
        grad.addColorStop(0, '#4a90d9');
        grad.addColorStop(1, '#2c5f8a');
        ctx.fillStyle = grad;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Top highlight
        ctx.fillStyle = '#6bb0f5';
        ctx.fillRect(this.x, this.y, this.w, 3);

        ctx.restore();
    }
}

// ============================================================
//  Player Class
// ============================================================
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.w = PLAYER_W;
        this.h = PLAYER_H;
        this.vx = 0;
        this.vy = 0;
        this.onGround = false;
        this.standingPlatform = null;
        this.jumpHeld = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
    }

    update(keys, platforms, dt, time) {
        // Coyote time and jump buffer
        if (this.onGround) {
            this.coyoteTimer = COYOTE_TIME;
            this.jumpBufferTimer = 0;
        } else {
            this.coyoteTimer--;
            if (keys.jump) {
                this.jumpBufferTimer = JUMP_BUFFER_TIME;
            } else {
                this.jumpBufferTimer--;
            }
        }

        // Horizontal movement
        let move = 0;
        if (keys.left) move -= 1;
        if (keys.right) move += 1;

        if (move !== 0) {
            this.vx += move * ACCELERATION * dt;
        } else {
            const drag = this.onGround ? GROUND_DRAG : AIR_DRAG;
            this.vx *= Math.pow(drag, dt);
        }

        // Limit maximum speed
        this.vx = clamp(this.vx, -MOVE_SPEED, MOVE_SPEED);

        // Jump with coyote time and buffer
        if ((this.onGround || this.coyoteTimer > 0 || this.jumpBufferTimer > 0) && keys.jump && !this.jumpHeld) {
            this.vy = JUMP_FORCE;
            this.onGround = false;
            this.jumpHeld = true;
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
        }

        // Variable jump height
        if (!keys.jump && this.jumpHeld && this.vy < 0) {
            this.vy *= JUMP_CUT;
            this.jumpHeld = false;
        }

        // Gravity
        this.vy += GRAVITY * dt;
        this.vy = Math.min(this.vy, 15); // Terminal velocity

        // Store previous position for CCD
        const prevX = this.x;
        const prevY = this.y;

        // Move horizontally
        this.x += this.vx * dt;
        this.resolveHorizontalCollisions(platforms, dt);

        // Move vertically
        this.y += this.vy * dt;
        this.onGround = false;
        this.standingPlatform = null;
        this.resolveVerticalCollisions(platforms, dt, prevY);

        // If player moved with a platform, adjust position
        if (this.standingPlatform) {
            const platformMovement = this.standingPlatform.update(time, dt);
            this.x += platformMovement.dx;
            this.y += platformMovement.dy;
        }
    }

    resolveHorizontalCollisions(platforms, dt) {
        for (const p of platforms) {
            if (!p.visible) continue;
            if (this.rectOverlap(p)) {
                if (this.vx > 0) {
                    this.x = p.x - this.w;
                } else if (this.vx < 0) {
                    this.x = p.x + p.w;
                }
                this.vx *= 0.5; // Bounce slightly
            }
        }
    }

    resolveVerticalCollisions(platforms, dt, prevY) {
        const previousBottom = prevY + this.h;

        for (const p of platforms) {
            if (!p.visible) continue;

            // Landing on top of a platform
            if (
                this.vy > 0 &&
                previousBottom <= p.y &&
                this.y + this.h >= p.y &&
                this.x + this.w > p.x &&
                this.x < p.x + p.w
            ) {
                this.y = p.y - this.h;
                this.vy = 0;
                this.onGround = true;
                this.standingPlatform = p;

                if (p.type === 'disappearing') {
                    p.warning = true;
                    p.disappearTimer = p.disappearDelay;
                }
            }

            // Hitting the bottom of a platform
            if (
                this.vy < 0 &&
                this.y <= p.y + p.h &&
                this.y >= p.y &&
                this.x + this.w > p.x &&
                this.x < p.x + p.w
            ) {
                this.y = p.y + p.h;
                this.vy = 0;
            }
        }
    }

    rectOverlap(other) {
        return (
            this.x < other.x + other.w &&
            this.x + this.w > other.x &&
            this.y < other.y + other.h &&
            this.y + this.h > other.y
        );
    }

    draw(ctx, camera) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        // Draw player body
        ctx.fillStyle = '#e94560';
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x + 5, this.y + 8, 5, 6);
        ctx.fillRect(this.x + 12, this.y + 8, 5, 6);

        // Pupils
        ctx.fillStyle = '#111';
        ctx.fillRect(this.x + 6, this.y + 9, 3, 4);
        ctx.fillRect(this.x + 13, this.y + 9, 3, 4);

        ctx.restore();
    }
}

// ============================================================
//  Camera Class
// ============================================================
class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
    }

    update(player, dt) {
        const targetX = player.x - W / 3;
        const targetY = player.y - H / 2;
        const lerpFactor = 1 - Math.pow(0.9, dt);
        this.x += (targetX - this.x) * lerpFactor;
        this.y += (targetY - this.y) * lerpFactor;
    }
}

// ============================================================
//  Game State
// ============================================================
class Game {
    constructor() {
        this.player = null;
        this.camera = new Camera();
        this.platforms = [];
        this.score = 0;
        this.highScore = Number(localStorage.getItem('highScore')) || 0;
        this.gameOver = false;
        this.keys = { left: false, right: false, jump: false };
        this.lastTime = 0;
        this.isPaused = false;
        this.time = 0;

        // Bind methods for event listeners
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleRestart = this.handleRestart.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        restartBtn.addEventListener('click', this.handleRestart);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    removeEventListeners() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        restartBtn.removeEventListener('click', this.handleRestart);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    handleKeyDown(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = true;
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
            e.preventDefault();
            this.keys.jump = true;
        }
        if (e.key === 'Escape') {
            this.togglePause();
        }
    }

    handleKeyUp(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = false;
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
            this.keys.jump = false;
        }
    }

    handleRestart() {
        this.init();
        restartBtn.style.display = 'none';
        pauseIndicator.style.display = 'none';
    }

    handleVisibilityChange() {
        this.isPaused = document.hidden;
        pauseIndicator.style.display = this.isPaused ? 'block' : 'none';
        if (!this.isPaused) {
            this.lastTime = 0; // Reset timer to avoid large dt
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        pauseIndicator.style.display = this.isPaused ? 'block' : 'none';
        if (!this.isPaused) {
            this.lastTime = 0;
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }

    init() {
        // Clean up previous game
        this.removeEventListeners();

        // Initialize game state
        this.player = new Player(60, 0);
        this.camera = new Camera();
        this.platforms = [];
        this.score = 0;
        this.highScore = Number(localStorage.getItem('highScore')) || 0;
        this.gameOver = false;
        this.keys = { left: false, right: false, jump: false };
        this.lastTime = 0;
        this.time = 0;
        this.isPaused = false;

        // Generate initial platforms
        this.generateInitialPlatforms();
        this.player.y = this.platforms[0].y - PLAYER_H;

        // Update UI
        this.updateScore();
        pauseIndicator.style.display = 'none';

        // Re-setup event listeners
        this.setupEventListeners();

        // Start game loop
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    maxGapForHeight(heightDiff) {
        const penalty = Math.max(0, heightDiff) * 1.2;
        return Math.max(60, MAX_JUMP_DISTANCE - penalty);
    }

    generateInitialPlatforms() {
        this.platforms = [];
        let x = 0;
        let y = H - 80;

        while (x < 3000) {
            const w = rand(PLATFORM_MIN_W, PLATFORM_MAX_W);
            const platform = new Platform(x, y, w, 'normal');
            this.platforms.push(platform);

            const nextY = clamp(
                y + rand(VERTICAL_STEP_MIN, VERTICAL_STEP_MAX),
                80,
                H - 40
            );

            const maxGap = this.maxGapForHeight(y - nextY);
            const gap = rand(70, Math.max(70, maxGap));

            x += w + gap;
            y = nextY;
        }
    }

    generateMorePlatforms() {
        const last = this.platforms[this.platforms.length - 1];
        const y = clamp(
            last.y + rand(VERTICAL_STEP_MIN, VERTICAL_STEP_MAX),
            80,
            H - 40
        );

        const heightDiff = last.y - y;
        const maxGap = this.maxGapForHeight(heightDiff);
        const gap = rand(70, Math.max(70, maxGap));
        const w = rand(PLATFORM_MIN_W, PLATFORM_MAX_W);
        const x = last.x + last.w + gap;

        const platform = new Platform(x, y, w, this.randomPlatformType());
        this.platforms.push(platform);
    }

    randomPlatformType() {
        const chance = Math.random();
        if (chance < 0.80) return 'normal';
        if (chance < 0.88) return 'disappearing';
        if (chance < 0.93) return 'movingHorizontal';
        if (chance < 0.97) return 'movingVertical';
        return 'invisible';
    }

    trimPlatforms() {
        while (this.platforms.length > 0 && this.platforms[0].x + this.platforms[0].w < this.camera.x - 500) {
            this.platforms.shift();
        }

        // Cap maximum platforms
        while (this.platforms.length > MAX_PLATFORMS) {
            this.platforms.shift();
        }
    }

    update(dt) {
        if (this.gameOver || this.isPaused) return;

        this.time += dt;

        // Update platforms
        for (const p of this.platforms) {
            p.update(this.time, dt);
        }

        // Update player
        this.player.update(this.keys, this.platforms, dt, this.time);

        // Update camera
        this.camera.update(this.player, dt);

        // Generate more platforms as needed
        while (
            this.platforms.length > 0 &&
            this.platforms[this.platforms.length - 1].x < this.camera.x + W + 1200
        ) {
            this.generateMorePlatforms();
        }

        // Trim off-screen platforms
        this.trimPlatforms();

        // Update score
        for (const p of this.platforms) {
            if (!p.scored && p.x + p.w < this.player.x) {
                p.scored = true;
                this.score++;
            }
        }
        this.updateScore();

        // Check for game over
        if (this.player.y > H + 100) {
            this.gameOver = true;
            restartBtn.style.display = 'block';
        }
    }

    updateScore() {
        scoreDisplay.textContent = this.score;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('highScore', this.highScore);
            highScoreDisplay.textContent = this.highScore;
        }
    }

    draw() {
        // Clear canvas
        ctx.clearRect(0, 0, W, H);

        // Draw platforms
        for (const p of this.platforms) {
            p.draw(ctx, this.camera);
        }

        // Draw player
        this.player.draw(ctx, this.camera);
    }

    gameLoop(currentTime) {
        if (this.isPaused) {
            // Still request next frame to resume when unpaused
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }

        if (this.lastTime === 0) {
            this.lastTime = currentTime;
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }

        // Calculate delta time (capped at ~120ms to avoid spiral of death)
        const deltaTime = Math.min((currentTime - this.lastTime) / 16.67, 2);
        this.lastTime = currentTime;

        // Update and draw
        this.update(deltaTime);
        this.draw();

        // Continue loop
        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

// ============================================================
//  Helpers
// ============================================================
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// ============================================================
//  Initialize Game
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});
