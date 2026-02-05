const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const WIDTH = 1920;
const HEIGHT = 1080;

// Create color image with gradient and shapes
const colorCanvas = createCanvas(WIDTH, HEIGHT);
const colorCtx = colorCanvas.getContext('2d');

// Background gradient
const bgGrad = colorCtx.createLinearGradient(0, 0, WIDTH, HEIGHT);
bgGrad.addColorStop(0, '#1a1a2e');
bgGrad.addColorStop(0.3, '#16213e');
bgGrad.addColorStop(0.6, '#0f3460');
bgGrad.addColorStop(1, '#e94560');
colorCtx.fillStyle = bgGrad;
colorCtx.fillRect(0, 0, WIDTH, HEIGHT);

// Add some circles with varied luminance
const colors = [
    { color: '#ff6b6b', x: 300, y: 300, r: 200 },
    { color: '#4ecdc4', x: 600, y: 500, r: 180 },
    { color: '#45b7d1', x: 950, y: 350, r: 220 },
    { color: '#f7dc6f', x: 1400, y: 400, r: 250 },
    { color: '#bb8fce', x: 1600, y: 700, r: 190 },
    { color: '#58d68d', x: 400, y: 800, r: 170 },
    { color: '#ec7063', x: 1100, y: 750, r: 200 },
    { color: '#85c1e9', x: 800, y: 900, r: 160 },
];

colors.forEach(({ color, x, y, r }) => {
    const grad = colorCtx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    colorCtx.fillStyle = grad;
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();
});

// Save color image
const colorBuffer = colorCanvas.toBuffer('image/jpeg', { quality: 0.92 });
fs.writeFileSync(path.join(__dirname, 'public', 'image-color.jpg'), colorBuffer);
console.log('Created public/image-color.jpg');

// Create B/W version
const bwCanvas = createCanvas(WIDTH, HEIGHT);
const bwCtx = bwCanvas.getContext('2d');

// Get image data and convert to grayscale
bwCtx.drawImage(colorCanvas, 0, 0);
const imageData = bwCtx.getImageData(0, 0, WIDTH, HEIGHT);
const data = imageData.data;

for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
}

bwCtx.putImageData(imageData, 0, 0);

const bwBuffer = bwCanvas.toBuffer('image/jpeg', { quality: 0.92 });
fs.writeFileSync(path.join(__dirname, 'public', 'image-bw.jpg'), bwBuffer);
console.log('Created public/image-bw.jpg');
