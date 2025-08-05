// core.js

// Initialize global state
window.isInitialized = false;
window.currentOptions = null;
window.isRecording = false;
window.isPaused = false;
window.canvas = null;
window.ctx = null;

// Initialize canvas and context
function initializeCanvas() {
    const canvas = document.getElementById('recordCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return null;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Failed to get canvas context');
        return null;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    console.log('Canvas imageSmoothingEnabled set to true, imageSmoothingQuality set to high.');

    window.canvas = canvas;
    window.ctx = ctx;
    return ctx;
}

// Initialize UI elements
function initializeUIElements() {
    const elements = {
        // Recording options
        resolutionEl: 'resolution',
        videoFormatEl: 'videoFormat',
        videoBitrateInput: 'videoBitrate',
        includeAudioCheckbox: 'includeAudio',
        audioBitrateEl: 'audioBitrate',
        fpsDisplayEl: 'fpsCounter',  // Element for displaying current FPS

        // Prompt options
        durationSelectionEl: 'durationSelection',
        categorySelectionEl: 'categorySelection',
        customPromptInputEl: 'customPromptInput',
          // Storage and records
        storageStatusEl: 'storageStatus',
        recordsListEl: 'recordsList',
        recordsModal: 'recordsModal',
        closeRecordsModalBtn: 'closeRecordsModal',
        openRecordsModalBtn: 'openRecordsModalBtn',
        recordInfoModal: 'recordInfoModal',
        closeRecordInfoModalBtn: 'closeRecordInfoModal',
        
        // AI selection and layout
        leftAiSelectionEl: 'leftAiSelection',
        rightAiSelectionEl: 'rightAiSelection',
        screenLayoutEl: 'screenLayout',
        
        // Visualizer controls
        visualizerTabSelectionEl: 'visualizerTabSelection',
        visualizerDiameterInput: 'visualizerDiameter',
        avatarDiameterInput: 'avatarDiameter',
        maxAmplitudePercentageInput: 'maxAmplitudePercentage',
        positionXInput: 'positionX',
        positionYInput: 'positionY',
        backgroundBlurInputEl: 'backgroundBlurAmount',

        // Video elements
        leftTabVideoElement: 'leftTabVideo',
        rightTabVideoElement: 'rightTabVideo',

        // Control buttons
        streamToggleBtn: 'streamToggleBtn',
        recordPauseToggleBtn: 'recordPauseToggleBtn',
        stopBtn: 'stopBtn',
        goButton: 'goButton',
        themeToggleBtn: 'themeToggle',
        
        // Status and indicators
        status: 'status',
        timerDisplay: 'timerDisplay',
        recordingIndicator: 'recordingIndicator',

        // Modal elements
        miniPlayerModal: 'miniPlayerModal',
        miniPlayerVideo: 'miniPlayerVideo',
        closeMiniPlayer: 'closeMiniPlayer',
        recordsModal: 'recordsModal',
        closeRecordsModalBtn: 'closeRecordsModal',
        recordsList: 'recordsList',
        storageStatus: 'storageStatus',
        recordInfoModal: 'recordInfoModal',
        closeRecordInfoModal: 'closeRecordInfoModal',

        // Record info fields
        recordInfoThumbnail: 'recordInfoThumbnail',
        recordInfoTitle: 'recordInfoTitle',
        recordInfoDate: 'recordInfoDate',
        recordInfoDescription: 'recordInfoDescription',
        recordInfoShortDescription: 'recordInfoShortDescription',
        recordInfoSeoTags: 'recordInfoSeoTags',
        recordInfoScenario: 'recordInfoScenario',
        recordInfoInstructions: 'recordInfoInstructions',

        // Record modal buttons
        openRecordsModalBtn: 'openRecordsModalBtn',
        backToRecordsBtn: 'backToRecordsBtn',
        saveRecordInfoBtn: 'saveRecordInfoBtn',
        deleteRecordInfoBtn: 'deleteRecordInfoBtn'
    };

    const missingElements = [];
    for (const [key, id] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (element) {
            window[key] = element;
        } else {
            console.warn(`Element ${id} not found`);
            missingElements.push(id);
        }
    }

    // List of critical elements that must be present    
    const criticalElements = [
        'resolution',
        'videoFormat',
        'videoBitrate',
        'includeAudio',
        'audioBitrate',
        'fpsCounter',
        'leftAiSelection',
        'rightAiSelection',
        'durationSelection',
        'categorySelection',
        'visualizerTabSelection',
        'visualizerDiameter',
        'avatarDiameter',
        'maxAmplitudePercentage',
        'positionX',
        'positionY',
        'screenLayout',
        'customPromptInput',
        'backgroundBlurAmount'
    ];

    const missingCritical = criticalElements.filter(id => !document.getElementById(id));
    if (missingCritical.length > 0) {
        console.error(`Missing critical elements: ${missingCritical.join(', ')}`);
        return false;
    }

    window.isAppReadyToSave = true;
    return true;
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    if (window.isInitialized) {
        console.log('Core already initialized, skipping');
        return;
    }
    
    console.log('DOMContentLoaded fired in core.js. Starting initialization...');
    
    try {
        // Initialize canvas first
        const ctx = initializeCanvas();
        if (!ctx) {
            throw new Error('Failed to initialize canvas');
        }

        // Initialize UI elements
        const uiInitialized = initializeUIElements();
        if (!uiInitialized) {
            throw new Error('Failed to initialize critical UI elements');
        }

        // Set up profile images
        window.leftProfileImage = new Image();
        window.rightProfileImage = new Image();
        const chatgptAvatarUrl = chrome.runtime.getURL('assets/avatars/chatgpt.png');
        window.rightProfileImage.src = chatgptAvatarUrl;
        console.log('Right profile image default source set to:', chatgptAvatarUrl);

        // Load options and record metadata
        if (typeof loadOptions === 'function') {
            await loadOptions();
            console.log('Options loaded successfully');
        }

        if (typeof loadRecordMetadata === 'function') {
            await loadRecordMetadata();
            console.log('Record metadata loaded successfully');
        }

        // Add event listeners
        if (typeof addEventListeners === 'function') {
            addEventListeners();
            console.log('Event listeners added successfully');
        }

        // Add window resize handler
        window.addEventListener('resize', () => {
            console.log('Window resized. Updating canvas display size.');
            if (typeof updateCanvasSize === 'function') {
                updateCanvasSize();
            }
        });

        window.isInitialized = true;
        console.log('Core initialization complete');
    } catch (error) {
        console.error('Error during core initialization:', error);
        window.isInitialized = false;
    }
}, { once: true });

