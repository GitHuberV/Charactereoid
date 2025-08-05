// event_listeners.js

// --- Global variables to store generated prompt details ---
// Declare these in the global scope so recording.js can access them
let generatedPromptTitle = '';
let generatedPromptDescription = '';
let generatedPromptShortDescription = '';
let generatedPromptSeoTags = '';
let generatedPromptScenario = '';
let generatedPromptInstructions = '';
let generatedPromptFullResponse = ''; // Store the full response text


// --- Global State for Toggle Button ---
// isDualPromptingActive needs to be accessible globally for the Go/Stop button logic
let isDualPromptingActive = false; // Track the state of the Go/Stop button
// AUTH_KEY is assumed to be defined elsewhere, e.g., in a config file or background script
// For now, keeping it here as it was in the user's provided code snippet.
const AUTH_KEY = "asdasdreweadbasdughvcgsad"; // your speechify api key


// Note: The initial loading of options and records, and adding modal listeners,
// is now handled by the DOMContentLoaded listener in core.js.


// --- Function to Add All Event Listeners ---
// This function is called by the DOMContentLoaded listener in core.js after UI element assignment
function addEventListeners() {
    console.log('addEventListeners function called. Adding all event listeners.');

    // Helper function to safely add click listener
    const addClickListener = (elementId, handler) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('click', handler);
            return true;
        }
        console.warn(`Element ${elementId} not found for click listener`);
        return false;
    };

    // Helper function to safely add change listener
    const addChangeListener = (elementId, handler) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('change', handler);
            return true;
        }
        console.warn(`Element ${elementId} not found for change listener`);
        return false;
    };

    // Stream Toggle Button
    addClickListener('streamToggleBtn', () => {
        console.log('Stream Toggle Button clicked.');
        if (window.leftTabStream && window.leftTabStream.active) {
            window.stopStreaming?.();
        } else {
            window.selectTabs?.();
        }
    });

    // Record/Pause Toggle Button
    addClickListener('recordPauseToggleBtn', () => {
        console.log('Record/Pause Toggle Button clicked.');
        if (window.isRecording) {
            if (window.isPaused) {
                window.resumeRecording?.();
            } else {
                window.pauseRecording?.();
            }
        } else {
            window.startRecording?.();
        }
    });

    // Stop Button
    addClickListener('stopBtn', () => {
        console.log('Stop Button clicked.');
        window.stopRecording?.();
    });

    // Position X/Y inputs
    addChangeListener('positionX', (e) => {
        const x = parseFloat(e.target.value) / 100;
        const y = window.currentOptions?.visualizerState?.position?.y ?? 0.5;
        window.updatePosition?.(x, y);
    });

    addChangeListener('positionY', (e) => {
        const y = parseFloat(e.target.value) / 100;
        const x = window.currentOptions?.visualizerState?.position?.x ?? 0.5;
        window.updatePosition?.(x, y);
    });

    // AI Selection Dropdowns
    addChangeListener('leftAiSelection', (e) => {
        window.updateAiSelection?.('left', e.target.value);
    });

    addChangeListener('rightAiSelection', (e) => {
        window.updateAiSelection?.('right', e.target.value);
    });

    // Position Mode Selection
    addChangeListener('visualizerPositionSelection', (e) => {
        if (window.currentOptions?.visualizerState) {
            window.currentOptions.visualizerState.positionMode = e.target.value;
            window.updatePosition?.(
                window.currentOptions.visualizerState.position.x,
                window.currentOptions.visualizerState.position.y
            );
        }
    });

    // Records Modal controls
    addClickListener('openRecordsModalBtn', () => {
        window.openRecordsModal?.();
    });

    addClickListener('closeRecordsModalBtn', () => {
        window.closeRecordsModal?.();
    });

    addClickListener('backToRecordsBtn', () => {
        window.closeAllModals?.();
    });

    // Theme Toggle
    addClickListener('themeToggle', () => {
        window.toggleTheme?.();
    });

    console.log('Event listeners added successfully');
} // End addEventListeners function


// --- Expose functions globally for access from other files ---
// selectTabs, stopStreaming, startRecording, pauseRecording, resumeRecording, stopRecording, handleVideoMetadataLoaded are assumed to be in recording.js
// updateRecordingStatus, updateUserRecordingStatus are assumed to be in recording.js
// generateThumbnail, addNewRecord, loadRecordMetadata, addRecordsModalListeners, openRecordsModal, closeRecordsModal, closeAllModals, saveRecordMetadata, deleteRecord are assumed to be in record_manager.js
// populateGenreCheckboxes, setTheme, toggleTheme, updateAIAvatar, aiInfo, updateLeftTabUrl, updateConfigureText are assumed to be in prompt_options.js
// updateCanvasSize, updateCanvasDrawing are assumed to be in layout_manager.js
// updateVisualizerPixelPositions, toggleLeftAvatarPosition, toggleRightAvatarPosition, leftCurrentAvatarPosition, rightCurrentAvatarPosition, setupLeftAudioVisualization, closeLeftAudioContext, setupRightAudioVisualization, closeRightAudioContext are assumed to be in visualizer.js
// debouncedSaveOptions, saveOptions, loadOptions, defaultOptions, currentLeftVisualizerSettings, currentRightVisualizerSettings are assumed to be in storage.js

// Expose global flags for recording.js
window.generatedPromptTitle = generatedPromptTitle;
window.generatedPromptDescription = generatedPromptDescription;
window.generatedPromptShortDescription = generatedPromptShortDescription;
window.generatedPromptSeoTags = generatedPromptSeoTags;
window.generatedPromptScenario = generatedPromptScenario;
window.generatedPromptInstructions = generatedPromptInstructions;
window.generatedPromptFullResponse = generatedPromptFullResponse;
window.isDualPromptingActive = isDualPromptingActive; // Expose global state
window.AUTH_KEY = AUTH_KEY; // Expose AUTH_KEY

// Expose functions
window.addEventListeners = addEventListeners;
