// storage.js

// Default options for the extension
const defaultOptions = {
    resolution: '1080',
    videoFormat: 'mp4',
    videoBitrate: 15,
    includeAudio: false,
    audioBitrate: 128,
    fps: 60,
    aiSelection: {
        leftTab: 'gemini',
        rightTab: 'chatgpt'
    },
    visualizerState: {
        positionMode: 'default', // 'start' or 'default'
        position: { x: 0.5, y: 0.5 }, // Current position in percentage
        _pixelPosition: { x: 0, y: 0 } // Current position in pixels (calculated)
    },
    // Updated Duration Options
    durationSelection: 'medium', // Default to medium
    categorySelection: 'education',
    selectedGenres: [],
    theme: 'light', // 'light' or 'dark'
    // Added Screen Layout Option
    screenLayout: 'landscape', // Default screen layout
    customPromptText: '', // Added default for custom prompt text
    // New: Background blur amount in pixels
    backgroundBlurAmount: 10, // Default blur amount
    // Default visualizer settings per AI, now nested for left and right tabs
    aiSettings: {
        gemini: {
            visualizer: {
                left: {
                    visualizerDiameterRatio: 0.2778, // Visualizer shape diameter as a ratio of the minimum canvas dimension (approx 300px at 1080p height, 300/1080 ≈ 0.2778)
                    avatarSizeRatio: 0.2685, // Avatar size as a ratio of the minimum canvas dimension (approx 290px at 1080p height, 290/1080 ≈ 0.2685)
                    maxAmplitudePercentage: 40,
                    positions: {
                        landscape: {
                            start: { x: 0.20, y: 0.5 },
                            default: { x: 0.25, y: 0.5 }
                        },
                        portrait: {
                            start: { x: 0.5, y: 0.20 },
                            default: { x: 0.5, y: 0.25 }
                        }
                    },
                    _avatarPixelSize: 0,
                    _visualizerPixelDiameter: 0 // Added temporary pixel diameter
                }
            }
        },
        chatgpt: {
            visualizer: {
                left: {
                    visualizerDiameterRatio: 0.2778, // Ratio
                    avatarSizeRatio: 0.2685, // Ratio
                    maxAmplitudePercentage: 40,
                    positions: {
                        landscape: {
                            start: { x: 0.20, y: 0.5 },
                            default: { x: 0.25, y: 0.5 }
                        },
                        portrait: {
                            start: { x: 0.5, y: 0.20 },
                            default: { x: 0.5, y: 0.25 }
                        }
                    },
                    _avatarPixelSize: 0,
                    _visualizerPixelDiameter: 0 // Added temporary pixel diameter
                },
                right: {
                    visualizerDiameterRatio: 0.2778, // Ratio
                    avatarSizeRatio: 0.2685, // Ratio
                    maxAmplitudePercentage: 40,
                    positions: {
                        landscape: {
                            start: { x: 0.80, y: 0.5 },
                            default: { x: 0.75, y: 0.5 }
                        },
                        portrait: {
                            start: { x: 0.5, y: 0.80 },
                            default: { x: 0.5, y: 0.75 }
                        }
                    },
                    _avatarPixelSize: 0,
                    _visualizerPixelDiameter: 0 // Added temporary pixel diameter
                }
            }
        }
    }
};

// Key for options in chrome.storage.sync
const OPTIONS_STORAGE_KEY = 'options';

// Global variable to hold loaded AI settings for easy access (default settings per AI)
// This object will hold the *entire* aiSettings structure from storage.
let loadedAiSettings = {};

// Global variables for the currently ACTIVE visualizer settings for left and right tabs
// These will be references (or shallow copies if needed, but references are fine for now)
// to the relevant parts of loadedAiSettings.
// --- Initialized with minimal structure to prevent null errors ---
// Initialize with a deep copy of the default settings to ensure they are never null
let currentLeftVisualizerSettings = mergeDeep({}, defaultOptions.aiSettings.gemini.visualizer.left);
let currentRightVisualizerSettings = mergeDeep({}, defaultOptions.aiSettings.chatgpt.visualizer.right);
// --- End Initialization ---

