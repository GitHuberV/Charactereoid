// layout_manager.js

// This file contains functions related to managing the canvas layout and drawing.

// Global variable for background blur amount (in pixels)
// This will be loaded from storage.js defaultOptions and user preferences.
let backgroundBlurAmount = 20; // Default blur amount increased for more blur

/**
 * Updates the canvas size based on selected resolution, screen layout, and video stream aspect ratios.
 * This function sets the canvas drawing buffer size (canvas.width, canvas.height),
 * which determines the resolution of the captured stream.
 * It calculates the canvas dimensions based on the selected height and the
 * aspect ratios of the currently active video streams to prevent stretching
 * when displaying them side-by-side (landscape) or stacked (portrait).
 * It also calculates a separate display size for the canvas element and its container,
 * capping the display height in both orientations.
 * Called from resolution change listener, selectTabs, and window resize.
 */
function updateCanvasSize() {
    // Ensure canvas, resolutionEl, and screenLayoutEl are available.
    if (typeof window.canvas === 'undefined' || window.canvas === null || typeof window.resolutionEl === 'undefined' || window.resolutionEl === null ||
        typeof window.screenLayoutEl === 'undefined' || window.screenLayoutEl === null) {
        console.warn('Canvas, resolutionEl, or screenLayoutEl not found in updateCanvasSize.');
        return;
    }

    const selectedResolutionHeight = parseInt(window.resolutionEl.value); // The height value from the dropdown (e.g., 1080)
    const screenLayout = window.screenLayoutEl.value;

    let targetWidth; // The target width for the high-quality drawing buffer (canvas attributes)
    let targetHeight; // The target height for the high-quality drawing buffer (canvas attributes)

    // Define the maximum allowed height for the canvas DISPLAY in both landscape and portrait mode
    const maxCanvasDisplayHeight = 666; // Maximum display height in pixels

    // --- Calculate the ORIGINAL canvas dimensions (for drawing buffer/recording) ---
    // The canvas drawing buffer should adhere to standard 16:9 or 9:16 aspect ratios
    // based on the selected height, regardless of individual video stream aspect ratios.
    if (screenLayout === 'landscape') {
        // Landscape layout: 16:9 aspect ratio (width is 16/9 times height)
        targetHeight = selectedResolutionHeight;
        targetWidth = Math.round(targetHeight * (16 / 9));
        console.log(`Landscape: Canvas drawing buffer set to ${targetWidth}x${targetHeight} (16:9 aspect ratio).`);
    } else { // portrait
        // Portrait layout: 9:16 aspect ratio (height is 16/9 times width)
        targetWidth = selectedResolutionHeight; // In portrait, the selected resolution value is the target width.
        targetHeight = Math.round(targetWidth * (16 / 9));
        console.log(`Portrait: Canvas drawing buffer set to ${targetWidth}x${targetHeight} (9:16 aspect ratio).`);
    }

    // Ensure targetWidth and targetHeight are positive numbers
    targetWidth = Math.max(1, targetWidth);
    targetHeight = Math.max(1, targetHeight);
    // --- End Calculate ORIGINAL canvas dimensions ---


    // --- Calculate DISPLAY dimensions (scaled down for view) ---
    // The display dimensions should maintain the aspect ratio of the original dimensions
    // but be scaled down to fit within the container, with a max height.

    const originalAspectRatio = targetWidth / targetHeight;

    // Get the container and its parent (preview-panel) to determine available space
    const container = document.querySelector('.canvas-container');
    const parentElement = container ? container.parentElement : null;

    let availableWidth = window.innerWidth; // Fallback to window size
    let availableHeight = window.innerHeight; // Fallback to window size

    if (parentElement) {
        // Get the dimensions of the parent element (preview-panel)
        const parentRect = parentElement.getBoundingClientRect();
        availableWidth = parentRect.width;
        availableHeight = parentRect.height;
         console.log(`Parent element (preview-panel) dimensions: ${availableWidth}x${availableHeight}`);
    } else {
        console.warn('Parent element of canvas container not found. Using window dimensions as fallback for display size calculation.');
    }


    // Calculate potential display dimensions if limited by the parent's available width
    let displayWidth_by_width = availableWidth;
    let displayHeight_by_width = Math.round(availableWidth / originalAspectRatio);

    // Calculate potential display dimensions if limited by the maximum allowed display height
    let displayHeight_by_max_height = maxCanvasDisplayHeight;
    let displayWidth_by_max_height = Math.round(maxCanvasDisplayHeight * originalAspectRatio);

    // Choose the dimensions that are smaller in BOTH width and height to fit within constraints
    // We want the largest possible size that fits within both the available container space AND the max display height cap.
    // This means we should choose the dimensions where the height is the minimum of the two potential heights,
    // and then calculate the width based on that height and the aspect ratio.
    let displayHeight = Math.min(displayHeight_by_width, displayHeight_by_max_height);
    let displayWidth = Math.round(displayHeight * originalAspectRatio);

    // After selecting the height, ensure the calculated width doesn't exceed the available width
     if (displayWidth > availableWidth) {
         displayWidth = availableWidth;
         displayHeight = Math.round(displayWidth / originalAspectRatio);
         console.log(`Adjusted display dimensions to fit available width: ${displayWidth}x${displayHeight}`);
     }

    // Ensure display dimensions are positive
    displayWidth = Math.max(1, displayWidth);
    displayHeight = Math.max(1, displayHeight);
    // --- End Calculate DISPLAY dimensions ---


    // Set the actual canvas drawing buffer size using attributes (High Quality).
    // This determines the resolution of the MediaStream captured by canvas.captureStream().
    window.canvas.width = targetWidth; // Use window.canvas
    window.canvas.height = targetHeight; // Use window.canvas

    // Set the canvas display size using style properties (Scaled for View).
    // This makes the canvas appear at a specific size on the page.
    window.canvas.style.width = displayWidth + 'px'; // Use window.canvas
    window.canvas.style.height = displayHeight + 'px'; // Use window.canvas

    // Set the canvas container size to match the canvas display size.
    if (container) {
        container.style.width = displayWidth + 'px';
        container.style.height = displayHeight + 'px';
        console.log(`Canvas container size updated: ${container.style.width}x${container.style.height}`);
    }


    console.log(`Canvas drawing buffer size (attributes) updated: ${window.canvas.width}x${window.canvas.height}`); // Use window.canvas
    console.log(`Canvas display size (style) updated: ${window.canvas.style.width}x${window.canvas.style.height}`); // Use window.canvas


    // Recalculate visualizer pixel positions based on the new canvas DRAWING BUFFER size.
    // Ensure updateVisualizerPixelPositions is available (defined in visualizer.js).
    // Visualizer positions and sizes should be relative to the actual drawing surface (canvas.width, canvas.height).
    if (typeof window.updateVisualizerPixelPositions === 'function') { // Use window.updateVisualizerPixelPositions
        window.updateVisualizerPixelPositions();
    } else {
        console.warn('updateVisualizerPixelPositions function not found after updateCanvasSize.');
    }

    // Redraw the canvas content immediately after resizing to reflect the new dimensions and positions.
    // Ensure updateCanvasDrawing is available (defined in this file).
    if (typeof window.updateCanvasDrawing === 'function') { // Use window.updateCanvasDrawing
        window.updateCanvasDrawing();
    } else {
        console.warn('updateCanvasDrawing function not found after updateCanvasSize.');
    }
}


