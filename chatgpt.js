// chatgpt.js (Right Content Script)
console.log('ChatGPT content script loaded.'); // Keep this outside the guard to see how many times the file is initiated.

// --- Multiple Execution Guard ---
// Use a 'var' variable to act as an execution flag in the global scope of the content script.
// 'var' declarations are more resilient to multiple executions in the same scope
// compared to 'const' or 'let'.
var chatgptContentScriptExecuted = chatgptContentScriptExecuted || false;

// Function to send a ping message to the background script to keep it alive (Defined OUTSIDE the guarded block)
function sendPing() {
    // console.log("chatgpt.js: Attempting to send ping to background from ChatGPT tab."); // Keep pings quiet unless debugging
    try {
        chrome.runtime.sendMessage({ action: "ping" });
        // console.log("chatgpt.js: Sent ping to background from ChatGPT tab."); // Keep pings quiet unless debugging
    } catch (error) {
        // This error often means the background script is not available (e.g. extension updated or crashed)
        // console.error("chatgpt.js: Error sending ping from ChatGPT tab:", error); // Keep quiet unless debugging
        // If ping fails, the background script's periodic check should detect the unresponsiveness
    }
}
console.log('chatgpt.js: sendPing function declared.');

// Use 'var' for pingInterval as well
var pingInterval = null; // Initialize outside the guard
pingInterval = setInterval(sendPing, 25000); // 25 seconds
console.log('chatgpt.js: pingInterval variable declared and interval started.');


// --- Inject Audio Iframe (Defined/Injected OUTSIDE the guarded block) ---
// Define the function outside the guarded block so it's always available.
function injectAudioIframe() {
    // Check if the iframe already exists to prevent duplicates
    if (document.getElementById('audio-player-iframe')) {
        console.log('chatgpt.js: Audio iframe already exists.');
        return;
    }
    const iframe = document.createElement('iframe');
    iframe.id = 'audio-player-iframe'; // Give the iframe an ID
    iframe.src = chrome.runtime.getURL('player.html');
    iframe.style.position = 'fixed';
    // Initially position the iframe off-screen to the left
    iframe.style.top = '50%';
    iframe.style.left = '50%'; // Position off-screen (iframe width is 300px, plus some margin)
    iframe.style.width = '300px';
    iframe.style.height = '200px'; // Increased height slightly for the modal
    iframe.style.translate = '-50% -50%'; // Adjust translate based on left position
    iframe.style.border = 'none';
    iframe.style.zIndex = '10000';
    iframe.style.borderRadius = '10px';
    iframe.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';

    // Use a try-catch for appending the iframe
    try {
        document.body.appendChild(iframe);
        console.log('chatgpt.js: 🎶 Audio iframe injected!');
    } catch (error) {
        console.error("chatgpt.js: Error injecting audio iframe:", error);
    }
}
console.log('chatgpt.js: injectAudioIframe function declared.');


// Inject iframe when the DOM is ready (Setup OUTSIDE the guarded block)
// These listeners should be set up regardless of the execution guard state.
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectAudioIframe);
    } else {
        injectAudioIframe();
    }
    // Also inject on window load as a fallback
    window.addEventListener('load', injectAudioIframe);
} catch (error) {
    console.error("chatgpt.js: Error setting up iframe injection listeners:", error);
    // Attempt to inject anyway as a fallback
    injectAudioIframe();
}
console.log('chatgpt.js: injectAudioIframe listeners set up.');
// --- End Inject Audio Iframe ---