// Flag to indicate if the application is ready to save options
let isAppReadyToSave = false;


// Debounce function to limit how often saveOptions is called
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// Create a debounced version of saveOptions
const debouncedSaveOptions = debounce(saveOptions, 100); // Save options after 100ms of inactivity


// Function to save options to chrome.storage.sync
function saveOptions() {
    // --- Check if the app is ready to save ---
    if (!window.isAppReadyToSave) { // Changed to window.isAppReadyToSave
        console.warn('App not ready to save options yet. Skipping save.');
        return;
    }
    // --- End Check ---

    // --- Robust Check for Core UI Elements ---
    // Check if a few critical UI elements are defined before proceeding.
    // This helps prevent errors if saveOptions is called before the DOM is fully ready.
    if (typeof window.leftAiSelectionEl === 'undefined' || typeof window.rightAiSelectionEl === 'undefined' || typeof window.resolutionEl === 'undefined' || typeof window.customPromptInputEl === 'undefined' || typeof window.visualizerTabSelectionEl === 'undefined' || typeof window.canvas === 'undefined' || typeof window.avatarDiameterInput === 'undefined' || typeof window.visualizerDiameterInput === 'undefined' || typeof window.screenLayoutEl === 'undefined' || typeof window.backgroundBlurInputEl === 'undefined') {
        console.warn('Core UI elements not fully loaded for saving options or canvas not available. Skipping save.');
        return;
    }
    // --- End Robust Check ---


    const selectedVisualizerTab = window.visualizerTabSelectionEl.value;
    const currentScreenLayout = window.screenLayoutEl.value; // Get current screen layout
    let aiKeyForSaving; // The AI key under which to save the settings

    // Determine which AI's settings to save based on the selected tab
    if (selectedVisualizerTab === 'left') {
        aiKeyForSaving = window.leftAiSelectionEl.value; // Save settings for the currently selected AI on the left tab
    } else if (selectedVisualizerTab === 'right') {
        aiKeyForSaving = window.rightAiSelectionEl.value; // Always save settings for ChatGPT on the right tab
    } else {
        console.error('Unknown visualizer tab selected for saving:', selectedVisualizerTab);
        return;
    }

    // Determine which active settings object to read from for saving
    // This is a reference to the object within loadedAiSettings
    const activeSettingsToSave = (selectedVisualizerTab === 'left') ? currentLeftVisualizerSettings : currentRightVisualizerSettings;


    // Ensure the active settings object exists and is a valid object
    if (!activeSettingsToSave || typeof activeSettingsToSave !== 'object') {
        console.error(`Assertion failed: Active settings for tab "${selectedVisualizerTab}" is not a valid object when attempting to save.`);
        return;
    }

    // --- Direct Update of Loaded Settings ---
    // Instead of merging the activeSettingsToSave back into loadedAiSettings,
    // we directly update the properties on the activeSettingsToSave object.
    // Since activeSettingsToSave is a reference to the relevant part of loadedAiSettings,
    // this directly modifies the loadedAiSettings structure in memory.

    // Update properties from UI inputs
    activeSettingsToSave.maxAmplitudePercentage = parseInt(window.maxAmplitudePercentageInput.value) || activeSettingsToSave.maxAmplitudePercentage; // Use current value as fallback
    activeSettingsToSave.currentPositionState = window.visualizerPositionSelectionEl.value; // Save the selected position state

    // Calculate the minimum dimension of the current canvas
    const minCanvasDimension = Math.min(window.canvas.width, window.canvas.height);

    // --- Save Visualizer Diameter as Ratio ---
    const visualizerPixelValue = parseFloat(window.diameterInput.value);
    if (!isNaN(visualizerPixelValue) && minCanvasDimension > 0) {
        // Calculate the ratio and save it
        activeSettingsToSave.visualizerDiameterRatio = visualizerPixelValue / minCanvasDimension;
        console.log(`Saved visualizerDiameterRatio for tab "${selectedVisualizerTab}": ${activeSettingsToSave.visualizerDiameterRatio}`);
    } else {
        console.warn(`Invalid pixel input for visualizer diameter or canvas dimension is zero. Retaining previous visualizerDiameterRatio.`);
        // Keep the last valid ratio if input is invalid or canvas is zero
    }
    // --- End Save Visualizer Diameter as Ratio ---


    // --- Save Avatar Size as Ratio ---
    const avatarPixelValue = parseFloat(window.avatarDiameterInput.value);
    if (!isNaN(avatarPixelValue) && minCanvasDimension > 0) {
        // Calculate the ratio and save it
        activeSettingsToSave.avatarSizeRatio = avatarPixelValue / minCanvasDimension;
        console.log(`Saved avatarSizeRatio for tab "${selectedVisualizerTab}": ${activeSettingsToSave.avatarSizeRatio}`);
    } else {
        console.warn(`Invalid pixel input for avatar diameter or canvas dimension is zero. Retaining previous avatarSizeRatio.`);
        // Keep the last valid ratio if input is invalid or canvas is zero
    }
    // --- End Save Avatar Size as Ratio ---


    // Convert pixel positions from UI inputs back to percentage relative to canvas size
    if (window.canvas && window.canvas.width > 0 && window.canvas.height > 0) {
        const startInputX = parseFloat(window.startXInput.value);
        const startInputY = parseFloat(window.startYInput.value);
        const defaultInputX = parseFloat(window.defaultXInput.value);
        const defaultInputY = parseFloat(window.defaultYInput.value);

        // Only update percentage if the pixel input is a valid number
        if (!isNaN(startInputX) && !isNaN(startInputY)) {
            // Save positions based on the current screen layout and selected tab
            if (currentScreenLayout === 'portrait') {
                // Ensure portraitStartPosition object exists
                if (!activeSettingsToSave.portraitStartPosition) activeSettingsToSave.portraitStartPosition = { x: 0, y: 0 };
                activeSettingsToSave.portraitStartPosition.x = startInputX / window.canvas.width;
                activeSettingsToSave.portraitStartPosition.y = startInputY / window.canvas.height;
                console.log(`Saved portrait start position for tab "${selectedVisualizerTab}": ${activeSettingsToSave.portraitStartPosition.x}, ${activeSettingsToSave.portraitStartPosition.y}`);
            } else { // landscape
                // Ensure startPosition object exists
                if (!activeSettingsToSave.startPosition) activeSettingsToSave.startPosition = { x: 0, y: 0 };
                activeSettingsToSave.startPosition.x = startInputX / window.canvas.width;
                activeSettingsToSave.startPosition.y = startInputY / window.canvas.height;
                console.log(`Saved landscape start position for tab "${selectedVisualizerTab}": ${activeSettingsToSave.startPosition.x}, ${activeSettingsToSave.startPosition.y}`);
            }
        } else {
            console.warn(`Invalid pixel input for ${selectedVisualizerTab} start position. Retaining previous percentage.`);
            // Keep the last valid percentage if input is invalid
        }

        if (!isNaN(defaultInputX) && !isNaN(defaultInputY)) {
            // Save positions based on the current screen layout and selected tab
            if (currentScreenLayout === 'portrait') {
                // Ensure portraitDefaultPosition object exists
                if (!activeSettingsToSave.portraitDefaultPosition) activeSettingsToSave.portraitDefaultPosition = { x: 0, y: 0 };
                activeSettingsToSave.portraitDefaultPosition.x = defaultInputX / window.canvas.width;
                activeSettingsToSave.portraitDefaultPosition.y = defaultInputY / window.canvas.height;
                console.log(`Saved portrait default position for tab "${selectedVisualizerTab}": ${activeSettingsToSave.portraitDefaultPosition.x}, ${activeSettingsToSave.portraitDefaultPosition.y}`);
            } else { // landscape
                // Ensure defaultPosition object exists
                if (!activeSettingsToSave.defaultPosition) activeSettingsToSave.defaultPosition = { x: 0, y: 0 };
                activeSettingsToSave.defaultPosition.x = defaultInputX / window.canvas.width;
                activeSettingsToSave.defaultPosition.y = defaultInputY / window.canvas.height;
                console.log(`Saved landscape default position for tab "${selectedVisualizerTab}": ${activeSettingsToSave.defaultPosition.x}, ${activeSettingsToSave.defaultPosition.y}`);
            }
        } else {
            console.warn(`Invalid pixel input for ${selectedVisualizerTab} default position. Retaining previous percentage.`);
            // Keep the last valid percentage if input is invalid
        }

        // Update the temporary pixel positions and sizes on the active settings object as well,
        // so the drawing loop uses the latest values immediately.
        // getAvatarPixelPosition is assumed to be in visualizer.js
        if (typeof getAvatarPixelPosition === 'function') {
            // Recalculate the temporary pixel positions based on the current layout and saved percentages
            const startPosPercentage = (currentScreenLayout === 'portrait' && activeSettingsToSave.portraitStartPosition)
                ? activeSettingsToSave.portraitStartPosition
                : (activeSettingsToSave.startPosition || { x: 0, y: 0 }); // Fallback if landscape or portrait position is missing

            const defaultPosPercentage = (currentScreenLayout === 'portrait' && activeSettingsToSave.portraitDefaultPosition)
                ? activeSettingsToSave.portraitDefaultPosition
                : (activeSettingsToSave.defaultPosition || { x: 0, y: 0 }); // Fallback if landscape or portrait position is missing

            activeSettingsToSave._startPixelPosition = getAvatarPixelPosition({ avatarPosition: startPosPercentage }, window.canvas.width, window.canvas.height);
            activeSettingsToSave._defaultPixelPosition = getAvatarPixelPosition({ avatarPosition: defaultPosPercentage }, window.canvas.width, window.canvas.height);


            // Recalculate temporary pixel sizes after saving new ratios
            // Use default options for fallback ratios based on the tab (left/right)
            const defaultAvatarRatio = (selectedVisualizerTab === 'left')
                ? defaultOptions.aiSettings.gemini.visualizer.left.avatarSizeRatio
                : defaultOptions.aiSettings.chatgpt.visualizer.right.avatarSizeRatio;
            const defaultVisualizerRatio = (selectedVisualizerTab === 'left')
                ? defaultOptions.aiSettings.gemini.visualizer.left.visualizerDiameterRatio
                : defaultOptions.aiSettings.chatgpt.visualizer.right.visualizerDiameterRatio;

            activeSettingsToSave._avatarPixelSize = (activeSettingsToSave.avatarSizeRatio ?? defaultAvatarRatio) * minCanvasDimension;
            activeSettingsToSave._visualizerPixelDiameter = (activeSettingsToSave.visualizerDiameterRatio ?? defaultVisualizerRatio) * minCanvasDimension;
        } else {
            console.warn('getAvatarPixelPosition function not found, cannot update temporary pixel positions/sizes during save.');
        }


    } else {
        console.warn('Canvas is not available or size is zero, cannot convert pixel position to percentage for saving.');
        // If canvas is not ready, we can't calculate pixel positions.
        // The percentage values on activeSettingsToSave should already be the last known good values
        // or defaults from loadOptions, so we just keep them.
    }

    console.log(`Updated settings for AI "${aiKeyForSaving}" on tab "${selectedVisualizerTab}" in loadedAiSettings.`, activeSettingsToSave);

    // --- End Direct Update ---


    const options = {
        resolution: window.resolutionEl.value,
        videoFormat: window.videoFormatEl.value,
        videoBitrate: parseInt(window.videoBitrateInput.value) || defaultOptions.videoBitrate,
        includeAudio: window.includeAudioCheckbox.checked,
        audioBitrate: parseInt(window.audioBitrateEl.value) || defaultOptions.audioBitrate,
        fps: parseInt(window.fpsEl.value) || defaultOptions.fps,
        aiSelection: {
            leftTab: window.leftAiSelectionEl.value,
            rightTab: window.rightAiSelectionEl.value
        },
        durationSelection: window.durationSelectionEl.value,
        categorySelection: window.categorySelectionEl.value,
        selectedGenres: getSelectedGenres(), // getSelectedGenres is in prompt_options.js
        theme: document.body.classList.contains('dark-theme') ? 'dark' : 'light',
        screenLayout: window.screenLayoutEl.value, // Save screen layout
        customPromptText: window.customPromptInputEl.value, // Save custom prompt text
        backgroundBlurAmount: parseInt(window.backgroundBlurInputEl.value) || defaultOptions.backgroundBlurAmount, // Save blur amount
        // Save the entire updated aiSettings object
        aiSettings: loadedAiSettings // Save the entire structure
    };

    chrome.storage.sync.set({ [OPTIONS_STORAGE_KEY]: options }, () => {
        console.log('Options saved:', options);
    });
}