// Animation frame ID
let animationId = null;

// FPS tracking
let frameCount = 0;
let lastFpsUpdate = 0;
let currentFps = 0;


// Global UI Elements - These will be initialized in initializeUIElements()
// Keep centralized declaration here to document all the UI elements used across the application


// --- Function to apply screen layout CSS class ---
// Called on load and when screenLayoutEl changes
function applyScreenLayout(layout) {
    const body = document.body;
    if (layout === 'portrait') {
        body.classList.add('portrait-layout');
        body.classList.remove('landscape-layout'); // Ensure landscape is removed
        console.log('Applied portrait layout class.');
    } else { // Default to landscape
        body.classList.add('landscape-layout'); // Ensure landscape is added
        body.classList.remove('portrait-layout'); // Ensure portrait is removed
        console.log('Applied landscape layout class.');
    }
    // Ensure updateCanvasSize is called after applying layout class
    // updateCanvasSize is now in layout_manager.js
    if (typeof updateCanvasSize === 'function') {
        updateCanvasSize();
    } else {
        console.warn('updateCanvasSize function not found in applyScreenLayout.');
    }
}


// --- DOMContentLoaded Listener for UI Element Assignment and Initialization ---
// This listener is in core.js and runs first, assigning UI elements.
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded fired in core.js. Assigning UI elements.');
    
    try {
        // Initialize canvas first
        const ctx = initializeCanvas();
        if (!ctx) {
            throw new Error('Failed to initialize canvas');
        }

        // Initialize UI elements
        const uiInitialized = initializeUIElements();
        if (!uiInitialized) {
            throw new Error('Failed to initialize UI elements');
        }

        // Set up profile images
        window.leftProfileImage = new Image();
        window.rightProfileImage = new Image();
        window.rightProfileImage.src = chrome.runtime.getURL('assets/avatars/chatgpt.png');
        console.log('Right profile image default source set to:', window.rightProfileImage.src);

        // Load options and record metadata
        if (typeof loadOptions === 'function') {
            await loadOptions();
            console.log('Options loaded successfully');
        }

        if (typeof loadRecordMetadata === 'function') {
            await loadRecordMetadata();
            console.log('Record metadata loaded successfully');
        }

        // Add event listeners
        if (typeof addEventListeners === 'function') {
            addEventListeners();
            console.log('Event listeners added successfully');
        }

        // Add window resize handler
        window.addEventListener('resize', () => {
            console.log('Window resized. Updating canvas display size.');
            if (typeof updateCanvasSize === 'function') {
                updateCanvasSize();
            }
        });

        console.log('Core initialization complete');
    } catch (error) {
        console.error('Error during core initialization:', error);
    }
});

