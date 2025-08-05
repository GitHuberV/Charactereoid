// visualizer.js

// Global variables for audio analysis
let leftAnalyser;
let rightAnalyser;
let leftAudioContext;
let rightAudioContext;

let hue = 0; // Initial hue for gradient (shared) - FIX: Explicitly declared with 'let'

// Global variables for avatar positions (pixel values, updated by updateVisualizerPixelPositions)
// These will be updated by updateVisualizerPixelPositions based on selected layout and percentage positions.
let leftCurrentAvatarPosition = { x: 0, y: 0 };
let rightCurrentAvatarPosition = { x: 0, y: 0 };

// Global variables for avatar and visualizer pixel sizes
// These will be derived from ratios and canvas size, and stored on currentLeft/RightVisualizerSettings
// No need to declare them here as separate globals anymore.
// let leftAvatarPixelSize = 0;
// let rightAvatarPixelSize = 0;
// let leftVisualizerPixelDiameter = 0;
// let rightVisualizerPixelDiameter = 0;


// --- Audio Visualization Setup ---

// Setup audio visualization for the left tab stream
function setupLeftAudioVisualization(stream) {
    if (!stream) {
        console.warn('No left stream provided for audio visualization setup.');
        return;
    }
    // Close existing context if open
    closeLeftAudioContext();

    try {
        leftAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = leftAudioContext.createMediaStreamSource(stream);
        leftAnalyser = leftAudioContext.createAnalyser();
        leftAnalyser.fftSize = 256; // Fast Fourier Transform size
        source.connect(leftAnalyser);
        console.log('Left audio visualization setup successfully.');
    } catch (error) {
        console.error('Error setting up left audio visualization:', error);
        leftAudioContext = null;
        leftAnalyser = null;
    }
}

// Close left audio context
function closeLeftAudioContext() {
    if (leftAudioContext) {
        leftAudioContext.close().then(() => {
            console.log('Left AudioContext closed.');
            leftAudioContext = null;
            leftAnalyser = null;
        }).catch(error => console.error('Error closing left AudioContext:', error));
    }
}

// Setup audio visualization for the right tab stream
function setupRightAudioVisualization(stream) {
    if (!stream) {
        console.warn('No right stream provided for audio visualization setup.');
        return;
    }
    // Close existing context if open
    closeRightAudioContext();

    try {
        rightAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = rightAudioContext.createMediaStreamSource(stream);
        rightAnalyser = rightAudioContext.createAnalyser();
        rightAnalyser.fftSize = 256; // Fast Fourier Transform size
        source.connect(rightAnalyser);
        console.log('Right audio visualization setup successfully.');
    } catch (error) {
        console.error('Error setting up right audio visualization:', error);
        rightAudioContext = null;
        rightAnalyser = null;
    }
}

// Close right audio context
function closeRightAudioContext() {
    if (rightAudioContext) {
        rightAudioContext.close().then(() => {
            console.log('Right AudioContext closed.');
            rightAudioContext = null;
            rightAnalyser = null;
        }).catch(error => console.error('Error closing right AudioContext:', error));
    }
}

// --- Drawing Functions ---

// Draw visualizer and avatar for the left tab
function drawLeftVisualizerAndAvatar() {
    if (!window.canvas || !window.ctx || !window.leftTabVideoElement || !window.leftProfileImage) {
        return;
    }

    const options = window.currentOptions;
    const visualizerSettings = getCurrentVisualizerSettings().left;
    const { position, _pixelPosition } = options.visualizerState;
    
    // Draw the avatar
    const avatarSize = visualizerSettings._avatarPixelSize;
    drawAvatar(window.leftProfileImage, _pixelPosition.x, _pixelPosition.y, avatarSize);

    // Draw the audio visualizer
    if (leftAnalyser) {
        const dataArray = new Uint8Array(leftAnalyser.frequencyBinCount);
        leftAnalyser.getByteFrequencyData(dataArray);
        
        drawVisualizerRing(
            _pixelPosition.x,
            _pixelPosition.y,
            visualizerSettings._visualizerPixelDiameter,
            dataArray,
            visualizerSettings.maxAmplitudePercentage,
            'left'
        );
    }
}

// Draw visualizer and avatar for the right tab
function drawRightVisualizerAndAvatar() {
    if (!window.canvas || !window.ctx || !window.rightTabVideoElement || !window.rightProfileImage) {
        return;
    }

    const options = window.currentOptions;
    const visualizerSettings = getCurrentVisualizerSettings().right;
    const { position, _pixelPosition } = options.visualizerState;
    
    // Draw the avatar
    const avatarSize = visualizerSettings._avatarPixelSize;
    drawAvatar(window.rightProfileImage, _pixelPosition.x, _pixelPosition.y, avatarSize);

    // Draw the audio visualizer
    if (rightAnalyser) {
        const dataArray = new Uint8Array(rightAnalyser.frequencyBinCount);
        rightAnalyser.getByteFrequencyData(dataArray);
        
        drawVisualizerRing(
            _pixelPosition.x,
            _pixelPosition.y,
            visualizerSettings._visualizerPixelDiameter,
            dataArray,
            visualizerSettings.maxAmplitudePercentage,
            'right'
        );
    }
}

