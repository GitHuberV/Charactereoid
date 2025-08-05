// recording.js

// Recording variables
let mediaRecorder;
let recordedChunks = [];
let isRecording = false; // This flag reflects MediaRecorder state, synced with storage
let isPaused = false; // State for MediaRecorder pause
let isUserRecording = false; // Flag to track if recording was started by the user
let leftTabStream; // Left tab stream
let rightTabStream; // Right tab stream
let recordingStartTime;
let timerInterval = null; // Variable to hold the timer interval ID
// New variable to store time elapsed before pausing
let timeElapsedBeforePause = 0;
// Removed: const recordedVideos = []; // This is now in record_manager.js

// New AudioContexts for mixing (separate from visualizer's contexts)
let recordingAudioContext;
let recordingAudioDestination;

// Global variables to store desktopCapture sourceIds
let leftDesktopSourceId = null;
let rightDesktopSourceId = null;


// UI elements for Recording and Status are now declared in core.js


// --- Storage and Recording Status Sync ---
const RECORDING_STATUS_STORAGE_KEY = 'isRecording'; // Match key in background.js
// Corrected typo here: USER_RECORDing_STATUS_STORAGE_KEY -> USER_RECORDING_STATUS_STORAGE_KEY
const USER_RECORDING_STATUS_STORAGE_KEY = 'isUserRecording';

// Function to update recording status in chrome.storage.local
function updateRecordingStatus(status) {
    isRecording = status; // Update local flag
    chrome.storage.local.set({ [RECORDING_STATUS_STORAGE_KEY]: status }, () => {
        console.log('Recording status updated in storage:', status);
        // Send message to background script (optional, storage sync is primary)
        chrome.runtime.sendMessage({ action: "updateRecordingStatus", isRecording: status });
    });
}

// Function to update user recording status in chrome.storage.local
function updateUserRecordingStatus(status) {
    isUserRecording = status; // Update local flag
    // Corrected typo here: USER_RECORDing_STATUS_STORAGE_KEY -> USER_RECORDING_STATUS_STORAGE_KEY
    chrome.storage.local.set({ [USER_RECORDING_STATUS_STORAGE_KEY]: status }, () => {
        console.log('User recording status updated in storage:', status);
        // Send message to background script
        chrome.runtime.sendMessage({ action: "updateUserRecordingStatus", isUserRecording: status });
    });
}


// Listen for beforeunload event to warn user if recording
window.addEventListener('beforeunload', (event) => {
    if (isRecording) {
        // Cancel the event and prompt the user
        event.preventDefault();
        // Chrome and other browsers display a generic message
        event.returnValue = ''; // Required for legacy support
        console.log('beforeunload event: Recording active, prompting user.');
        // The browser will show a confirmation dialog.
    } else {
        console.log('beforeunload event: Not recording, allowing unload.');
    }
});
// --- End Storage and Recording Status Sync ---


// Update recording timer display
function updateRecordingTimer() {
    // Only update if recording and not paused
    // The check for isPaused is now handled by pausing/resuming the interval itself
    if (!isRecording || !recordingStartTime) return;

    // Calculate elapsed time using the adjusted start time
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
    const minutes = Math.floor((elapsed / (1000 * 60)) % 60).toString().padStart(2, '0');
    const hours = Math.floor((elapsed / (1000 * 60 * 60))).toString().padStart(2, '0');

    // Ensure timerDisplayEl is available (declared in core.js)
    if (window.timerDisplayEl !== null) {
        window.timerDisplayEl.textContent = `${hours}:${minutes}:${seconds}`;
    } else {
        console.warn('timerDisplayEl not found when updating timer.');
    }
}