// Animation loop (kept in core.js as it handles canvas drawing)
// updateCanvasDrawing is now in layout_manager.js
function animate(timestamp) {
    // Ensure canvas and context are available
    if (!window.canvas || !window.ctx) {
        // console.warn('Canvas or context not available in animate loop.'); // Reduced log frequency
        animationId = requestAnimationFrame(animate); // Keep trying to animate
        return; // Stop drawing if canvas/context are missing
    }

    // Calculate FPS
    if (!lastFpsUpdate) {
        lastFpsUpdate = timestamp;
    }
    const elapsed = timestamp - lastFpsUpdate;

    if (elapsed > 1000) { // Update FPS every second        currentFps = Math.round(frameCount * 1000 / elapsed);
        if (window.fpsDisplayEl) { // Use the renamed element for displaying FPS
            window.fpsDisplayEl.textContent = currentFps;
        } else {
            // console.warn('fpsDisplayEl not found when updating FPS.'); // Reduced log frequency
        }
        frameCount = 0;
        lastFpsUpdate = timestamp;
    }
    frameCount++;

    // Clear canvas for the next frame
    window.ctx.clearRect(0, 0, window.canvas.width, window.canvas.height);

    // Draw the video streams and visualizers
    // Ensure updateCanvasDrawing is available (defined in layout_manager.js)
    if (typeof updateCanvasDrawing === 'function') {
        updateCanvasDrawing(); // Draw videos and visualizers
    } else {
        console.warn('updateCanvasDrawing function not found in animate loop.');
        // Fallback: draw solid background if drawing function is missing
        window.ctx.fillStyle = '#f0f0f0';
        window.ctx.fillRect(0, 0, window.canvas.width, window.canvas.height);
    }


    // Request the next frame
    animationId = requestAnimationFrame(animate);
}


