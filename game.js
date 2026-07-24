// ============================================================
//  Procedural Platformer — Minimal Working Version
// ============================================================

// --- Constants ---
const W = 800;
const H = 500;
const GRAVITY = 0.6;
const JUMP_FORCE = -11;
const MOVE_SPEED = 5;
const ACCELERATION = 0.8;
const DRAG = 0.82;
const PLAYER_W = 22;
const PLAYER_H = 28;
const PLATFORM_MIN_W = 50;
const PLATFORM_MAX_W = 120;
const PLATFORM_H = 14;

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreDisplay');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const restartBtn = document.getElementById('restart-btn');
const pauseIndicator = document.getElementById('pause-indicator');

canvas.width = W;
canvas.height = H;

// --- Game State ---
let player, camera, platforms, score, highScore, gameOver, keys, lastTime, isPaused, time;

// --- Helpers ---
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// --- Initialize Game ---
function init() {
    player = {
        x: 60, y: 0, w: PLAYER_W, h: PLAYER_H,
        vx: 0, vy: 0,
        onGround: false,
        standingPlatform: null,
        jumpHeld: false
    };
    camera = { x: 0, y: 0 };
    platforms = [];
    score = 0;
    highScore = Number(localStorage.getItem('highScore')) || 0;
    highScoreDisplay.textContent = highScore;
    gameOver = false;
    keys = { left: false, right: false, jump: false };
    lastTime = 0;
    isPaused = false;
    time = 0;
    restartBtn.style.display = 'none';
    pauseIndicator.style.display = 'none';

    // Generate initial platforms
    let x = 0;
    let y = H - 80;
    while (x < 3000) {
        const w = rand(PLATFORM_MIN_W, PLATFORM_MAX_W);
        platforms.push({ x, y, w, h: PLATFORM_H, type: 'normal', visible: true, scored: false });
        const nextY = clamp(y + rand(-40, 50), 80, H - 40);
        const gap = rand(70, 170);
        x += w + gap;
        y = nextY;
    }
    player.y = platforms[0].y - PLAYER_H;
    updateScore();
}

// --- Input ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        keys.jump = true;
    }
    if (e.key === 'Escape') {
        isPaused = !isPaused;
        pauseIndicator.style.display = isPaused ? 'block' : 'none';
    }
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.jump = false;
});
restartBtn.addEventListener('click', init);