// Update pixel positions and sizes based on current canvas dimensions
function updateCanvasLayout() {
    const { canvas } = window;
    if (!canvas) return;

    const options = window.currentOptions;
    const visualizerSettings = getCurrentVisualizerSettings();
    const minDimension = Math.min(canvas.width, canvas.height);

    // Update avatar and visualizer sizes
    ['left', 'right'].forEach(side => {
        const settings = visualizerSettings[side];
        if (settings) {
            settings._avatarPixelSize = minDimension * settings.avatarSizeRatio;
            settings._visualizerPixelDiameter = minDimension * settings.visualizerDiameterRatio;
        }
    });

    // Update pixel positions
    updatePixelPositions();
}


// --- Avatar Position Management ---

// Image elements for avatars (loaded in prompt_options.js)
let leftProfileImage = new Image();
let rightProfileImage = new Image();

// Add error handlers for image loading
leftProfileImage.onerror = () => console.error('Error loading left profile image:', leftProfileImage.src);
rightProfileImage.onerror = () => console.error('Error loading right profile image:', rightProfileImage.src);

// Function to update the avatar image sources
// Called from prompt_options.js when AI selection changes
function updateLeftProfileImage(url) {
    leftProfileImage.src = url;
    console.log('Left profile image source updated to:', url);
}

function updateRightProfileImage(url) {
    rightProfileImage.src = url;
    console.log('Right profile image source updated to:', url);
}


/**
 * Calculates the pixel position for an avatar based on its percentage position and canvas dimensions.
 * @param {object} positionPercentage - The position object with x and y as percentages (0.0 to 1.0).
 * @param {number} canvasWidth - The width of the canvas.
 * @param {number} canvasHeight - The height of the canvas.
 * @returns {{x: number, y: number}} The calculated pixel position.
 */
function getAvatarPixelPosition(positionPercentage, defaultPosition = { x: 0.5, y: 0.5 }) {
    if (!window.canvas) {
        console.warn('Canvas not available for position calculation');
        return { x: 0, y: 0 };
    }

    // Handle invalid or missing position
    if (!positionPercentage || typeof positionPercentage.x !== 'number' || typeof positionPercentage.y !== 'number') {
        console.warn('Using default position due to invalid input:', defaultPosition);
        positionPercentage = defaultPosition;
    }

    return {
        x: Math.round(positionPercentage.x * window.canvas.width),
        y: Math.round(positionPercentage.y * window.canvas.height)
    };
}


/**
 * Updates the temporary pixel positions and sizes for visualizers and avatars.
 * This function should be called whenever the canvas size changes or visualizer settings are loaded/updated.
 * It populates the _startPixelPosition, _defaultPixelPosition, _avatarPixelSize, and _visualizerPixelDiameter
 * properties on the currentLeftVisualizerSettings and currentRightVisualizerSettings objects.
 */