// Listen for messages *from the iframe* (Listener defined OUTSIDE the guarded block)
// This listener must be outside the execution guard to ensure it's always active.
window.addEventListener('message', (event) => {
    // Check the origin for security in a real application!
    // For now, we'll accept messages from any origin ('*') but be aware this is not secure
    // if your iframe content could be loaded from other domains.
    // A more secure approach is to check event.origin against chrome.runtime.getURL('player.html').origin
    // if (event.origin !== chrome.runtime.getURL('player.html').origin) { return; }
    // You can get your extension ID from chrome.runtime.id in your content script.

    const request = event.data; // The message data from the iframe
    console.log("chatgpt.js: Received message from iframe:", request);

    const playerIframe = document.getElementById('audio-player-iframe'); // Get iframe reference here

    if (!playerIframe) {
        console.warn('chatgpt.js: Audio iframe not found when receiving message from iframe.');
        return; // Exit if iframe element is not found
    }


    if (request.action === "audioPlaybackReady") {
        console.log("chatgpt.js: Received 'audioPlaybackReady' message from player iframe.");
        // Now that audio is loaded and ready to play, resume recording
        console.log('chatgpt.js: Sending message to background to resume recording...');
        try {
            chrome.runtime.sendMessage({ action: 'resumeRecording' })
                .then(response => console.log("Response from background after sending resumeRecording:", response))
                .catch(error => console.error("Error sending resumeRecording message:", error));
        } catch (error) {
            console.error('chatgpt.js: Error sending resumeRecording message after audioPlaybackReady:', error);
        }
        // No sendResponse for window.message listeners
    } else if (request.action === "audioPlaybackFinished") {
        console.log("chatgpt.js: Received 'audioPlaybackFinished' message from player iframe via window.message.");
        const originalResponseText = request.responseText; // The original text that was spoken
        const sourceAI = request.sourceAI; // Which AI's audio finished

        // Ensure the message came from the correct AI's audio (in case multiple iframes are ever used)
        if (sourceAI === 'chatgpt') {
            console.log("chatgpt.js: ChatGPT audio playback finished. Notifying background script and resuming recording.");
            // Now that audio is done, send the original response text to the background script
            // so it can be passed to the other AI for processing.
            try {
                // Send the original response text back to the background script
                chrome.runtime.sendMessage({
                    action: "chatGPTResponseAudioFinished", // New action to signal audio complete
                    responseText: originalResponseText
                });
                console.log("chatgpt.js: Sent 'chatGPTResponseAudioFinished' message to background script.");

                // NEW: Send message to background script to resume recording AFTER audio finishes
                console.log('chatgpt.js: Sending message to background to resume recording...');
                chrome.runtime.sendMessage({ action: 'resumeRecording' })
                    .then(response => console.log("Response from background after sending resumeRecording:", response))
                    .catch(error => console.error("Error sending resumeRecording message:", error));


            } catch (error) {
                console.error("chatgpt.js: Error sending 'chatGPTResponseAudioFinished' message to background script:", error);
                // NEW: Attempt to resume recording even if sending the main message fails
                console.log('chatgpt.js: Attempting to send resumeRecording message after error...');
                chrome.runtime.sendMessage({ action: 'resumeRecording' })
                    .then(response => console.log("Response from background after sending resumeRecording (fallback):", response))
                    .catch(error => console.error("Error sending resumeRecording message (fallback):", error));
            }
        } else {
            console.log(`chatgpt.js: Received audioPlaybackFinished from ${sourceAI}, ignoring as this is the ChatGPT script.`);
        }
        // No sendResponse for window.message listeners
    } else if (request.action === 'showAudioIframe') {
        console.log('chatgpt.js: Received showAudioIframe message from iframe.');
        const playerIframe = document.getElementById('audio-player-iframe');
        if (playerIframe) {
            // Move the iframe to the center of the screen
            playerIframe.style.left = '50%';
            playerIframe.style.translate = '-50% -50%';
            console.log('chatgpt.js: Moved audio iframe to center.');
        }
    } else if (request.action === 'hideAudioIframe') {
        console.log('chatgpt.js: Received hideAudioIframe message from iframe.');
        const playerIframe = document.getElementById('audio-player-iframe');
        if (playerIframe) {
            // Move the iframe off-screen to the left
            playerIframe.style.left = '-350px'; // Needs to be less than negative of its width
            playerIframe.style.translate = '0 -50%'; // Reset translate for left positioning
            console.log('chatgpt.js: Moved audio iframe off-screen to the left.');
        }
    }
    // Removed 'pauseRecording' and 'resumeRecording' handlers here, they are now sent directly from handleButtonStateChange
    else if (request.action === 'pauseRecording') {
        chrome.runtime.sendMessage({ action: 'pauseRecording' })
            .then(response => console.log("Response from background after sending pauseRecording:", response))
            .catch(error => console.error("Error sending pauseRecording message:", error));
    }
    else if (request.action === 'resumeRecording') {
        chrome.runtime.sendMessage({ action: 'resumeRecording' })
            .then(response => console.log("Response from background after sending resumeRecording:", response))
            .catch(error => console.error("Error sending resumeRecording message:", error));
    }

    // Handle other messages from the iframe if needed
});
console.log('chatgpt.js: window.message listener for iframe messages declared.');


