// ============================================================
//  Procedural Platformer — Fully Optimized & Working
// ============================================================

// --- Constants ---
const W = 800;
const H = 500;
const GRAVITY = 0.6;
const JUMP_FORCE = -11;
const MOVE_SPEED = 5;
const ACCELERATION = 0.8;
const GROUND_DRAG = 0.82;
const AIR_DRAG = 0.995;
const COYOTE_TIME = 8;
const JUMP_BUFFER_TIME = 8;
const JUMP_CUT = 0.5;
const MAX_JUMP_DISTANCE = 170;
const PLAYER_W = 22;
const PLAYER_H = 28;
const PLATFORM_MIN_W = 50;
const PLATFORM_MAX_W = 120;
const PLATFORM_H = 14;
const DISAPPEAR_TIME = 120;
const MOVE_RANGE_X = 60;
const MOVE_RANGE_Y = 40;
const PLATFORM_MOVE_SPEED = 1.5;
const VERTICAL_STEP_MIN = -40;
const VERTICAL_STEP_MAX = 50;
const MAX_PLATFORMS = 500;
const GRID_CELL_SIZE = 100;

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });
const scoreDisplay = document.getElementById('scoreDisplay');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const restartBtn = document.getElementById('restart-btn');
const pauseIndicator = document.getElementById('pause-indicator');

canvas.width = W;
canvas.height = H;

// ============================================================
//  Platform Class
// ============================================================
class Platform {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = 0;
        this.baseX = 0;
        this.baseY = 0;
        this.w = 0;
        this.h = PLATFORM_H;
        this.scored = false;
        this.type = 'normal';
        this.visible = true;
        this.disappearTimer = 0;
        this.disappearDelay = 0;
        this.warning = false;
        this.moveOffset = Math.random() * Math.PI * 2;
    }

    init(x, y, w, type) {
        this.x = x;
        this.y = y;
        this.baseX = x;
        this.baseY = y;
        this.w = w;
        this.type = type;
        this.scored = false;
        this.visible = true;
        this.warning = false;
        this.disappearTimer = 0;
        this.disappearDelay = type === 'disappearing' ? 90 : 0;
        return this;
    }

    update(time, dt) {
        const oldX = this.x;
        const oldY = this.y;

        if (this.type === 'movingHorizontal') {
            this.x = this.baseX + Math.sin(time * PLATFORM_MOVE_SPEED + this.moveOffset) * MOVE_RANGE_X;
        }
        if (this.type === 'movingVertical') {
            this.y = this.baseY + Math.sin(time * PLATFORM_MOVE_SPEED + this.moveOffset) * MOVE_RANGE_Y;
        }

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
        if (this.type === 'invisible') ctx.globalAlpha = 0.15;

        const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
        grad.addColorStop(0, '#4a90d9');
        grad.addColorStop(1, '#2c5f8a');
        ctx.fillStyle = grad;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = '#6bb0f5';
        ctx.fillRect(this.x, this.y, this.w, 3);
        ctx.restore();
    }
}

// ============================================================
//  Object Pool for Platforms
// ============================================================
const platformPool = {
    pool: [],
    acquire() {
        return this.pool.length > 0 ? this.pool.pop() : new Platform();
    },
    release(platform) {
        platform.reset();
        this.pool.push(platform);
    }
};

