// gemini.js (Content Script for Gemini)
console.log('Gemini content script loaded.'); // Keep this outside the guard to see how many times the file is initiated.

// --- Multiple Execution Guard ---
// Use a 'var' variable to act as an execution flag in the global scope of the content script.
// 'var' declarations are more resilient to multiple executions in the same scope
// compared to 'const' or 'let'.
var geminiContentScriptExecuted = geminiContentScriptExecuted || false;

// Function to send a ping message to the background script to keep it alive (Defined OUTSIDE the guarded block)
function sendPing() {
    // console.log("gemini.js: Attempting to send ping to background from Gemini tab."); // Keep pings quiet unless debugging
    try {
        chrome.runtime.sendMessage({ action: "ping" });
        // console.log("gemini.js: Sent ping to background from Gemini tab."); // Keep pings quiet unless debugging
    } catch (error) {
        // This error often means the background script is not available (e.g. extension updated or crashed)
        // console.error("gemini.js: Error sending ping from Gemini tab:", error); // Keep quiet unless debugging
        // If ping fails, the background script's periodic check should detect the unresponsiveness
    }
}
console.log('gemini.js: sendPing function declared.');

// Use 'var' for pingInterval as well
var pingInterval = null; // Initialize outside the guard
pingInterval = setInterval(sendPing, 25000); // 25 seconds
console.log('gemini.js: pingInterval variable declared and interval started.');


// --- Inject Audio Iframe (Defined/Injected OUTSIDE the guarded block) ---
// Define the function outside the guarded block so it's always available.
function injectAudioIframe() {
    // Check if the iframe already exists to prevent duplicates
    if (document.getElementById('audio-player-iframe')) {
        console.log('gemini.js: Audio iframe already exists.');
        return;
    }
    const iframe = document.createElement('iframe');
    iframe.id = 'audio-player-iframe'; // Give the iframe an ID
    iframe.src = chrome.runtime.getURL('player.html');
    iframe.style.position = 'fixed';
    // Initially position the iframe centered
    iframe.style.top = '50%';
    iframe.style.left = '50%'; // Start centered
    iframe.style.width = '300px';
    iframe.style.height = '200px'; // Increased height slightly for the modal
    iframe.style.translate = '-50% -50%'; // Center based on its own size
    iframe.style.border = 'none';
    iframe.style.zIndex = '10000';
    iframe.style.borderRadius = '10px';
    iframe.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
    // Removed transition for instant movement

    // Use a try-catch for appending the iframe
    try {
        document.body.appendChild(iframe);
        console.log('gemini.js: 🎶 Audio iframe injected!');
    } catch (error) {
        console.error("gemini.js: Error injecting audio iframe:", error);
    }
}
console.log('gemini.js: injectAudioIframe function declared.');


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
    console.error("gemini.js: Error setting up iframe injection listeners:", error);
    // Attempt to inject anyway as a fallback
    injectAudioIframe();
}
console.log('gemini.js: injectAudioIframe listeners set up.');
// --- End Inject Audio Iframe ---