// Select tabs for streaming
// Called from event_listeners.js
async function selectTabs() {
    // Ensure UI elements and required functions are available (declared in core.js, visualizer.js)
    if (window.statusEl === null || window.streamToggleBtn === null ||
        window.recordPauseToggleBtn === null || window.stopBtn === null ||
        window.includeAudioCheckbox === null || window.leftTabVideoElement === null ||
        window.rightTabVideoElement === null || typeof window.updateCanvasSize === 'undefined' || // Use window.updateCanvasSize
        typeof window.setupLeftAudioVisualization === 'undefined' || typeof window.closeLeftAudioContext === 'undefined' || // Use window.setupLeftAudioVisualization, window.closeLeftAudioContext
        typeof window.setupRightAudioVisualization === 'undefined' || typeof window.closeRightAudioContext === 'undefined' || // Use window.setupRightAudioVisualization, window.closeRightAudioContext
        typeof window.toggleRightAvatarPosition === 'undefined' || typeof window.toggleLeftAvatarPosition === 'undefined' || // Use window.toggleRightAvatarPosition, window.toggleLeftAvatarPosition
        window.resolutionEl === null) {
        console.error('Required elements or functions not found for selectTabs.');
        if (window.statusEl !== null) window.statusEl.textContent = 'Initialization error: Cannot select tabs.';
        return;
    }

    // Prevent starting new streams if already active and source IDs are available
    // This check is now more nuanced: if source IDs exist, we reconfigure, otherwise we prompt.
    if (leftTabStream && leftTabStream.active && leftDesktopSourceId && rightDesktopSourceId) {
        console.log('Streams are active and source IDs exist. Attempting to reconfigure streams with new resolution.');
        // Proceed to reconfigure below without re-prompting chooseDesktopMedia
    } else if (leftTabStream && leftTabStream.active) {
        console.warn('Streams are active but source IDs are missing. Not attempting to select new tabs.');
        if (window.statusEl) window.statusEl.textContent = 'Streams active, but source IDs missing. Please stop and re-select.';
        return;
    }


    if (window.statusEl) window.statusEl.textContent = 'Selecting left tab... Please check "Share audio" in the Chrome prompt if you want tab audio.';
    window.streamToggleBtn.disabled = true;
    window.recordPauseToggleBtn.disabled = true; // Disable record/pause during selection
    window.stopBtn.disabled = true; // Disable stop during selection


    try {
        // Get the selected resolution height
        const selectedResolutionHeight = parseInt(window.resolutionEl.value, 10);
        let targetHeight = selectedResolutionHeight;

        // Apply dynamic constraints based on selected resolution
        // If selected resolution is below 1080p, set min/max height to 1080px (or the selected height if it's higher)
        // This ensures we always try to get a high-quality source stream.
        if (selectedResolutionHeight < 1080) {
            targetHeight = 1080; // Request at least 1080p source if selected is lower
            console.log(`Selected resolution ${selectedResolutionHeight}p is below 1080p. Setting getUserMedia target height to 1080px.`);
        } else {
            // If selected resolution is 1080p or more, set min/max height to that size
            console.log(`Selected resolution ${selectedResolutionHeight}p. Setting getUserMedia target height to ${selectedResolutionHeight}px.`);
        }

        // Constraints for getUserMedia
        const videoConstraints = {
            mandatory: {
                chromeMediaSource: 'desktop',
                // We are not bothering about width here as the canvas will handle scaling.
                // We are setting min and max height to ensure the source stream is at least the desired height.
                minHeight: targetHeight,
                maxHeight: targetHeight,
            }
        };

        const audioConstraints = window.includeAudioCheckbox.checked ? {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: '', // Will be set by chooseDesktopMedia or stored ID
            }
        } : false;


        // --- Logic to handle re-selection without re-prompting chrome.desktopCapture.chooseDesktopMedia() ---
        // If source IDs are not stored, prompt for them. Otherwise, use the stored ones.
        if (!leftDesktopSourceId) {
            console.log('Left desktop source ID not found, prompting user for selection.');
            leftDesktopSourceId = await new Promise((resolve, reject) => {
                chrome.desktopCapture.chooseDesktopMedia(
                    ['tab', 'audio'], // Request both tab and audio sources
                    (streamId) => {
                        if (streamId) {
                            resolve(streamId);
                        } else {
                            reject(new Error('User cancelled left tab selection.'));
                        }
                    }
                );
            });
        } else {
            console.log('Using previously selected left tab source ID:', leftDesktopSourceId);
        }

        // Update audio constraints with the specific sourceId for the left tab
        if (audioConstraints) {
            audioConstraints.mandatory.chromeMediaSourceId = leftDesktopSourceId;
        }

        // Stop existing left stream tracks if they exist before getting new ones
        if (leftTabStream) {
            console.log('Stopping existing left tab stream tracks.');
            leftTabStream.getTracks().forEach(track => track.stop());
            if (window.leftTabVideoElement) window.leftTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
            if (window.leftTabVideoElement) window.leftTabVideoElement.srcObject = null;
        }

        const leftStream = await navigator.mediaDevices.getUserMedia({
            video: {
                ...videoConstraints,
                mandatory: {
                    ...videoConstraints.mandatory,
                    chromeMediaSourceId: leftDesktopSourceId,
                }
            },
            audio: audioConstraints
        });


        leftTabStream = leftStream; // Assign the obtained stream
        if (window.leftTabVideoElement) window.leftTabVideoElement.srcObject = leftTabStream;

        // Add event listener to trigger canvas size update when video metadata is loaded
        // This ensures videoWidth and videoHeight are available for dimension calculation.
        if (window.leftTabVideoElement) window.leftTabVideoElement.addEventListener('loadedmetadata', handleVideoMetadataLoaded);

        // Explicitly call play() after setting srcObject
        if (window.leftTabVideoElement) window.leftTabVideoElement.play().catch(error => console.error('Error playing left video element:', error));

        console.log('Left tab stream obtained:', leftTabStream);
        console.log('Left tab stream audio tracks:', leftTabStream.getAudioTracks());


        if (window.statusEl) window.statusEl.textContent = 'Left tab selected. Selecting right tab... Please check "Share audio" in the Chrome prompt if you want tab audio.';

        // If source IDs are not stored, prompt for them. Otherwise, use the stored ones.
        if (!rightDesktopSourceId) {
            console.log('Right desktop source ID not found, prompting user for selection.');
            rightDesktopSourceId = await new Promise((resolve, reject) => {
                chrome.desktopCapture.chooseDesktopMedia(
                    ['tab', 'audio'], // Request both tab and audio sources
                    (streamId) => {
                        if (streamId) {
                            resolve(streamId);
                        } else {
                            reject(new Error('User cancelled right tab selection.'));
                        }
                    }
                );
            });
        } else {
            console.log('Using previously selected right tab source ID:', rightDesktopSourceId);
        }

        // Update audio constraints with the specific sourceId for the right tab
        if (audioConstraints) {
            audioConstraints.mandatory.chromeMediaSourceId = rightDesktopSourceId;
        }

        // Stop existing right stream tracks if they exist before getting new ones
        if (rightTabStream) {
            console.log('Stopping existing right tab stream tracks.');
            rightTabStream.getTracks().forEach(track => track.stop());
            if (window.rightTabVideoElement) window.rightTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
            if (window.rightTabVideoElement) window.rightTabVideoElement.srcObject = null;
        }

        const rightStream = await navigator.mediaDevices.getUserMedia({
            video: {
                ...videoConstraints,
                mandatory: {
                    ...videoConstraints.mandatory,
                    chromeMediaSourceId: rightDesktopSourceId,
                }
            },
            audio: audioConstraints
        });

        rightTabStream = rightStream; // Assign the obtained stream
        if (window.rightTabVideoElement) window.rightTabVideoElement.srcObject = rightStream;

         // Add event listener to trigger canvas size update when video metadata is loaded
         // This ensures videoWidth and videoHeight are available for dimension calculation.
         if (window.rightTabVideoElement) window.rightTabVideoElement.addEventListener('loadedmetadata', handleVideoMetadataLoaded);

         // Explicitly call play() after setting srcObject
        if (window.rightTabVideoElement) window.rightTabVideoElement.play().catch(error => console.error('Error playing right video element:', error));

        console.log('Right tab stream obtained:', rightTabStream);
        console.log('Right tab stream audio tracks:', rightTabStream.getAudioTracks());


        if (window.statusEl) window.statusEl.textContent = 'Both tabs selected. Ready to record.';
        if (window.streamToggleBtn) window.streamToggleBtn.disabled = false; // Re-enable stream toggle
        if (window.streamToggleBtn) window.streamToggleBtn.innerHTML = '<i class="fas fa-stop"></i>'; // Change icon to stop
        if (window.streamToggleBtn) window.streamToggleBtn.title = 'Stop Streaming'; // Update title
        if (window.recordPauseToggleBtn) window.recordPauseToggleBtn.disabled = false; // Enable record/pause
        if (window.stopBtn) window.stopBtn.disabled = false; // Enable stop
        // Removed: updateCanvasSize(); // No longer call updateCanvasSize immediately here. It's called by loadedmetadata listeners.


        // Handle stream ending for both tabs
        // Ensure video tracks exist before adding onended listener
        if (leftTabStream && leftTabStream.getVideoTracks().length > 0) {
            leftTabStream.getVideoTracks()[0].onended = handleStreamEnded;
        } else {
            console.warn('No video track found for left stream. Cannot add onended listener.');
        }
        if (rightTabStream && rightTabStream.getVideoTracks().length > 0) {
            rightTabStream.getVideoTracks()[0].onended = handleStreamEnded;
        } else {
             console.warn('No video track found for right stream. Cannot add onended listener.');
        }


        // Check if audio tracks were obtained and update status
        const leftAudioTracks = leftTabStream && leftTabStream.getAudioTracks().length > 0;
        const rightAudioTracks = rightTabStream && rightTabStream.getAudioTracks().length > 0;

        if (window.includeAudioCheckbox.checked) {
            if (leftAudioTracks) {
                window.setupLeftAudioVisualization(leftTabStream); // Use window.setupLeftAudioVisualization
            } else {
                 console.warn('Include audio checked, but no audio tracks found for left tab.');
                 window.closeLeftAudioContext(); // Use window.closeLeftAudioContext
            }
             if (rightAudioTracks) {
                window.setupRightAudioVisualization(rightTabStream); // Use window.setupRightAudioVisualization
            } else {
                 console.warn('Include audio checked, but no audio tracks found for right tab.');
                 window.closeRightAudioContext(); // Use window.closeRightAudioContext
            }

            if (leftAudioTracks || rightAudioTracks) {
                 if (window.statusEl) window.statusEl.textContent = 'Both tabs selected. Tab audio included. Ready to record.';
            } else {
                 if (window.statusEl) window.statusEl.textContent = 'Both tabs selected. Include audio checked, but no tab audio found (did you check "Share audio" in the prompts?). Ready to record without audio.';
            }

        } else {
             if (window.statusEl) window.statusEl.textContent = 'Both tabs selected. Audio not included. Ready to record.'; // Update status if include audio is not checked
             console.log('Include audio not checked. No audio tracks added to combined stream.');
             // Ensure audio contexts are cleaned up if audio is not included
             window.closeLeftAudioContext(); // Use window.closeLeftAudioContext
             window.closeRightAudioContext(); // Use window.closeRightAudioContext
        }

        // --- Fix for TypeError: Cannot set properties of null (setting 'currentPositionState') ---
        // Ensure currentLeftVisualizerSettings and currentRightVisualizerSettings are valid objects
        // before calling toggleAvatarPosition. This is handled by robust initialization in storage.js.
        // However, adding a check here for safety.
        if (window.currentLeftVisualizerSettings) {
            window.toggleLeftAvatarPosition('s'); // Use window.toggleLeftAvatarPosition
        } else {
            console.error('currentLeftVisualizerSettings is null. Cannot set left avatar position.');
        }
        if (window.currentRightVisualizerSettings) {
            window.toggleRightAvatarPosition('s'); // Use window.toggleRightAvatarPosition
        } else {
            console.error('currentRightVisualizerSettings is null. Cannot set right avatar position.');
        }
        // --- End Fix ---


    } catch (error) {
        console.error('Error selecting tabs:', error);
        // Check if the error is due to user cancellation
        if (error.name === 'AbortError') {
             if (window.statusEl !== null) window.statusEl.textContent = 'Tab selection cancelled.';
        } else {
             if (window.statusEl !== null) window.statusEl.textContent = 'Error selecting tabs: ' + error.message;
        }

        if (window.streamToggleBtn !== null) window.streamToggleBtn.disabled = false; // Re-enable stream toggle (Added null check)
        if (window.recordPauseToggleBtn !== null) window.recordPauseToggleBtn.disabled = true; // Disable record/pause (Added null check)
        if (window.stopBtn !== null) window.stopBtn.disabled = true; // Disable stop (Added null check)


        // Stop any active streams if selection was cancelled or failed
        if (leftTabStream) {
            leftTabStream.getTracks().forEach(track => track.stop());
            leftTabStream = null;
            if (window.leftTabVideoElement) {
                window.leftTabVideoElement.srcObject = null;
                 // Remove event listeners to prevent memory leaks
                window.leftTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
            }
        }
        if (rightTabStream) {
            rightTabStream.getTracks().forEach(track => track.stop());
            rightTabStream = null;
            if (window.rightTabVideoElement) {
                window.rightTabVideoElement.srcObject = null;
                 // Remove event listeners
                window.rightTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
            }
        }
        if (typeof window.updateCanvasSize === 'function') window.updateCanvasSize(); // Reset canvas size if streams are cleared (updateCanvasSize is in core.js) // Use window.updateCanvasSize
        if (typeof window.closeLeftAudioContext === 'function') window.closeLeftAudioContext(); // Clean up left audio context (closeLeftAudioContext is in visualizer.js) // Use window.closeLeftAudioContext
        if (typeof window.closeRightAudioContext === 'function') window.closeRightAudioContext(); // Clean up right audio context (closeRightAudioContext is in visualizer.js) // Use window.closeRightAudioContext

        // Reset stream toggle button state on error
        if (window.streamToggleBtn) {
            window.streamToggleBtn.innerHTML = '<i class="fas fa-play"></i>';
            window.streamToggleBtn.title = 'Select Tabs';
        }
        // Clear stored source IDs on error/cancellation to force re-prompt next time
        leftDesktopSourceId = null;
        rightDesktopSourceId = null;
    }
}

