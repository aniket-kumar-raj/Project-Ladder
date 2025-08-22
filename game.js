/* Archery Game with Multiple Levels
 * Author: (You)
 * Extend / modify freely.
 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// UI elements
const levelNumEl = document.getElementById("levelNum");
const arrowsLeftEl = document.getElementById("arrowsLeft");
const scoreEl = document.getElementById("score");
const accuracyEl = document.getElementById("accuracy");
const windDisplayEl = document.getElementById("windDisplay");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const powerBar = document.getElementById("powerBar");

const levelOverlay = document.getElementById("levelOverlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const continueBtn = document.getElementById("continueBtn");

// Game constants
const GRAVITY = 0.35;
const BASE_ARROW_SPEED = 18;
const MAX_POWER_HOLD = 2000; // ms to reach 100%
const WIND_CHANGE_INTERVAL = 4000; // ms
const TARGET_RING_COLORS = ["#ffd700","#ff3b30","#1fa94d","#2d62d4","#555"];
const TARGET_RINGS = 5;

// Game state
let gameState = {
  levelIndex: 0,
  arrowsLeft: 0,
  totalScore: 0,
  shotsFired: 0,
  hits: 0,
  wind: 0,
  lastWindChange: 0,
  isCharging: false,
  chargeStartTime: 0,
  playing: false,
  arrows: [],
  target: null,
};

const levels = [
  // Each level defines difficulty and requirements
  {
    name: "Training Grounds",
    arrows: 10,
    targetDistance: 520,
    targetRadius: 70,
    minScoreToAdvance: 80,
    moving: false,
    windMax: 0,
  },
  {
    name: "Light Breeze",
    arrows: 10,
    targetDistance: 560,
    targetRadius: 65,
    minScoreToAdvance: 140,
    moving: false,
    windMax: 1.2,
  },
  {
    name: "Shifting Gusts",
    arrows: 10,
    targetDistance: 600,
    targetRadius: 60,
    minScoreToAdvance: 220,
    moving: true,
    moveAmplitude: 40,
    moveSpeed: 1.2,
    windMax: 2.5,
  },
  {
    name: "Mountain Draft",
    arrows: 9,
    targetDistance: 640,
    targetRadius: 56,
    minScoreToAdvance: 310,
    moving: true,
    moveAmplitude: 70,
    moveSpeed: 1.5,
    windMax: 3.4,
  },
  {
    name: "Storm Front",
    arrows: 9,
    targetDistance: 680,
    targetRadius: 52,
    minScoreToAdvance: 420,
    moving: true,
    moveAmplitude: 95,
    moveSpeed: 1.8,
    windMax: 4.2,
  },
  {
    name: "Final Trial",
    arrows: 8,
    targetDistance: 720,
    targetRadius: 48,
    minScoreToAdvance: 560,
    moving: true,
    moveAmplitude: 120,
    moveSpeed: 2.3,
    windMax: 5.0,
  }
];

// Helper: clamp
const clamp = (v,min,max)=> Math.max(min,Math.min(max,v));

class Arrow {
  constructor(x,y,vx,vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.rotation = Math.atan2(vy,vx);
    this.stuck = false;
    this.hitScore = 0;
  }

  update(dt) {
    if (this.stuck) return;
    // apply wind horizontally (constant acceleration)
    this.vx += (gameState.wind * 0.015) * dt;
    // gravity
    this.vy += GRAVITY * dt * 0.6;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.rotation = Math.atan2(this.vy,this.vx);

    // target collision
    if (checkArrowHitTarget(this)) {
      this.stuck = true;
      // arrow stops slightly after hit point
      const depth = 10;
      this.x += Math.cos(this.rotation)*depth;
      this.y += Math.sin(this.rotation)*depth;
      // Evaluate scoring
      const ringScore = scoreArrowHit(this);
      this.hitScore = ringScore;
      gameState.totalScore += ringScore;
      gameState.hits += (ringScore > 0 ? 1 : 0);
      updateHUD();
    }

    // Out of bounds
    if (this.x > canvas.width + 150 || this.y > canvas.height + 50 || this.y < -50) {
      this.stuck = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.rotate(this.rotation);
    ctx.strokeStyle = "#fefefe";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-18,0);
    ctx.lineTo(18,0);
    ctx.stroke();

    // fletching
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath();
    ctx.moveTo(-18,0);
    ctx.lineTo(-24,4);
    ctx.lineTo(-24,-4);
    ctx.closePath();
    ctx.fill();

    // tip
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(18,0);
    ctx.lineTo(24,3);
    ctx.lineTo(24,-3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (this.hitScore > 0) {
      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.fillText("+"+this.hitScore, this.x + 6, this.y - 6);
    }
  }
}

class Target {
  constructor(cfg) {
    this.baseX = cfg.targetDistance;
    this.baseY = canvas.height/2;
    this.radius = cfg.targetRadius;
    this.cfg = cfg;
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
  }

  get position() {
    let x = this.baseX;
    let y = this.baseY;
    if (this.cfg.moving) {
      const amp = this.cfg.moveAmplitude || 50;
      const speed = this.cfg.moveSpeed || 1;
      y += Math.sin(this.time * 0.001 * speed) * amp;
    }
    return {x,y};
  }

  draw(ctx) {
    const {x,y} = this.position;
    // Stand / post
    ctx.strokeStyle = "#493f2d";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x,y+this.radius);
    ctx.lineTo(x,y+this.radius+90);
    ctx.stroke();

    // Rings
    for (let i=0;i<TARGET_RINGS;i++) {
      const rFrac = 1 - i / TARGET_RINGS;
      const ringR = this.radius * rFrac;
      ctx.beginPath();
      ctx.fillStyle = TARGET_RING_COLORS[i%TARGET_RING_COLORS.length];
      ctx.arc(x,y,ringR,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = "#111a";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Bullseye dot
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x,y, this.radius * 0.08,0,Math.PI*2);
    ctx.fill();
  }
}

// Input & aiming
let mouse = {x:0,y:0};
let bow = {
  x: 120,
  y: canvas.height/2,
  angle: 0
};

canvas.addEventListener("mousemove", e=>{
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

const startCharge = ()=>{
  if (!gameState.playing) return;
  if (gameState.arrowsLeft <= 0) return;
  if (gameState.isCharging) return;
  gameState.isCharging = true;
  gameState.chargeStartTime = performance.now();
};

const releaseShot = ()=>{
  if (!gameState.isCharging) return;
  if (!gameState.playing) { gameState.isCharging = false; return; }
  const elapsed = performance.now() - gameState.chargeStartTime;
  const powerPct = clamp(elapsed / MAX_POWER_HOLD, 0,1);
  shootArrow(powerPct);
  gameState.isCharging = false;
};

canvas.addEventListener("mousedown", startCharge);
canvas.addEventListener("mouseup", releaseShot);
window.addEventListener("keydown", e=>{
  if (e.code === "Space") {
    e.preventDefault();
    startCharge();
  }
});
window.addEventListener("keyup", e=>{
  if (e.code === "Space") {
    e.preventDefault();
    releaseShot();
  }
});

startBtn.addEventListener("click", ()=>{
  if (!gameState.playing) {
    startLevel(gameState.levelIndex);
  }
});
resetBtn.addEventListener("click", resetGame);
continueBtn.addEventListener("click", ()=>{
  levelOverlay.classList.add("hidden");
  // proceed to next level if available
  if (gameState.levelIndex < levels.length && !gameState.playing) {
    startLevel(gameState.levelIndex);
  }
});

// Core functions
function resetGame() {
  gameState.levelIndex = 0;
  gameState.totalScore = 0;
  gameState.arrowsLeft = 0;
  gameState.arrows = [];
  gameState.playing = false;
  gameState.shotsFired = 0;
  gameState.hits = 0;
  updateHUD();
  showOverlay("Game Reset","Click Start to begin a new challenge.");
}

function startLevel(index) {
  if (index >= levels.length) {
    showOverlay("All Levels Complete!","Final Score: " + gameState.totalScore + "\nAccuracy: " + getAccuracyString() + "\nPress Reset to play again.");
    return;
  }
  const cfg = levels[index];
  gameState.arrowsLeft = cfg.arrows;
  gameState.arrows = [];
  gameState.target = new Target(cfg);
  gameState.playing = true;
  gameState.isCharging = false;
  gameState.wind = 0;
  gameState.lastWindChange = performance.now();
  updateHUD();
  hideOverlay();
}

function advanceLevel() {
  gameState.levelIndex++;
  gameState.playing = false;
  const allDone = gameState.levelIndex >= levels.length;
  if (allDone) {
    showOverlay("You Finished the Trial!","Grand Total Score: " + gameState.totalScore + "\nFinal Accuracy: " + getAccuracyString() + "\nReset to attempt better stats.");
  } else {
    const next = levels[gameState.levelIndex];
    showOverlay("Level Complete!",
      "Next: " + next.name + "\nCurrent Score: " + gameState.totalScore + "\nAccuracy: " + getAccuracyString() + "\nPress Continue to proceed.");
  }
}

function failLevel() {
  gameState.playing = false;
  showOverlay("Level Failed",
    "You did not reach the required score.\nTotal Score: " + gameState.totalScore +
    "\nAccuracy: " + getAccuracyString() + "\nPress Continue to retry this level.");
  // Keep same level index so player can retry
}

function showOverlay(title,message) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  levelOverlay.classList.remove("hidden");
}

function hideOverlay() {
  levelOverlay.classList.add("hidden");
}

function getAccuracyString() {
  if (gameState.shotsFired === 0) return "0%";
  return ( (gameState.hits / gameState.shotsFired)*100 ).toFixed(1)+"%";
}

function updateHUD() {
  levelNumEl.textContent = (gameState.levelIndex+1) + " / " + levels.length;
  arrowsLeftEl.textContent = gameState.arrowsLeft;
  scoreEl.textContent = gameState.totalScore;
  accuracyEl.textContent = getAccuracyString();
  windDisplayEl.textContent = gameState.wind.toFixed(2);
}

function shootArrow(powerPct) {
  if (gameState.arrowsLeft <= 0) return;
  const cfg = levels[gameState.levelIndex];
  const dx = mouse.x - bow.x;
  const dy = mouse.y - bow.y;
  const angle = Math.atan2(dy,dx);
  const speed = BASE_ARROW_SPEED * (0.4 + 0.6 * powerPct);
  const vx = Math.cos(angle)*speed;
  const vy = Math.sin(angle)*speed;
  const arrow = new Arrow(bow.x, bow.y, vx, vy);
  gameState.arrows.push(arrow);
  gameState.arrowsLeft--;
  gameState.shotsFired++;
  updateHUD();
  // Sound hook (uncomment if you add an audio file)
  // playSound("shoot.wav");
}

function checkArrowHitTarget(arrow) {
  if (!gameState.target) return false;
  const {x:tx,y:ty} = gameState.target.position;
  const dx = arrow.x - tx;
  const dy = arrow.y - ty;
  const dist = Math.sqrt(dx*dx + dy*dy);
  return dist <= gameState.target.radius;
}

function scoreArrowHit(arrow) {
  const {x:tx,y:ty} = gameState.target.position;
  const dx = arrow.x - tx;
  const dy = arrow.y - ty;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const radius = gameState.target.radius;
  // Each ring is radius/TARGET_RINGS thickness.
  const ringThickness = radius / TARGET_RINGS;
  let ringIndex = Math.floor(dist / ringThickness);
  ringIndex = clamp(ringIndex,0,TARGET_RINGS-1);
  // Higher score for inner rings
  const ringScores = [50,30,20,10,5]; // ringIndex 0 is center
  return ringScores[ringIndex] || 0;
}

function updateWind() {
  const cfg = levels[gameState.levelIndex];
  const now = performance.now();
  if (now - gameState.lastWindChange > WIND_CHANGE_INTERVAL) {
    const max = cfg.windMax || 0;
    // Smooth random
    gameState.wind = (Math.random()*2 -1) * max;
    gameState.lastWindChange = now;
    updateHUD();
  }
}

function updateBow() {
  // Bow vertical follow toward mouse for subtle smoothing
  bow.y += (mouse.y - bow.y) * 0.08;
  bow.angle = Math.atan2(mouse.y - bow.y, mouse.x - bow.x);
}

function drawBow(ctx) {
  ctx.save();
  ctx.translate(bow.x,bow.y);
  ctx.rotate(bow.angle);
  // Bow body
  ctx.strokeStyle = "#c48a3a";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0,0,48,-Math.PI/2,Math.PI/2, bow.angle < 0);
  ctx.stroke();

  // String
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const top = {x: Math.cos(-Math.PI/2)*48, y: Math.sin(-Math.PI/2)*48};
  const bottom = {x: Math.cos(Math.PI/2)*48, y: Math.sin(Math.PI/2)*48};
  ctx.moveTo(top.x,top.y);
  // If charging, string pulls back
  let pull = 0;
  if (gameState.isCharging) {
    const elapsed = performance.now() - gameState.chargeStartTime;
    pull = 10 + 25 * clamp(elapsed / MAX_POWER_HOLD,0,1);
  }
  ctx.lineTo(-pull,0);
  ctx.lineTo(bottom.x,bottom.y);
  ctx.stroke();

  ctx.restore();
}

function drawWindIndicator() {
  const w = gameState.wind;
  const x = 120;
  const y = 40;
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px Arial";
  ctx.fillText("Wind", -18,-14);
  ctx.strokeStyle = "#2c4a68";
  ctx.fillStyle = "#173648aa";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-60,-6,120,12);
  ctx.fill();
  ctx.stroke();

  // needle
  const max = (levels[gameState.levelIndex].windMax || 1) || 1;
  const pct = clamp((w / max), -1,1);
  ctx.fillStyle = "#5cc2ff";
  ctx.beginPath();
  ctx.rect(pct*60 -4,-10,8,20);
  ctx.fill();

  ctx.restore();
}

function drawPowerBar() {
  if (!gameState.isCharging) {
    powerBar.style.width = "0%";
    return;
  }
  const elapsed = performance.now() - gameState.chargeStartTime;
  const pct = clamp(elapsed / MAX_POWER_HOLD,0,1);
  powerBar.style.width = (pct*100).toFixed(1)+"%";
}

function checkLevelEnd() {
  if (!gameState.playing) return;
  if (gameState.arrowsLeft > 0) return;
  // All arrows fired and all moving arrows stopped (or irrelevant)
  const allStopped = gameState.arrows.every(a=>a.stuck);
  if (!allStopped) return;

  const cfg = levels[gameState.levelIndex];
  if (gameState.totalScore >= cfg.minScoreToAdvance) {
    advanceLevel();
  } else {
    failLevel();
  }
}

function mainLoop(timestamp) {
  requestAnimationFrame(mainLoop);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  if (gameState.playing) {
    updateWind();
    updateBow();
    if (gameState.target) gameState.target.update(16);
    gameState.arrows.forEach(a=>a.update(0.9)); // tweak dt
  }

  drawScene();
  drawPowerBar();
  checkLevelEnd();
}

function drawScene() {
  drawGround();
  if (gameState.target) gameState.target.draw(ctx);
  gameState.arrows.forEach(a=>a.draw(ctx));
  drawBow(ctx);
  drawWindIndicator();
  drawHUDOverlayDuringPlay();
}

function drawGround() {
  // Additional ground detail
  ctx.fillStyle = "#5d9640";
  ctx.fillRect(0, canvas.height-60, canvas.width, 60);
  // Some stripes
  ctx.fillStyle = "#5b8f3d";
  for (let i=0;i<canvas.width;i+=160) {
    ctx.fillRect(i, canvas.height-60, 80, 60);
  }
}

function drawHUDOverlayDuringPlay() {
  if (!gameState.playing) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Press Start / Next Level to begin", canvas.width/2, canvas.height/2);
    ctx.restore();
  } else {
    // Level name + required score
    const cfg = levels[gameState.levelIndex];
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(cfg.name, canvas.width/2, 24);
    ctx.font = "12px Arial";
    ctx.fillStyle = "#bfe9ff";
    ctx.fillText("Goal: " + cfg.minScoreToAdvance + " (Current: "+gameState.totalScore+")", canvas.width/2, 44);
    ctx.restore();
  }
}

/* Optional sound function placeholder
function playSound(name) {
  const audio = new Audio("assets/"+name);
  audio.play();
}
*/

resetGame();
requestAnimationFrame(mainLoop);

// (Optional) Expose for console testing
window.__gameState = gameState;
