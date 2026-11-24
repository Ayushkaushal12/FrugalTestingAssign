const canvas = document.getElementById('market-chart');
const ctx = canvas.getContext('2d');
const skeleton = document.getElementById('skeleton');
const canvasState = document.getElementById('canvas-state');
const lastPrice = document.getElementById('last-price');
const volume = document.getElementById('volume');
const packetCount = document.getElementById('packet-count');
const status = document.getElementById('connection-status');
const connectionLabel = document.getElementById('connection-label');
const toast = document.getElementById('toast');
const telemetry = document.getElementById('telemetry');
const buyButton = document.getElementById('buy-button');
const eventWindow = document.getElementById('event-window');

let points = [];
let receivedPackets = 0;
let renderedPackets = 0;
let renderedOnce = false;
let guardianReady = false;
let buyClicks = [];
const resilience = new StateGuardianCircuit();

function drawChart() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0) {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(380 * ratio);
  }

  ctx.setTransform(canvas.width / 960, 0, 0, canvas.height / 380, 0, 0);
  ctx.clearRect(0, 0, 960, 380);
  ctx.fillStyle = '#111c2e';
  ctx.fillRect(0, 0, 960, 380);
  ctx.strokeStyle = '#263650';
  ctx.lineWidth = 1;
  for (let y = 40; y < 380; y += 68) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
    ctx.stroke();
  }

  if (points.length === 0) return;
  const min = Math.min(...points) - 1;
  const max = Math.max(...points) + 1;
  const scaleY = value => 340 - ((value - min) / (max - min || 1)) * 280;
  const scaleX = index => 25 + (index / Math.max(1, points.length - 1)) * 910;

  ctx.beginPath();
  points.forEach((value, index) => {
    const x = scaleX(index);
    const y = scaleY(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#50d890';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#f4f7fb';
  ctx.font = '16px Segoe UI';
  ctx.fillText(`$${points.at(-1).toFixed(2)}`, 35, 34);
  renderedPackets = receivedPackets;
  canvasState.dataset.rendered = 'true';
  canvasState.dataset.packets = String(renderedPackets);
  if (!renderedOnce) {
    renderedOnce = true;
    runGuardian();
  }
}

async function runGuardian() {
  document.body.dataset.stateSync = 'pending';
  await resilience.run(
    () => Promise.resolve(),
    () => renderedOnce
      && canvasState.dataset.rendered === 'true'
      && skeleton
      && getComputedStyle(skeleton).display !== 'none'
  );
  if (resilience.open) {
    document.body.dataset.stateSync = 'circuit-open';
    return;
  }
  skeleton.dataset.sync = 'ready';
  skeleton.hidden = true;
  document.body.dataset.stateSync = 'synced';
  guardianReady = true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  toast.setAttribute('aria-hidden', 'false');
  telemetry.dataset.errorBoundary = 'validation-error';
  window.setTimeout(() => toast.classList.remove('visible'), 4000);
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/market-stream`);
  socket.addEventListener('open', () => {
    status.dataset.state = 'live';
    connectionLabel.textContent = 'Live';
  });
  socket.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (packet.type !== 'market') return;
    receivedPackets += 1;
    points.push(packet.price);
    if (points.length > 60) points.shift();
    lastPrice.textContent = `$${packet.price.toFixed(2)}`;
    volume.textContent = packet.volume.toLocaleString();
    packetCount.textContent = String(receivedPackets);
    drawChart();
  });
  socket.addEventListener('close', () => {
    status.dataset.state = 'reconnecting';
    connectionLabel.textContent = 'Reconnecting';
  });
  socket.addEventListener('error', () => showToast('Market stream disconnected.'));
}

async function submitTransaction(clickTime) {
  const precision = 2.5;
  buyClicks.push(clickTime);
  eventWindow.textContent = `${buyClicks.length}/3 rapid clicks`;
  if (buyClicks.length === 3) {
    document.body.dataset.rapidClicks = 'captured';
  }
  try {
    const response = await fetch('/api/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100.25, precision })
    });
    const result = await response.json();
    if (!response.ok) {
      showToast(result.message || 'Transaction validation failed.');
      document.body.dataset.transaction = 'validation-error';
    } else {
      document.body.dataset.transaction = 'accepted';
    }
  } catch (error) {
    showToast('Unable to submit transaction.');
    telemetry.dataset.errorBoundary = 'network-error';
  }
}

buyButton.addEventListener('click', event => {
  submitTransaction(performance.now());
});

drawChart();
connect();