// Handle video metadata loaded event
// This function checks if both video elements have loaded their metadata
// and then triggers the canvas size update.
function handleVideoMetadataLoaded() {
     console.log('Video metadata loaded for one stream.');
     // Ensure leftTabVideoElement and rightTabVideoElement are available and have valid dimensions
     const leftVideoReady = window.leftTabVideoElement !== null &&
                            window.leftTabVideoElement.readyState >= 2 && window.leftTabVideoElement.videoWidth > 0 && window.leftTabVideoElement.videoHeight > 0;
     const rightVideoReady = window.rightTabVideoElement !== null &&
                             window.rightTabVideoElement.readyState >= 2 && window.rightTabVideoElement.videoWidth > 0 && window.rightTabVideoElement.videoHeight > 0;

     // If both videos are ready, update the canvas size based on their dimensions
     if (leftVideoReady && rightVideoReady) {
         console.log('Both video streams metadata loaded. Updating canvas size.');
         // Ensure updateCanvasSize is available (defined in core.js)
         if (typeof window.updateCanvasSize === 'function') { // Use window.updateCanvasSize
             window.updateCanvasSize();
         } else {
             console.warn('updateCanvasSize function not found after video metadata loaded.');
         }
          // Remove the listeners after successful update to avoid multiple calls
          if (window.leftTabVideoElement) window.leftTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
          if (window.rightTabVideoElement) window.rightTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
     } else {
         console.log('Waiting for metadata from the other video stream.');
     }
}