function updateVisualizerPixelPositions() {
    // Ensure canvas is available
    if (!window.canvas || !window.defaultOptions || !window.loadedAiSettings || !window.currentLeftVisualizerSettings || !window.currentRightVisualizerSettings) {
        console.warn('Canvas or essential settings not found in updateVisualizerPixelPositions. Skipping pixel position update.');
        return;
    }

    const minCanvasDimension = Math.min(window.canvas.width, window.canvas.height);
    const currentScreenLayout = window.screenLayoutEl ? window.screenLayoutEl.value : 'landscape'; // Get current screen layout    // Update settings for the LEFT tab (based on selected AI)
    const leftAiKey = window.leftAiSelectionEl ? window.leftAiSelectionEl.value : 'gemini'; // Fallback to gemini
    const leftSettings = window.loadedAiSettings[leftAiKey]?.visualizer?.left || window.defaultOptions.aiSettings[leftAiKey]?.visualizer?.left || window.defaultOptions.aiSettings.gemini.visualizer.left;

    if (leftSettings) {
        let startPosPercentageLeft;
        let defaultPosPercentageLeft;

        if (currentScreenLayout === 'portrait') {
            startPosPercentageLeft = leftSettings.portraitStartPosition;
            defaultPosPercentageLeft = leftSettings.portraitDefaultPosition;
        } else { // landscape
            startPosPercentageLeft = leftSettings.startPosition;
            defaultPosPercentageLeft = leftSettings.defaultPosition;
        }

        // Ensure position objects exist before calculating pixel positions
        leftSettings._startPixelPosition = getAvatarPixelPosition(startPosPercentageLeft, window.canvas.width, window.canvas.height);
        leftSettings._defaultPixelPosition = getAvatarPixelPosition(defaultPosPercentageLeft, window.canvas.width, window.canvas.height);

        leftSettings._avatarPixelSize = (leftSettings.avatarSizeRatio ?? window.defaultOptions.aiSettings.gemini.visualizer.left.avatarSizeRatio) * minCanvasDimension;
        leftSettings._visualizerPixelDiameter = (leftSettings.visualizerDiameterRatio ?? window.defaultOptions.aiSettings.gemini.visualizer.left.visualizerDiameterRatio) * minCanvasDimension;

        // Update the global currentLeftVisualizerSettings with these calculated pixel values
        Object.assign(window.currentLeftVisualizerSettings, leftSettings);
    } else {
        console.warn('Left settings not found for pixel position update.');
    }

    // Update settings for the RIGHT tab (always chatgpt)
    const rightSettings = window.loadedAiSettings['chatgpt']?.visualizer?.right || window.defaultOptions.aiSettings.chatgpt.visualizer.right;

    if (rightSettings) {
        let startPosPercentageRight;
        let defaultPosPercentageRight;

        if (currentScreenLayout === 'portrait') {
            startPosPercentageRight = rightSettings.portraitStartPosition;
            defaultPosPercentageRight = rightSettings.portraitDefaultPosition;
        } else { // landscape
            startPosPercentageRight = rightSettings.startPosition;
            defaultPosPercentageRight = rightSettings.defaultPosition;
        }

        // Ensure position objects exist before calculating pixel positions
        rightSettings._startPixelPosition = getAvatarPixelPosition(startPosPercentageRight, window.canvas.width, window.canvas.height);
        rightSettings._defaultPixelPosition = getAvatarPixelPosition(defaultPosPercentageRight, window.canvas.width, window.canvas.height);

        rightSettings._avatarPixelSize = (rightSettings.avatarSizeRatio ?? window.defaultOptions.aiSettings.chatgpt.visualizer.right.avatarSizeRatio) * minCanvasDimension;
        rightSettings._visualizerPixelDiameter = (rightSettings.visualizerDiameterRatio ?? window.defaultOptions.aiSettings.chatgpt.visualizer.right.visualizerDiameterRatio) * minCanvasDimension;

        // Update the global currentRightVisualizerSettings with these calculated pixel values
        Object.assign(window.currentRightVisualizerSettings, rightSettings);
    } else {
        console.warn('Right settings not found for pixel position update.');
    }


    // After updating pixel positions and sizes for ALL loaded settings,
    // update the current drawing positions (leftCurrentAvatarPosition, rightCurrentAvatarPosition)
    // based on the currentPositionState of the *active* settings.
    // Ensure currentLeftVisualizerSettings and currentRightVisualizerSettings are available
    if (window.currentLeftVisualizerSettings && typeof leftCurrentAvatarPosition !== 'undefined') {
        // Use the pre-calculated temporary pixel positions
        const initialLeftPosition = (window.currentLeftVisualizerSettings.currentPositionState === 'start' && window.currentLeftVisualizerSettings._startPixelPosition)
            ? window.currentLeftVisualizerSettings._startPixelPosition
            : (window.currentLeftVisualizerSettings._defaultPixelPosition || { x: leftCurrentAvatarPosition.x, y: leftCurrentAvatarPosition.y }); // Fallback to current if target is missing

        // Initialize leftCurrentAvatarPosition if it hasn't been already, or update its target for interpolation
        // This ensures the avatar starts at the correct pixel position on load/resize
        leftCurrentAvatarPosition.x = initialLeftPosition.x;
        leftCurrentAvatarPosition.y = initialLeftPosition.y;
        console.log('Initialized/Updated leftCurrentAvatarPosition based on active settings state.');
        console.log(`Left Avatar Pixel Size: ${window.currentLeftVisualizerSettings._avatarPixelSize}, Visualizer Diameter: ${window.currentLeftVisualizerSettings._visualizerPixelDiameter}`);


    } else {
        console.warn('currentLeftVisualizerSettings or leftCurrentAvatarPosition not found during initial position setup.');
    }

    if (window.currentRightVisualizerSettings && typeof rightCurrentAvatarPosition !== 'undefined') {
        // Use the pre-calculated temporary pixel positions
        const initialRightPosition = (window.currentRightVisualizerSettings.currentPositionState === 'start' && window.currentRightVisualizerSettings._startPixelPosition)
            ? window.currentRightVisualizerSettings._startPixelPosition
            : (window.currentRightVisualizerSettings._defaultPixelPosition || { x: rightCurrentAvatarPosition.x, y: rightCurrentAvatarPosition.y }); // Fallback to current if target is missing

        // Initialize rightCurrentAvatarPosition if it hasn't been already, or update its target for interpolation
        // This ensures the avatar starts at the correct pixel position on load/resize
        rightCurrentAvatarPosition.x = initialRightPosition.x;
        rightCurrentAvatarPosition.y = initialRightPosition.y;
        console.log('Initialized/Updated rightCurrentAvatarPosition based on active settings state.');
        console.log(`Right Avatar Pixel Size: ${window.currentRightVisualizerSettings._avatarPixelSize}, Visualizer Diameter: ${window.currentRightVisualizerSettings._visualizerPixelDiameter}`);

    } else {
        console.warn('currentRightVisualizerSettings or rightCurrentAvatarPosition not found during initial position setup.');
    }


    console.log(`Visualizer pixel positions and avatar sizes updated for canvas size ${window.canvas.width}x${window.canvas.height}.`);

    // Update the UI if the visualizer tab is currently selected
    // updateVisualizerUIBasedOnSelection is assumed to be in storage.js
    // Add a check to ensure visualizerTabSelectionEl is available before accessing its value
    if (window.visualizerTabSelectionEl && typeof window.updateVisualizerUIBasedOnSelection === 'function') {
        window.updateVisualizerUIBasedOnSelection(window.visualizerTabSelectionEl.value);
    } else {
        console.warn('visualizerTabSelectionEl or updateVisualizerUIBasedOnSelection not found. Skipping UI update in updateVisualizerPixelPositions.');
    }

    // No need to call updateCanvasDrawing here, updateCanvasSize already does it
}


