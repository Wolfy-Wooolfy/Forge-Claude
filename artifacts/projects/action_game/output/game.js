const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreElement = document.getElementById("score");
const speedElement = document.getElementById("speed");
const statusElement = document.getElementById("status");
const restartButton = document.getElementById("restart");

const groundY = 430;
let player;
let obstacles;
let score;
let speed;
let frame;
let running;

function resetGame() {
  player = { x: 70, y: groundY, w: 34, h: 44, vy: 0, jumping: false };
  obstacles = [];
  score = 0;
  speed = 1;
  frame = 0;
  running = true;
  statusElement.textContent = "Press Space or Tap to jump.";
  requestAnimationFrame(loop);
}

function jump() {
  if (!running) return;
  if (!player.jumping) {
    player.vy = -15;
    player.jumping = true;
  }
}

function spawnObstacle() {
  obstacles.push({ x: canvas.width + 20, y: groundY + 8, w: 28, h: 36 });
}

function update() {
  frame += 1;
  score += 1;
  speed = 1 + Math.floor(score / 500) * 0.25;

  player.y += player.vy;
  player.vy += 0.8;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.jumping = false;
  }

  if (frame % Math.max(45, Math.floor(100 / speed)) === 0) spawnObstacle();
  obstacles.forEach((obstacle) => { obstacle.x -= 5 * speed; });
  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > 0);

  if (obstacles.some(collides)) {
    running = false;
    statusElement.textContent = "Game over. Press Restart.";
  }

  scoreElement.textContent = score;
  speedElement.textContent = speed.toFixed(2);
}

function collides(obstacle) {
  return player.x < obstacle.x + obstacle.w &&
    player.x + player.w > obstacle.x &&
    player.y < obstacle.y + obstacle.h &&
    player.y + player.h > obstacle.y;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(0, groundY + 44, canvas.width, 8);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.fillStyle = "#f97316";
  obstacles.forEach((obstacle) => ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h));
}

function loop() {
  if (!running) {
    draw();
    return;
  }
  update();
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => { if (event.code === "Space") jump(); });
canvas.addEventListener("click", jump);
restartButton.addEventListener("click", resetGame);
resetGame();