// Handle stream ending
function handleStreamEnded() {
     // Ensure statusEl, recordPauseToggleBtn, stopBtn are available (declared in core.js)
    if (window.statusEl === null || window.recordPauseToggleBtn === null || window.stopBtn === null) {
        console.warn('Required UI elements not found for handleStreamEnded.');
        // Continue with stopStreaming if possible
    } else {
        if (window.statusEl) window.statusEl.textContent = 'One or both tab streams ended.';
        if (!window.isRecording) {
           if (window.recordPauseToggleBtn) window.recordPauseToggleBtn.disabled = true;
           if (window.stopBtn) window.stopBtn.disabled = true;
        }
    }
    window.stopStreaming(); // Automatically stop streaming if a tab stream ends // Use window.stopStreaming
}


// Stop tab streaming
// Called from event_listeners.js or handleStreamEnded
function stopStreaming() {
    // Ensure UI elements and required functions are available (declared in core.js, visualizer.js)
    if (window.statusEl === null || window.streamToggleBtn === null ||
        window.recordPauseToggleBtn === null || window.stopBtn === null ||
        window.leftTabVideoElement === null || window.rightTabVideoElement === null ||
        typeof window.updateCanvasSize === 'undefined' || typeof window.closeLeftAudioContext === 'undefined' || // Use window.updateCanvasSize, window.closeLeftAudioContext
        typeof window.closeRightAudioContext === 'undefined') { // Use window.closeRightAudioContext
        console.error('Required elements or functions not found for stopStreaming.');
        // Attempt to stop streams anyway if possible
    }


    if (leftTabStream) {
        leftTabStream.getTracks().forEach(track => track.stop());
        leftTabStream = null;
        if (window.leftTabVideoElement) {
            window.leftTabVideoElement.srcObject = null;
             // Remove event listeners to prevent memory leaks
             window.leftTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
        }
    }
    if (rightTabStream) {
        rightTabStream.getTracks().forEach(track => track.stop());
        rightTabStream = null;
        if (window.rightTabVideoElement) {
            window.rightTabVideoElement.srcObject = null;
             // Remove event listeners
            window.rightTabVideoElement.removeEventListener('loadedmetadata', handleVideoMetadataLoaded);
        }
    }

    // Close the recording audio context if it exists
    closeRecordingAudioContext(); // closeRecordingAudioContext is defined in this file


    if (window.statusEl && window.streamToggleBtn && window.recordPauseToggleBtn && window.stopBtn) {
        window.statusEl.textContent = 'Tab streaming stopped.';
        window.streamToggleBtn.innerHTML = '<i class="fas fa-play"></i>'; // Change icon to play
        window.streamToggleBtn.title = 'Select Tabs';
        window.recordPauseToggleBtn.disabled = true; // Disable record/pause
        window.stopBtn.disabled = true; // Disable stop
    } else {
        console.warn('Required UI elements not found for stopStreaming UI update.');
    }

    if (typeof window.updateCanvasSize === 'function') window.updateCanvasSize(); // Update canvas size after stopping streams (updateCanvasSize is in core.js) // Use window.updateCanvasSize
    if (typeof window.closeLeftAudioContext === 'function') window.closeLeftAudioContext(); // Clean up left audio context (closeLeftAudioContext is in visualizer.js) // Use window.closeLeftAudioContext
    if (typeof window.closeRightAudioContext === 'function') window.closeRightAudioContext(); // Clean up right audio context (closeRightAudioContext is in visualizer.js) // Use window.closeRightAudioContext

    // Clear stored source IDs when streaming stops to force re-prompt if user closes extension or manually stops
    leftDesktopSourceId = null;
    rightDesktopSourceId = null;
}