// Function to smoothly interpolate avatar position towards target
const positionSmoothness = 0.15; // Factor for smooth interpolation (0.0 to 1.0)
function interpolatePosition(current, target, smoothness) {
    return {
        x: current.x + (target.x - current.x) * smoothness,
        y: current.y + (target.y - current.y) * smoothness
    };
}


// Function to draw the LEFT audio visualizer and avatar on the canvas
// Called from the animate loop in core.js
// updateCanvasDrawing is now in layout_manager.js and calls this function
function drawLeftVisualizerAndAvatar() {
    // Ensure canvas context (ctx from core.js) and active settings are available
    // Added check for currentLeftVisualizerSettings
    if (typeof window.ctx === 'undefined' || typeof window.currentLeftVisualizerSettings === 'undefined' || typeof leftCurrentAvatarPosition === 'undefined' || typeof window.canvas === 'undefined') {
        // console.error('Canvas context (ctx), currentLeftVisualizerSettings, leftCurrentAvatarPosition, or canvas is not defined in drawLeftVisualizerAndAvatar.');
        return; // Exit if essential elements are missing
    }

    const leftVisualizerSettings = window.currentLeftVisualizerSettings; // Use the active settings

    // --- ADDED NULL CHECK FOR SETTINGS ---
    if (!leftVisualizerSettings || typeof leftVisualizerSettings._avatarPixelSize === 'undefined' || typeof leftVisualizerSettings._visualizerPixelDiameter === 'undefined') {
        // console.warn('Left visualizer settings are null or missing pixel sizes, skipping drawing.');
        return; // Exit if settings are not loaded yet or missing derived pixel values
    }
    // --- END ADDED NULL CHECK ---


    // Determine the TARGET pixel position based on the currentPositionState
    // Use the pre-calculated temporary pixel positions based on the current layout
    const targetPixelPosition = (leftVisualizerSettings.currentPositionState === 'start' && leftVisualizerSettings._startPixelPosition)
        ? leftVisualizerSettings._startPixelPosition
        : (leftVisualizerSettings._defaultPixelPosition || { x: leftCurrentAvatarPosition.x, y: leftCurrentAvatarPosition.y }); // Fallback to current if target is missing


    // Smoothly update the current drawing position towards the target
    leftCurrentAvatarPosition = interpolatePosition(leftCurrentAvatarPosition, targetPixelPosition, positionSmoothness);


    // --- Calculate Avatar Size from Ratio ---
    // Use the pre-calculated pixel size stored in updateVisualizerPixelPositions
    const avatarDrawSize = leftVisualizerSettings._avatarPixelSize ?? 0;
    // --- End Calculate Avatar Size ---

    // --- Calculate Visualizer Diameter from Ratio ---
    // Use the pre-calculated pixel diameter stored in updateVisualizerPixelPositions
    const visualizerDrawDiameter = leftVisualizerSettings._visualizerPixelDiameter ?? 0; // Added visualizer pixel diameter
    const currentInnerRadius = visualizerDrawDiameter / 2; // Use calculated diameter for radius
    const currentMaxAmplitude = currentInnerRadius * (leftVisualizerSettings.maxAmplitudePercentage / 100);
    // --- End Calculate Visualizer Diameter ---

    // --- Calculate Shadow Blur based on Visualizer Diameter ---
    // Make shadow blur a proportion of the visualizer diameter. Adjust the multiplier (e.g., 0.1 to 0.2) as needed for desired effect.
    const shadowBlurAmount = visualizerDrawDiameter * 0.25; // Example: 15% of the visualizer diameter
    // --- End Calculate Shadow Blur ---


    // Only draw if the left tab stream is active and avatarDrawSize is valid
    if (window.leftTabStream && window.leftTabStream.active && avatarDrawSize > 0 && visualizerDrawDiameter > 0) { // Added check for visualizerDrawDiameter

        // --- Draw Left Audio Visualizer ---
        // Only draw visualizer if include audio is checked AND audio tracks are available and analyser is ready
        if (window.includeAudioCheckbox.checked && window.leftTabStream.getAudioTracks().length > 0 && leftAnalyser) {
            // Get frequency data locally within the drawing function
            const leftFrequencyData = new Uint8Array(leftAnalyser.frequencyBinCount);
            leftAnalyser.getByteFrequencyData(leftFrequencyData);

            // Pause hue animation when recording is paused
            // isRecording and isPaused are assumed to be globally available from recording.js
            if (typeof window.isRecording !== 'undefined' && typeof window.isPaused !== 'undefined' && window.isRecording && !window.isPaused) {
                hue = (hue + 0.7) % 360; // Animate hue only when recording and not paused
            }

            const frequencyStart = 20; // Lower frequency bound for visualization
            const frequencyEnd = 100; // Upper frequency bound for visualization

            const effectiveFrequencyEnd = Math.min(frequencyEnd, leftAnalyser.frequencyBinCount);
            const effectiveFrequencyStart = Math.min(frequencyStart, effectiveFrequencyEnd);
            const usedFrequencyCount = effectiveFrequencyEnd - effectiveFrequencyStart;

            if (usedFrequencyCount > 0) {
                // --- Draw Wavy Shape (Always) ---
                const outerPoints = [];
                const angleStep = (Math.PI * 2) / usedFrequencyCount;

                for (let i = 0; i < usedFrequencyCount; i++) {
                    const angle = i * angleStep;
                    const frequencyValue = leftFrequencyData[effectiveFrequencyStart + i];
                    // Calculate the radius for this angle based on frequency data, extending from innerRadius (no bass scaling)
                    const amplitudeExtension = (frequencyValue / 255) * currentMaxAmplitude; // Use max amplitude directly
                    const extension = 2 + amplitudeExtension; // minVisualizerExtension is 2
                    const radius = currentInnerRadius + extension;

                    const x = leftCurrentAvatarPosition.x + radius * Math.cos(angle);
                    const y = leftCurrentAvatarPosition.y + radius * Math.sin(angle);
                    outerPoints.push({ x, y });
                }

                window.ctx.beginPath();
                window.ctx.moveTo(outerPoints[0].x, outerPoints[0].y);

                for (let i = 0; i < outerPoints.length; i++) {
                    const current = outerPoints[i];
                    const next = outerPoints[(i + 1) % outerPoints.length];
                    const prev = outerPoints[(i - 1 + outerPoints.length) % outerPoints.length];

                    const cpX = current.x + (next.x - prev.x) / 4;
                    const cpY = current.y + (next.y - prev.y) / 4;

                    window.ctx.quadraticCurveTo(cpX, cpY, next.x, next.y);
                }

                window.ctx.closePath();

                // Create Radial gradient for the fill
                // Gradient extends from visualizer center (now leftCurrentAvatarPosition) to max possible outer edge (no bass scaling)
                const gradient = window.ctx.createRadialGradient(leftCurrentAvatarPosition.x, leftCurrentAvatarPosition.y, currentInnerRadius, leftCurrentAvatarPosition.x, leftCurrentAvatarPosition.y, currentInnerRadius + currentMaxAmplitude); // Removed bass scale here
                // Adjusted color stops for smoother two-color blend
                gradient.addColorStop(0, '#ffffff'); // White in the center
                gradient.addColorStop(1, `hsl(${hue}, 100%, 50%)`); // Deeper color at the edge


                window.ctx.fillStyle = gradient;
                // Apply glow effect
                window.ctx.shadowBlur = shadowBlurAmount * 2; // Use calculated shadow blur, potentially larger for wavy fill
                window.ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
                window.ctx.globalAlpha = 0.6; // Adjusted globalAlpha for dimness/transparency
                window.ctx.fill();
                window.ctx.shadowBlur = 0;
                window.ctx.shadowColor = 'transparent';
                window.ctx.globalAlpha = 1; // Reset globalAlpha

            } else {
                // If no frequency data (or silent), draw a simple grey circle
                const outerRadius = currentInnerRadius + 2; // Base size when silent, minVisualizerExtension is 2
                window.ctx.beginPath();
                // Ensure radius is not negative
                window.ctx.arc(leftCurrentAvatarPosition.x, leftCurrentAvatarPosition.y, Math.max(0, outerRadius), 0, Math.PI * 2); // Use base outerRadius for placeholder
                window.ctx.fillStyle = '#555'; // Grey placeholder
                window.ctx.fill();
                window.ctx.closePath();
            }
        } else {
            // If audio not included or no audio data, draw a simple grey circle
            window.ctx.beginPath();
            // Ensure radius is not negative
            window.ctx.arc(leftCurrentAvatarPosition.x, leftCurrentAvatarPosition.y, Math.max(0, avatarDrawSize / 2), 0, Math.PI * 2); // Use calculated size for placeholder
            window.ctx.fillStyle = '#555'; // Grey placeholder
            window.ctx.fill();
            window.ctx.closePath();
        }


        // Draw the circular profile image over the visualizer (if stream is active)
        if (window.leftProfileImage.complete && window.leftProfileImage.naturalWidth !== 0) {
            window.ctx.save();
            window.ctx.beginPath();
            // Ensure radius is not negative
            window.ctx.arc(leftCurrentAvatarPosition.x, leftCurrentAvatarPosition.y, Math.max(0, avatarDrawSize / 2), 0, Math.PI * 2, false); // Use calculated avatarDrawSize
            window.ctx.closePath();
            window.ctx.clip(); // Clip the drawing area to the circle
            // Ensure avatarSize is positive before drawing image
            if (avatarDrawSize > 0) {
                window.ctx.drawImage(window.leftProfileImage,
                    leftCurrentAvatarPosition.x - avatarDrawSize / 2, // Use calculated size
                    leftCurrentAvatarPosition.y - avatarDrawSize / 2, // Use calculated size
                    avatarDrawSize, // Use calculated size
                    avatarDrawSize); // Use calculated size
            } else {
                console.warn('Left Avatar draw size is zero or negative, skipping image draw.');
            }


            window.ctx.restore(); // Restore the canvas state
        } else {
            // Draw a placeholder circle if image not loaded but stream is active
            window.ctx.beginPath();
            // Ensure radius is not negative
            window.ctx.arc(leftCurrentAvatarPosition.x, leftCurrentAvatarPosition.y, Math.max(0, avatarDrawSize / 2), 0, Math.PI * 2); // Use calculated size for placeholder
            window.ctx.fillStyle = '#777'; // Slightly darker grey placeholder
            window.ctx.fill();
            window.ctx.closePath();
        }
    } // End check for leftTabStream active and valid avatarDrawSize and visualizerDrawDiameter
    // If leftTabStream is NOT active or avatarDrawSize/visualizerDrawDiameter is invalid, nothing is drawn for the left side.
}

