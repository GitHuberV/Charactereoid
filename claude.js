// claude.js (Content Script for Claude)
console.log('Claude content script loaded.'); // Keep this outside the guard to see how many times the file is initiated.

// --- Multiple Execution Guard ---
// Use a 'var' variable to act as an execution flag in the global scope of the content script.
// 'var' declarations are more resilient to multiple executions in the same scope
// compared to 'const' or 'let'.
var claudeContentScriptExecuted = claudeContentScriptExecuted || false;

// Check if the script has already been executed. If the flag is true, exit immediately.
if (claudeContentScriptExecuted) {
    console.warn('Claude content script already executed in this tab. Exiting core logic.');
} else {
    // Set the flag to true to indicate that the script is now running its core logic.
    claudeContentScriptExecuted = true;
    console.log('Claude content script execution flag set. Running core logic.');


    // --- Global Variables ---
    // Flag to indicate if dual prompting is currently active (controlled by the control panel toggle)
    var isDualPromptingActive = false; // Initialize within the guard

    // Variable to store the original prompt received from the background script
    var savedLeftAiPrompt = null; // Initialize within the guard

    // Variable to store the prompt that is currently being processed or needs to be inputted
    // This variable is less critical with the new flow, but keep it for potential future use or edge cases.
    var promptToInput = null; // Initialize within the guard

    // Variable to hold the MutationObserver for monitoring responses (might not be strictly needed if relying on button state)
    var responseObserver = null; // Initialize within the guard

    // Variable to store the accumulated response text during streaming (might not be strictly needed)
    var currentResponseText = ''; // Initialize within the guard

    // Flag to indicate if the left AI is currently processing a prompt
    var isProcessingLeftPrompt = false; // Initialize within the guard

    // Flag to track if the first prompt has been sent from this "left" tab in the dual prompting flow
    var isFirstLeftPromptSent = true; // Initialize as true


    // Use 'var' for pingInterval as well
    var pingInterval = null; // Initialize within the guard
    pingInterval = setInterval(sendPing, 25000); // 25 seconds
    console.log('claude.js: pingInterval variable declared and interval started.');


    // --- Claude Button State Observer Class ---
    // Monitors the state of the AI chat interface buttons (idle, send, responding)
    class claudeButtonStateObserver {
         constructor(onStateChangeCallback) {
            this.observing = false;
            this.observer = null;
            this.currentState = 'idle'; // Default state
            this.onStateChangeCallback = onStateChangeCallback; // Callback function to call on state change
         }

         start() {
            if (this.observing) {
                console.log('claude.js: Left Button Observer is already running');
                return;
            }

            console.log('claude.js: Left Button Observer: Starting observer.');
            // Create a mutation observer to watch for DOM changes
            this.observer = new MutationObserver(mutations => {
                // Use a try-catch block to prevent observer from stopping on errors
                try {
                    this.checkButtonState();
                } catch (error) {
                    console.error('claude.js: Error during claudeButtonStateObserver check:', error);
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
            console.log('claude.js: Left button state observer started');
         }

         stop() {
            if (!this.observing) {
                console.log('claude.js: Observer is not running');
                return;
            }

            this.observer.disconnect();
            this.observing = false;
            console.log('claude.js: Left button state observer stopped');
         }

         checkButtonState() {
             // --- IMPORTANT: These selectors are specific to Claude's current UI. ---
             // --- They are prone to breaking if Claude updates its front-end. ---
             // --- If the extension stops working, check these selectors first! ---

             // Use the specific selectors provided by the user for Claude
             const idleButton = document.querySelector('button[aria-label="Send message"][disabled]');
             const sendButton = document.querySelector('button[aria-label="Send message"]:not([disabled])');
             const stopButton = document.querySelector('button[aria-label="Stop response"]');


             let newState = this.currentState; // Assume state doesn't change unless a visible button is found

             // Determine the current state based on which button is visible and active
             // Prioritize 'responding' (stop button), then 'send', then 'idle'.
             // Check visibility using offsetParent (ensures it's in the rendered layout)
             const isStopButtonVisible = stopButton && stopButton.offsetParent !== null;
             const isSendButtonVisible = sendButton && sendButton.offsetParent !== null;
             const isIdleButtonVisible = idleButton && idleButton.offsetParent !== null;


             if (isStopButtonVisible) {
                 newState = 'responding';
             } else if (isSendButtonVisible) {
                 newState = 'send';
             } else if (isIdleButtonVisible) {
                 newState = 'idle';
             } else {
                 // If none of the expected buttons are visible, keep the current state
                 // or potentially transition to a 'unknown' state if needed.
                 // For now, we'll just keep the current state if no matching visible button is found.
                 // console.warn('claude.js: ButtonStateObserver: No expected button visible. State remains:', this.currentState); // Keep this quiet
                 return; // Don't update state or call callback if no relevant button found
             }


             // Only log and call callback if the state has changed
             if (newState !== this.currentState) {
                 console.log(`claude.js: Left button state changed: ${this.currentState} -> ${newState}`);
                 const oldState = this.currentState; // Capture old state before updating
                 this.currentState = newState;

                 // Call the callback, passing both the new and old state
                 if (this.onStateChangeCallback && typeof this.onStateChangeCallback === 'function') {
                      this.onStateChangeCallback(newState, oldState);
                 }
             }
         }
    }
    console.log('claude.js: Claude Button State Observer class declared.');
    // --- End Claude Button State Observer Class ---


    // Create an instance of the claudeButtonStateObserver, passing the handler function
    var leftButtonObserver = new claudeButtonStateObserver(handleLeftButtonStateChange);
    console.log('claude.js: claudeButtonStateObserver instance created.');


    // --- Response Handling Logic ---
    // Function to handle state changes reported by the claudeButtonStateObserver
    // This function now receives both the new and old state
    async function handleLeftButtonStateChange(newState, oldState) {
        console.log('claude.js: handleLeftButtonStateChange called with newState:', newState, 'oldState:', oldState);

        // We are interested when the state transitions from 'responding' to 'idle'
        if (oldState === 'responding' && newState === 'idle') {
            console.log("claude.js: State transitioned from 'responding' to 'idle'. Response is likely finished.");

            // Stop the observer immediately
            if (leftButtonObserver && leftButtonObserver.observing) {
                 leftButtonObserver.stop();
                 console.log("claude.js: Stopped claudeButtonStateObserver.");
            }


            // Add a small delay to allow the DOM to fully update after the response finishes
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms as requested

            console.log("claude.js: Attempting to extract response text after 100ms delay.");

            // --- Find the latest response element and extract text ---
            // --- IMPORTANT: These selectors are specific to Claude's current UI. ---
            // --- They are prone to breaking if Claude updates its front-end. ---
            // --- If the extension stops working, check these selectors first! ---
            // Use the class name provided by the user
            const responseElementSelector = '.font-claude-message'; // Selector for Claude's response text element

            // Find all elements matching the response selector
            const responseElements = document.querySelectorAll(responseElementSelector);

            let latestResponseText = '';

            if (responseElements.length > 0) {
                // Get the text content of the last matching element
                const lastResponseElement = responseElements[responseElements.length - 1];
                latestResponseText = lastResponseElement.textContent;
                console.log("claude.js: Extracted latest response text:", latestResponseText);
                console.log("claude.js: Latest response element:", lastResponseElement);
            } else {
                 console.warn(`claude.js: State is 'idle', but response element with selector "${responseElementSelector}" not found. This might be due to UI changes.`);
            }


            // --- Send the response to the background script ---
            // Check if dual prompting is active before sending response
            if (isDualPromptingActive) {
                console.log("claude.js: Dual prompting is active. Sending Claude response to background script.");
                try {
                    await chrome.runtime.sendMessage({
                        action: "claudeResponseFinished", // Specific action for Claude
                        responseText: latestResponseText // Send the extracted text
                    });
                    console.log("claude.js: Response sent to background script");
                } catch (error) {
                    console.error("claude.js: Error sending response to background script:", error);
                }
            } else {
                console.log("claude.js: Dual prompting is NOT active. Skipping sending Claude response.");
            }
            // --- End Send Check ---

            // Reset the processing flag after handling the response
            isProcessingLeftPrompt = false;
            console.log("claude.js: isProcessingLeftPrompt set to false.");

        } else if (newState === 'responding') {
             console.log("claude.js: Button state is 'responding'. AI is generating response.");
             // We don't need to do anything specific here in this flow,
             // but the log confirms we detect this state.
        } else if (newState === 'send') {
             console.log("claude.js: Button state is 'send'. Input area is ready.");
             // In this flow, inputPromptAndSend is called from message handlers,
             // not triggered by this state change directly.
             // However, if promptToInput is set, this might indicate a race condition
             // or a manual trigger, so we keep the check for robustness.
             if (promptToInput !== null) {
                 console.log("claude.js: Button state is 'send' and promptToInput exists. Attempting to input prompt.");
                 inputPromptAndSend(promptToInput);
                 promptToInput = null; // Clear the prompt after attempting to input it
             }
        } else if (newState === 'idle') {
            console.log("claude.js: Button state is 'idle'.");
             // If the state is idle but wasn't previously 'responding',
             // it means the AI is idle after page load or before a prompt.
             // We don't need to extract a response in this case.
        }
    }
    console.log('claude.js: handleLeftButtonStateChange function declared.');
    // --- End Response Handling Logic ---


    // --- DOM Interaction Functions ---

    // Helper function to wait for an element to appear in the DOM
    function waitForElement(selector, timeout = 15000) { // Increased default timeout slightly
        return new Promise((resolve, reject) => {
            console.log(`claude.js: waitForElement: Waiting for selector: ${selector}`); // Added log
            const element = document.querySelector(selector);
            if (element) {
                console.log(`claude.js: waitForElement: Found element immediately for selector: ${selector}`); // Added log
                return resolve(element);
            }

            const observer = new MutationObserver((mutations) => {
                const element = document.querySelector(selector);
                if (element) {
                    console.log(`claude.js: waitForElement: Found element via observer for selector: ${selector}`); // Added log
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
                    console.error(`claude.js: waitForElement: Timeout waiting for selector: ${selector}`); // Added log
                    reject(new Error(`claude.js: waitForElement: Timeout waiting for selector: ${selector}`));
                }, timeout);
                 // Clear timeout if element is found before timeout
                 // This requires storing the timeoutId and clearing it in the resolve block
                 // For simplicity here, we'll rely on the observer disconnect and the promise resolving.
                 // The timeout will still fire, but the promise will already be resolved.
            }
        });
    }
    console.log('claude.js: waitForElement function declared.');


    // Function to start observing for new messages/responses
    // This function might be less critical in the new flow if we rely solely on button state,
    // but keep it if response streaming needs to be handled later.
    function startResponseObserver() {
        // --- IMPORTANT: These selectors are specific to Claude's current UI. ---
        // --- They are prone to breaking if Claude updates its front-end. ---
        // --- If the extension stops working, check these selectors first! ---
        // Need to identify a stable container for Claude's chat messages if needed for observation
        // For now, relying on button state observer is sufficient.
        console.warn('claude.js: Response observer is currently not implemented for Claude.');
        // Example selector if needed: const chatContainerSelector = '...';
        // waitForElement(chatContainerSelector)...
    }
    console.log('claude.js: startResponseObserver function declared.');


    // Function to process a new message element (if needed for streaming)
    // This function is less critical if we rely on the 'idle' state of the button observer
    // to signal the end of a response.
    function processNewMessage(messageNode) {
         console.warn('claude.js: processNewMessage is currently not implemented for Claude.');
        // Example selector if needed: const responseTextElementSelector = '...';
        // const responseElement = messageNode.querySelector(responseTextElementSelector);
        // if (responseElement) { ... }
    }
    console.log('claude.js: processNewMessage function declared.');


    // Function to input the prompt text into the Claude UI and click send
    async function inputPromptAndSend(promptText) {
        console.log('claude.js: inputPromptAndSend called with prompt:', promptText);

        // --- Claude-Specific Selectors and Properties ---
        console.log("claude.js: Using Claude selectors.");
        const promptInputSelector = 'div[contenteditable="true"]'; // Selector for Claude's input area (contenteditable div)
        const sendButtonSelector = 'button[aria-label="Send message"]:not([disabled])'; // Selector for Claude's ENABLED send button
        const isContentEditable = true; // It's a contenteditable div
        const sendButtonTimeout = 15000; // Slightly longer timeout for Claude send button


        // --- Check if the prompt is empty ---
        if (!promptText || promptText.trim() === '') {
            console.warn("claude.js: Prompt text is empty or whitespace only. Skipping input and send.");
            isProcessingLeftPrompt = false; // Reset processing flag
            return; // Exit the function
        }
        // --- End Check ---


        try {
            console.log(`claude.js: inputPromptAndSend: Waiting for prompt input with selector: ${promptInputSelector}`); // Added log
            // Wait for the prompt input element to be available
            const promptInput = await waitForElement(promptInputSelector, 20000); // Increased timeout to 20 seconds

            console.log('claude.js: Found prompt input. Attempting to input text.'); // This log confirms element was found
            console.log('claude.js: Prompt input element:', promptInput); // Log the actual element

            // Use a try-catch block for DOM manipulation
            try {
                 console.log('claude.js: Clearing existing content in prompt input field.'); // Added log
                 // Clear existing content
                 if (isContentEditable) {
                     promptInput.innerHTML = ''; // Use innerHTML for contenteditable
                     // For contenteditable, setting innerHTML might not fully clear if there are complex nodes.
                     // Setting textContent is usually sufficient after clearing innerHTML.
                     promptInput.textContent = '';
                 } else {
                     promptInput.value = ''; // For textarea
                 }
                 console.log('claude.js: Existing content cleared.'); // Added log

                 console.log('claude.js: Setting new prompt text.'); // Added log
                 // Set the new combined prompt text
                 if (isContentEditable) {
                     promptInput.textContent = promptText; // For contenteditable div
                 } else {
                     promptInput.value = promptText; // For textarea
                 }
                 console.log('claude.js: New prompt text set.'); // Added log

                 console.log('claude.js: Dispatching input event.'); // Added log
                 // Dispatch an input event to notify any listeners (like a rich text editor)
                 const inputEvent = new Event('input', { bubbles: true });
                 promptInput.dispatchEvent(inputEvent);
                 console.log('claude.js: Input event dispatched.'); // Added log

                 // For textarea elements, also dispatch a 'change' event as some sites might listen for it
                 if (!isContentEditable) {
                     const changeEvent = new Event('change', { bubbles: true });
                     promptInput.dispatchEvent(changeEvent);
                     console.log("claude.js: Change event dispatched for textarea.");
                 }


                 console.log("claude.js: Prompt text inputted and input event dispatched."); // This log confirms these steps

                 // The CSS injected at the start handles hiding the promptInput if needed.

                 // --- Find and click the send button ---
                 // Add a small delay before attempting to click the send button
                 // This can help ensure the UI has registered the text input and enabled the button.
                 await new Promise(resolve => setTimeout(resolve, 750)); // Increased delay slightly for robustness

                 console.log(`claude.js: inputPromptAndSend: Waiting for send button with selector: "${sendButtonSelector}"`); // Added log
                 // Wait for the send button to be available and enabled (matching the :not([disabled]) selector)
                 const sendButton = await waitForElement(sendButtonSelector, sendButtonTimeout); // Use site-specific timeout

                 if (sendButton) {
                     console.log("claude.js: Send button element found:", sendButton); // Log the element
                     console.log(`claude.js: Found send button with selector "${sendButtonSelector}". Attempting to click.`); // This log confirms button was found

                     // Use a try-catch block for clicking
                     try {
                         // --- Send message to background script immediately after clicking send button (ONLY for the first prompt) ---
                         // This message is just to trigger the avatar movement in the control panel
                         if (isFirstLeftPromptSent) {
                             chrome.runtime.sendMessage({
                                 action: "leftTabSendButtonClicked", // Use the generic 'leftTabSendButtonClicked' for Claude when it's the left tab
                                 // No need for tabId here, background knows the sender tab
                             })
                             .then(() => console.log("claude.js: Sent 'leftTabSendButtonClicked' message to background (First prompt)."))
                             .catch(error => console.error("claude.js: Error sending 'leftTabSendButtonClicked' message (First prompt):", error));

                             isFirstLeftPromptSent = false; // Set the flag to false after sending the first time
                         } else {
                             console.log("claude.js: Skipping sending 'leftTabSendButtonClicked' message (Not the first prompt).");
                         }
                         // --- End Send message ---

                         // Simulate a click event on the button
                         sendButton.click();
                         console.log("claude.js: Send button clicked."); // This log confirms the click was attempted

                         // Set the processing flag to true (already set at the start of receiveChatGPTResponse)
                         // isProcessingLeftPrompt = true; // No need to set again here
                         console.log("claude.js: isProcessingLeftPrompt remains true.");

                         // --- Start the claudeButtonStateObserver ---
                         // Start the observer *after* clicking the send button to monitor response state.
                         if (leftButtonObserver && !leftButtonObserver.observing) { // Only start if not already observing
                              leftButtonObserver.start();
                              console.log("claude.js: Started claudeButtonStateObserver.");
                         } else if (leftButtonObserver) {
                              console.log("claude.js: claudeButtonStateObserver is already observing.");
                         } else {
                              console.warn("claude.js: claudeButtonStateObserver instance not found. Cannot start observer.");
                           }

                         // No need to send a response back here, the response handling logic will signal completion.

                     } catch (clickError) {
                         console.error(`claude.js: Error clicking send button with selector "${sendButtonSelector}" on left tab:`, clickError);
                         // If clicking fails, reset the processing flag
                         isProcessingLeftPrompt = false;
                         console.log("claude.js: isProcessingLeftPrompt set to false due to click error.");
                          // Optionally, send an error message back to the background
                         /*
                         chrome.runtime.sendMessage({
                             action: "claudeResponseFinished", // Use the finished action to signal an issue
                             responseText: `ERROR: Failed to click send button: ${clickError.message}`
                         }).catch(e => console.error("Error sending error message:", e));
                         */
                     }

                 } else {
                     console.warn(`claude.js: Send button with selector "${sendButtonSelector}" not found or not enabled on current AI site after delay. Cannot send prompt.`);
                     // Even if send button not found, we still inputted the text.
                     // Maybe the user needs to manually click? Log and indicate partial success.
                     // Start the observer anyway, it might detect something.
                     if (leftButtonObserver && !leftButtonObserver.observing) { // Only start if not already observing
                         leftButtonObserver.start();
                         console.log("claude.js: Started claudeButtonStateObserver even though send button not found/enabled.");
                     } else if (leftButtonObserver) {
                         console.log("claude.js: claudeButtonStateObserver is already observing.");
                     } else {
                         console.warn("claude.js: claudeButtonStateObserver instance not found. Cannot start observer.");
                     }


                     // If send button not found, reset the processing flag
                     isProcessingLeftPrompt = false;
                     console.log("claude.js: isProcessingLeftPrompt set to false due to send button not found.");

                      // Optionally, send an error message back to the background
                     /*
                     chrome.runtime.sendMessage({
                         action: "claudeResponseFinished", // Use the finished action to signal an issue
                         responseText: `ERROR: Send button not found.`
                     }).catch(e => console.error("Error sending error message:", e));
                     */
                 }

            } catch (inputError) {
                 console.error(`claude.js: Error inputting prompt text into element with selector "${promptInputSelector}" on left tab:`, inputError);
                 // If input fails, reset the processing flag
                 isProcessingLeftPrompt = false;
                 console.log("claude.js: isProcessingLeftPrompt set to false due to input error.");
                  // Optionally, send an error message back to the background
                 /*
                 chrome.runtime.sendMessage({
                     action: "claudeResponseFinished", // Use the finished action to signal an issue
                     responseText: `ERROR: Failed to input prompt text: ${inputError.message}`
                 }).catch(e => console.error("Error sending error message:", e));
                 */
            }


        } catch (waitForElementError) {
            console.error(`claude.js: Error waiting for prompt input element with selector "${promptInputSelector}" on left tab:`, waitForElementError);
            // If waiting for input fails, reset the processing flag
            isProcessingLeftPrompt = false;
            console.log("claude.js: isProcessingLeftPrompt set to false due to wait for element error.");
             // Optionally, send an error message back to the background
            /*
            chrome.runtime.sendMessage({
                action: "claudeResponseFinished", // Use the finished action to signal an issue
                responseText: `ERROR: Prompt input element not found: ${waitForElementError.message}`
            }).catch(e => console.error("Error sending error message:", e));
            */
        }
    }
    console.log('claude.js: inputPromptAndSend function declared.');

    // --- End DOM Interaction Functions ---


    // Listen for messages from the background script (Listener defined within the guarded block)
    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => { // Made listener async
        console.log("claude.js: Claude content script received message:", request);

        // Handle message to save the initial prompt (sent from background.js after user input)
        if (request.action === "saveLeftPrompt") {
            console.log("claude.js: Received 'saveLeftPrompt' action.");
            // Only save the prompt if dual prompting is active.
            // If not active, this prompt is likely from manual user input we don't need to intercept.
            if (isDualPromptingActive) {
                 savedLeftAiPrompt = request.prompt; // Save the prompt
                 console.log("claude.js: Saved original prompt for dual prompting:", savedLeftAiPrompt);
                 // DO NOT automatically process the prompt here. Wait for the ChatGPT response.
                 sendResponse({ status: "Prompt saved for dual prompting on left tab" });
            } else {
                 console.log("claude.js: Dual prompting is NOT active. Skipping saving initial prompt.");
                 sendResponse({ status: "Dual prompting inactive, skipping prompt save" });
            }
            return true; // Indicate async response
        }
        // Handle message to receive response from the right tab AI (ChatGPT)
        // This message is sent from the background script ONLY if dual prompting is active.
        if (request.action === "receiveChatGPTResponse") {
            // --- Check if dual prompting is active before processing ---
            // Although the background script *should* only send this if active,
            // an extra check here provides robustness.
            if (!isDualPromptingActive) {
                 console.log("claude.js: Dual prompting is NOT active. Skipping processing ChatGPT response.");
                 sendResponse({ status: "Dual prompting inactive, skipping response processing" });
                 return true; // Indicate async response
            }

            if (isProcessingLeftPrompt) {
                console.warn("claude.js: Still processing previous prompt, deferring new response");
                sendResponse({ status: "Busy processing previous prompt" });
                return true; // Indicate async response
            }

            console.log("claude.js: Received 'receiveChatGPTResponse' action.");
            isProcessingLeftPrompt = true; // Set processing flag
            const chatGPTResponse = request.chatGPTResponse;
            console.log("claude.js: Received ChatGPT response:", chatGPTResponse);

            // --- Combine the saved prompt and the ChatGPT response ---
            // Use the saved prompt as the base
            let combinedPrompt = savedLeftAiPrompt;

            if (chatGPTResponse && chatGPTResponse.trim() !== '') { // Check if ChatGPT response is not empty
                // Append the ChatGPT response to the saved prompt
                // Using a clear label to indicate the source of the appended text
                combinedPrompt = (combinedPrompt ? combinedPrompt + '\n\n' : '') + `--- Response from other AI ---\n${chatGPTResponse}`; // Ensure newline if initial prompt exists
                 console.log("claude.js: Combined prompt with ChatGPT response.");
            } else {
                console.warn("claude.js: Received null, empty, or whitespace-only ChatGPT response. Only sending the initial prompt.");
                 console.log("claude.js: Using only the initial prompt.");
                 // If response is null, empty, or whitespace, just use the initial prompt (which is already in combinedPrompt if it existed)
                 // If initial prompt was also empty, combinedPrompt will be empty, handled by the empty check in inputPromptAndSend
            }

            // Clear the saved prompt after combining, as it's now used for the combined prompt.
            savedLeftAiPrompt = null; // Use null instead of empty string for consistency
            console.log("claude.js: Cleared savedLeftAiPrompt after combining.");

            // --- Input the combined prompt and click send ---
            // Call the input and send function directly with the combined prompt
            // This function will handle waiting for the input and send button.
            await inputPromptAndSend(combinedPrompt); // Use await here

            // isProcessingLeftPrompt is reset within inputPromptAndSend if it fails
            // It remains true if inputPromptAndSend successfully clicks the button,
            // and is reset by handleLeftButtonStateChange when the response finishes.

            sendResponse({ status: "ChatGPT response received, combined prompt inputted and send button clicked" });
            return true; // Indicate async response
        } else if (request.action === "updateDualPromptingStatus") {
            // Receive the updated dual prompting status from the background script
            isDualPromptingActive = request.isActive;
            console.log(`claude.js: Received updateDualPromptingStatus: isDualPromptingActive set to ${isDualPromptingActive}`);
            sendResponse({ status: "Dual prompting status updated" });
            return true; // Indicate async response
        }


        // Handle other message actions if necessary

        // If the message was not handled, return false
        return false;
    });

    // Function to send a message to the background script indicating readiness (Defined within the guarded block)
    function notifyBackgroundScriptReady() {
        console.log("claude.js: Attempting to send 'contentScriptReady' message to background from Claude tab.");
        try {
            chrome.runtime.sendMessage({ action: "contentScriptReady" });
            console.log("claude.js: Sent 'contentScriptReady' message to background from Claude tab.");
        } catch (error) {
            console.error("claude.js: Error sending 'contentScriptReady' message from Claude tab:", error);
            // This error often means the background script is not available (e.g. extension updated or crashed)
        }
    }
    console.log('claude.js: notifyBackgroundScriptReady function declared.');

    // Function to send a ping message to the background script to keep it alive (Defined within the guarded block)
    function sendPing() {
        // console.log("claude.js: Attempting to send ping to background from Claude tab."); // Keep pings quiet unless debugging
        try {
            chrome.runtime.sendMessage({ action: "ping" });
            // console.log("claude.js: Sent ping to background from Claude tab."); // Keep pings quiet unless debugging
        } catch (error) {
            // This error often means the background script is not available (e.g. extension updated or crashed)
            // console.error("claude.js: Error sending ping from Claude tab:", error); // Keep quiet unless debugging
            // If ping fails, the background script's periodic check should detect the unresponsiveness
        }
    }
    console.log('claude.js: sendPing function declared.');


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
        console.log('claude.js: DOMContentLoaded/load listeners set up.');
    } catch (error) {
        console.error("claude.js: Error setting up DOMContentLoaded/load listeners:", error);
        // Attempt to send ready signal anyway, might work in some error states
        notifyBackgroundScriptReady();
    }


    // --- Inject Custom CSS (Injected within the guarded block) ---
    // This CSS will hide the prompt textarea and response elements initially.
    // Define the variable and perform injection within the guarded block.
    const customCss = `
        /* --- IMPORTANT: These selectors are specific to Claude's current UI. --- */
        /* --- They are prone to breaking if Claude updates its front-end. --- */
        /* --- If the extension stops working, check these selectors first! --- */
        /* Example: Hide the main input area or a container around it */
        /*
        div.relative.flex.h-full.w-full.flex-col {
             display: none !important;
        }
        */
        /* Example: Hide the prompt text area specifically */
        /*
        div[contenteditable="true"] {
             display: none !important;
        }
        */

        /* Hiding the actual response might interfere with scraping it.
           Consider if this rule is truly necessary or if just hiding the input is enough. */
        /* Example: Hiding response elements */
        /*
        div[data-testid^="message-"] div.ProseMirror {
             display: none !important;
        }
        */
    `;

    // Use a try-catch block for CSS injection
    try {
        const styleElement = document.createElement('style');
        styleElement.textContent = customCss;
        document.head.appendChild(styleElement);
        console.log('claude.js: Custom CSS injected into Claude tab.');
    } catch (error) {
        console.error("claude.js: Error injecting custom CSS into Claude tab:", error);
    }
    // --- End Inject Custom CSS ---


    // --- Inject Audio Iframe (if needed, based on your previous code - Defined/Injected within the guarded block) ---
    // This part seems unrelated to the core AI communication but was in the original content.js.
    // Keeping it here if it's still needed for the audio visualizer part.
    /*
    // Define the function within the guarded block.
    function injectAudioIframe() {
        // Check if the iframe already exists to prevent duplicates
        if (document.getElementById('audio-player-iframe')) {
            console.log('claude.js: Audio iframe already exists.');
            return;
        }
        const iframe = document.createElement('iframe');
        iframe.id = 'audio-player-iframe'; // Give the iframe an ID
        iframe.src = chrome.runtime.getURL('player.html');
        iframe.style.position = 'fixed';
        iframe.style.bottom = '10px';
        iframe.style.left = '10px';
        iframe.style.width = '300px';
        iframe.style.height = '80px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '10000';
        iframe.style.borderRadius = '10px';
        iframe.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
        iframe.style.display = 'none'; // Hide initially, can be shown when needed

        // Use a try-catch for appending the iframe
        try {
            document.body.appendChild(iframe);
            console.log('claude.js: 🎶 Audio iframe injected!');
        } catch (error) {
            console.error("claude.js: Error injecting audio iframe:", error);
        }
    }
    console.log('claude.js: injectAudioIframe function declared.');


    // Inject iframe when the DOM is ready (Setup within the guarded block)
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectAudioIframe);
        } else {
            injectAudioIframe();
        }
         // Also inject on window load as a fallback
        window.addEventListener('load', injectAudioIframe);
    } catch (error) {
        console.error("claude.js: Error setting up iframe injection listeners:", error);
        // Attempt to inject anyway as a fallback
        injectAudioIframe();
    }
    */
    // --- End Inject Audio Iframe ---

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