// Start recording process
// This function is now only for STARTING the recording.
async function startRecording() { // Renamed from toggleRecordPause
     console.log('startRecording function called.');
     // Ensure required UI elements and functions are available (declared in core.js, visualizer.js, storage.js)
    if (window.statusEl === null || window.recordPauseToggleBtn === null ||
        window.stopBtn === null || window.streamToggleBtn === null ||
        window.recordingIndicatorEl === null || typeof window.updateCanvasSize === 'undefined' || // Use window.updateCanvasSize
        typeof window.updateRecordingStatus === 'undefined' || typeof window.updateUserRecordingStatus === 'undefined' || // Added check for updateUserRecordingStatus // Use window.updateRecordingStatus, window.updateUserRecordingStatus
        typeof window.updateRecordingTimer === 'undefined' || // Use window.updateRecordingTimer
        window.canvas === null || window.ctx === null ||
        window.resolutionEl === null || window.videoFormatEl === null ||
        window.videoBitrateInput === null || window.includeAudioCheckbox === null ||        window.audioBitrateEl === null || window.fpsEl === null ||
        leftTabStream === null || rightTabStream === null || // Added null checks for streams
        window.timerDisplayEl === null || typeof window.addNewRecord === 'undefined') { // Use window.timerDisplayEl, Added null check and check for addNewRecord // Use window.addNewRecord
        console.error('Required elements or functions not found for startRecording.');
         if (window.statusEl !== null) window.statusEl.textContent = 'Initialization error: Cannot start recording.';
        return;
    }

    if (isRecording) {
         console.warn('startRecording called while recording is already active.');
         return; // Prevent starting if already recording
    }


    // Start Recording
    recordedChunks = [];
    timeElapsedBeforePause = 0; // Reset elapsed time on start
    const resolution = window.resolutionEl.value; // This is now target height
    const videoFormat = window.videoFormatEl.value;
    const videoBitrate = parseInt(window.videoBitrateInput.value);
    const includeAudio = window.includeAudioCheckbox.checked;
    const audioBitrate = parseInt(window.audioBitrateEl.value);
    const fps = parseInt(window.fpsEl.value);

    // Ensure canvas size is updated based on current streams before recording starts
    // This call will use the latest available video dimensions if metadata has loaded,
    // otherwise it will use the fallback. The loadedmetadata listener ensures it's called
    // with accurate dimensions after streams are selected.
    window.updateCanvasSize(); // Use window.updateCanvasSize

    try {
        // Setup canvas stream with high quality
        // The canvas is already sized to the target resolution in updateCanvasSize
        const canvasStream = window.canvas.captureStream(fps);
        console.log('Canvas stream created:', canvasStream);
        console.log('Canvas stream video tracks:', canvasStream.getVideoTracks());

        // Combine canvas and tab streams and audio
        const combinedStream = new MediaStream();
        canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
        console.log('Combined stream initialized with canvas video track.');

        // --- Audio Mixing Logic (Re-implemented from old code) ---
        if (window.includeAudioCheckbox.checked) {
            try {
                // Create a new AudioContext specifically for recording mix
                recordingAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                recordingAudioDestination = recordingAudioContext.createMediaStreamDestination();
                console.log('Recording AudioContext and Destination created.');

                let audioSourceAdded = false;

                // Process left stream audio
                if (leftTabStream && leftTabStream.active && leftTabStream.getAudioTracks().length > 0) {
                    const leftSource = recordingAudioContext.createMediaStreamSource(leftTabStream);
                    const gainNode = recordingAudioContext.createGain(); // Use gain node for mixing
                    gainNode.gain.value = 0.7; // Adjust volume if needed
                    leftSource.connect(gainNode);
                    gainNode.connect(recordingAudioDestination);
                    console.log('Connected left tab audio to recording destination.');
                    audioSourceAdded = true;
                } else if (window.includeAudioCheckbox.checked) {
                     console.warn('Include audio checked, but no audio tracks found for left tab to mix.');
                }


                // Process right stream audio
                if (rightTabStream && rightTabStream.active && rightTabStream.getAudioTracks().length > 0) {
                    const rightSource = recordingAudioContext.createMediaStreamSource(rightTabStream);
                    const gainNode = recordingAudioContext.createGain(); // Use gain node for mixing
                    gainNode.gain.value = 0.7; // Adjust volume if needed
                    rightSource.connect(gainNode);
                    gainNode.connect(recordingAudioDestination);
                    console.log('Connected right tab audio to recording destination.');
                    audioSourceAdded = true;
                } else if (window.includeAudioCheckbox.checked) {
                    console.warn('Include audio checked, but no audio tracks found for right tab to mix.');
                }

                // Add the mixed audio track from the destination to the combined stream
                if (audioSourceAdded) {
                     recordingAudioDestination.stream.getAudioTracks().forEach(track => {
                         combinedStream.addTrack(track);
                         console.log('Added mixed audio track to combined stream.');
                     });
                     if (window.statusEl) window.statusEl.textContent = 'Recording with mixed tab audio...';
                } else {
                     if (window.statusEl) window.statusEl.textContent = 'Recording without audio (include audio checked, but no mixable tab audio found).';
                     console.log('Include audio checked, but no mixable tab audio tracks found in either stream.');
                     // Close the audio context if no sources were added
                     closeRecordingAudioContext();
                }


            } catch (audioError) {
                console.error('Error setting up audio mixing for recording:', audioError);
                if (window.statusEl) window.statusEl.textContent = 'Error setting up audio for recording: ' + audioError.message;
                console.warn('Proceeding with recording without audio due to mixing error.');
                // Ensure the recording audio context is closed on error
                closeRecordingAudioContext();
            }
        } else {
             if (window.statusEl) window.statusEl.textContent = 'Recording without audio...'; // Update status if include audio is not checked
             console.log('Include audio not checked. No audio tracks added to combined stream.');
             // Ensure the recording audio context is closed if not needed
             closeRecordingAudioContext();
        }
        // --- End Audio Mixing Logic ---


        console.log('Combined stream tracks before MediaRecorder:', combinedStream.getTracks().map(track => `${track.kind}: ${track.label}`));
        console.log('Number of audio tracks in combined stream:', combinedStream.getAudioTracks().length);


        // Setup media recorder with YouTube-compatible options
        let mimeType = ''; // Initialize mimeType

        // Define preferred codecs for WebM and MP4
        const webmVP9Opus = 'video/webm;codecs=vp9,opus';
        const mp4Avc1Aac = 'video/mp4;codecs=avc1.42001E,mp4a.40.2'; // H.264 Baseline Profile, AAC

        // Prioritize selected format and its preferred codecs
        if (videoFormat === 'mp4' || videoFormat === 'avc3') {
            // For MP4, try the specific H.264 Baseline profile first for broad compatibility
            if (MediaRecorder.isTypeSupported(mp4Avc1Aac)) {
                mimeType = mp4Avc1Aac;
                console.log('Using preferred MP4 mime type:', mimeType);
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4'; // Fallback to generic MP4
                console.log('Using generic MP4 mime type as fallback:', mimeType);
            }
        } else if (videoFormat === 'webm') {
            // For WebM, try VP9 with Opus first
            if (MediaRecorder.isTypeSupported(webmVP9Opus)) {
                mimeType = webmVP9Opus;
                console.log('Using preferred WebM mime type:', mimeType);
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9'; // Fallback to VP9 only
                console.log('Using WebM VP9 mime type as fallback:', mimeType);
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
                mimeType = 'video/webm'; // Fallback to generic WebM
                console.log('Using generic WebM mime type as fallback:', mimeType);
            }
        }

        // Fallback to other supported formats if selected format is not fully supported
        if (!mimeType) {
            console.warn(`Selected video format "${videoFormat}" and its preferred codecs not fully supported. Falling back to other formats.`);
            if (MediaRecorder.isTypeSupported(webmVP9Opus)) {
                mimeType = webmVP9Opus;
                console.log('Falling back to mime type: video/webm;codecs=vp9,opus');
            } else if (MediaRecorder.isTypeSupported(mp4Avc1Aac)) {
                mimeType = mp4Avc1Aac;
                console.log('Falling back to mime type: video/mp4;codecs=avc1.42001E,mp4a.40.2');
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
                mimeType = 'video/webm';
                console.log('Falling back to generic mime type: video/webm');
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4';
                console.log('Falling back to generic mime type: video/mp4');
            } else {
                console.error('No supported mime type found for recording after trying all options.');
                if (window.statusEl) window.statusEl.textContent = `Error: Your browser does not support any compatible recording formats.`;
                throw new Error('Unsupported mime types for recording.');
            }
        }

        // Final check if any mime type was determined and is supported
        if (!mimeType || !MediaRecorder.isTypeSupported(mimeType)) {
            console.error(`No supported mime type found for recording. Final determined: ${mimeType}`);
            if (window.statusEl) window.statusEl.textContent = `Error: Your browser does not support any compatible recording formats.`;
            throw new Error('Unsupported mime types for recording.');
        }
        console.log('Final mime type for MediaRecorder:', mimeType);


        // Configure recorder options for YouTube-compatible options
        let recommendedBitrate = videoBitrate * 1000000;
        console.log('Using video bitrate (bits per second):', recommendedBitrate);


        const recorderOptions = {
            mimeType: mimeType,
            videoBitsPerSecond: recommendedBitrate,
        };

        // Only set audio bitrate if audio tracks are actually present in the combined stream
        if (combinedStream.getAudioTracks().length > 0) {
            recorderOptions.audioBitsPerSecond = audioBitrate * 1000;
            console.log('Using audio bitrate (bits per second):', recorderOptions.audioBitsPerSecond);
        } else {
            console.log('No audio tracks in combined stream. Audio bitrate option omitted.');
        }

        // Log the final recorder options before creating MediaRecorder
        console.log('MediaRecorder options:', recorderOptions);


        mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);
        console.log('MediaRecorder created with state:', mediaRecorder.state);
        console.log('MediaRecorder mimeType:', mediaRecorder.mimeType);


        mediaRecorder.ondataavailable = function(event) {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
                console.log('ondataavailable: Received chunk with size:', event.data.size);
            } else {
                 console.log('ondataavailable: Received empty chunk.');
            }
        };

        mediaRecorder.onstop = async function() { // Made onstop async to await addNewRecord
            console.log('MediaRecorder stopped. Total chunks:', recordedChunks.length);
            // Use the mimeType from the MediaRecorder instance for the blob
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
            console.log('Created Blob with type:', blob.type, 'and size:', blob.size);

            // Determine file extension from the actual mime type
            let fileExtension = 'webm'; // Default fallback
            const mimeParts = mediaRecorder.mimeType.split('/');
            if (mimeParts.length > 1) {
                const formatParts = mimeParts[1].split(';');
                if (formatParts.length > 0) {
                    fileExtension = formatParts[0].toLowerCase();
                    // Adjust common aliases
                    if (fileExtension.includes('mp4')) fileExtension = 'mp4';
                    else if (fileExtension.includes('webm')) fileExtension = 'webm';
                }
            }
            console.log('Determined file extension:', fileExtension);


            // Generate a unique ID and filename
            const recordId = `record-${Date.now()}`;
            const filename = `canvas-recording-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.${fileExtension}`;
            console.log('Generated filename:', filename);

            const videoUrl = URL.createObjectURL(blob);

            // Create record data object (addNewRecord expects this structure)
            const recordData = {
                id: recordId,
                name: filename,
                size: blob.size,
                url: videoUrl, // Temporary blob URL
                timestamp: Date.now(),
                // Include prompt-related info if available (from event_listeners.js)
                title: typeof window.generatedPromptTitle !== 'undefined' ? window.generatedPromptTitle : '',
                description: typeof window.generatedPromptDescription !== 'undefined' ? window.generatedPromptDescription : '',
                shortDescription: typeof window.generatedPromptShortDescription !== 'undefined' ? window.generatedPromptShortDescription : '',
                seoTags: typeof window.generatedPromptSeoTags !== 'undefined' ? window.generatedPromptSeoTags : '',
                scenario: typeof window.generatedPromptScenario !== 'undefined' ? window.generatedPromptScenario : '',
                instructions: typeof window.generatedPromptInstructions !== 'undefined' ? window.generatedPromptInstructions : '',
            };


            // Add the new record using the function from record_manager.js
            // addNewRecord is assumed to be globally available
            if (typeof window.addNewRecord === 'function') { // Use window.addNewRecord
                await window.addNewRecord(recordData, blob); // Pass blob to addNewRecord for thumbnail generation and download initiation
                console.log('Called addNewRecord from onstop.');
            } else {
                console.error('addNewRecord function not found. Cannot save record or initiate download.');
                // Fallback: manually trigger download if addNewRecord is missing
                 const downloadLink = document.createElement('a');
                 downloadLink.href = videoUrl;
                 downloadLink.download = filename;
                 downloadLink.click();
                 URL.revokeObjectURL(videoUrl); // Clean up temporary URL
                 if (window.statusEl !== null) window.statusEl.textContent = 'Recording finished, but saving failed. Download initiated.';
            }


            // Stop all tracks in the combined stream
            combinedStream.getTracks().forEach(track => {
                 console.log('Stopping combined stream track:', track.kind, track.id);
                 track.stop();
            });
            console.log('Stopped all tracks in combined stream.');

            // Close the recording audio context after stopping
            closeRecordingAudioContext(); // closeRecordingAudioContext is defined in this file


            // Stop original streams if they are still active
             // Tab streams are handled by the stopStreaming function or handleStreamEnded

            // Ensure UI elements are available before updating (declared in core.js)
            if (window.recordPauseToggleBtn && window.stopBtn && window.streamToggleBtn && window.statusEl && window.recordingIndicatorEl && window.timerDisplayEl) {
                window.recordPauseToggleBtn.disabled = false; // Re-enable record/pause
                window.stopBtn.disabled = true; // Disable stop
                window.streamToggleBtn.disabled = false; // Re-enable stream toggle
                // Status text is updated by addNewRecord now
                window.recordPauseToggleBtn.innerHTML = '<i class="fas fa-circle"></i>'; // Reset icon to circle
                window.recordPauseToggleBtn.title = 'Start Recording'; // Reset title
                window.recordingIndicatorEl.style.display = 'none'; // Hide indicator
                // Timer display is preserved by not clearing it here
            } else {
                console.warn('Required UI elements not found for onstop UI update.');
            }

            window.updateRecordingStatus(false); // Update recording status in storage (updateRecordingStatus is defined in this file) // Use window.updateRecordingStatus
            window.updateUserRecordingStatus(false); // Update user recording status in storage (updateUserRecordingStatus is defined in this file) // Use window.updateUserRecordingStatus
            isPaused = false; // Reset pause state
             // Clear the timer interval
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            recordingStartTime = null; // Reset start time
            timeElapsedBeforePause = 0; // Reset elapsed time
             console.log('Recording process finished.');
        };

         mediaRecorder.onerror = function(event) {
             console.error('MediaRecorder error:', event.error);
             // Log the full error object for more details
             console.error('MediaRecorder error object:', event);

             let errorMessage = 'MediaRecorder error: ' + (event.error ? event.error.message : 'Unknown error');

             // Check for specific EncodingError and provide more helpful message
             if (event.error && event.error.name === 'EncodingError') {
                 errorMessage += '. This often means the selected video format/codecs or bitrate are not supported by your browser/system for recording. Please try selecting "WebM (VP9)" as the Video Format in the Recording Options.';
             }

             // Ensure statusEl is available before accessing textContent
             if (window.statusEl !== null) {
                 window.statusEl.textContent = errorMessage;
             } else {
                 console.warn('statusEl not found when reporting MediaRecorder error.');
             }

             // Attempt to stop recording gracefully on error
             if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                 mediaRecorder.stop();
             }
             // Ensure the recording audio context is closed on error
             closeRecordingAudioContext(); // closeRecordingAudioContext is defined in this file
         };


        // Start recording
        mediaRecorder.start(1000); // Capture chunks every second for better handling
        console.log('MediaRecorder started with interval 1000ms.');
        // Ensure UI elements are available before updating (declared in core.js)
        if (window.recordPauseToggleBtn && window.stopBtn && window.streamToggleBtn && window.statusEl && window.recordingIndicatorEl && window.timerDisplayEl) {
            window.recordPauseToggleBtn.innerHTML = '<i class="fas fa-pause"></i>'; // Change icon to pause
            window.recordPauseToggleBtn.title = 'Pause Recording'; // Update title
            window.stopBtn.disabled = false; // Enable stop
            window.streamToggleBtn.disabled = true; // Disable stream toggle during recording
            if (window.statusEl) window.statusEl.textContent = 'Recording...';
            if (window.recordingIndicatorEl) window.recordingIndicatorEl.style.display = 'block';
            if (window.recordingIndicatorEl) window.recordingIndicatorEl.style.animation = 'pulse 1.5s infinite ease-in-out';
            if (window.timerDisplayEl) window.timerDisplayEl.textContent = '00:00:00';
        } else {
             console.warn('Required UI elements not found for recording start UI update.');
        }

        window.updateRecordingStatus(true); // Update recording status in storage (updateRecordingStatus is defined in this file) // Use window.updateRecordingStatus
        window.updateUserRecordingStatus(true); // Update user recording status in storage (updateUserRecordingStatus is defined in this file) // Use window.updateUserRecordingStatus
        isPaused = false;
        recordingStartTime = Date.now();
        timeElapsedBeforePause = 0; // Reset elapsed time on start
        // Start the timer interval
        if (!timerInterval) {
            timerInterval = setInterval(updateRecordingTimer, 1000);
            console.log('Timer interval started.');
        } else {
             console.warn('Timer interval was already active when starting recording.');
        }

        console.log('Recording started.');


    } catch (error) {
        console.error('Error starting recording:', error);
        // Ensure statusEl is available before accessing textContent
        if (window.statusEl !== null) window.statusEl.textContent = 'Error starting recording: ' + error.message;

        // Ensure UI elements are available before updating (declared in core.js)
        if (window.recordPauseToggleBtn && window.stopBtn && window.streamToggleBtn && window.recordingIndicatorEl) {
            window.recordPauseToggleBtn.disabled = false; // Re-enable record/pause
            window.stopBtn.disabled = true; // Disable stop
            window.streamToggleBtn.disabled = false; // Re-enable stream toggle
            if (window.recordingIndicatorEl) window.recordingIndicatorEl.style.display = 'none';
        } else {
             console.warn('Required UI elements not found for recording start error UI update.');
        }

        window.updateRecordingStatus(false); // Ensure status is false on error (updateRecordingStatus is defined in this file) // Use window.updateRecordingStatus
        window.updateUserRecordingStatus(false); // Ensure user status is false on error (updateUserRecordingStatus is defined in this file) // Use window.updateUserRecordingStatus
        isPaused = false;
         // Clear the timer interval on error
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        recordingStartTime = null; // Reset start time
        timeElapsedBeforePause = 0; // Reset elapsed time
        // Ensure the recording audio context is closed on error
        closeRecordingAudioContext(); // closeRecordingAudioContext is defined in this file
    }
}