// Listen for messages *from the iframe* (Listener defined OUTSIDE the guarded block)
// This listener must be outside the execution guard to ensure it's always active.
window.addEventListener('message', (event) => {
    // Check the origin for security in a real application!
    // For now, we'll accept messages from any origin ('*') but be aware this is not secure
    // if your iframe content could be loaded from other domains.
    // A more secure approach is to check event.origin against chrome.runtime.getURL('player.html').origin
    // if (event.origin !== chrome.runtime.getURL('player.html').origin) {
    //     console.warn('gemini.js: Received message from unknown origin:', event.origin);
    //     return; // Ignore messages from unexpected origins
    // }

    const request = event.data; // The message data from the iframe
    console.log("gemini.js: Received message from iframe:", request);

    const playerIframe = document.getElementById('audio-player-iframe'); // Get iframe reference here

    if (!playerIframe) {
        console.warn('gemini.js: Audio iframe not found when receiving message from iframe.');
        return; // Exit if iframe element is not found
    }

    // Handle message from player iframe indicating audio is ready to play
    if (request.action === "audioPlaybackReady") {
        console.log("gemini.js: Received 'audioPlaybackReady' message from player iframe.");
        // Now that audio is loaded and ready to play, resume recording
        console.log('gemini.js: Sending message to background to resume recording...');
        try {
            chrome.runtime.sendMessage({ action: 'resumeRecording' })
                .then(response => console.log("Response from background after sending resumeRecording:", response))
                .catch(error => console.error("Error sending resumeRecording message:", error));
        } catch (error) {
            console.error('gemini.js: Error sending resumeRecording message after audioPlaybackReady:', error);
        }
        // No sendResponse for window.message listeners
    } else if (request.action === "audioPlaybackFinished") {
        console.log("gemini.js: Received 'audioPlaybackFinished' message from player iframe via window.message.");
        const originalResponseText = request.responseText; // The original text that was spoken

        // Now that audio is done, send the original response text to the background script
        // so it can be passed to the other AI for processing.
        console.log("gemini.js: Notifying background script that audio playback is finished.");
        try {
            // Send the original response text back to the background script
            chrome.runtime.sendMessage({
                action: "geminiResponseAudioFinished", // Action to signal audio complete
                responseText: originalResponseText // Include the original text
            });
            console.log("gemini.js: Sent 'geminiResponseAudioFinished' message to background script.");

            // IMPORTANT: Do NOT send resumeRecording here anymore. It is sent when audioPlaybackReady is received.

        } catch (error) {
            console.error("gemini.js: Error sending 'geminiResponseAudioFinished' message to background script:", error);
            // Fallback resume recording is now handled in the audioPlaybackReady handler if that message is missed,
            // or if the iframe wasn't found initially.
        }
        // No sendResponse for window.message listeners
    } else if (request.action === 'hideAudioIframe') {
        console.log('gemini.js: Received hideAudioIframe message from iframe.');
        // Move the iframe off-screen to the left
        playerIframe.style.left = '-350px'; // Needs to be less than negative of its width
        playerIframe.style.translate = '0 -50%'; // Reset translate for left positioning
        console.log('gemini.js: Moved audio iframe off-screen to the left.');
    }
    // Removed handlers for 'pauseRecording' and 'resumeRecording' received *from* the iframe
    else if (request.action === 'pauseRecording') {
        chrome.runtime.sendMessage({ action: 'pauseRecording' })
            .then(response => console.log("Response from background after sending pauseRecording:", response))
            .catch(error => console.error("Error sending pauseRecording message:", error));
    }
    else if (request.action === 'resumeRecording') {
        chrome.runtime.sendMessage({ action: 'resumeRecording' })
            .then(response => console.log("Response from background after sending resumeRecording (iframe fallback):", response))
            .catch(error => console.error("Error sending resumeRecording message (iframe fallback):", error));
    }

    // Handle other messages from the iframe if needed
});
console.log('gemini.js: window.message listener for iframe messages declared.');


// Listen for messages from the background script (Listener defined OUTSIDE the guarded block)
// This listener must be outside the execution guard to ensure it's always active.
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => { // Made listener async
    console.log("gemini.js: Gemini content script received message:", request);

    // Handle message to save the initial prompt (sent from background.js after user input)
    // This is the prompt that the user initially types into the control panel.
    if (request.action === "saveLeftPrompt") {
        console.log("gemini.js: Received 'saveLeftPrompt' action.");
        // Only save the prompt if dual prompting is active.
        // If not active, this prompt is likely from manual user input we don't need to intercept.
        if (isDualPromptingActive) { // Access global variable directly
            savedLeftPrompt = request.prompt; // Save the prompt
            console.log("gemini.js: Saved initial prompt for dual prompting:", savedLeftPrompt);
            // DO NOT automatically process the prompt here. Wait for the ChatGPT response.
            sendResponse({ status: "Prompt saved for dual prompting on Gemini tab" });
        } else {
            console.log("gemini.js: Dual prompting is NOT active. Skipping saving initial prompt.");
            sendResponse({ status: "Dual prompting inactive, skipping prompt save" });
        }
        return true; // Indicate async response
    }
    // Handle message to receive response from the other AI (e.g., Claude or ChatGPT)
    // This message is sent from the background script ONLY if dual prompting is active.
    if (request.action === "receiveChatGPTResponse") {
        // --- Check if dual prompting is active before processing ---
        if (!isDualPromptingActive) { // Access global variable directly
            console.log("gemini.js: Dual prompting is NOT active. Skipping processing ChatGPT response.");
            sendResponse({ status: "Dual prompting inactive, skipping response processing" });
            return true; // Indicate async response
        }

        if (isProcessingGeminiPrompt) { // Access global variable directly
            console.warn("gemini.js: Still processing previous prompt, deferring new response from other AI");
            sendResponse({ status: "Busy processing previous prompt" });
            return true; // Indicate async response
        }

        console.log("gemini.js: Received 'receiveChatGPTResponse' action.");
        isProcessingGeminiPrompt = true; // Set processing flag (Access global variable directly)
        const chatGPTResponse = request.chatGPTResponse; // Assuming the response text is in chatGPTResponse property
        console.log("gemini.js: Received ChatGPT response:", chatGPTResponse);

        // --- Combine the saved initial Gemini prompt and the ChatGPT response ---
        // Use the saved initial prompt as the base
        let combinedPrompt = savedLeftPrompt; // Access global variable directly

        if (chatGPTResponse && chatGPTResponse.trim() !== '') { // Check if ChatGPT response is not empty
            // Append the ChatGPT response to the saved prompt
            // Using a clear label to indicate the source of the appended text
            combinedPrompt = (combinedPrompt ? combinedPrompt + '\n\n' : '') + `--- Response from other AI ---\n${chatGPTResponse}`; // Ensure newline if initial prompt exists
            console.log("gemini.js: Combined prompt with ChatGPT response.");
        } else {
            console.warn("gemini.js: Received null, empty, or whitespace-only ChatGPT response. Only sending the initial prompt.");
            console.log("gemini.js: Using only the initial prompt.");
            // If response is null, empty, or whitespace, combinedPrompt will be empty if initial prompt was also empty, handled by the empty check in inputPromptAndSend
        }

        // Clear the saved initial prompt after combining, as it's now used for the combined prompt.
        savedLeftPrompt = null; // Use null instead of empty string for consistency (Access global variable directly)
        console.log("gemini.js: Cleared savedLeftPrompt after combining.");

        // --- Input the combined prompt and click send ---
        // Call the input and send function directly with the combined prompt
        // This function will handle waiting for the input and send button.
        await inputPromptAndSend(combinedPrompt); // Use await here

        // isProcessingGeminiPrompt is reset within inputPromptAndSend if it fails
        // It remains true if inputPromptAndSend successfully clicks the button,
        // and is reset by handleGeminiButtonStateChange when the response finishes.

        sendResponse({ status: "ChatGPT response received, combined prompt inputted and send button clicked on Gemini tab" });
        return true; // Indicate async response
    } else if (request.action === "updateDualPromptingStatus") {
        // Receive the updated dual prompting status from the background script
        isDualPromptingActive = request.isActive; // Access global variable directly
        console.log(`gemini.js: Received updateDualPromptingStatus: isDualPromptingActive set to ${isDualPromptingActive}`);
        sendResponse({ status: "Dual prompting status updated" });
        return true; // Indicate async response
    }
    // Removed the direct audioPlaybackFinished handler here, it's now handled by the window.message listener above.
    // else if (request.action === "audioPlaybackFinished") { ... }


    // Handle other message actions if necessary

    // If the message was not handled, return false
    return false;
});
console.log('gemini.js: chrome.runtime.onMessage listener for background messages declared.');