// ============================================================
//  Spatial Grid for Collision Detection
// ============================================================
const spatialGrid = {
    cellSize: GRID_CELL_SIZE,
    grid: new Map(),

    clear() {
        this.grid.clear();
    },

    insert(obj) {
        const cells = this.getCells(obj);
        for (const cell of cells) {
            if (!this.grid.has(cell)) this.grid.set(cell, new Set());
            this.grid.get(cell).add(obj);
        }
    },

    remove(obj) {
        const cells = this.getCells(obj);
        for (const cell of cells) {
            if (this.grid.has(cell)) this.grid.get(cell).delete(obj);
        }
    },

    getCells(obj) {
        const cells = [];
        const minX = Math.floor(obj.x / this.cellSize);
        const minY = Math.floor(obj.y / this.cellSize);
        const maxX = Math.floor((obj.x + obj.w) / this.cellSize);
        const maxY = Math.floor((obj.y + obj.h) / this.cellSize);
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                cells.push(`${x},${y}`);
            }
        }
        return cells;
    },

    query(obj) {
        const results = new Set();
        const cells = this.getCells(obj);
        for (const cell of cells) {
            if (this.grid.has(cell)) {
                for (const item of this.grid.get(cell)) {
                    if (item !== obj) results.add(item);
                }
            }
        }
        return Array.from(results);
    }
};

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
        if (this.onGround) {
            this.coyoteTimer = COYOTE_TIME;
            this.jumpBufferTimer = 0;
        } else {
            this.coyoteTimer--;
            if (keys.jump) this.jumpBufferTimer = JUMP_BUFFER_TIME;
            else this.jumpBufferTimer--;
        }

        let move = 0;
        if (keys.left) move -= 1;
        if (keys.right) move += 1;

        if (move !== 0) {
            this.vx += move * ACCELERATION * dt;
        } else {
            const drag = this.onGround ? GROUND_DRAG : AIR_DRAG;
            this.vx *= Math.pow(drag, dt);
        }

        this.vx = clamp(this.vx, -MOVE_SPEED, MOVE_SPEED);

        if ((this.onGround || this.coyoteTimer > 0 || this.jumpBufferTimer > 0) && keys.jump && !this.jumpHeld) {
            this.vy = JUMP_FORCE;
            this.onGround = false;
            this.jumpHeld = true;
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
        }

        if (!keys.jump && this.jumpHeld && this.vy < 0) {
            this.vy *= JUMP_CUT;
            this.jumpHeld = false;
        }

        this.vy += GRAVITY * dt;
        this.vy = Math.min(this.vy, 15);

        const prevX = this.x;
        const prevY = this.y;

        this.x += this.vx * dt;
        this.resolveHorizontalCollisions(platforms);

        this.y += this.vy * dt;
        this.onGround = false;
        this.standingPlatform = null;
        this.resolveVerticalCollisions(platforms, prevY);

        if (this.standingPlatform) {
            const movement = this.standingPlatform.update(time, dt);
            this.x += movement.dx;
            this.y += movement.dy;
        }
    }

    resolveHorizontalCollisions(platforms) {
        for (const p of platforms) {
            if (!p.visible) continue;
            if (this.rectOverlap(p)) {
                if (this.vx > 0) this.x = p.x - this.w;
                else if (this.vx < 0) this.x = p.x + p.w;
                this.vx *= 0.5;
            }
        }
    }

    resolveVerticalCollisions(platforms, prevY) {
        const previousBottom = prevY + this.h;
        for (const p of platforms) {
            if (!p.visible) continue;
            if (this.vy > 0 && previousBottom <= p.y && this.y + this.h >= p.y &&
                this.x + this.w > p.x && this.x < p.x + p.w) {
                this.y = p.y - this.h;
                this.vy = 0;
                this.onGround = true;
                this.standingPlatform = p;
                if (p.type === 'disappearing') {
                    p.warning = true;
                    p.disappearTimer = p.disappearDelay;
                }
            }
            if (this.vy < 0 && this.y <= p.y + p.h && this.y >= p.y &&
                this.x + this.w > p.x && this.x < p.x + p.w) {
                this.y = p.y + p.h;
                this.vy = 0;
            }
        }
    }

    rectOverlap(other) {
        return this.x < other.x + other.w && this.x + this.w > other.x &&
               this.y < other.y + other.h && this.y + this.h > other.y;
    }

    draw(ctx, camera) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        ctx.fillStyle = '#e94560';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x + 5, this.y + 8, 5, 6);
        ctx.fillRect(this.x + 12, this.y + 8, 5, 6);
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

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleRestart = this.handleRestart.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
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
        if (e.key === 'Escape') this.togglePause();
    }

    handleKeyUp(e) {
        if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = false;
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') this.keys.jump = false;
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
            this.lastTime = 0;
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
        this.removeEventListeners();
        spatialGrid.clear();

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

        this.generateInitialPlatforms();
        this.player.y = this.platforms[0].y - PLAYER_H;
        this.updateScore();
        pauseIndicator.style.display = 'none';
        this.setupEventListeners();
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
            const platform = platformPool.acquire().init(x, y, w, 'normal');
            this.platforms.push(platform);
            spatialGrid.insert(platform);

            const nextY = clamp(y + rand(VERTICAL_STEP_MIN, VERTICAL_STEP_MAX), 80, H - 40);
            const maxGap = this.maxGapForHeight(y - nextY);
            const gap = rand(70, Math.max(70, maxGap));
            x += w + gap;
            y = nextY;
        }
    }

    generateMorePlatforms() {
        const last = this.platforms[this.platforms.length - 1];
        const y = clamp(last.y + rand(VERTICAL_STEP_MIN, VERTICAL_STEP_MAX), 80, H - 40);
        const heightDiff = last.y - y;
        const maxGap = this.maxGapForHeight(heightDiff);
        const gap = rand(70, Math.max(70, maxGap));
        const w = rand(PLATFORM_MIN_W, PLATFORM_MAX_W);
        const x = last.x + last.w + gap;

        const platform = platformPool.acquire().init(x, y, w, this.randomPlatformType());
        this.platforms.push(platform);
        spatialGrid.insert(platform);
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
            const p = this.platforms.shift();
            spatialGrid.remove(p);
            platformPool.release(p);
        }
        while (this.platforms.length > MAX_PLATFORMS) {
            const p = this.platforms.shift();
            spatialGrid.remove(p);
            platformPool.release(p);
        }
    }

    update(dt) {
        if (this.gameOver || this.isPaused) return;
        this.time += dt;

        for (const p of this.platforms) p.update(this.time, dt);
        this.player.update(this.keys, this.platforms, dt, this.time);
        this.camera.update(this.player, dt);

        while (this.platforms.length > 0 && this.platforms[this.platforms.length - 1].x < this.camera.x + W + 1200) {
            this.generateMorePlatforms();
        }
        this.trimPlatforms();

        for (const p of this.platforms) {
            if (!p.scored && p.x + p.w < this.player.x) {
                p.scored = true;
                this.score++;
            }
        }
        this.updateScore();

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
        ctx.clearRect(0, 0, W, H);
        for (const p of this.platforms) p.draw(ctx, this.camera);
        this.player.draw(ctx, this.camera);
    }

    gameLoop(currentTime) {
        if (this.isPaused) {
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }
        if (this.lastTime === 0) {
            this.lastTime = currentTime;
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }
        const deltaTime = Math.min((currentTime - this.lastTime) / 16.67, 2);
        this.lastTime = currentTime;
        this.update(deltaTime);
        this.draw();
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