// Function to draw the RIGHT audio visualizer and avatar on the canvas
// Called from the animate loop in core.js
// updateCanvasDrawing is now in layout_manager.js and calls this function
function drawRightVisualizerAndAvatar() {
    // Ensure canvas, ctx, rightAnalyser, rightTabVideoElement are available (declared in core.js)
    if (!window.canvas || !window.ctx || !window.rightTabVideoElement || !window.currentRightVisualizerSettings || !window.rightProfileImage) { // Added currentRightVisualizerSettings and rightProfileImage check
        // console.warn('Right visualizer elements not ready.'); // Too frequent log
        return;
    }

    // Ensure the video element has loaded and has a valid source
    if (window.rightTabVideoElement.readyState < 2 || !window.rightTabVideoElement.srcObject) {
        // console.warn('Right video element not ready or no stream source.'); // Too frequent log
        return;
    }

    // Get settings from the global currentRightVisualizerSettings
    const { maxAmplitudePercentage, _avatarPixelSize, _visualizerPixelDiameter } = window.currentRightVisualizerSettings;
    const visualizerBaseDiameter = _visualizerPixelDiameter;
    const avatarSize = _avatarPixelSize;

    // Exit early if calculated sizes are invalid
    if (avatarSize <= 0 || visualizerBaseDiameter <= 0) {
        // console.warn('Right avatar or visualizer pixel size is zero or negative. Skipping draw.');
        return;
    }

    // Position (using current pixel position)
    const centerX = rightCurrentAvatarPosition.x;
    const centerY = rightCurrentAvatarPosition.y;


    // --- Draw Right Audio Visualizer ---
    // Only draw visualizer if include audio is checked AND audio tracks are available and analyser is ready
    if (window.includeAudioCheckbox.checked && window.rightTabStream && window.rightTabStream.getAudioTracks().length > 0 && rightAnalyser) {
        const bufferLength = rightAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        rightAnalyser.getByteFrequencyData(dataArray);

        // Calculate average amplitude
        const averageAmplitude = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;

        // Scale amplitude based on maxAmplitudePercentage
        const scaledAmplitude = (averageAmplitude / 255) * (maxAmplitudePercentage / 100); // Normalize to 0-1 and scale by max percentage
        const dynamicDiameter = visualizerBaseDiameter * (1 + scaledAmplitude); // Visualizer grows with amplitude

        // Pause hue animation when recording is paused
        // isRecording and isPaused are assumed to be globally available from recording.js
        if (typeof window.isRecording !== 'undefined' && typeof window.isPaused !== 'undefined' && window.isRecording && !window.isPaused) {
            hue = (hue + 0.7) % 360; // Animate hue only when recording and not paused
        }

        const currentInnerRadius = visualizerBaseDiameter / 2; // Use calculated diameter for radius
        const currentMaxAmplitude = currentInnerRadius * (maxAmplitudePercentage / 100);

        const frequencyStart = 20; // Lower frequency bound for visualization
        const frequencyEnd = 100; // Upper frequency bound for visualization

        const effectiveFrequencyEnd = Math.min(frequencyEnd, rightAnalyser.frequencyBinCount);
        const effectiveFrequencyStart = Math.min(frequencyStart, effectiveFrequencyEnd);
        const usedFrequencyCount = effectiveFrequencyEnd - effectiveFrequencyStart;

        if (usedFrequencyCount > 0) {
            // --- Draw Wavy Shape (Always) ---
            const outerPoints = [];
            const angleStep = (Math.PI * 2) / usedFrequencyCount;

            for (let i = 0; i < usedFrequencyCount; i++) {
                const angle = i * angleStep;
                const frequencyValue = dataArray[effectiveFrequencyStart + i];
                // Calculate the radius for this angle based on frequency data, extending from innerRadius (no bass scaling)
                const amplitudeExtension = (frequencyValue / 255) * currentMaxAmplitude; // Use max amplitude directly
                const extension = 2 + amplitudeExtension; // minVisualizerExtension is 2
                const radius = currentInnerRadius + extension;

                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                outerPoints.push({ x, y });
            }

            window.ctx.beginPath();
            window.ctx.moveTo(outerPoints[0].x, outerPoints[0].y);

            for (let i = 0; i < outerPoints.length; i++) {
                const current = outerPoints[i];
                const next = outerPoints[(i + 1) % outerPoints.length];
                const prev = outerPoints[(i - 1 + outerPoints.length) % outerPoints.length];

                const cpX = current.x + (next.x - prev.x) / 4;
                const cpY = current.y + (next.y - prev.y) / 4;

                window.ctx.quadraticCurveTo(cpX, cpY, next.x, next.y);
            }

            window.ctx.closePath();

            // Create Radial gradient for the fill
            // Gradient extends from visualizer center (now centerX) to max possible outer edge (no bass scaling)
            const gradient = window.ctx.createRadialGradient(centerX, centerY, currentInnerRadius, centerX, centerY, currentInnerRadius + currentMaxAmplitude); // Removed bass scale here
            // Adjusted color stops for smoother two-color blend
            gradient.addColorStop(0, '#ffffff'); // White in the center
            gradient.addColorStop(1, `hsl(${hue}, 100%, 50%)`); // Deeper color at the edge


            window.ctx.fillStyle = gradient;
            // Apply glow effect
            const shadowBlurAmount = visualizerBaseDiameter * 0.25;
            window.ctx.shadowBlur = shadowBlurAmount * 2; // Use calculated shadow blur, potentially larger for wavy fill
            window.ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
            window.ctx.globalAlpha = 0.6; // Adjusted globalAlpha for dimness/transparency
            window.ctx.fill();
            window.ctx.shadowBlur = 0;
            window.ctx.shadowColor = 'transparent';
            window.ctx.globalAlpha = 1; // Reset globalAlpha

        } else {
            // If no frequency data (or silent), draw a simple grey circle
            const outerRadius = currentInnerRadius + 2; // Base size when silent, minVisualizerExtension is 2
            window.ctx.beginPath();
            // Ensure radius is not negative
            window.ctx.arc(centerX, centerY, Math.max(0, outerRadius), 0, Math.PI * 2); // Use base outerRadius for placeholder
            window.ctx.fillStyle = '#555'; // Grey placeholder
            window.ctx.fill();
            window.ctx.closePath();
        }
    } else {
        // If audio not included or no audio data, draw a simple grey circle (or hide if preferred)
        window.ctx.beginPath();
        // Ensure radius is not negative
        window.ctx.arc(centerX, centerY, Math.max(0, avatarSize / 2), 0, Math.PI * 2); // Use calculated size for placeholder
        window.ctx.fillStyle = '#555'; // Grey placeholder
        window.ctx.fill();
        window.ctx.closePath();
    }

    // Draw the circular profile image over the visualizer (if stream is active)
    if (window.rightProfileImage.complete && window.rightProfileImage.naturalWidth !== 0) {
        window.ctx.save();
        window.ctx.beginPath();
        // Ensure radius is not negative
        window.ctx.arc(centerX, centerY, Math.max(0, avatarSize / 2), 0, Math.PI * 2, false); // Use calculated avatarSize
        window.ctx.closePath();
        window.ctx.clip(); // Clip the drawing area to the circle
        // Ensure avatarSize is positive before drawing image
        if (avatarSize > 0) {
            window.ctx.drawImage(window.rightProfileImage,
                centerX - avatarSize / 2, // Use calculated size
                centerY - avatarSize / 2, // Use calculated size
                avatarSize, // Use calculated size
                avatarSize); // Use calculated size
        } else {
            console.warn('Right Avatar draw size is zero or negative, skipping image draw.');
        }

        window.ctx.restore(); // Restore the canvas state
    } else {
        // Draw a placeholder circle if image not loaded but stream is active
        window.ctx.beginPath();
        // Ensure radius is not negative
        window.ctx.arc(centerX, centerY, Math.max(0, avatarSize / 2), 0, Math.PI * 2); // Use calculated size for placeholder
        window.ctx.fillStyle = '#777'; // Slightly darker grey placeholder
        window.ctx.fill();
        window.ctx.closePath();
    }
}