// Pause recording process (triggered by message from background or button click)
function pauseRecording() {
     console.log('pauseRecording function called.');
     // Ensure mediaRecorder is available and currently recording
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        isPaused = true;

        // Stop the timer interval
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
            console.log('Timer interval cleared on pause.');
        }

        // Store the time elapsed before pausing
        if (recordingStartTime) {
             timeElapsedBeforePause = Date.now() - recordingStartTime;
             console.log('Time elapsed before pause:', timeElapsedBeforePause, 'ms');
        }


        // Ensure UI elements are available (declared in core.js)
        if (window.recordPauseToggleBtn && window.statusEl && window.recordingIndicatorEl) {
            window.recordPauseToggleBtn.innerHTML = '<i class="fas fa-play"></i>'; // Change icon to play
            window.recordPauseToggleBtn.title = 'Resume Recording'; // Update title
            if (window.statusEl) window.statusEl.textContent = 'Recording Paused.';
            if (window.recordingIndicatorEl) window.recordingIndicatorEl.style.animation = 'none';
            if (window.recordingIndicatorEl) window.recordingIndicatorEl.style.opacity = '1';
        } else {
            console.warn('Required UI elements not found for pauseRecording UI update.');
        }
        console.log('Recording paused by message. isPaused:', isPaused);
    } else {
        console.warn('MediaRecorder not active or not recording when trying to pause.');
    }
}


