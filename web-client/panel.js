function destinationEdges(logicalSize, backingSize, guides) {
  const leading = guides[1];
  const trailing = guides[3] - guides[2];
  if (logicalSize < leading + trailing) {
    // Collapse the center when the two authored edges cannot both fit.
    const split = Math.round(backingSize * leading / (leading + trailing));
    return [0, split, split, backingSize];
  }

  const scale = backingSize / logicalSize;
  return [0, Math.round(leading * scale), Math.round((logicalSize - trailing) * scale), backingSize];
}

export function panelLayout(image, width, height, guides, pixelRatio = globalThis.devicePixelRatio || 1) {
  const imageWidth = image.naturalWidth ?? image.width;
  const imageHeight = image.naturalHeight ?? image.height;
  const { left, top, right, bottom } = guides;
  if (![left, top, right, bottom, imageWidth, imageHeight].every(Number.isFinite)
      || left < 0 || top < 0 || right <= left || bottom <= top || right > imageWidth || bottom > imageHeight) {
    throw new RangeError('Panel cut coordinates must enclose a center inside the source image');
  }
  if (![width, height, pixelRatio].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Panel dimensions and pixel ratio must be finite and positive');
  }

  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
  const sourceX = [0, left, right, imageWidth];
  const sourceY = [0, top, bottom, imageHeight];
  const x = destinationEdges(width, pixelWidth, sourceX);
  const y = destinationEdges(height, pixelHeight, sourceY);
  const slices = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const targetWidth = x[column + 1] - x[column];
      const targetHeight = y[row + 1] - y[row];
      if (!targetWidth || !targetHeight) continue;
      slices.push({
        source: [sourceX[column], sourceY[row], sourceX[column + 1] - sourceX[column], sourceY[row + 1] - sourceY[row]],
        destination: [x[column], y[row], targetWidth, targetHeight],
      });
    }
  }
  return { pixelWidth, pixelHeight, imageWidth, imageHeight, slices };
}

export function drawPanel(canvas, image, width, height, guides, pixelRatio = globalThis.devicePixelRatio || 1) {
  const { pixelWidth, pixelHeight, slices } = panelLayout(image, width, height, guides, pixelRatio);
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D is unavailable');
  context.imageSmoothingEnabled = false;

  for (const { source, destination } of slices) {
    context.drawImage(image, ...source, ...destination);
  }
}