// Function to toggle the LEFT avatar position between start and default
// Called from event_listeners.js
// updateCanvasDrawing is now in layout_manager.js and calls this function
function toggleLeftAvatarPosition(forcePosition) {
    // Ensure active settings, debouncedSaveOptions, updateCanvasDrawing are available
    // updateCanvasDrawing is now in layout_manager.js
    if (typeof window.currentLeftVisualizerSettings === 'undefined' ||
        typeof window.debouncedSaveOptions === 'undefined' ||
        typeof window.updateCanvasDrawing === 'undefined' ||
        typeof window.screenLayoutEl === 'undefined') { // Added screenLayoutEl check
        console.error('Required variables or functions not defined for toggleLeftAvatarPosition.');
        return;
    }

    const visualizerSettings = window.currentLeftVisualizerSettings;
    const currentScreenLayout = window.screenLayoutEl.value; // Get current screen layout


    // Determine new position based on forcePosition
    if (forcePosition === 's') {
        visualizerSettings.currentPositionState = 'start';
        console.log(`Left Avatar forcefully moved to Start Position (${currentScreenLayout}).`);
    } else if (forcePosition === 'd') {
        visualizerSettings.currentPositionState = 'default';
        console.log(`Left Avatar forcefully moved to Default Position (${currentScreenLayout}).`);
    } else {
        // Toggle between 'start' and 'default' if no valid forcePosition
        if (visualizerSettings.currentPositionState === 'default') {
            visualizerSettings.currentPositionState = 'start';
            console.log(`Left Avatar toggled to Start Position (${currentScreenLayout}).`);
        } else {
            visualizerSettings.currentPositionState = 'default';
            console.log(`Left Avatar toggled to Default Position (${currentScreenLayout}).`);
        }
    }

    // Update the UI if the left tab is selected
    if (typeof window.updateVisualizerUIBasedOnSelection === 'function' &&
        typeof window.visualizerTabSelectionEl !== 'undefined' &&
        window.visualizerTabSelectionEl.value === 'left') {
        window.updateVisualizerUIBasedOnSelection('left');
    }

    window.debouncedSaveOptions();
    window.updateCanvasDrawing();
}