// Function to send a message to the background script indicating readiness (Defined OUTSIDE the guarded block)
// This function must be outside the execution guard to ensure it's always called.
function notifyBackgroundScriptReady() {
    console.log("gemini.js: Attempting to send 'contentScriptReady' message to background from Gemini tab.");
    try {
        chrome.runtime.sendMessage({ action: "contentScriptReady" });
        console.log("gemini.js: Sent 'contentScriptReady' message to background from Gemini tab.");
    } catch (error) {
        console.error("gemini.js: Error sending 'contentScriptReady' message from Gemini tab:", error);
        // This error often means the background script is not available (e.g. extension updated or crashed)
    }
}
console.log('gemini.js: notifyBackgroundScriptReady function declared.');


// Use a try-catch around the ready state listeners (Setup OUTSIDE the guarded block)
// These listeners must be outside the execution guard to ensure they are always set up.
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
    console.error("gemini.js: Error setting up DOMContentLoaded/load listeners:", error);
    // Attempt to send ready signal anyway as a fallback
    notifyBackgroundScriptReady();
}
console.log('gemini.js: DOMContentLoaded/load listeners set up for notifyBackgroundScriptReady.');


// Helper function to get the current recording status (Defined OUTSIDE the guarded block)
// This function is needed by the beforeunload listener.
function getRecordingStatus() {
    // You would need to store and retrieve the recording status in content script state
    // or request it from the background script if it's only stored there.
    // For now, returning a placeholder. This needs to be properly implemented.
    console.warn('gemini.js: getRecordingStatus function is a placeholder and needs proper implementation.');
    return false; // Placeholder
}
// Assuming `currentRecordingStatus` is a global variable managed by messages from background.js
// if the recording state is managed in the background script.
// Let's add a placeholder for this variable outside the guard as well.
var currentRecordingStatus = false; // Placeholder variable

// --- DOM Interaction Functions (Defined OUTSIDE the guarded block) ---
// These functions must be outside the guard to be available to other functions like message listeners.