// Resume recording process (triggered by message from background or button click)
function resumeRecording() {
     console.log('resumeRecording function called.');
     // Ensure mediaRecorder is available and currently paused
    if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        isPaused = false;

        // Adjust recordingStartTime to account for the pause duration
        // The new start time is the current time minus the time that had elapsed before pausing
        recordingStartTime = Date.now() - timeElapsedBeforePause;
        console.log('Recording start time adjusted for resume:', new Date(recordingStartTime).toLocaleString());

        // Restart the timer interval
        if (!timerInterval) {
             timerInterval = setInterval(updateRecordingTimer, 1000);
             console.log('Timer interval restarted on resume.');
        } else {
             console.warn('Timer interval was unexpectedly active when resuming.');
        }


        // Ensure UI elements are available (declared in core.js)
        if (window.recordPauseToggleBtn && window.statusEl && window.recordingIndicatorEl) {
            window.recordPauseToggleBtn.innerHTML = '<i class="fas fa-pause"></i>'; // Change icon to pause
            window.recordPauseToggleBtn.title = 'Pause Recording'; // Update title
            if (window.statusEl) window.statusEl.textContent = 'Recording...';
            if (window.recordingIndicatorEl) window.recordingIndicatorEl.style.animation = 'pulse 1.5s infinite ease-in-out';
        } else {
             console.warn('Required UI elements not found for resumeRecording UI update.');
        }
        console.log('Recording resumed by message. isPaused:', isPaused);
    } else {
        console.warn('MediaRecorder not active or not paused when trying to resume.');
    }
}