// Function to toggle the RIGHT avatar position between start and default
// Called from event_listeners.js
// updateCanvasDrawing is now in layout_manager.js and calls this function
function toggleRightAvatarPosition(forcePosition) {
    // Ensure active settings, debouncedSaveOptions, updateCanvasDrawing are available
    // updateCanvasDrawing is now in layout_manager.js
    if (typeof window.currentRightVisualizerSettings === 'undefined' ||
        typeof window.debouncedSaveOptions === 'undefined' ||
        typeof window.updateCanvasDrawing === 'undefined' ||
        typeof window.screenLayoutEl === 'undefined') { // Added screenLayoutEl check
        console.error('Required variables or functions not defined for toggleRightAvatarPosition.');
        return;
    }

    const visualizerSettings = window.currentRightVisualizerSettings;
    const currentScreenLayout = window.screenLayoutEl.value; // Get current screen layout


    // Determine new position based on forcePosition
    if (forcePosition === 's') {
        visualizerSettings.currentPositionState = 'start';
        console.log(`Right Avatar forcefully moved to Start Position (${currentScreenLayout}).`);
    } else if (forcePosition === 'd') {
        visualizerSettings.currentPositionState = 'default';
        console.log(`Right Avatar forcefully moved to Default Position (${currentScreenLayout}).`);
    } else {
        // Toggle between 'start' and 'default' if no valid forcePosition
        if (visualizerSettings.currentPositionState === 'default') {
            visualizerSettings.currentPositionState = 'start';
            console.log(`Right Avatar toggled to Default Position (${currentScreenLayout}).`);
        } else {
            visualizerSettings.currentPositionState = 'default';
            console.log(`Right Avatar toggled to Default Position (${currentScreenLayout}).`);
        }
    }

    // Update the UI if the right tab is selected
    if (typeof window.updateVisualizerUIBasedOnSelection === 'function' &&
        typeof window.visualizerTabSelectionEl !== 'undefined' &&
        window.visualizerTabSelectionEl.value === 'right') {
        window.updateVisualizerUIBasedOnSelection('right');
    }

    window.debouncedSaveOptions();
    window.updateCanvasDrawing();
}