// Function to load options from chrome.storage.sync
async function loadOptions() {
    // Ensure all UI elements are available before loading
    // Added customPromptInputEl and screenLayoutEl to the check    if (typeof window.resolutionEl === 'undefined' || typeof window.videoFormatEl === 'undefined' || typeof window.videoBitrateInput === 'undefined' ||
    if (typeof window.includeAudioCheckbox === 'undefined' || typeof window.audioBitrateEl === 'undefined' || typeof window.fpsDisplayEl === 'undefined' ||
        typeof window.leftAiSelectionEl === 'undefined' || typeof window.rightAiSelectionEl === 'undefined' || typeof window.durationSelectionEl === 'undefined' ||
        typeof window.categorySelectionEl === 'undefined' || typeof window.visualizerTabSelectionEl === 'undefined' ||
        typeof window.visualizerDiameterInput === 'undefined' || typeof window.avatarDiameterInput === 'undefined' ||
        typeof window.maxAmplitudePercentageInput === 'undefined' || typeof window.positionXInput === 'undefined' || typeof window.positionYInput === 'undefined' ||
        typeof window.themeToggleBtn === 'undefined' || typeof window.screenLayoutEl === 'undefined' ||
        typeof window.customPromptInputEl === 'undefined' || typeof window.backgroundBlurInputEl === 'undefined') {
        console.error('Required UI elements not found for loading options. This indicates a potential issue with script loading order or DOM structure.');
        return; // Exit if elements are missing
    }

    const stored = await chrome.storage.sync.get(OPTIONS_STORAGE_KEY);
    // Merge stored options with default options, ensuring aiSettings is also merged deeply
    // Use defaultOptions as the base, then merge stored options on top
    const options = mergeDeep({}, defaultOptions, stored[OPTIONS_STORAGE_KEY]);

    console.log('Options loaded:', options);

    window.loadedAiSettings = options.aiSettings;
    console.log('Loaded AI settings:', loadedAiSettings);

    // --- Ensure currentLeftVisualizerSettings and currentRightVisualizerSettings are fully populated before use ---
    const selectedAIKey = options.aiSelection;

    // Deep merge to ensure all nested properties are present from defaults if missing in loaded settings
    window.currentLeftVisualizerSettings = mergeDeep(
        {}, // Start with an empty object to ensure a new object reference
        defaultOptions.aiSettings[selectedAIKey]?.visualizer?.left || defaultOptions.aiSettings.gemini.visualizer.left, // Fallback to default for selected AI, then to Gemini default
        window.loadedAiSettings[selectedAIKey]?.visualizer?.left // Overlay with loaded settings
    );

    window.currentRightVisualizerSettings = mergeDeep(
        {}, // Start with an empty object
        defaultOptions.aiSettings.chatgpt.visualizer.right, // Fallback to ChatGPT default
        window.loadedAiSettings['chatgpt']?.visualizer?.right // Overlay with loaded settings
    );

    console.log('Updated active visualizer settings with loaded options.');
    console.log('currentLeftVisualizerSettings:', currentLeftVisualizerSettings);
    console.log('currentRightVisualizerSettings:', currentRightVisualizerSettings);

    // --- Initialize Current Avatar Positions for Smooth Animation ---
    // These need to be initialized as objects if they aren't already
    if (typeof window.leftCurrentAvatarPosition !== 'object' || window.leftCurrentAvatarPosition === null) {
        window.leftCurrentAvatarPosition = { x: 0, y: 0 };
    }
    if (typeof window.rightCurrentAvatarPosition !== 'object' || window.rightCurrentAvatarPosition === null) {
        window.rightCurrentAvatarPosition = { x: 0, y: 0 };
    }
    console.log('Initialized current avatar position objects.');
    // --- End Initialization ---


    // Apply loaded options to the UI
    window.resolutionEl.value = options.resolution;
    window.videoFormatEl.value = options.videoFormat;
    window.videoBitrateInput.value = options.videoBitrate;
    window.includeAudioCheckbox.checked = options.includeAudio; window.audioBitrateEl.value = options.audioBitrate;
    window.fpsDisplayEl.value = options.fps;
    window.leftAiSelectionEl.value = options.aiSelection?.leftTab || options.aiSelection;
    window.rightAiSelectionEl.value = options.aiSelection?.rightTab || 'chatgpt';
    window.durationSelectionEl.value = options.durationSelection;
    window.categorySelectionEl.value = options.categorySelection;
    window.screenLayoutEl.value = options.screenLayout; // Load screen layout
    window.customPromptInputEl.value = options.customPromptText; // Load custom prompt text
    window.backgroundBlurInputEl.value = options.backgroundBlurAmount; // Load blur amount
    // visualizerPositionSelectionEl will be set by updateVisualizerUIBasedOnSelection
    // window.visualizerPositionSelectionEl.value = options.aiSettings[options.aiSelection]?.visualizer?.left?.currentPositionState || 'default'; // Load position state for left tab
    // Update the global blur variable in layout_manager.js
    if (typeof window.backgroundBlurAmount !== 'undefined') {
        window.backgroundBlurAmount = options.backgroundBlurAmount;
    } else {
        console.warn('backgroundBlurAmount not found in layout_manager.js. Cannot update global blur variable.');
    }


    // Apply the loaded screen layout immediately
    // applyScreenLayout is defined in core.js
    if (typeof window.applyScreenLayout === 'function') {
        window.applyScreenLayout(options.screenLayout);
    } else {
        console.warn('applyScreenLayout function not found when loading options.');
        // Fallback: just set the value if function is missing
        if (window.screenLayoutEl) window.screenLayoutEl.value = options.screenLayout;
    }


    // Apply theme
    // setTheme is assumed to be in prompt_options.js
    if (typeof setTheme === 'function') {
        setTheme(options.theme);
    } else {
        console.error('setTheme function not found when loading options.');
    }


    // Populate genres based on loaded category and select saved genres
    // populateGenreCheckboxes is assumed to be in prompt_options.js
    if (typeof populateGenreCheckboxes === 'function') {
        populateGenreCheckboxes(options.categorySelection, options.selectedGenres); // Pass selected genres
    } else {
        console.error('populateGenreCheckboxes function not found when loading options.');
    }


    // Update the AI avatar image based on the loaded selection (Left tab)
    // updateAIAvatar is assumed to be in prompt_options.js
    if (typeof updateAIAvatar === 'function') {
        updateAIAvatar(options.aiSelection);
    } else {
        console.error('updateAIAvatar function not found after loading options.');
    }


    // Update canvas size based on loaded resolution and potentially active streams
    // This will also trigger updateVisualizerPixelPositions
    // updateCanvasSize is now in layout_manager.js
    // This call is crucial after loading options to set the initial canvas size
    // and calculate the initial pixel positions and avatar diameters for the UI.
    if (typeof window.updateCanvasSize === 'function') {
        window.updateCanvasSize();
    } else {
        console.error('updateCanvasSize function not found when loading options.');
    }

    // Call updateVisualizerUIBasedOnSelection directly with 'left' as the selected tab
    // This ensures the UI is updated with the correct settings from the start for the left tab.
    if (typeof window.updateVisualizerUIBasedOnSelection === 'function') {
        window.updateVisualizerUIBasedOnSelection('left'); // Pass 'left' here
        // After updating the UI, ensure the visualizer tab selection element's value is set
        // and dispatch a change event if it's not already 'left' to trigger its own listener.
        if (window.visualizerTabSelectionEl.value !== 'left') {
            window.visualizerTabSelectionEl.value = 'left';
            const changeEvent = new Event('change');
            window.visualizerTabSelectionEl.dispatchEvent(changeEvent);
        }
    } else {
        console.error('updateVisualizerUIBasedOnSelection function not found when loading options.');
    }

    // The isAppReadyToSave flag is now set in core.js after all initialization.
}

