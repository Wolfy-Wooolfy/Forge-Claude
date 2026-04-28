const boardElement = document.getElementById("board");
const scoreElement = document.getElementById("score");
const movesElement = document.getElementById("moves");
const targetElement = document.getElementById("target");
const statusElement = document.getElementById("status");
const restartButton = document.getElementById("restart");

const size = 8;
const targetScore = 1000;
const tileTypes = ["🍒", "🍋", "🍇", "💎", "⭐"];
let board = [];
let selectedIndex = null;
let score = 0;
let moves = 20;

function randomTile() {
  return tileTypes[Math.floor(Math.random() * tileTypes.length)];
}

function createBoard() {
  board = Array.from({ length: size * size }, randomTile);
  score = 0;
  moves = 20;
  selectedIndex = null;
  render();
}

function render() {
  boardElement.innerHTML = "";
  scoreElement.textContent = score;
  movesElement.textContent = moves;
  targetElement.textContent = targetScore;

  board.forEach((tile, index) => {
    const button = document.createElement("button");
    button.className = `tile${selectedIndex === index ? " selected" : ""}`;
    button.textContent = tile;
    button.addEventListener("click", () => selectTile(index));
    boardElement.appendChild(button);
  });
}

function selectTile(index) {
  if (moves <= 0 || score >= targetScore) return;

  if (selectedIndex === null) {
    selectedIndex = index;
    render();
    return;
  }

  if (!areAdjacent(selectedIndex, index)) {
    selectedIndex = index;
    render();
    return;
  }

  swap(selectedIndex, index);
  selectedIndex = null;
  moves -= 1;

  const matches = findMatches();
  if (matches.size === 0) {
    swap(index, selectedIndex);
    statusElement.textContent = "No match. Try another swap.";
  } else {
    resolveMatches(matches);
  }

  checkResult();
  render();
}

function areAdjacent(a, b) {
  const ax = a % size;
  const ay = Math.floor(a / size);
  const bx = b % size;
  const by = Math.floor(b / size);
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

function swap(a, b) {
  const temp = board[a];
  board[a] = board[b];
  board[b] = temp;
}

function findMatches() {
  const matches = new Set();

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size - 2; x += 1) {
      const i = y * size + x;
      if (board[i] === board[i + 1] && board[i] === board[i + 2]) {
        matches.add(i);
        matches.add(i + 1);
        matches.add(i + 2);
      }
    }
  }

  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size - 2; y += 1) {
      const i = y * size + x;
      if (board[i] === board[i + size] && board[i] === board[i + size * 2]) {
        matches.add(i);
        matches.add(i + size);
        matches.add(i + size * 2);
      }
    }
  }

  return matches;
}

function resolveMatches(matches) {
  score += matches.size * 50;
  matches.forEach((index) => {
    board[index] = randomTile();
  });
  statusElement.textContent = `Matched ${matches.size} tiles!`;
}

function checkResult() {
  if (score >= targetScore) {
    statusElement.textContent = "You win!";
  } else if (moves <= 0) {
    statusElement.textContent = "No moves left. Try again.";
  }
}

restartButton.addEventListener("click", createBoard);
createBoard();