// Example in a content script (e.g., gemini.js)
window.addEventListener('beforeunload', (event) => {
    // You would need a way for the content script to know the recording status.
    // This could be sent via a message from the background script when it changes.
    // Let's assume a global variable `currentRecordingStatus` exists in the content script.
    if (currentRecordingStatus) { // Check the recording status in the content script
        // Cancel the event
        event.preventDefault();
        // Chrome requires returnValue to be set for the dialog to appear
        event.returnValue = 'Recording is in progress. Are you sure you want to leave?';
        // Return the message as well for compatibility with older browsers
        return 'Recording is in progress. Are you sure you want to leave?';
    }
    // If not recording, allow the page to unload normally
    delete event.returnValue;
});
// You would need to send the recording status to content scripts
// from background.js whenever it changes (e.g., in the toggleDualPrompting handler).


// Check if the script has already been executed. If the flag is true, exit immediately.
if (chatgptContentScriptExecuted) {
    console.warn('ChatGPT content script already executed in this tab. Exiting core logic.');
} else {
    // Set the flag to true to indicate that the script is now running its core logic.
    chatgptContentScriptExecuted = true;
    console.log('ChatGPT content script execution flag set. Running core logic.');


    // --- Global Variables (Declared within the guarded block) ---
    // Flag to indicate if dual prompting is currently active (controlled by the control panel toggle)
    var isDualPromptingActive = false; // Initialize within the guard

    // Variable to temporarily store the latest extracted response text
    // This is needed because the audio playback is asynchronous, and we need
    // the original text to send to the background script after audio finishes.
    var latestResponseText = ''; // Initialize within the guard

    // Placeholder for Speechify API Token and Voice ID.
    // These should ideally be loaded from extension storage or received from the background script.
    // For now, using placeholder values. Replace with actual logic to get these values.
    // API Token is now handled server-side, voiceId is determined in player.js
    // var speechifyApiToken = 'YOUR_SPEECHIFY_API_TOKEN'; // Removed
    // var speechifyVoiceId = 'YOUR_SPEECHIFY_VOICE_ID'; // Removed

    // NEW: Flag to track if recording was active before we paused it
    var wasRecordingBeforePause = false;


    // --- Button State Observer Class (Defined within the guarded block) ---
    // Monitors the state of the AI chat interface buttons (idle, send, responding)
    class ButtonStateObserver {
        constructor(onStateChangeCallback) {
            this.observing = false;
            this.observer = null;
            this.currentState = 'idle'; // Default state
            this.onStateChangeCallback = onStateChangeCallback; // Callback function to call on state change
        }

        start() {
            if (this.observing) {
                console.log('chatgpt.js: Button Observer is already running');
                return;
            }

            console.log('chatgpt.js: Button Observer: Starting observer.');
            // Create a mutation observer to watch for DOM changes
            this.observer = new MutationObserver(mutations => {
                // Use a try-catch block to prevent observer from stopping on errors
                try {
                    this.checkButtonState();
                } catch (error) {
                    console.error('chatgpt.js: Error during ButtonStateObserver check:', error);
                    // Optionally, stop the observer or attempt to restart it
                    // this.stop(); // Consider if stopping is desired on error
                }
            });

            // Set up the observer to watch the entire document
            // since buttons might appear/disappear or change attributes
            const config = { childList: true, subtree: true, attributes: true };
            this.observer.observe(document.body, config);

            // Check initial state
            this.checkButtonState();

            this.observing = true;
            console.log('chatgpt.js: Button state observer started');
        }

        stop() {
            if (!this.observing) {
                console.log('chatgpt.js: Observer is not running');
                return;
            }

            this.observer.disconnect();
            this.observing = false;
            console.log('chatgpt.js: Button state observer stopped');
        }

        checkButtonState() {
            // --- IMPORTANT: These selectors are specific to ChatGPT's current UI. ---
            // --- They are prone to breaking if ChatGPT updates its front-end. ---
            // --- If the extension stops working, check these selectors first! ---
            // --- They are prone to breaking if ChatGPT updates its front-end. ---
            // --- If the extension stops working, check these selectors first! ---

            // Check for disabled voice button (state 'idle')
            // Using data-testid for robustness if available, fallback to ID if needed
            const voiceButton = document.querySelector('button[data-testid="composer-speech-button"][state="disabled"]');

            // Check for send button (state 'send')
            // Using data-testid="send-button" if available, fallback to enabled ID button
            const sendButton = document.querySelector('button[data-testid="send-button"]');
            const sendButtonById = document.getElementById("composer-submit-button");
            // Determine the active send button: prioritize data-testid, fallback to ID if it's enabled
            const activeSendButton = sendButton || (sendButtonById && !sendButtonById.disabled ? sendButtonById : null);


            // Check for stop button (state 'responding')
            // Using data-testid for robustness if available, fallback to ID if needed
            const stopButton = document.querySelector('button[data-testid="stop-button"]');
            const stopButtonById = document.getElementById("cancel-button"); // Common ID for stop/cancel


            let newState = this.currentState; // Assume state doesn't change unless a visible button is found

            // Check button visibility using offsetParent (ensures it's in the rendered layout)
            const isStopButtonVisible = stopButton && stopButton.offsetParent !== null;
            const isStopButtonByIdVisible = stopButtonById && stopButtonById.offsetParent !== null;
            const isActiveSendButtonVisible = activeSendButton && activeSendButton.offsetParent !== null;
            const isVoiceButtonVisible = voiceButton && voiceButton.offsetParent !== null;


            if (isStopButtonVisible || isStopButtonByIdVisible) {
                newState = 'responding';
            } else if (isActiveSendButtonVisible) {
                // If the active send button is visible and enabled (handled by activeSendButton logic)
                newState = 'send';
            } else if (isVoiceButtonVisible) {
                newState = 'idle';
            } else {
                // If none of the expected buttons are visible, keep the current state
                // or potentially transition to a 'unknown' state if needed.
                // For now, we'll just keep the current state if no matching visible button is found.
                // console.warn('chatgpt.js: ButtonStateObserver: No expected button visible. State remains:', this.currentState); // Keep this quiet
                return; // Don't update state or call callback if no relevant button found
            }


            // Only log and call callback if the state has changed
            if (newState !== this.currentState) {
                console.log(`chatgpt.js: Button state changed: ${this.currentState} -> ${newState}`);
                const oldState = this.currentState; // Capture old state
                this.currentState = newState;
                if (this.onStateChangeCallback && typeof this.onStateChangeCallback === 'function') {
                    // Add a small delay before calling the callback for 'idle' state
                    // to give the UI a moment to fully render the response.
                    if (newState === 'idle') {
                        setTimeout(() => this.onStateChangeCallback(this.currentState, oldState), 500); // Increased to 500ms
                    } else {
                        this.onStateChangeCallback(this.currentState, oldState);
                    }
                }
            }
        }
    }
    console.log('chatgpt.js: ButtonStateObserver class declared.');
    // --- End Button State Observer Class ---


    // Create an instance of the ButtonStateObserver, passing the handler function
    var buttonObserver = new ButtonStateObserver(handleButtonStateChange);
    console.log('chatgpt.js: ButtonStateObserver instance created.');

    // --- Content Observer for Response Element (Removed) ---
    // This observer is no longer needed.
    // var responseContentObserver = null;
    // var lastObservedResponseText = ''; // Keep track of the last observed text to avoid duplicate checks

    // function createResponseContentObserver() { ... } // Removed function

    // Helper function to get the latest response element
    function getLatestResponseElement() {
        // --- IMPORTANT: These selectors are specific to ChatGPT's current UI. ---
        // --- They are prone to breaking if ChatGPT updates its front-end. ---
        const responseElementSelector = "div.markdown.prose.dark\\:prose-invert.w-full.break-words.dark";
        const articleElements = document.querySelectorAll('article');

        if (articleElements.length > 0) {
            const lastArticle = articleElements[articleElements.length - 1];
            // --- Debugging: Log the element being returned ---
            const responseEl = lastArticle.querySelector(responseElementSelector);
            console.log('chatgpt.js: getLatestResponseElement returning:', responseEl);
            return responseEl;
            // --- End Debugging ---
        }
        console.log('chatgpt.js: getLatestResponseElement returning null.'); // Debugging
        return null; // Return null if no response element is found
    }
    console.log('chatgpt.js: getLatestResponseElement function declared.');

    // --- End Content Observer (Removed) ---


    // --- Response Handling Logic (Defined within the guarded block) ---
    // Function to handle state changes reported by the ButtonStateObserver
    async function handleButtonStateChange(newState, oldState) {
        console.log('chatgpt.js: handleButtonStateChange called with newState:', newState, 'oldState:', oldState);

        // When the state transitions to 'responding', we are no longer using the content observer
        if (newState === 'responding' && oldState !== 'responding') {
            console.log("chatgpt.js: State transitioned to 'responding'. AI is generating response.");
            // No action needed here as the content observer is removed.
            // isRecordingPausedByContentScript = false; // Reset pause flag when AI starts responding
        }


        // We are interested when the state transitions to 'idle', indicating response is finished
        if (newState === 'idle' && oldState === 'responding') { // Only trigger on transition from responding to idle
            console.log("chatgpt.js: Button state transitioned from 'responding' to 'idle'. Attempting to extract response.");

            // Add a small delay to allow the DOM to fully update after the button state changes
            await new Promise(resolve => setTimeout(resolve, 500));

            // --- Find the latest response element and extract text ---
            const extractedText = getLatestResponseElement()?.textContent || ''; // Use optional chaining and default to empty string
            console.log("chatgpt.js: Extracted latest response text after state change:", extractedText);

            // Store the extracted text in the global variable for later use after audio finishes
            latestResponseText = extractedText;
            console.log("chatgpt.js: Stored extracted text in latestResponseText:", latestResponseText);


            // --- Check if dual prompting is active before sending response for audio ---
            // Access the global variable directly
            if (isDualPromptingActive) {
                console.log("chatgpt.js: Dual prompting is active. Sending ChatGPT response text to player iframe for audio.");

                // NEW: Send message to background script to pause recording BEFORE sending to iframe
                console.log('chatgpt.js: Sending message to background to pause recording...');
                // Store the current recording status before pausing
                chrome.runtime.sendMessage({ action: 'pauseRecording' })
                    .then(response => {
                        console.log("Response from background after sending pauseRecording:", response);
                        // Assuming the background script responds with whether recording was active
                        if (response && typeof response.wasRecording !== 'undefined') {
                            wasRecordingBeforePause = response.wasRecording;
                            console.log('chatgpt.js: Recording was active before pause:', wasRecordingBeforePause);
                        }
                    })
                    .catch(error => console.error("Error sending pauseRecording message:", error));


                // Send the response text to the player iframe for audio generation and playback
                const playerIframe = document.getElementById('audio-player-iframe');
                if (playerIframe && playerIframe.contentWindow) {
                    playerIframe.contentWindow.postMessage({
                        action: 'playAudioForText', // Action for the player iframe
                        text: latestResponseText, // Send the extracted text
                        sourceAI: 'chatgpt' // Indicate which AI generated the response
                        // API Token and Voice ID are now handled in player.js
                    }, '*'); // Use '*' for now, but specify origin if possible for security
                    console.log("chatgpt.js: Sent 'playAudioForText' message to audio player iframe.");

                    // DO NOT send the response to the background script yet.
                    // The background script will be notified when the audio finishes playing
                    // by the player.js script via a message back to this content script,
                    // which then forwards it to the background.

                } else {
                    console.error("chatgpt.js: Audio player iframe not found or not accessible. Cannot initiate audio playback.");
                    // If iframe is not available, proceed without audio, notifying background script directly
                    console.log("chatgpt.js: Audio iframe not found. Notifying background script directly.");
                    try {
                        // Send the original response text directly to the background script
                        chrome.runtime.sendMessage({
                            action: "chatGPTResponseAudioFinished", // Use this action to signal completion (even without audio)
                            responseText: latestResponseText // Still send the text response
                        });
                        console.log("chatgpt.js: Response (without audio) sent to background script");

                        // NEW: Send message to background script to resume recording since audio playback won't happen
                        console.log('chatgpt.js: Sending message to background to resume recording (iframe not found)...');
                        chrome.runtime.sendMessage({ action: 'resumeRecording' })
                            .then(response => console.log("Response from background after sending resumeRecording (iframe fallback):", response))
                            .catch(error => console.error("Error sending resumeRecording message (iframe fallback):", error));

                    } catch (error) {
                        console.error("chatgpt.js: Error sending response (without audio) to background script:", error);
                        // NEW: Attempt to resume recording even if sending the main message fails
                        console.log('chatgpt.js: Attempting to send resumeRecording message after error (iframe fallback)...');
                        chrome.runtime.sendMessage({ action: 'resumeRecording' })
                            .then(response => console.log("Response from background after sending resumeRecording (iframe fallback error):", response))
                            .catch(error => console.error("Error sending resumeRecording message (iframe fallback error):", error));
                    }
                }

            } else {
                console.log("chatgpt.js: Dual prompting is NOT active. Skipping sending ChatGPT response for audio.");
                // If dual prompting is not active, we don't need to involve the other AI or audio playback in this flow.
                // The user is likely interacting manually.
                // In this case, we still might want to send the response to the background script
                // for other potential uses, but not for dual prompting.
                // For now, let's assume if dual prompting is off, we don't send the response anywhere automatically.
            }
            // --- End Check ---

            // Don't stop the observer, just let it keep monitoring for the next turn
            // buttonObserver.stop();  // Removed this line
        } else if (newState === 'responding') {
            console.log("chatgpt.js: Button state is 'responding'. AI is generating response.");
            // The content observer is no longer used here.
        } else if (newState === 'send') {
            console.log("chatgpt.js: Button state is 'send'. Input area is ready.");
            // isRecordingPausedByContentScript = false; // Reset pause flag

        } else if (newState === 'idle') {
            console.log("chatgpt.js: Button state is 'idle'.");
            // If the state is idle but wasn't previously 'responding',
            // it means the AI is idle after page load or before a prompt.
            // We don't need to extract a response in this case.
            // isRecordingPausedByContentScript = false; // Reset pause flag
        }
    }
    console.log('chatgpt.js: handleButtonStateChange function declared.');
    // --- End Response Handling Logic ---


    // Listen for messages from the background script (Listener defined within the guarded block)
    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
        console.log("chatgpt.js: Received message:", request);

        // Handle message to input the prompt into ChatGPT
        // This action is typically for the *initial* prompt to ChatGPT.
        // It should happen regardless of the dual prompting toggle state.
        if (request.action === "processRightPrompt") { // Action name from background.js
            console.log("chatgpt.js: Received 'processRightPrompt' action.");
            const promptText = request.prompt;

            // --- IMPORTANT: These selectors are specific to ChatGPT's current UI. ---
            // --- They are prone to breaking if ChatGPT updates its front-end. ---
            // --- If the extension stops working, check these selectors first! ---
            const promptTextareaId = "prompt-textarea"; // The ID of the target div for the prompt input (ChatGPT)


            // Find the target contenteditable element
            const promptTextarea = document.getElementById(promptTextareaId);

            if (promptTextarea) {
                console.log(`chatgpt.js: Found element with ID "${promptTextareaId}". Attempting to input prompt`);

                // Use a try-catch block for DOM manipulation
                try {
                    // Clear existing content
                    promptTextarea.innerHTML = ''; // Use innerHTML for contenteditable

                    // Set the new prompt text
                    promptTextarea.textContent = promptText; // Set text content

                    console.log("chatgpt.js: Prompt text inputted."); // Log after setting text

                    // Dispatch an input event to notify any listeners (like a rich text editor)
                    const inputEvent = new Event('input', { bubbles: true });
                    promptTextarea.dispatchEvent(inputEvent);

                    console.log("chatgpt.js: Input event dispatched."); // Log after dispatching event

                    // The CSS injected at the start handles hiding the promptTextarea.

                    // --- Add a delay before simulating key press ---
                    // This helps ensure the UI has registered the text input and enabled the button.
                    setTimeout(() => {
                        console.log("chatgpt.js: Delay finished. Attempting to simulate Enter key press."); // Log after delay

                        // --- Simulate Enter key press on the prompt input element ---
                        // This is often more reliable than clicking the send button directly.
                        const enterKeyEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true, // Important for event propagation
                            cancelable: true,
                            composed: true // Important for events crossing shadow DOM boundaries
                        });

                        try {
                            // Dispatch the keydown event on the prompt input element
                            promptTextarea.dispatchEvent(enterKeyEvent);
                            console.log("chatgpt.js: Simulated Enter key press on prompt input.");

                            // --- Send message to background script immediately after simulating key press ---
                            // This message is just to trigger the avatar movement in the control panel
                            chrome.runtime.sendMessage({
                                action: "rightTabSendButtonClicked",
                                // No need for tabId here, background knows the sender tab
                            })
                                .then(() => console.log("chatgpt.js: Sent 'rightTabSendButtonClicked' message to background."))
                                .catch(error => console.error("chatgpt.js: Error sending 'rightTabSendButtonClicked' message:", error));
                            // --- End Send message ---


                            // --- Start the ButtonStateObserver ---
                            // The observer will now monitor the button state and call
                            // handleButtonStateChange when the state changes, including to 'idle'.
                            // Ensure buttonObserver instance exists before starting
                            if (buttonObserver) {
                                buttonObserver.start();
                                console.log("chatgpt.js: Started ButtonStateObserver.");
                            } else {
                                console.warn("chatgpt.js: ButtonStateObserver instance not found. Cannot start observer.");
                            }

                            // Send a success response back to the background script
                            sendResponse({ status: "Prompt inputted and Enter key press simulated on right tab" });

                        } catch (keyPressError) {
                            console.error(`chatgpt.js: Error simulating Enter key press on element with ID "${promptTextareaId}" on right tab:`, keyPressError);
                            sendResponse({ status: "Error", message: `Error simulating Enter key press: ${keyPressError.message}` });
                        }

                    }, 100); // Added a small delay (e.g., 100ms) before simulating key press

                    // Indicate that sendResponse will be called asynchronously
                    return true;

                } catch (inputError) {
                    console.error(`chatgpt.js: Error inputting prompt text into element with ID "${promptTextareaId}" on right tab:`, inputError);
                    sendResponse({ status: "Error", message: `Error inputting prompt text: ${inputError.message}` });
                    return true; // Indicate async response
                }


            } else {
                console.error(`chatgpt.js: Prompt textarea element with ID "${promptTextareaId}" not found on right tab. This might be due to UI changes.`);
                // If prompt textarea is not found, send an error response.
                sendResponse({ status: "Error", message: `Prompt textarea element with ID "${promptTextareaId}" not found on right tab.` });
            }
            // Indicate that sendResponse will be called asynchronously
            return true;
        }
        // Handle message to receive response from any AI on the left tab
        // This message is sent from the background script ONLY if dual prompting is active.
        else if (request.action === "receiveOtherAIResponse") {
            console.log("chatgpt.js: Received 'receiveOtherAIResponse' action.");
            // The responseText property holds the response from the left tab AI
            const responseText = request.responseText;
            console.log("chatgpt.js: Received response from left tab AI:", responseText);


            // --- Check if dual prompting is active before processing ---
            // Although the background script *should* only send this if active,
            // an extra check here provides robustness.
            if (isDualPromptingActive) {
                console.log("chatgpt.js: Dual prompting is active. Processing left AI response.");

                // --- Process the received left AI response ---
                // This is where you would inject the left AI response back into the ChatGPT chat interface
                // or use it to formulate the next prompt for ChatGPT.
                console.log("chatgpt.js: Injecting/processing left AI response within ChatGPT interface (replace with actual DOM manipulation).");

                // --- IMPORTANT: These selectors are specific to ChatGPT's current UI. ---
                // --- They are prone to breaking if ChatGPT updates its front-end. ---
                const promptTextareaId = "prompt-textarea"; // The ID of the target div for the prompt input (ChatGPT)


                // Find the target contenteditable element
                const promptTextarea = document.getElementById(promptTextareaId);

                if (promptTextarea) {
                    console.log(`chatgpt.js: Found element with ID "${promptTextareaId}". Attempting to input prompt.`);

                    // Use a try-catch block for DOM manipulation
                    try {
                        // Clear existing content
                        promptTextarea.innerHTML = ''; // Use innerHTML for contenteditable

                        // Set the new prompt text (using the response from the left AI)
                        promptTextarea.textContent = responseText; // Set text content

                        console.log("chatgpt.js: Prompt text inputted."); // Log after setting text

                        // Dispatch an input event to notify any listeners (like a rich text editor)
                        const inputEvent = new Event('input', { bubbles: true });
                        promptTextarea.dispatchEvent(inputEvent);

                        console.log("chatgpt.js: Input event dispatched."); // Log after dispatching event

                        // The CSS injected at the start handles hiding the promptTextarea.

                        // --- Add a delay before simulating key press ---
                        // This helps ensure the UI has registered the text input and enabled the button.
                        setTimeout(() => {
                            console.log("chatgpt.js: Delay finished. Attempting to simulate Enter key press."); // Log after delay

                            // --- Simulate Enter key press on the prompt input element ---
                            const enterKeyEvent = new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                bubbles: true,
                                cancelable: true,
                                composed: true
                            });

                            try {
                                promptTextarea.dispatchEvent(enterKeyEvent);
                                console.log("chatgpt.js: Simulated Enter key press on prompt input.");

                                // --- Start the ButtonStateObserver ---
                                // The observer will now monitor the button state and call
                                // handleButtonStateChange when the state changes, including to 'idle'.
                                // Ensure buttonObserver instance exists before starting
                                if (buttonObserver) {
                                    buttonObserver.start();
                                    console.log("chatgpt.js: Started ButtonStateObserver.");
                                } else {
                                    console.warn("chatgpt.js: ButtonStateObserver instance not found. Cannot start observer.");
                                }


                                // Send a success response back to the background script
                                sendResponse({ status: "Prompt inputted and Enter key press simulated on right tab" });

                            } catch (keyPressError) {
                                console.error(`chatgpt.js: Error simulating Enter key press on element with ID "${promptTextareaId}" on right tab:`, keyPressError);
                                sendResponse({ status: "Error", message: `Error simulating Enter key press: ${keyPressError.message}` });
                            }

                        }, 100); // Added a small delay (e.g., 100ms) before simulating key press

                        // Indicate that sendResponse will be called asynchronously
                        return true;

                    } catch (inputError) {
                        console.error(`chatgpt.js: Error inputting prompt text into element with ID "${promptTextareaId}" on right tab:`, inputError);
                        sendResponse({ status: "Error", message: `Error inputting prompt text: ${inputError.message}` });
                        return true; // Indicate async response
                    }

                } else {
                    console.error(`chatgpt.js: Prompt textarea element with ID "${promptTextareaId}" not found on right tab. This might be due to UI changes.`);
                    // If prompt textarea is not found, send an error response.
                    sendResponse({ status: "Error", message: `Prompt textarea element with ID "${promptTextareaId}" not found on right tab.` });
                }
                // Indicate that sendResponse will be called asynchronously
                return true;


            } else {
                console.log("chatgpt.js: Dual prompting is NOT active. Skipping processing left AI response.");
                sendResponse({ status: "Dual prompting inactive, skipping response processing" });
            }
            // --- End Check ---

            return true; // Indicate async response
        } else if (request.action === "updateDualPromptingStatus") {
            // Receive the updated dual prompting status from the background script
            isDualPromptingActive = request.isActive;
            console.log(`chatgpt.js: Received updateDualPromptingStatus: isDualPromptingActive set to ${isDualPromptingActive}`);
            sendResponse({ status: "Dual prompting status updated" });
            return true; // Indicate async response
        }
        // The 'audioPlaybackFinished' message is now handled by the window.message listener below

        // NEW: Handle message from background script about user recording status
        else if (request.action === "updateUserRecordingStatus") {
            console.log("chatgpt.js: Received 'updateUserRecordingStatus' action.");
            // We don't need to store this flag in the content script anymore,
            // the background script will decide whether to forward pause/resume commands.
            // This message is just informative if needed for other logic in the future.
            sendResponse({ status: "User recording status received by content script" });
            return true; // Indicate async response
        }

        // Handle other message actions if necessary

        // If the message was not handled, return false
        return false;
    });


    // Function to send a message to the background script indicating readiness (Defined within the guarded block)
    function notifyBackgroundScriptReady() {
        console.log("chatgpt.js: Attempting to send 'contentScriptReady' message to background from ChatGPT tab.");
        try {
            chrome.runtime.sendMessage({ action: "contentScriptReady" });
            console.log("chatgpt.js: Sent 'contentScriptReady' message to background from ChatGPT tab.");
        } catch (error) {
            console.error("chatgpt.js: Error sending 'contentScriptReady' message from ChatGPT tab:", error);
            // This error often means the background script is not available (e.g. extension updated or crashed)
        }
    }
    console.log('chatgpt.js: notifyBackgroundScriptReady function declared.');


    // Use a try-catch around the ready state listeners (Setup within the guarded block)
    try {
        // Send ready signal when the DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', notifyBackgroundScriptReady);
        } else {
            notifyBackgroundScriptReady();
        }

        // Also send ready signal on window load as a fallback
        window.addEventListener('load', notifyBackgroundScriptReady);
    } catch (error) {
        console.error("chatgpt.js: Error setting up DOMContentLoaded/load listeners:", error);
        // Attempt to send ready signal anyway as a fallback
        notifyBackgroundScriptReady();
    }
    console.log('chatgpt.js: DOMContentLoaded/load listeners set up.');


    // --- Inject Custom CSS (Injected within the guarded block) ---
    // This CSS will hide the prompt textarea and response elements initially.
    // Define the variable and perform injection within the guarded block.
    const customCss = `
        /* --- IMPORTANT: These selectors are specific to ChatGPT's current UI. --- */
        /* --- They are prone to breaking if ChatGPT updates its front-end. --- */
        /* --- If the extension stops working, check these selectors first! --- */
        /*#prompt-textarea {
            display: none !important;
        }*/
        /* Hiding the actual response might interfere with scraping it.
           Consider if this rule is truly necessary or if just hiding the input is enough. */
        /* The selector below targets the markdown/prose container for responses */
        /*
        div.markdown.prose.dark\\:prose-invert.w-full.break-words.dark {
            display: none !important;
        }
        */
    `;

    // Use a try-catch block for CSS injection
    try {
        const styleElement = document.createElement('style');
        styleElement.textContent = customCss;
        document.head.appendChild(styleElement);
        console.log('chatgpt.js: Custom CSS injected to hide prompt input in ChatGPT tab.');
    } catch (error) {
        console.error("chatgpt.js: Error injecting custom CSS into ChatGPT tab:", error);
    }
    // --- End Inject Custom CSS ---

} // End of Multiple Execution Guard block

// Assuming `currentRecordingStatus` is a global variable managed by messages from background.js
// if the recording state is managed in the background script.
// Let's add a placeholder for this variable outside the guard as well.
// This variable is now less critical in content scripts as the background script
// decides whether to forward pause/resume commands based on user recording status.
var currentRecordingStatus = false; // Placeholder variable