// Helper function to wait for an element to appear in the DOM
function waitForElement(selector, timeout = 15000) { // Increased default timeout slightly
    return new Promise((resolve, reject) => {
        console.log(`gemini.js: waitForElement: Waiting for selector: ${selector}`); // Added log
        const element = document.querySelector(selector);
        if (element) {
            console.log(`gemini.js: waitForElement: Found element immediately for selector: ${selector}`); // Added log
            return resolve(element);
        }

        const observer = new MutationObserver((mutations) => {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`gemini.js: waitForElement: Found element via observer for selector: ${selector}`); // Added log
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        if (timeout) {
            const timeoutId = setTimeout(() => {
                observer.disconnect();
                console.error(`gemini.js: waitForElement: Timeout waiting for selector: ${selector}`); // Added log
                reject(new Error(`gemini.js: waitForElement: Timeout waiting for selector: ${selector}`));
            }, timeout);
            // Clear timeout if element is found before timeout
            // This requires storing the timeoutId and clearing it in the resolve block
            // For simplicity here, we'll rely on the observer disconnect and the promise resolving.
            // The timeout will still fire, but the promise will already be resolved.
        }
    });
}
console.log('gemini.js: waitForElement function declared.');


// Function to start observing for new messages/responses
// This function might be less critical in the new flow if we rely solely on button state,
// but keep it if response streaming needs to be handled later.
function startResponseObserver() {
    // --- IMPORTANT: These selectors are specific to Gemini's current UI. ---
    // --- They are prone to breaking if Gemini updates its front-end. ---
    // --- If the extension stops working, check these selectors first! ---
    // Need to identify a stable container for Gemini's chat messages if needed for observation
    // For now, relying on button state observer is sufficient.
    console.warn('gemini.js: Response observer is currently not implemented for Gemini.');
    // Example selector if needed: const chatContainerSelector = '...';
    // waitForElement(chatContainerSelector)...
}
console.log('gemini.js: startResponseObserver function declared.');


// Function to process a new message element (if needed for streaming)
// This function is less critical if we rely on the 'idle' state of the button observer
// to signal the end of a response.
function processNewMessage(messageNode) {
    console.warn('gemini.js: processNewMessage is currently not implemented for Gemini.');
    // Example selector if needed: const responseTextElementSelector = '...';
    // const responseElement = messageNode.querySelector(responseTextElementSelector);
    // if (responseElement) { ... }
}
console.log('gemini.js: processNewMessage function declared.');


// Function to input the prompt text into the Gemini UI and click send
async function inputPromptAndSend(promptText) {
    console.log('gemini.js: inputPromptAndSend called with prompt:', promptText);

    // --- Gemini-Specific Selectors and Properties ---
    console.log("gemini.js: Using Gemini selectors.");
    const promptInputSelector = 'rich-textarea div.ql-editor'; // Selector for Gemini's contenteditable input
    const sendButtonSelector = 'button[aria-label="Send message"][aria-disabled="false"]'; // Selector for Gemini's ENABLED send button
    const isContentEditable = true; // It's a contenteditable div
    const sendButtonTimeout = 10000;


    // --- Check if the prompt is empty ---
    if (!promptText || promptText.trim() === '') {
        console.warn("gemini.js: Prompt text is empty or whitespace only. Skipping input and send.");
        isProcessingGeminiPrompt = false; // Reset processing flag (Access global variable directly)
        return; // Exit the function
    }
    // --- End Check ---


    try {
        console.log(`gemini.js: inputPromptAndSend: Waiting for prompt input with selector: ${promptInputSelector}`); // Added log
        // Wait for the prompt input element (contenteditable div) to be available
        const promptInput = await waitForElement(promptInputSelector, 20000); // Increased timeout to 20 seconds

        console.log('gemini.js: Found prompt input. Attempting to input text.'); // This log confirms element was found
        console.log('gemini.js: Prompt input element:', promptInput); // Log the actual element

        // Use a try-catch block for DOM manipulation
        try {
            console.log('gemini.js: Clearing existing content in prompt input field.'); // Added log
            // Clear existing content for contenteditable
            promptInput.innerHTML = '';
            promptInput.textContent = ''; // Ensure text content is also cleared
            console.log('gemini.js: Existing content cleared.'); // Added log

            console.log('gemini.js: Setting new prompt text.'); // Added log
            // Set the new prompt text for contenteditable
            promptInput.textContent = promptText;
            console.log('gemini.js: New prompt text set.'); // Added log

            console.log('gemini.js: Dispatching input event.'); // Added log
            // Dispatch an input event to notify any listeners
            const inputEvent = new Event('input', { bubbles: true });
            promptInput.dispatchEvent(inputEvent);
            console.log('gemini.js: Input event dispatched.'); // Added log

            // For contenteditable, sometimes a 'blur' or 'focus' event can help trigger UI updates.
            // Let's try dispatching a blur followed by focus after a small delay.
            setTimeout(() => {
                try {
                    promptInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    console.log('gemini.js: Blur event dispatched.');
                    promptInput.dispatchEvent(new Event('focus', { bubbles: true }));
                    console.log('gemini.js: Focus event dispatched.');
                } catch (e) {
                    console.warn('gemini.js: Error dispatching blur/focus events:', e);
                }
            }, 50); // Small delay


            console.log("gemini.js: Prompt text inputted and input event dispatched."); // This log confirms these steps

            // The CSS injected at the start handles hiding the promptInput if needed.

            // --- Find and click the send button ---
            // Add a small delay before attempting to click the send button
            // This can help ensure the UI has registered the text input and enabled the button.
            await new Promise(resolve => setTimeout(resolve, 750)); // Increased delay slightly for robustness

            console.log(`gemini.js: inputPromptAndSend: Waiting for send button with selector: "${sendButtonSelector}"`); // Added log
            // Wait for the send button to be available and enabled (matching the selector)
            const sendButton = await waitForElement(sendButtonSelector, sendButtonTimeout); // Use site-specific timeout

            if (sendButton) {
                console.log("gemini.js: Send button element found:", sendButton); // Log the element
                console.log(`gemini.js: Found send button with selector "${sendButtonSelector}". Attempting to click.`); // This log confirms button was found

                // Use a try-catch block for clicking
                try {
                    // --- Send message to background script immediately after clicking send button (ONLY for the first prompt) ---
                    // This message is just to trigger the avatar movement in the control panel
                    if (isFirstLeftPromptSent) { // Access global variable directly
                        chrome.runtime.sendMessage({
                            action: "leftTabSendButtonClicked", // Use the generic 'leftTabSendButtonClicked' for Gemini when it's the left tab
                            // No need for tabId here, background knows the sender tab
                        })
                            .then(() => console.log("gemini.js: Sent 'leftTabSendButtonClicked' message to background (First prompt)."))
                            .catch(error => console.error("gemini.js: Error sending 'leftTabSendButtonClicked' message (First prompt):", error));

                        isFirstLeftPromptSent = false; // Set the flag to false after sending the first time (Access global variable directly)
                    } else {
                        console.log("gemini.js: Skipping sending 'leftTabSendButtonClicked' message (Not the first prompt).");
                    }
                    // --- End Send message ---

                    // Simulate a click event on the button
                    sendButton.click();
                    console.log("gemini.js: Send button clicked."); // This log confirms the click was attempted

                    // Set the processing flag to true (already set at the start of message handler)
                    console.log("gemini.js: isProcessingGeminiPrompt remains true.");

                    // --- Start the GeminiButtonStateObserver ---
                    // Start the observer *after* clicking the send button to monitor response state.
                    // Access the global instance, which is now defined inside the guarded block
                    if (typeof geminiButtonObserver !== 'undefined' && geminiButtonObserver && !geminiButtonObserver.observing) {
                        geminiButtonObserver.start();
                        console.log("gemini.js: Started GeminiButtonStateObserver.");
                    } else if (typeof geminiButtonObserver !== 'undefined' && geminiButtonObserver) {
                        console.log("gemini.js: GeminiButtonStateObserver is already observing.");
                    } else {
                        console.warn("gemini.js: GeminiButtonStateObserver instance not found. Cannot start observer.");
                    }

                    // No need to send a response back here, the response handling logic will signal completion.

                } catch (clickError) { // Added catch block here
                    console.error(`gemini.js: Error clicking send button with selector "${sendButtonSelector}" on Gemini tab:`, clickError);
                    // If clicking fails, reset the processing flag
                    isProcessingGeminiPrompt = false; // Access global variable directly
                    console.log("gemini.js: isProcessingGeminiPrompt set to false due to click error.");
                    // Optionally, send an error message back to the background
                    /*
                    chrome.runtime.sendMessage({
                        action: "geminiResponseAudioFinished", // Use the finished action to signal an issue
                        responseText: `ERROR: Failed to click send button: ${clickError.message}`
                    }).catch(e => console.error("Error sending error message:", e));
                    */
                }

            } else {
                console.warn(`gemini.js: Send button with selector "${sendButtonSelector}" not found or not enabled on Gemini site after delay. Cannot send prompt.`);
                // Even if send button not found, we still inputted the text.
                // Maybe the user needs to manually click? Log and indicate partial success.
                // Start the observer anyway, it might detect something.
                // Access the global instance, which is now defined inside the guarded block
                if (typeof geminiButtonObserver !== 'undefined' && geminiButtonObserver && !geminiButtonObserver.observing) {
                    geminiButtonObserver.start();
                    console.log("gemini.js: Started GeminiButtonStateObserver even though send button not found/enabled.");
                } else if (typeof geminiButtonObserver !== 'undefined' && geminiButtonObserver) {
                    console.log("gemini.js: GeminiButtonStateObserver is already observing.");
                } else {
                    console.warn("gemini.js: GeminiButtonStateObserver instance not found. Cannot start observer.");
                }


                // If send button not found, reset the processing flag
                isProcessingGeminiPrompt = false; // Access global variable directly
                console.log("gemini.js: isProcessingGeminiPrompt set to false due to send button not found.");

                // Optionally, send an error message back to the background
                /*
                chrome.runtime.sendMessage({
                    action: "geminiResponseAudioFinished", // Use the finished action to signal an issue
                    responseText: `ERROR: Send button not found.`
                }).catch(e => console.error("Error sending error message:", e));
                */
            }

        } catch (waitForElementError) {
            console.error(`gemini.js: Error waiting for prompt input element with selector "${promptInputSelector}" on Gemini tab:`, waitForElementError);
            // If waiting for input fails, reset the processing flag
            isProcessingGeminiPrompt = false; // Access global variable directly
            console.log("gemini.js: isProcessingGeminiPrompt set to false due to wait for element error.");
            // Optionally, send an error message back to the background
            /*
            chrome.runtime.sendMessage({
                action: "geminiResponseAudioFinished", // Use the finished action to signal an issue
                responseText: `ERROR: Prompt input element not found: ${waitForElementError.message}`
            }).catch(e => console.error("Error sending error message:", e));
            */
        }
    } catch (error) {
        console.error("gemini.js: Error in inputPromptAndSend:", error);
        isProcessingGeminiPrompt = false; // Access global variable directly
    }
}
console.log('gemini.js: inputPromptAndSend function declared.');

// --- End DOM Interaction Functions ---


// Check if the script has already been executed. If the flag is true, exit immediately.
if (geminiContentScriptExecuted) {
    console.warn('Gemini content script already executed in this tab. Exiting core logic.');
} else {
    // Set the flag to true to indicate that the script is now running its core logic.
    geminiContentScriptExecuted = true;
    console.log('Gemini content script execution flag set. Running core logic.');


    // --- Global Variables (Defined within the guarded block) ---
    // Flag to indicate if dual prompting is currently active (controlled by the control panel toggle)
    var isDualPromptingActive = false; // Initialize within the guard

    // Variable to store the original prompt received from the background script
    // This will store the initial prompt sent to Gemini when dual prompting starts.
    var savedLeftPrompt = null; // Stores the initial prompt from the control panel

    // Flag to indicate if Gemini is currently processing a prompt
    var isProcessingGeminiPrompt = false; // Initialize within the guard

    // Flag to track if the first prompt has been sent from this "left" tab in the dual prompting flow
    // Assuming Gemini is the "left" tab in this dual prompting setup.
    var isFirstLeftPromptSent = true; // Initialize as true


    // --- Gemini Button State Observer Class (Defined INSIDE the guarded block) ---
    // Monitors the state of the AI chat interface buttons (idle, send, responding)
    // This class definition is now inside the guard to prevent re-declaration.
    class GeminiButtonStateObserver {
        constructor(onStateChangeCallback) {
            this.observing = false;
            this.observer = null;
            this.currentState = 'idle'; // Default state
            this.onStateChangeCallback = onStateChangeCallback; // Callback function to call on state change
        }

        start() {
            if (this.observing) {
                console.log('gemini.js: Gemini Button Observer is already running');
                return;
            }

            console.log('gemini.js: Gemini Button Observer: Starting observer.');
            // Create a mutation observer to watch for DOM changes
            this.observer = new MutationObserver(mutations => {
                // Use a try-catch block to prevent observer from stopping on errors
                try {
                    this.checkButtonState();
                } catch (error) {
                    console.error('gemini.js: Error during GeminiButtonStateObserver check:', error);
                    // Optionally, stop the observer or attempt to restart it
                    // this.stop(); // Consider if stopping is desired on error
                }
            });

            // Set up the observer to watch the entire document
            // We need to watch for childList changes in the body to catch buttons appearing/disappearing
            // and attribute changes on buttons to detect disabled state changes.
            const config = { childList: true, subtree: true, attributes: true };
            this.observer.observe(document.body, config);

            // Check initial state
            this.checkButtonState();

            this.observing = true;
            console.log('gemini.js: Gemini button state observer started');
        }

        stop() {
            if (!this.observing) {
                console.log('gemini.js: Observer is not running');
                return;
            }

            this.observer.disconnect();
            this.observing = false;
            console.log('gemini.js: Gemini button state observer stopped');
        }

        checkButtonState() {
            // --- IMPORTANT: These selectors are specific to Gemini's current UI. ---
            // --- They are prone to breaking if Gemini updates its front-end. ---
            // --- If the extension stops working, check these selectors first! ---

            // Use the specific selectors provided by the user for Gemini
            const enabledSendButton = document.querySelector('button[aria-label="Send message"][aria-disabled="false"]'); // Enabled send button
            const anySendButton = document.querySelector('button[aria-label="Send message"]'); // Any send button (enabled or disabled)
            const micButton = document.querySelector('button[aria-label="Microphone"]'); // Mic button

            // Add logging to see the status of each button and the processing flag
            console.log('gemini.js: checkButtonState:');
            console.log('  enabledSendButton:', enabledSendButton);
            console.log('  anySendButton:', anySendButton, 'aria-disabled:', anySendButton ? anySendButton.getAttribute('aria-disabled') : 'N/A');
            console.log('  micButton:', micButton, 'disabled:', micButton ? micButton.disabled : 'N/A');
            console.log('  isProcessingGeminiPrompt:', isProcessingGeminiPrompt); // Access global variable directly


            let newState = this.currentState; // Assume state doesn't change unless a clear indicator is found

            // Determine the current state based on the presence and state of key buttons
            const isEnabledSendButtonVisible = enabledSendButton && enabledSendButton.offsetParent !== null;
            const isAnySendButtonVisible = anySendButton && anySendButton.offsetParent !== null;
            const isMicButtonVisible = micButton && micButton.offsetParent !== null;


            if (isEnabledSendButtonVisible) {
                // If the enabled send button is visible, the UI is ready for input.
                newState = 'send'; // Use 'send' to indicate readiness for a new prompt
            } else if (isProcessingGeminiPrompt && !isAnySendButtonVisible) { // Access global variable directly
                // If we are processing a prompt AND *any* send button is NOT visible,
                // assume the AI is responding.
                newState = 'responding';
            } else if (isAnySendButtonVisible && !isEnabledSendButtonVisible) {
                // If a send button is visible but NOT enabled, it's likely the idle state after load or error.
                newState = 'idle';
            }
            // If none of the above match, keep the current state. This handles cases where the UI might be in an unexpected state.


            // Only log and call callback if the state has changed
            if (newState !== this.currentState) {
                console.log(`gemini.js: Gemini button state changed: ${this.currentState} -> ${newState}`);
                const oldState = this.currentState; // Capture old state before updating
                this.currentState = newState;

                // Call the callback, passing both the new and old state
                if (this.onStateChangeCallback && typeof this.onStateChangeCallback === 'function') {
                    this.onStateChangeCallback(newState, oldState);
                }
            }
        }
    }
    console.log('gemini.js: Gemini Button State Observer class declared.');
    // --- End Gemini Button State Observer Class ---


    // Create an instance of the GeminiButtonStateObserver (Defined INSIDE the guarded block)
    // This instance needs to be available to the message listener.
    var geminiButtonObserver = new GeminiButtonStateObserver(handleGeminiButtonStateChange);
    console.log('gemini.js: GeminiButtonStateObserver instance created.');


    // --- Response Handling Logic (Defined INSIDE the guarded block) ---
    // Function to handle state changes reported by the GeminiButtonStateObserver
    // This function now receives both the new and old state
    // This function must be inside the guard to be available to the observer instance.
    async function handleGeminiButtonStateChange(newState, oldState) {
        console.log('gemini.js: handleGeminiButtonStateChange called with newState:', newState, 'oldState:', oldState);

        // We are interested when the state transitions from 'responding' to 'send' (or 'idle')
        // The 'send' state indicates the UI is ready for the next input after a response.
        if (oldState === 'responding' && (newState === 'send' || newState === 'idle')) {
            console.log("gemini.js: State transitioned from 'responding' to 'send' or 'idle'. Response is likely finished.");

            // Stop the observer immediately
            if (typeof geminiButtonObserver !== 'undefined' && geminiButtonObserver && geminiButtonObserver.observing) { // Access global variable directly
                geminiButtonObserver.stop();
                console.log("gemini.js: Stopped GeminiButtonStateObserver.");
            }


            // Add a small delay to allow the DOM to fully update after the response finishes
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms as requested

            console.log("gemini.js: Attempting to extract response text after 100ms delay.");

            // --- Find the latest response element and extract text ---
            // --- IMPORTANT: These selectors are specific to Gemini's current UI. ---
            // --- They are prone to breaking if Gemini updates its front-end. ---
            // --- If the extension stops working, check these selectors first! ---
            // Use the class name provided by the user for message bubbles
            const responseElementSelector = 'message-content'; // Selector for Gemini's message content element

            // Find all elements matching the response selector
            const responseElements = document.querySelectorAll(responseElementSelector);

            let latestResponseText = '';

            if (responseElements.length > 0) {
                // Get the text content of the last matching element
                const lastResponseElement = responseElements[responseElements.length - 1];
                latestResponseText = lastResponseElement.textContent;
                console.log("gemini.js: Extracted latest response text:", latestResponseText);
                console.log("gemini.js: Latest response element:", lastResponseElement);
            } else {
                console.warn(`gemini.js: State is 'idle', but response element with selector "${responseElementSelector}" not found. This might be due to UI changes.`);
            }


            // --- Send the response to the background script ---
            // Check if dual prompting is active before sending response
            if (isDualPromptingActive) { // Access global variable directly
                console.log("gemini.js: Dual prompting is active. Sending Gemini response text to player iframe for audio.");

                // Send message to background script to pause recording BEFORE sending to iframe
                console.log('gemini.js: Sending message to background to pause recording...');
                // Store the current recording status before pausing (optional, background script decides based on user flag)
                chrome.runtime.sendMessage({ action: 'pauseRecording' })
                    .then(response => {
                        console.log("Response from background after sending pauseRecording:", response);
                        // Assuming the background script responds with whether recording was active
                        // if (response && typeof response.wasRecording !== 'undefined') {
                        //     wasRecordingBeforePause = response.wasRecording; // Need a flag like this if used
                        //     console.log('gemini.js: Recording was active before pause:', wasRecordingBeforePause);
                        // }
                    })
                    .catch(error => console.error("Error sending pauseRecording message:", error));


                // Send the response text to the player iframe for audio generation and playback
                const playerIframe = document.getElementById('audio-player-iframe');
                if (playerIframe && playerIframe.contentWindow) {
                    playerIframe.contentWindow.postMessage({
                        action: 'playAudioForText', // Action for the player iframe
                        text: latestResponseText, // Send the extracted text
                        sourceAI: 'gemini' // Indicate which AI generated the response
                    }, '*'); // Use '*' for now, but specify origin if possible for security
                    console.log("gemini.js: Sent 'playAudioForText' message to audio player iframe.");

                    // The player.js script should send an 'audioPlaybackReady' message
                    // when the audio is loaded and ready to play.
                    // The content script will listen for 'audioPlaybackReady' and send 'resumeRecording'
                    // to the background at that point.

                    // The background script will be notified when the audio finishes playing by the player.js script
                    // via an 'audioPlaybackFinished' message back to this content script,
                    // which then forwards it as 'geminiResponseAudioFinished' to the background.

                } else {
                    console.error("gemini.js: Audio player iframe not found or not accessible. Cannot initiate audio playback.");
                    // If iframe is not available, proceed without audio, notifying background script directly
                    console.log("gemini.js: Audio iframe not found. Notifying background script directly.");
                    try {
                        await chrome.runtime.sendMessage({
                            action: "geminiResponseAudioFinished", // Use a new action for when audio is skipped
                            responseText: latestResponseText // Still send the text response
                        });
                        console.log("gemini.js: Response (without audio) sent to background script");

                        // Send message to background script to resume recording since audio playback won't happen
                        console.log('gemini.js: Sending message to background to resume recording (iframe not found)...');
                        chrome.runtime.sendMessage({ action: 'resumeRecording' })
                            .then(response => console.log("Response from background after sending resumeRecording (iframe fallback):", response))
                            .catch(error => console.error("Error sending resumeRecording message (iframe fallback):", error));

                    } catch (error) {
                        console.error("gemini.js: Error sending response (without audio) to background script:", error);
                        // Attempt to resume recording even if sending the main message fails
                        console.log('gemini.js: Attempting to send resumeRecording message after error (iframe fallback error)...');
                        chrome.runtime.sendMessage({ action: 'resumeRecording' })
                            .then(response => console.log("Response from background after sending resumeRecording (iframe fallback error):", response))
                            .catch(error => console.error("Error sending resumeRecording message (iframe fallback error):", error));
                    }
                }
            } else {
                console.log("gemini.js: Dual prompting is NOT active. Skipping sending Gemini response.");
            }
            // --- End Send Check ---

            // Reset the processing flag after handling the response
            isProcessingGeminiPrompt = false; // Access global variable directly
            console.log("gemini.js: isProcessingGeminiPrompt set to false.");

        } else if (newState === 'responding') {
            console.log("gemini.js: Button state is 'responding'. AI is generating response.");
            // We don't need to do anything specific here in this flow,
            // but the log confirms we detect this state.
        } else if (newState === 'send') {
            console.log("gemini.js: Button state is 'send'. Input area is ready.");
            // In this flow, inputPromptAndSend is called from message handlers,
            // not triggered by this state change directly.
            // However, if promptToInput is set, this might indicate a race condition
            // or a manual trigger, so we keep the check for robustness.
            // (promptToInput is not used in the current Gemini flow, but keeping this check for general structure)
            // if (promptToInput !== null) {
            //     console.log("gemini.js: Button state is 'send' and promptToInput exists. Attempting to input prompt.");
            //     inputPromptAndSend(promptToInput);
            //     promptToInput = null; // Clear the prompt after attempting to input it
            // }
        } else if (newState === 'idle') {
            console.log("gemini.js: Button state is 'idle'.");
            // If the state is idle but wasn't previously 'responding',
            // it means the AI is idle after page load or before a prompt.
            // We don't need to extract a response in this case.
        }
    }
    console.log('gemini.js: handleGeminiButtonStateChange function declared.');
    // --- End Response Handling Logic ---

} // End of Multiple Execution Guard block

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