// --- Physics & Update ---
function update(dt) {
    if (gameOver || isPaused) return;
    time += dt;

    // Update platforms (moving types)
    for (const p of platforms) {
        if (p.type === 'movingHorizontal') {
            p.x = p.baseX + Math.sin(time * 1.5 + p.moveOffset) * 60;
        }
        if (p.type === 'movingVertical') {
            p.y = p.baseY + Math.sin(time * 1.5 + p.moveOffset) * 40;
        }
        if (p.type === 'disappearing' && p.warning) {
            p.disappearTimer--;
            if (p.disappearTimer <= 0) p.visible = false;
        }
    }

    // Player movement
    let move = 0;
    if (keys.left) move -= 1;
    if (keys.right) move += 1;
    if (move !== 0) player.vx += move * ACCELERATION * dt;
    else player.vx *= Math.pow(DRAG, dt);
    player.vx = clamp(player.vx, -MOVE_SPEED, MOVE_SPEED);

    // Jump
    if (keys.jump && player.onGround && !player.jumpHeld) {
        player.vy = JUMP_FORCE;
        player.onGround = false;
        player.jumpHeld = true;
    }
    if (!keys.jump && player.jumpHeld && player.vy < 0) {
        player.vy *= 0.5;
        player.jumpHeld = false;
    }

    // Gravity
    player.vy += GRAVITY * dt;
    player.vy = Math.min(player.vy, 15);

    // Move player
    const prevX = player.x;
    const prevY = player.y;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Collisions
    player.onGround = false;
    for (const p of platforms) {
        if (!p.visible) continue;
        
        // Vertical (landing on top) - check this FIRST
        if (player.vy > 0 && prevY + player.h <= p.y &&
            player.y + player.h >= p.y &&
            player.x + player.w > p.x && player.x < p.x + p.w) {
            player.y = p.y - player.h;
            player.vy = 0;
            player.onGround = true;
            player.standingPlatform = p;
            if (p.type === 'disappearing') {
                p.warning = true;
                p.disappearTimer = 90;
            }
        }
        
        // Horizontal - only check sides, not top
        if (player.x + player.w > p.x && player.x < p.x + p.w &&
            player.y + player.h > p.y && player.y < p.y + p.h) {
            // Skip if standing on this platform (feet at platform top)
            if (Math.abs((player.y + player.h) - p.y) < 1) {
                continue;
            }
            if (player.vx > 0) player.x = p.x - player.w;
            else if (player.vx < 0) player.x = p.x + p.w;
            player.vx *= 0.5;
        }
        
        // Vertical (hitting bottom)
        if (player.vy < 0 && player.y <= p.y + p.h &&
            player.y >= p.y &&
            player.x + player.w > p.x && player.x < p.x + p.w) {
            player.y = p.y + p.h;
            player.vy = 0;
        }
    }

    // Camera
    camera.x = player.x - W / 3;
    camera.y = player.y - H / 2;

    // Generate more platforms
    while (platforms.length > 0 && platforms[platforms.length - 1].x < camera.x + W + 1000) {
        const last = platforms[platforms.length - 1];
        const y = clamp(last.y + rand(-40, 50), 80, H - 40);
        const gap = rand(70, 170);
        const w = rand(PLATFORM_MIN_W, PLATFORM_MAX_W);
        const x = last.x + last.w + gap;
        const type = Math.random() < 0.8 ? 'normal' : Math.random() < 0.5 ? 'disappearing' : 'movingHorizontal';
        platforms.push({ x, y, w, h: PLATFORM_H, type, visible: true, scored: false, baseX: x, baseY: y, moveOffset: Math.random() * Math.PI * 2 });
    }

    // Trim platforms
    while (platforms.length > 0 && platforms[0].x + platforms[0].w < camera.x - 500) {
        platforms.shift();
    }

    // Score
    for (const p of platforms) {
        if (!p.scored && p.x + p.w < player.x) {
            p.scored = true;
            score++;
        }
    }
    updateScore();

    // Game over
    if (player.y > H + 100) {
        gameOver = true;
        restartBtn.style.display = 'block';
    }
}

function updateScore() {
    scoreDisplay.textContent = score;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
        highScoreDisplay.textContent = highScore;
    }
}

// --- Render ---
function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw platforms
    for (const p of platforms) {
        if (!p.visible && p.type !== 'invisible') continue;
        ctx.fillStyle = '#4a90d9';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#6bb0f5';
        ctx.fillRect(p.x, p.y, p.w, 3);
        if (p.type === 'invisible') ctx.globalAlpha = 0.15;
        else ctx.globalAlpha = 1;
    }

    // Draw player
    ctx.fillStyle = '#e94560';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(player.x + 5, player.y + 8, 5, 6);
    ctx.fillRect(player.x + 12, player.y + 8, 5, 6);
    ctx.fillStyle = '#111';
    ctx.fillRect(player.x + 6, player.y + 9, 3, 4);
    ctx.fillRect(player.x + 13, player.y + 9, 3, 4);

    ctx.restore();
}

// --- Game Loop ---
function gameLoop(currentTime) {
    if (lastTime === 0) {
        lastTime = currentTime;
        requestAnimationFrame(gameLoop);
        return;
    }
    const dt = Math.min((currentTime - lastTime) / 16.67, 2);
    lastTime = currentTime;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}
// --- Start ---
document.addEventListener('DOMContentLoaded', () => {
    init();
    gameLoop(0);
});