// Stop recording process (triggered by button click or command)
// This function now handles the STOPPING of recording.
function stopRecording() {
    console.log('Stop recording function called.');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        console.log('Stopping MediaRecorder...');
        mediaRecorder.stop();
         // Ensure stopBtn, recordPauseToggleBtn, streamToggleBtn, statusEl, recordingIndicatorEl are available (declared in core.js)
        if (window.stopBtn && window.recordPauseToggleBtn && window.streamToggleBtn && window.statusEl && window.recordingIndicatorEl) {
            window.stopBtn.disabled = true; // Disable stop button immediately
            window.recordPauseToggleBtn.disabled = true; // Disable record/pause button immediately
            window.streamToggleBtn.disabled = true; // Disable stream toggle button immediately
            if (window.statusEl) window.statusEl.textContent = 'Processing recording...';
            if (window.recordingIndicatorEl) window.recordingIndicatorEl.style.display = 'none';
        } else {
            console.warn('Required UI elements not found for stopRecording UI update.');
        }

        // isRecording status is updated in mediaRecorder.onstop
        isPaused = false; // Reset pause state
         // Clear the timer interval
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        recordingStartTime = null; // Reset start time
        timeElapsedBeforePause = 0; // Reset elapsed time
        // The rest of the state reset happens in mediaRecorder.onstop
    } else {
        console.log('MediaRecorder not active or already stopped.');
    }
}

// Function to close the recording AudioContext
function closeRecordingAudioContext() {
    if (recordingAudioDestination) {
        recordingAudioDestination.disconnect();
        recordingAudioDestination = null;
    }
    if (recordingAudioContext) {
        recordingAudioContext.close().then(() => {
            console.log('Recording AudioContext closed.');
            recordingAudioContext = null;
        }).catch(error => console.error('Error closing recording AudioContext:', error));
    }
}


// Format file size
function formatSize(bytes) {
    if (bytes === undefined || bytes === null) return 'N/A';
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

// Note: canvas, ctx, leftTabVideoElement, rightTabVideoElement, resolutionEl, videoFormatEl, videoBitrateInput, includeAudioCheckbox, audioBitrateEl, fpsCounter, streamToggleBtn, recordPauseToggleBtn, stopBtn, recordingIndicatorEl, statusEl, timerDisplayEl are assumed to be in core.js.
// setupLeftAudioVisualization, closeLeftAudioContext, setupRightAudioVisualization, closeRightAudioContext are assumed to be in visualizer.js.
// updateCanvasSize, updateCanvasDrawing are assumed to be in core.js.
// updateRecordingStatus, updateUserRecordingStatus, pauseRecording, resumeRecording, stopRecording, closeRecordingAudioContext, startRecording, handleVideoMetadataLoaded are defined in this file.
// recordingAudioContext, recordingAudioDestination, timeElapsedBeforePause are defined in this file.
// generatedPromptTitle, generatedPromptDescription, etc. are assumed to be globally available from event_listeners.js.
// addNewRecord is assumed to be globally available from record_manager.js.
// formatSize is defined in this file.
// displayRecordedVideos and handleDeleteVideo are now in record_manager.js

// Expose global variables and functions
window.isRecording = isRecording;
window.isPaused = isPaused;
window.leftTabStream = leftTabStream;
window.rightTabStream = rightTabStream;
window.timerInterval = timerInterval;
window.timeElapsedBeforePause = timeElapsedBeforePause;

window.updateRecordingStatus = updateRecordingStatus;
window.updateUserRecordingStatus = updateUserRecordingStatus;
window.updateRecordingTimer = updateRecordingTimer;
window.selectTabs = selectTabs;
window.handleVideoMetadataLoaded = handleVideoMetadataLoaded;
window.handleStreamEnded = handleStreamEnded;
window.stopStreaming = stopStreaming;
window.startRecording = startRecording;
window.pauseRecording = pauseRecording;
window.resumeRecording = resumeRecording;
window.stopRecording = stopRecording;
window.closeRecordingAudioContext = closeRecordingAudioContext;
window.formatSize = formatSize;