// Handle visibility change - pause/resume recording and animation
document.addEventListener('visibilitychange', function () {
    // Ensure isRecording and isPaused are available (defined in recording.js)
    // Ensure updateRecordingTimer is available (defined in recording.js)
    if (typeof window.isRecording === 'undefined' || typeof window.isPaused === 'undefined' || typeof updateRecordingTimer === 'undefined') {
        console.warn('isRecording, isPaused, or updateRecordingTimer not defined in visibilitychange handler.');
        return;
    }

    if (document.hidden) {
        // Tab is hidden
        if (window.isRecording && !window.isPaused) {
            console.log('Tab hidden, pausing recording.');
            // Send message to background script to pause recording
            chrome.runtime.sendMessage({ action: 'pauseRecordingFromTabHidden' });
            // Pause the timer display
            if (window.timerInterval) { // timerInterval is in recording.js
                clearInterval(window.timerInterval);
                window.timerInterval = null;
            }
            // Pause animation loop
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        }
    } else {
        // Tab is visible
        // The background script will send a 'resumeRecording' message if needed
        // We don't automatically resume here as the background script is the source of truth.
        // If recording is active and not paused according to background, the resume message will trigger resume.
        console.log('Tab visible.');
        // Restart the timer display if recording is active and not paused (status will be synced by background message)
        // The resumeRecording function in recording.js will handle restarting the timer and animation.

        // If animation was stopped, restart it when tab becomes visible
        // Ensure video elements are available before restarting animation
        if (!animationId && window.leftTabVideoElement !== null && typeof window.leftTabVideoElement !== 'undefined' && window.rightTabVideoElement !== null && typeof window.rightTabVideoElement !== 'undefined' && (window.leftTabVideoElement?.srcObject || window.rightTabVideoElement?.srcObject)) {
            console.log('Tab visible, restarting animation loop.');
            animate();
        } else if (!animationId) {
            console.log('Tab visible, but no streams to animate.');
        }
    }
});

// Handle window resize - update display size, not actual canvas dimensions
// updateCanvasSize is now in layout_manager.js
window.addEventListener('resize', function () {
    console.log('Window resized. Updating canvas display size.');
    const container = document.querySelector('.canvas-container');
    if (container) {
        // The actual canvas dimensions are set by updateCanvasSize based on streams and resolution
        // We only need to ensure the container allows the canvas to display correctly
        // The CSS handles the display width and height (now using calculated canvas height)
        // Re-calling updateCanvasSize will recalculate the display size based on the new container width
        // Ensure updateCanvasSize is available (defined in layout_manager.js)
        if (typeof updateCanvasSize === 'function') {
            updateCanvasSize();
        } else {
            console.warn('updateCanvasSize function not found on resize.');
        }
    }
});


// Note: leftTabStream, rightTabStream, isRecording, isPaused, updateRecordingTimer, timerInterval, handleVideoMetadataLoaded are assumed to be in recording.js
// drawLeftVisualizerAndAvatar, drawRightVisualizerAndAvatar, leftAnalyser, rightAnalyser, updateVisualizerPixelPositions are assumed to be in visualizer.js
// All UI element variables are defined here and assumed to be global after DOMContentLoaded (which is now in this file).
// updateCanvasSize, updateCanvasDrawing are now in layout_manager.js.
// loadedAiSettings is assumed to be in storage.js
// loadOptions, saveOptions, debouncedSaveOptions are assumed to be in storage.js
// loadRecordMetadata, addRecordsModalListeners, closeAllModals are assumed to be in record_manager.js
// aiInfo is assumed to be in prompt_options.js
// toggleLeftAvatarPosition, toggleRightAvatarPosition are assumed to be in visualizer.js
// addEventListeners is defined in event_listeners.js
// selectTabs is defined in recording.js
// toggleTheme is assumed to be globally available from prompt_options.js
// Added null checks for all accessed UI elements for robustness.
// backToRecordsBtn, goButton, aiAvatarEl, rightAvatarEl, backgroundBlurInputEl are declared here and are global.
// includeAudioCheckbox is declared here and is global.
// leftAnalyser, rightAnalyser are assumed to be globally available from visualizer.js
// applyScreenLayout is defined in this file.

// Expose global variables and functions
window.canvas = canvas;
window.ctx = ctx;
window.animate = animate;
window.applyScreenLayout = applyScreenLayout;