// --- End Avatar Movement Functions ---


// Expose necessary functions to the global scope
window.setupLeftAudioVisualization = setupLeftAudioVisualization;
window.closeLeftAudioContext = closeLeftAudioContext;
window.setupRightAudioVisualization = setupRightAudioVisualization;
window.closeRightAudioContext = closeRightAudioContext;
window.drawLeftVisualizerAndAvatar = drawLeftVisualizerAndAvatar;
window.drawRightVisualizerAndAvatar = drawRightVisualizerAndAvatar;
window.updateVisualizerPixelPositions = updateVisualizerPixelPositions;
window.toggleLeftAvatarPosition = toggleLeftAvatarPosition;
window.toggleRightAvatarPosition = toggleRightAvatarPosition;
window.getAvatarPixelPosition = getAvatarPixelPosition; // Expose for storage.js
window.leftProfileImage = leftProfileImage; // Expose for prompt_options.js
window.rightProfileImage = rightProfileImage; // Expose for core.js (initial load) and prompt_options.js (if needed)
window.leftCurrentAvatarPosition = leftCurrentAvatarPosition; // Expose for storage.js
window.rightCurrentAvatarPosition = rightCurrentAvatarPosition; // Expose for storage.js
window.updateLeftProfileImage = updateLeftProfileImage;
window.updateRightProfileImage = updateRightProfileImage;