/**
 * Draw the current frame on the canvas (videos + visualizers).
 * This function draws the video streams onto the canvas, scaling them to fit
 * the calculated canvas dimensions while maintaining their aspect ratios.
 * It then draws the visualizers and avatars on top.
 * Called from the animation loop and updateCanvasSize.
 */
function updateCanvasDrawing() {
     // Ensure canvas, ctx, leftTabVideoElement, rightTabVideoElement are available (declared in core.js)
    if (!window.canvas || !window.ctx || typeof window.leftTabVideoElement === 'undefined' || window.leftTabVideoElement === null ||
        typeof window.rightTabVideoElement === 'undefined' || window.rightTabVideoElement === null || typeof window.screenLayoutEl === 'undefined' || window.screenLayoutEl === null) { // Added screenLayoutEl check
        // console.warn('Required elements not available for updateCanvasDrawing. Skipping draw.'); // Reduced log frequency
        return; // Do not draw if elements are missing
    }

    // Clear canvas for the new frame.
    window.ctx.clearRect(0, 0, window.canvas.width, window.canvas.height);

    // Fill the entire canvas with a very dark grey base color first
    window.ctx.fillStyle = '#1a1a1a'; // A very dark grey to ensure no transparent artifacts
    window.ctx.fillRect(0, 0, window.canvas.width, window.canvas.height);


    const screenLayout = window.screenLayoutEl.value;

    // Check if both video streams are ready with valid dimensions.
    const leftVideoReady = window.leftTabVideoElement && window.leftTabVideoElement.srcObject &&
                           window.leftTabVideoElement.readyState >= 2 &&
                           window.leftTabVideoElement.videoWidth > 0 && window.leftTabVideoElement.videoHeight > 0;
    const rightVideoReady = window.rightTabVideoElement && window.rightTabVideoElement.srcObject &&
                            window.rightTabVideoElement.readyState >= 2 &&
                            window.rightTabVideoElement.videoWidth > 0 && window.rightTabVideoElement.videoHeight > 0;


    // Create a temporary offscreen canvas for the combined video (for blurring)
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d');

    // Set offscreen canvas to the same dimensions as the main canvas for consistency
    offscreenCanvas.width = window.canvas.width;
    offscreenCanvas.height = window.canvas.height;

    // --- Draw Combined Video onto Offscreen Canvas (for background) ---
    // This drawing will fill the offscreen canvas with the combined video,
    // scaling each video to fit its half/section of the offscreen canvas.
    // This is the source for both blurred background and sharp foreground.

    let leftVideoSourceWidth = leftVideoReady ? window.leftTabVideoElement.videoWidth : 0;
    let leftVideoSourceHeight = leftVideoReady ? window.leftTabVideoElement.videoHeight : 0;
    let rightVideoSourceWidth = rightVideoReady ? window.rightTabVideoElement.videoWidth : 0;
    let rightVideoSourceHeight = rightVideoReady ? window.rightTabVideoElement.videoHeight : 0;

    let offscreenLeftX, offscreenLeftY, offscreenLeftWidth, offscreenLeftHeight;
    let offscreenRightX, offscreenRightY, offscreenRightWidth, offscreenRightHeight;

    if (screenLayout === 'landscape') {
        // Landscape: side-by-side, each video takes half width, scaled to full height
        offscreenLeftWidth = offscreenCanvas.width / 2;
        offscreenLeftHeight = offscreenCanvas.height;
        offscreenLeftX = 0;
        offscreenLeftY = 0;

        offscreenRightWidth = offscreenCanvas.width / 2;
        offscreenRightHeight = offscreenCanvas.height;
        offscreenRightX = offscreenCanvas.width / 2;
        offscreenRightY = 0;

        // Draw left video onto its half of the offscreen canvas (object-fit: cover)
        if (leftVideoReady) {
            const sourceAspectRatio = leftVideoSourceWidth / leftVideoSourceHeight;
            const destAspectRatio = offscreenLeftWidth / offscreenLeftHeight;

            let sx, sy, sWidth, sHeight;
            if (sourceAspectRatio > destAspectRatio) { // Source wider, crop horizontally
                sHeight = leftVideoSourceHeight;
                sWidth = sHeight * destAspectRatio;
                sx = (leftVideoSourceWidth - sWidth) / 2;
                sy = 0;
            } else { // Source taller, crop vertically
                sWidth = leftVideoSourceWidth;
                sHeight = sWidth / destAspectRatio;
                sx = 0;
                sy = (leftVideoSourceHeight - sHeight) / 2;
            }
            offscreenCtx.drawImage(window.leftTabVideoElement, sx, sy, sWidth, sHeight, offscreenLeftX, offscreenLeftY, offscreenLeftWidth, offscreenLeftHeight);
        } else {
            offscreenCtx.fillStyle = '#333';
            offscreenCtx.fillRect(offscreenLeftX, offscreenLeftY, offscreenLeftWidth, offscreenLeftHeight);
        }

        // Draw right video onto its half of the offscreen canvas (object-fit: cover)
        if (rightVideoReady) {
            const sourceAspectRatio = rightVideoSourceWidth / rightVideoSourceHeight;
            const destAspectRatio = offscreenRightWidth / offscreenRightHeight;

            let sx, sy, sWidth, sHeight;
            if (sourceAspectRatio > destAspectRatio) { // Source wider, crop horizontally
                sHeight = rightVideoSourceHeight;
                sWidth = sHeight * destAspectRatio;
                sx = (rightVideoSourceWidth - sWidth) / 2;
                sy = 0;
            } else { // Source taller, crop vertically
                sWidth = rightVideoSourceWidth;
                sHeight = sWidth / destAspectRatio;
                sx = 0;
                sy = (rightVideoSourceHeight - sHeight) / 2;
            }
            offscreenCtx.drawImage(window.rightTabVideoElement, sx, sy, sWidth, sHeight, offscreenRightX, offscreenRightY, offscreenRightWidth, offscreenRightHeight);
        } else {
            offscreenCtx.fillStyle = '#555';
            offscreenCtx.fillRect(offscreenRightX, offscreenRightY, offscreenRightWidth, offscreenRightHeight);
        }

    } else { // portrait
        // Portrait: stacked, each video takes full width, half height
        offscreenLeftWidth = offscreenCanvas.width;
        offscreenLeftHeight = offscreenCanvas.height / 2;
        offscreenLeftX = 0;
        offscreenLeftY = 0;

        offscreenRightWidth = offscreenCanvas.width;
        offscreenRightHeight = offscreenCanvas.height / 2;
        offscreenRightX = 0;
        offscreenRightY = offscreenCanvas.height / 2;

        // Draw left video onto its half of the offscreen canvas (object-fit: cover)
        if (leftVideoReady) {
            const sourceAspectRatio = leftVideoSourceWidth / leftVideoSourceHeight;
            const destAspectRatio = offscreenLeftWidth / offscreenLeftHeight;

            let sx, sy, sWidth, sHeight;
            if (sourceAspectRatio > destAspectRatio) { // Source wider, crop horizontally
                sHeight = leftVideoSourceHeight;
                sWidth = sHeight * destAspectRatio;
                sx = (leftVideoSourceWidth - sWidth) / 2;
                sy = 0;
            } else { // Source taller, crop vertically
                sWidth = leftVideoSourceWidth;
                sHeight = sWidth / destAspectRatio;
                sx = 0;
                sy = (leftVideoSourceHeight - sHeight) / 2;
            }
            offscreenCtx.drawImage(window.leftTabVideoElement, sx, sy, sWidth, sHeight, offscreenLeftX, offscreenLeftY, offscreenLeftWidth, offscreenLeftHeight);
        } else {
            offscreenCtx.fillStyle = '#333';
            offscreenCtx.fillRect(offscreenLeftX, offscreenLeftY, offscreenLeftWidth, offscreenLeftHeight);
        }

        // Draw right video onto its half of the offscreen canvas (object-fit: cover)
        if (rightVideoReady) {
            const sourceAspectRatio = rightVideoSourceWidth / rightVideoSourceHeight;
            const destAspectRatio = offscreenRightWidth / offscreenRightHeight;

            let sx, sy, sWidth, sHeight;
            if (sourceAspectRatio > destAspectRatio) { // Source wider, crop horizontally
                sHeight = rightVideoSourceHeight;
                sWidth = sHeight * destAspectRatio;
                sx = (rightVideoSourceWidth - sWidth) / 2;
                sy = 0;
            } else { // Source taller, crop vertically
                sWidth = rightVideoSourceWidth;
                sHeight = sWidth / destAspectRatio;
                sx = 0;
                sy = (rightVideoSourceHeight - sHeight) / 2;
            }
            offscreenCtx.drawImage(window.rightTabVideoElement, sx, sy, sWidth, sHeight, offscreenRightX, offscreenRightY, offscreenRightWidth, offscreenRightHeight);
        } else {
            offscreenCtx.fillStyle = '#555';
            offscreenCtx.fillRect(offscreenRightX, offscreenRightY, offscreenRightWidth, offscreenRightHeight);
        }
    }


    // 1. Draw the blurred background onto the main canvas
    if (window.backgroundBlurAmount > 0) { // Use window.backgroundBlurAmount
        window.ctx.filter = `blur(${window.backgroundBlurAmount}px)`; // Use window.backgroundBlurAmount
    } else {
        window.ctx.filter = 'none'; // No blur
    }

    // Draw the offscreen canvas content (combined video) onto the main canvas,
    // scaling it to cover the entire canvas. This creates the blurred background.
    // Calculate source and destination rectangles for object-fit: cover
    const sourceAspectRatio = offscreenCanvas.width / offscreenCanvas.height;
    const destAspectRatio = window.canvas.width / window.canvas.height;

    let sx, sy, sWidth, sHeight; // Source rectangle (from offscreenCanvas)
    let dx, dy, dWidth, dHeight; // Destination rectangle (on main canvas)

    dx = 0;
    dy = 0;
    dWidth = window.canvas.width;
    dHeight = window.canvas.height;

    if (sourceAspectRatio > destAspectRatio) {
        // Source is wider than destination, crop source horizontally
        sHeight = offscreenCanvas.height;
        sWidth = sHeight * destAspectRatio;
        sx = (offscreenCanvas.width - sWidth) / 2;
        sy = 0;
    } else {
        // Source is taller than destination, crop source vertically
        sWidth = offscreenCanvas.width;
        sHeight = sWidth / destAspectRatio;
        sx = 0;
        sy = (offscreenCanvas.height - sHeight) / 2;
    }

    // Draw the blurred background
    window.ctx.drawImage(offscreenCanvas, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

    // Apply a semi-transparent dark overlay on top of the blurred background
    // This makes the background appear darker and more "faded"
    window.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // 40% black overlay (increased from 0.3)
    window.ctx.fillRect(0, 0, window.canvas.width, window.canvas.height);


    // Reset filter for subsequent drawings
    window.ctx.filter = 'none';


    // 2. Draw the unblurred foreground video onto the main canvas
    // This drawing will now scale the combined video to CONTAIN within the canvas area,
    // preserving its aspect ratio. Any empty space (letterboxing) will be filled by the blurred background.

    // Calculate the combined aspect ratio of the actual video streams
    let combinedVideoActualWidth = 0;
    let combinedVideoActualHeight = 0;

    if (screenLayout === 'landscape') {
        // In landscape, height is consistent, widths add up
        combinedVideoActualHeight = Math.max(leftVideoSourceHeight || 1, rightVideoSourceHeight || 1); // Use 1 to avoid division by zero
        if (leftVideoReady) combinedVideoActualWidth += leftVideoSourceWidth;
        if (rightVideoReady) combinedVideoActualWidth += rightVideoSourceWidth;
    } else { // portrait
        // In portrait, width is consistent, heights add up
        combinedVideoActualWidth = Math.max(leftVideoSourceWidth || 1, rightVideoSourceWidth || 1); // Use 1 to avoid division by zero
        if (leftVideoReady) combinedVideoActualHeight += leftVideoSourceHeight;
        if (rightVideoReady) combinedVideoActualHeight += rightVideoSourceHeight;
    }

    // Fallback if no videos are ready
    if (!leftVideoReady && !rightVideoReady) {
        combinedVideoActualWidth = window.canvas.width;
        combinedVideoActualHeight = window.canvas.height;
    }

    const combinedVideoAspectRatio = combinedVideoActualWidth / combinedVideoActualHeight;

    let drawWidth, drawHeight;
    // Ensure combinedVideoAspectRatio is a valid number before division
    if (isNaN(combinedVideoAspectRatio) || combinedVideoAspectRatio === 0 || !isFinite(combinedVideoAspectRatio)) {
        console.warn('Combined video aspect ratio is invalid or zero. Cannot draw foreground video.');
        // Draw placeholders if aspect ratio is bad
        window.ctx.fillStyle = '#333';
        window.ctx.fillRect(0, 0, window.canvas.width / 2, window.canvas.height);
        window.ctx.fillStyle = '#555';
        window.ctx.fillRect(window.canvas.width / 2, 0, window.canvas.width / 2, window.canvas.height);
        window.ctx.fillStyle = '#fff';
        window.ctx.textAlign = 'center';
        window.ctx.font = '20px Arial';
        window.ctx.fillText('No Stream', window.canvas.width / 2, window.canvas.height / 2);
        return; // Skip drawing foreground if aspect ratio is bad
    }

    // Calculate dimensions for object-fit: contain on the main canvas (foreground)
    if (combinedVideoAspectRatio > window.canvas.width / window.canvas.height) {
        // Combined video is wider than canvas, fit by width
        drawWidth = window.canvas.width;
        drawHeight = window.canvas.width / combinedVideoAspectRatio;
    } else {
        // Combined video is taller than canvas, fit by height
        drawHeight = window.canvas.height;
        drawWidth = window.canvas.height * combinedVideoAspectRatio;
    }

    const drawX = (window.canvas.width - drawWidth) / 2;
    const drawY = (window.canvas.height - drawHeight) / 2;

    // Draw the unblurred combined video directly from source elements onto main canvas
    if (screenLayout === 'landscape') {
        // Calculate the width for each video within the 'contain' area
        const totalSourceWidth = (leftVideoSourceWidth + rightVideoSourceWidth) || 1; // Avoid division by zero
        const leftDrawWidth = drawWidth * (leftVideoSourceWidth / totalSourceWidth);
        const rightDrawWidth = drawWidth * (rightVideoSourceWidth / totalSourceWidth);

        if (leftVideoReady) {
            window.ctx.drawImage(window.leftTabVideoElement, drawX, drawY, leftDrawWidth, drawHeight);
        } else {
            // Draw placeholder for left video on main canvas
            window.ctx.fillStyle = '#333';
            window.ctx.fillRect(drawX, drawY, leftDrawWidth, drawHeight);
            window.ctx.fillStyle = '#fff';
            window.ctx.textAlign = 'center';
            window.ctx.font = '20px Arial';
            window.ctx.fillText('Left Tab Preview', drawX + leftDrawWidth / 2, drawY + drawHeight / 2);
        }
        if (rightVideoReady) {
            window.ctx.drawImage(window.rightTabVideoElement, drawX + leftDrawWidth, drawY, rightDrawWidth, drawHeight);
        } else {
            // Draw placeholder for right video on main canvas
            window.ctx.fillStyle = '#555';
            window.ctx.fillRect(drawX + leftDrawWidth, drawY, rightDrawWidth, drawHeight);
            window.ctx.fillStyle = '#fff';
            window.ctx.textAlign = 'center';
            window.ctx.font = '20px Arial';
            window.ctx.fillText('Right Tab Preview', drawX + leftDrawWidth + rightDrawWidth / 2, drawY + drawHeight / 2);
        }
    } else { // Portrait (stacked)
        // Calculate the height for each video within the 'contain' area
        const totalSourceHeight = (leftVideoSourceHeight + rightVideoSourceHeight) || 1; // Avoid division by zero
        const leftDrawHeight = drawHeight * (leftVideoSourceHeight / totalSourceHeight);
        const rightDrawHeight = drawHeight * (rightVideoSourceHeight / totalSourceHeight);

        if (leftVideoReady) {
            window.ctx.drawImage(window.leftTabVideoElement, drawX, drawY, drawWidth, leftDrawHeight);
        } else {
            // Draw placeholder for left video on main canvas
            window.ctx.fillStyle = '#333';
            window.ctx.fillRect(drawX, drawY, drawWidth, leftDrawHeight);
            window.ctx.fillStyle = '#fff';
            window.ctx.textAlign = 'center';
            window.ctx.font = '20px Arial';
            window.ctx.fillText('Left Tab Preview (Top)', drawX + drawWidth / 2, drawY + leftDrawHeight / 2);
        }
        if (rightVideoReady) {
            window.ctx.drawImage(window.rightTabVideoElement, drawX, drawY + leftDrawHeight, drawWidth, rightDrawHeight);
        } else {
            // Draw placeholder for right video on main canvas
            window.ctx.fillStyle = '#555';
            window.ctx.fillRect(drawX, drawY + leftDrawHeight, drawWidth, rightDrawHeight);
            window.ctx.fillStyle = '#fff';
            window.ctx.textAlign = 'center';
            window.ctx.font = '20px Arial';
            window.ctx.fillText('Right Tab Preview (Bottom)', drawX + drawWidth / 2, drawY + leftDrawHeight + rightDrawHeight / 2);
        }
    }


    // 3. Draw visualizers and avatars on top
    // These functions are assumed to be in visualizer.js
    if (typeof window.drawLeftVisualizerAndAvatar === 'function') { // Use window.drawLeftVisualizerAndAvatar
        window.drawLeftVisualizerAndAvatar();
    } else {
        // console.warn('drawLeftVisualizerAndAvatar function not found in updateCanvasDrawing.');
    }

    if (typeof window.drawRightVisualizerAndAvatar === 'function') { // Use window.drawRightVisualizerAndAvatar
        window.drawRightVisualizerAndAvatar();
    } else {
        // console.warn('drawRightVisualizerAndAvatar function not found in updateCanvasDrawing.');
    }
}

// Expose functions to the global scope
window.updateCanvasSize = updateCanvasSize;
window.updateCanvasDrawing = updateCanvasDrawing;