// Helper function for deep merging objects (used for loading options)
// This function is generally correct for merging structures.
// The issue was likely in how it was used in saveOptions previously.
function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
}

// Helper function to check if a variable is an object
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}


// Function to update the visualizer options UI based on the selected tab (left/right)
// Called from loadOptions and visualizerTabSelectionEl change listener, and updateVisualizerPixelPositions
function updateVisualizerUIBasedOnSelection() {
    const options = window.currentOptions;
    if (!options) {
        console.warn('No options available for UI update');
        return;
    }    // Get the current tab selection
    const tabSelect = document.getElementById('visualizerTabSelection');
    if (!tabSelect) {
        console.warn('Visualizer tab selection element not found');
        return;
    }

    // Get the active settings based on the selected tab
    const activeSettings = tabSelect.value === 'left' ? currentLeftVisualizerSettings : currentRightVisualizerSettings;
    if (!activeSettings) {
        console.warn('No active settings found for the selected tab');
        return;
    }

    // Get references to UI elements
    const visualizerDiameterInput = document.getElementById('visualizerDiameter');
    const avatarDiameterInput = document.getElementById('avatarDiameter');
    const maxAmplitudeInput = document.getElementById('maxAmplitudePercentage');
    const positionXInput = document.getElementById('positionX');
    const positionYInput = document.getElementById('positionY');
    const positionModeSelect = document.getElementById('visualizerPositionSelection');
    const leftAiSelect = document.getElementById('leftAiSelection');
    const rightAiSelect = document.getElementById('rightAiSelection');

    if (!visualizerDiameterInput || !avatarDiameterInput || !maxAmplitudeInput ||
        !positionXInput || !positionYInput || !positionModeSelect ||
        !tabSelect || !leftAiSelect || !rightAiSelect) {
        console.warn('updateVisualizerUIBasedOnSelection: Missing UI elements');
        return;
    }

    // Update AI selection dropdowns
    leftAiSelect.value = options.aiSelection.leftTab;
    rightAiSelect.value = options.aiSelection.rightTab;    // Update size and amplitude inputs
    const minDimension = Math.min(window.canvas?.width || 1920, window.canvas?.height || 1080);
    if (visualizerDiameterInput) {
        visualizerDiameterInput.value = Math.round(activeSettings.visualizerDiameterRatio * minDimension);
    }
    if (avatarDiameterInput) {
        avatarDiameterInput.value = Math.round(activeSettings.avatarSizeRatio * minDimension);
    }
    if (maxAmplitudeInput) {
        maxAmplitudeInput.value = activeSettings.maxAmplitudePercentage;
    }    // Update position inputs
    const screenLayoutEl = document.getElementById('screenLayout');
    const layout = screenLayoutEl?.value || 'landscape';
    const mode = positionModeSelect?.value || 'default';

    // Get the appropriate position based on layout and mode
    const positions = activeSettings.positions?.[layout] || {
        start: { x: 0.5, y: 0.5 },
        default: { x: 0.5, y: 0.5 }
    };
    const position = positions[mode] || positions.default;

    // Update position inputs if they exist
    if (positionXInput && position) {
        positionXInput.value = Math.round(position.x * 100);
    }
    if (positionYInput && position) {
        positionYInput.value = Math.round(position.y * 100);
    }
    if (positionModeSelect) {
        positionModeSelect.value = mode;
    }

    // Update AI selection dropdowns
    if (leftAiSelect && rightAiSelect) {
        const leftAiValue = window.leftAiSelectionEl?.value || 'gemini';
        const rightAiValue = window.rightAiSelectionEl?.value || 'chatgpt';
        leftAiSelect.value = leftAiValue;
        rightAiSelect.value = rightAiValue;
    }
}
