// messages.js

// This file contains listeners for messages and commands.

// Access global variables and functions from manager.js
// In Manifest V3 service workers listed in manifest.json, these are globally available
// after importScripts() in the main service worker file (background.js).
// Access them directly from the global scope (self).

// Access global state from manager.js
// self.isDualPromptingActive; // Already available
// self.currentLeftTabId; // Already available
// self.currentRightTabId; // Already available
// self.controlPanelWindowId; // Already available
// self.sendMessageToTab; // Already available
// self.getTabIdForWindowId; // Assuming this helper function exists or is added in manager.js
// self.contentScriptReadyTabs; // Available globally from manager.js
// self.lastPingTime; // Available globally from manager.js
// self.pendingMessages; // Available globally from manager.js
// self.resetInjectionStatusForTab; // Available globally from manager.js
// self.DUAL_PROMPTING_STATUS_KEY; // Available globally from manager.js
// self.LEFT_AI_ORIGINAL_PROMPT_STORAGE_KEY; // Available globally from manager.js
// self.createOrFocusWindows; // Available globally from windows.js
// self.stopStreaming; // Assuming available globally from recording.js
// self.toggleRecordPause; // Assuming available globally from recording.js
// self.stopRecording; // Assuming available globally from recording.js


// Global variable in background script to track user recording status
let isUserRecording = false;

// Listener for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Use a try-catch block for the message listener
    try {
        const tabId = sender.tab?.id; // Use optional chaining in case sender.tab is undefined

        if (!tabId) {
            console.warn("Received message from unknown sender:", request);
            sendResponse({ status: "Error", message: "Unknown sender." });
            return false;
        }

        if (request.action !== "ping") {
            console.log(`Background script received message from tab ${tabId}:`, request);
        }

        // Handle content script ready signal
        if (request.action === "contentScriptReady") {
            // Mark the content script as ready for this tab
            self.contentScriptReadyTabs[tabId] = true;
            // Record the ping time immediately on ready, as readiness implies a successful ping
            self.lastPingTime[tabId] = Date.now(); // Update the last ping time for this tab
            console.log(`Content script in tab ${tabId} is ready. self.contentScriptReadyTabs[${tabId}] set to true. Last ping time updated.`);
            console.log(`Current managed tab IDs: Left=${self.currentLeftTabId}, Right=${self.currentRightTabId}`);

            // Send the current dual prompting status to the content script that just reported ready
            // This ensures the content script has the correct initial state.
            // Use a small delay to allow the content script to fully initialize its listeners
            setTimeout(() => {
                self.sendMessageToTab(tabId, { action: "updateDualPromptingStatus", isActive: self.isDualPromptingActive })
                    .then(response => console.log("Response from newly ready content script after updateDualPromptingStatus:", response))
                    .catch(error => console.error("Error sending updateDualPromptingStatus to newly ready content script:", error));
            }, 100); // Small delay


            // If there are pending messages for this tab, send them now
            if (self.pendingMessages[tabId] && self.pendingMessages[tabId].length > 0) { // Added check for empty array
                 console.log(`Sending ${self.pendingMessages[tabId].length} pending messages to tab ${tabId}.`);
                 const queue = self.pendingMessages[tabId];
                 delete self.pendingMessages[tabId]; // Clear the queue

                 for (const { message, sendResponse: queuedSendResponse } of queue) {
                     // Send queued messages using sendMessageToTab which handles content script readiness
                     self.sendMessageToTab(tabId, message, queuedSendResponse);
                 }
            } else {
                console.log(`No pending messages for tab ${tabId}.`);
            }
            sendResponse({ status: "Background ready" });
            return true; // Indicate that sendResponse will be called asynchronously
        }

        // Handle ping message to keep service worker alive and update last ping time
        if (request.action === "ping") {
            self.lastPingTime[tabId] = Date.now(); // Update the last ping time for this tab
            // console.log(`Received ping from tab ${tabId}. Last ping time updated.`); // Keep pings quiet unless debugging
            sendResponse({ status: "pong" });
            return true; // Indicate async response
        }

        // Handle request to update the left tab's URL
        // This is triggered when the user selects a different AI in the control panel.
        if (request.action === "updateLeftTabUrl") {
            console.log("Received 'updateLeftTabUrl' action.");
            const newUrl = request.url;
            if (self.currentLeftTabId) {
                console.log(`Updating left tab ${self.currentLeftTabId} URL to ${newUrl}.`);

                // *** IMPORTANT: Reset state for the left tab BEFORE updating the URL ***
                // This ensures that when the tab finishes loading the *new* URL,
                // the onUpdated listener will correctly trigger the injection
                // of the content script corresponding to the new URL.
                self.resetInjectionStatusForTab(self.currentLeftTabId);
                console.log(`Marked content script in tab ${self.currentLeftTabId} as not ready and cleared injection flags before URL update.`);

                chrome.tabs.update(self.currentLeftTabId, { url: newUrl })
                    .then(() => {
                        console.log(`Left tab (ID: ${self.currentLeftTabId}) URL update initiated to: ${newUrl}.`);
                        // The chrome.tabs.onUpdated listener in manager.js will handle the re-injection check
                        // when the URL changes and when the 'complete' status is reached.
                        sendResponse({ status: "Left tab URL update initiated" });
                    })
                    .catch(error => {
                        console.error(`Error updating left tab URL: ${error}`);
                        // If update fails, log the error and report back.
                        sendResponse({ status: "Error", message: "Failed to update left tab URL." });
                    });
            } else {
                console.warn("Left tab ID not found. Cannot update URL.");
                sendResponse({ status: "Warning", message: "Left tab ID not found." });
            }
            return true; // Indicate that sendResponse will be called asynchronously
        }

        // Handle request to send dual prompts (only sends the *initial* prompts)
        if (request.action === "sendInitialDualPrompts") {
            console.log("Received 'sendInitialDualPrompts' action.");
            const { left: leftPrompt, right: rightPrompt } = request.prompts;

            // Store the initial prompt for the left AI
            chrome.storage.local.set({ [self.LEFT_AI_ORIGINAL_PROMPT_STORAGE_KEY]: leftPrompt })
                .then(() => console.log("Stored left AI original prompt."))
                .catch(error => console.error("Error storing left AI original prompt:", error));

            // Send the initial prompt to the left tab (it will save it)
            if (self.currentLeftTabId) {
                self.sendMessageToTab(self.currentLeftTabId, { action: "saveLeftPrompt", prompt: leftPrompt })
                    .then(response => console.log("Response from left tab after saving prompt:", response))
                    .catch(error => console.error("Error sending saveLeftPrompt to left tab:", error));
            } else {
                console.warn("Left tab ID not found. Cannot send initial prompt to left tab.");
            }

            // Send the initial prompt to the right tab (it will process it)
            if (self.currentRightTabId) {
                self.sendMessageToTab(self.currentRightTabId, { action: "processRightPrompt", prompt: rightPrompt })
                    .then(response => console.log("Response from right tab after processing prompt:", response))
                    .catch(error => console.error("Error sending processRightPrompt to right tab:", error));
            } else {
                console.warn("Right tab ID not found. Cannot send initial prompt to right tab.");
            }

            sendResponse({ status: "Initial dual prompts sent" });
            return true; // Indicate that sendResponse will be called asynchronously
        }

        // Handle request from control panel to toggle dual prompting status
        if (request.action === "toggleDualPrompting") {
            console.log("Received 'toggleDualPrompting' action.");
            const newState = request.isActive;
            self.isDualPromptingActive = newState; // Update the global state in manager.js

            // Store the state in local storage for persistence
            chrome.storage.local.set({ [self.DUAL_PROMPTING_STATUS_KEY]: self.isDualPromptingActive })
                .then(() => console.log(`Dual prompting status updated and stored: ${self.isDualPromptingActive}`))
                .catch(error => console.error("Error storing dual prompting status:", error));

            // Send the updated status to both content scripts IF they are ready
            if (self.currentLeftTabId) {
                // Use sendMessageToTab which queues if not ready
                self.sendMessageToTab(self.currentLeftTabId, { action: "updateDualPromptingStatus", isActive: self.isDualPromptingActive })
                    .then(response => console.log("Response from left tab after updateDualPromptingStatus:", response))
                    .catch(error => console.error("Error sending updateDualPromptingStatus to left tab:", error));
            } else {
                 console.warn("Left tab ID not found. Cannot send updateDualPromptingStatus to left tab.");
            }

            if (self.currentRightTabId) {
                // Use sendMessageToTab which queues if not ready
                self.sendMessageToTab(self.currentRightTabId, { action: "updateDualPromptingStatus", isActive: self.isDualPromptingActive })
                    .then(response => console.log("Response from right tab after updateDualPromptingStatus:", response))
                    .catch(error => console.error("Error sending updateDualPromptingStatus to right tab:", error));
            } else {
                console.warn("Right tab ID not found. Cannot send updateDualPromptingStatus to right tab.");
            }


            sendResponse({ status: "Dual prompting status toggled" });
            return true; // Indicate async response
        }

        // Handle request from control panel to get the current dual prompting status
        if (request.action === "getDualPromptingStatus") {
             console.log("Received 'getDualPromptingStatus' action.");
             // Respond immediately with the current state from the global variable
             sendResponse({ isActive: self.isDualPromptingActive });
             return false; // Indicate synchronous response
        }

        // Handle request for user recording status from control panel
         if (request.action === "getUserRecordingStatus") {
              sendResponse({ isUserRecording: isUserRecording }); // Use the global isUserRecording flag
              return false; // Synchronous response
         }

        // Handle update to user recording status from recording.js
        if (request.action === "updateUserRecordingStatus") {
             isUserRecording = request.isUserRecording; // Update global flag
             console.log(`Background script: User recording status updated to ${isUserRecording}`);
             // No need to send a response back for this
             return false; // Synchronous handling
        }


        // --- Handlers for specific AI response finished actions from the left tab ---
        // These now check the isDualPromptingActive flag before forwarding

        // Handle response finished from Claude
        if (request.action === "claudeResponseFinished") {
            console.log("Background script received 'claudeResponseFinished' action.");
            const responseText = request.responseText;
            console.log("Received responseText from Claude:", responseText);
            // Forward the response to the right tab using the general action ONLY if dual prompting is active
            if (self.isDualPromptingActive && self.currentRightTabId) {
                console.log(`Dual prompting active. Sending Claude response to right tab ${self.currentRightTabId} via 'receiveOtherAIResponse'.`);
                self.sendMessageToTab(self.currentRightTabId, { action: "receiveOtherAIResponse", responseText: responseText })
                    .then(response => console.log("Response from right tab after receiving Claude response:", response))
                    .catch(error => console.error("Error sending Claude response to right tab:", error));
            } else if (!self.isDualPromptingActive) {
                console.log("Dual prompting is NOT active. Skipping forwarding Claude response.");
            } else {
                 console.warn("Right tab ID not found. Cannot send Claude response.");
            }
            sendResponse({ status: "Claude response received and forwarded (if active)" });
            return true; // Indicate async response
        }

        // Handle response finished from Gemini (after audio)
        if (request.action === "geminiResponseAudioFinished") { // Changed action name
            console.log("Background script received 'geminiResponseAudioFinished' action.");
            const responseText = request.responseText;
            console.log("Received responseText from Gemini:", responseText);
            // Forward the response to the right tab using the general action ONLY if dual prompting is active
            if (self.isDualPromptingActive && self.currentRightTabId) {
                console.log(`Dual prompting active. Sending Gemini response to right tab ${self.currentRightTabId} via 'receiveOtherAIResponse'.`);
                self.sendMessageToTab(self.currentRightTabId, { action: "receiveOtherAIResponse", responseText: responseText })
                    .then(response => console.log("Response from right tab after receiving Gemini response:", response))
                    .catch(error => console.error("Error sending Gemini response to right tab:", error));
            } else if (!self.isDualPromptingActive) {
                console.log("Dual prompting is NOT active. Skipping forwarding Gemini response.");
            } else {
                 console.warn("Right tab ID not found. Cannot send Gemini response.");
            }
            sendResponse({ status: "Gemini response received and forwarded (if active)" });
            return true; // Indicate async response
        }

        // Handle response finished from Grok
        if (request.action === "grokResponseFinished") {
            console.log("Background script received 'grokResponseFinished' action.");
            const responseText = request.responseText;
            console.log("Received responseText from Grok:", responseText);
            // Forward the response to the right tab using the general action ONLY if dual prompting is active
            if (self.isDualPromptingActive && self.currentRightTabId) {
                console.log(`Dual prompting active. Sending Grok response to right tab ${self.currentRightTabId} via 'receiveOtherAIResponse'.`);
                self.sendMessageToTab(self.currentRightTabId, { action: "receiveOtherAIResponse", responseText: responseText })
                    .then(response => console.log("Response from right tab after receiving Grok response:", response))
                    .catch(error => console.error("Error sending Grok response to right tab:", error));
            } else if (!self.isDualPromptingActive) {
                console.log("Dual prompting is NOT active. Skipping forwarding Grok response.");
            } else {
                 console.warn("Right tab ID not found. Cannot send Grok response.");
            }
            sendResponse({ status: "Grok response received and forwarded (if active)" });
            return true; // Indicate async response
        }

        // Handle response finished from DeepSeek
        if (request.action === "deepseekResponseFinished") {
            console.log("Background script received 'deepseekResponseFinished' action.");
            const responseText = request.responseText;
            console.log("Received responseText from DeepSeek:", responseText);
            // Forward the response to the right tab using the general action ONLY if dual prompting is active
            if (self.isDualPromptingActive && self.currentRightTabId) {
                console.log(`Dual prompting active. Sending DeepSeek response to right tab ${self.currentRightTabId} via 'receiveOtherAIResponse'.`);
                self.sendMessageToTab(self.currentRightTabId, { action: "receiveOtherAIResponse", responseText: responseText })
                    .then(response => console.log("Response from right tab after receiving DeepSeek response:", response))
                    .catch(error => console.error("Error sending DeepSeek response to right tab:", error));
            } else if (!self.isDualPromptingActive) {
                console.log("Dual prompting is NOT active. Skipping forwarding DeepSeek response.");
            } else {
                 console.warn("Right tab ID not found. Cannot send DeepSeek response.");
            }
            sendResponse({ status: "DeepSeek response received and forwarded (if active)" });
            return true; // Indicate async response
        }

        // --- End Handlers for specific AI response finished actions ---


        // Handle response finished from the right tab AI (ChatGPT) (after audio)
        if (request.action === "chatGPTResponseAudioFinished") { // Changed action name
            console.log("Background script received 'chatGPTResponseAudioFinished' action.");
            const responseText = request.responseText;
            console.log("Received responseText from ChatGPT:", responseText);

            // Send this response text to the left tab AI ONLY if dual prompting is active
            if (self.isDualPromptingActive && self.currentLeftTabId) {
                console.log(`Dual prompting active. Sending ChatGPT response to left tab ${self.currentLeftTabId}.`);
                // The left tab expects the action 'receiveChatGPTResponse'
                self.sendMessageToTab(self.currentLeftTabId, { action: "receiveChatGPTResponse", chatGPTResponse: responseText })
                    .then(response => console.log("Response from left tab after receiving ChatGPT response:", response))
                    .catch(error => console.error("Error sending ChatGPT response to left tab:", error));
            } else if (!self.isDualPromptingActive) {
                console.log("Dual prompting is NOT active. Skipping forwarding ChatGPT response.");
            } else {
                 console.warn("Left tab ID not found. Cannot send ChatGPT response.");
            }

            sendResponse({ status: "ChatGPT response received and forwarded (if active)" });
            return true; // Indicate async response
        }


        // Handle message from left tab content script indicating send button was clicked
        if (request.action === "leftTabSendButtonClicked") {
            console.log("Background script received 'leftTabSendButtonClicked' action.");
            // Send a message to the popup/control panel to trigger left avatar movement
            chrome.runtime.sendMessage({ action: "moveLeftAvatar" })
                .then(response => console.log("Response from popup after moving left avatar:", response))
                .catch(error => console.error("Error sending moveLeftAvatar to popup:", error));

            sendResponse({ status: "Left avatar movement triggered" });
            return true; // Indicate async response
        }

        // Handle message from right tab content script indicating send button was clicked
        if (request.action === "rightTabSendButtonClicked") {
            console.log("Background script received 'rightTabSendButtonClicked' action.");
            // Send a message to the popup/control panel to trigger right avatar movement
            chrome.runtime.sendMessage({ action: "moveRightAvatar" })
                .then(response => console.log("Response from popup after moving right avatar:", response))
                .catch(error => console.error("Error sending moveRightAvatar to popup:", error));

            sendResponse({ status: "Right avatar movement triggered" });
            return true; // Indicate async response
        }


        // --- Handle Pause/Resume Recording messages from Content Scripts ---
        // These messages are sent by content scripts during AI response audio playback
        if (request.action === "pauseRecording") {
             console.log("Background script received 'pauseRecording' from content script.");
             // Only forward to control panel if user recording is active
             if (isUserRecording && self.controlPanelWindowId) {
                  console.log("Background script: User recording is active. Forwarding pauseRecording to control panel.");
                  // Find the active tab in the control panel window
                  chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                      if (tabs.length > 0) {
                          const controlPanelTabId = tabs[0].id;
                          self.sendMessageToTab(controlPanelTabId, { action: "pauseRecording" })
                              .then(response => console.log("Response from control panel after forwarding pauseRecording:", response))
                              .catch(error => console.error("Error forwarding pauseRecording to control panel:", error));
                           // Send response back to content script indicating whether recording was active
                           sendResponse({ status: "Pause command forwarded", wasRecording: true }); // Assuming if user recording is active, it was recording
                      } else {
                          console.warn("No active tab found in control panel window. Cannot forward pauseRecording.");
                           sendResponse({ status: "Pause command not forwarded", message: "Control panel tab not found", wasRecording: isUserRecording });
                      }
                  });
                  return true; // Indicate async response
             } else {
                  console.log("Background script: User recording is NOT active or control panel not found. Skipping forwarding pauseRecording.");
                  // Send response back to content script indicating recording was not active
                  sendResponse({ status: "Pause command not forwarded", message: "User recording inactive", wasRecording: isUserRecording });
                  return false; // Synchronous handling
             }
        }

        if (request.action === "resumeRecording") {
             console.log("Background script received 'resumeRecording' from content script.");
             // Only forward to control panel if user recording is active
             if (isUserRecording && self.controlPanelWindowId) {
                  console.log("Background script: User recording is active. Forwarding resumeRecording to control panel.");
                   // Find the active tab in the control panel window
                  chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                      if (tabs.length > 0) {
                          const controlPanelTabId = tabs[0].id;
                          self.sendMessageToTab(controlPanelTabId, { action: "resumeRecording" })
                               .then(response => console.log("Response from control panel after forwarding resumeRecording:", response))
                               .catch(error => console.error("Error forwarding resumeRecording to control panel:", error));
                           sendResponse({ status: "Resume command forwarded" });
                      } else {
                          console.warn("No active tab found in control panel window. Cannot forward resumeRecording.");
                           sendResponse({ status: "Resume command not forwarded", message: "Control panel tab not found" });
                      }
                  });
                  return true; // Indicate async response
             } else {
                  console.log("Background script: User recording is NOT active or control panel not found. Skipping forwarding resumeRecording.");
                   sendResponse({ status: "Resume command not forwarded", message: "User recording inactive" });
                  return false; // Synchronous handling
             }
        }
        // --- End New Handlers ---


        // --- Handlers for Popup Actions (Forwarded to Control Panel) ---
        // These messages are typically sent from the popup script
        if (request.action === "selectTabs") {
            console.log("Background script received 'selectTabs' action from popup.");
            // Forward to the control panel tab
             if (self.controlPanelWindowId) {
                 chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                     if (tabs.length > 0) {
                         const controlPanelTabId = tabs[0].id;
                         self.sendMessageToTab(controlPanelTabId, { action: "selectTabs" })
                             .then(response => console.log("Response from control panel after forwarding selectTabs:", response))
                             .catch(error => console.error("Error forwarding selectTabs to control panel:", error));
                         sendResponse({ status: "Tab selection command forwarded" });
                     } else {
                         console.warn("No active tab found in control panel window. Cannot forward selectTabs.");
                         sendResponse({ status: "Tab selection command not forwarded", message: "Control panel tab not found" });
                     }
                 });
                 return true; // Indicate async response
            } else {
                console.warn("Control panel window ID not found. Cannot forward selectTabs.");
                sendResponse({ status: "Tab selection command not forwarded", message: "Control panel window not found" });
                return false; // Synchronous handling
            }
        }

        if (request.action === "stopStreaming") {
            console.log("Background script received 'stopStreaming' action from popup.");
             // Forward to the control panel tab
             if (self.controlPanelWindowId) {
                 chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                     if (tabs.length > 0) {
                         const controlPanelTabId = tabs[0].id;
                         self.sendMessageToTab(controlPanelTabId, { action: "stopStreaming" })
                             .then(response => console.log("Response from control panel after forwarding stopStreaming:", response))
                             .catch(error => console.error("Error forwarding stopStreaming to control panel:", error));
                         sendResponse({ status: "Stop streaming command forwarded" });
                     } else {
                         console.warn("No active tab found in control panel window. Cannot forward stopStreaming.");
                         sendResponse({ status: "Stop streaming command not forwarded", message: "Control panel tab not found" });
                     }
                 });
                 return true; // Indicate async response
            } else {
                console.warn("Control panel window ID not found. Cannot forward stopStreaming.");
                sendResponse({ status: "Stop streaming command not forwarded", message: "Control panel window not found" });
                return false; // Synchronous handling
            }
        }

        if (request.action === "toggleRecordPause") {
            console.log("Background script received 'toggleRecordPause' action from popup.");
             // Forward to the control panel tab
             if (self.controlPanelWindowId) {
                 chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                     if (tabs.length > 0) {
                         const controlPanelTabId = tabs[0].id;
                         self.sendMessageToTab(controlPanelTabId, { action: "toggleRecordPause" })
                             .then(response => console.log("Response from control panel after forwarding toggleRecordPause:", response))
                             .catch(error => console.error("Error forwarding toggleRecordPause to control panel:", error));
                         sendResponse({ status: "Toggle record/pause command forwarded" });
                     } else {
                         console.warn("No active tab found in control panel window. Cannot forward toggleRecordPause.");
                         sendResponse({ status: "Toggle record/pause command not forwarded", message: "Control panel tab not found" });
                     }
                 });
                 return true; // Indicate async response
            } else {
                console.warn("Control panel window ID not found. Cannot forward toggleRecordPause.");
                sendResponse({ status: "Toggle record/pause command not forwarded", message: "Control panel window not found" });
                return false; // Synchronous handling
            }
        }

        if (request.action === "stopRecording") {
            console.log("Background script received 'stopRecording' action from popup.");
             // Forward to the control panel tab
             if (self.controlPanelWindowId) {
                 chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                     if (tabs.length > 0) {
                         const controlPanelTabId = tabs[0].id;
                         self.sendMessageToTab(controlPanelTabId, { action: "stopRecording" })
                             .then(response => console.log("Response from control panel after forwarding stopRecording:", response))
                             .catch(error => console.error("Error forwarding stopRecording to control panel:", error));
                         sendResponse({ status: "Stop recording command forwarded" });
                     } else {
                         console.warn("No active tab found in control panel window. Cannot forward stopRecording.");
                         sendResponse({ status: "Stop recording command not forwarded", message: "Control panel tab not found" });
                     }
                 });
                 return true; // Indicate async response
            } else {
                console.warn("Control panel window ID not found. Cannot forward stopRecording.");
                sendResponse({ status: "Stop recording command not forwarded", message: "Control panel window not found" });
                return false; // Synchronous handling
            }
        }
        // --- End Handlers for Popup Actions ---


        // Handle avatar movement commands from control panel (forward to content scripts)
        if (request.action === "moveRightAvatar") {
             console.log("Background script received 'moveRightAvatar' from control panel.");
             if (self.currentRightTabId) {
                  self.sendMessageToTab(self.currentRightTabId, { action: "moveRightAvatar" })
                      .then(response => console.log(`Response from right tab (${self.currentRightTabId}) after moveRightAvatar:`, response))
                      .catch(error => console.error(`Error sending moveRightAvatar to right tab (${self.currentRightTabId}):`, error));
             } else {
                  console.warn("Right tab ID not found. Cannot send moveRightAvatar command.");
             }
             sendResponse({ status: "Move right avatar command processed" });
             return true; // Indicate async response
        }
         if (request.action === "moveLeftAvatar") {
             console.log("Background script received 'moveLeftAvatar' from control panel.");
             if (self.currentLeftTabId) {
                  self.sendMessageToTab(self.currentLeftTabId, { action: "moveLeftAvatar" })
                      .then(response => console.log(`Response from left tab (${self.currentLeftTabId}) after moveLeftAvatar:`, response))
                      .catch(error => console.error(`Error sending moveLeftAvatar to left tab (${self.currentLeftTabId}):`, error));
             } else {
                  console.warn("Left tab ID not found. Cannot send moveLeftAvatar command.");
             }
             sendResponse({ status: "Move left avatar command processed" });
             return true; // Indicate async response
        }


        // Handle stop recording command from control panel or command listener
         if (request.action === "stopRecordingFromCommand") {
             console.log("Background script received 'stopRecordingFromCommand'.");
             // Forward to the control panel content script
             if (self.controlPanelWindowId) {
                 chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                     if (tabs.length > 0) {
                         const controlPanelTabId = tabs[0].id;
                         self.sendMessageToTab(controlPanelTabId, { action: "stopRecordingFromCommand" })
                             .then(response => console.log("Response from control panel after forwarding stopRecordingFromCommand:", response))
                             .catch(error => console.error("Error forwarding stopRecordingFromCommand to control panel:", error));
                         sendResponse({ status: "Stop recording command forwarded" });
                     } else {
                         console.warn("No active tab found in control panel window. Cannot forward stopRecordingFromCommand.");
                         sendResponse({ status: "Stop recording command not forwarded", message: "Control panel tab not found" });
                     }
                 });
                 return true; // Indicate async response
             } else {
                 console.warn("Control panel window ID not found. Cannot forward stopRecordingFromCommand.");
                 sendResponse({ status: "Stop recording command not forwarded", message: "Control panel window not found" });
                 return false; // Synchronous handling
             }
         }


        // Add other message handlers here if needed

        // If the message was not handled, return false
        return false;
    } catch (error) {
        console.error("Error in chrome.runtime.onMessage listener:", error);
        // Attempt to send an error response if sendResponse is available and hasn't been called
        if (typeof sendResponse === 'function') {
             try {
                 sendResponse({ status: "Error", message: `Background script error: ${error.message}` });
             } catch (e) {
                 console.error("Error sending error response:", e);
             }
        }
        // Returning true indicates you will respond asynchronously, which is safer
        // even if an error occurred before calling sendResponse.
        return true;
    }
});

// --- Command Listener for Keyboard Shortcuts ---
chrome.commands.onCommand.addListener((command) => {
    // Use a try-catch block for the command listener
    try {
        console.log(`Command received: ${command}`);
        if (command === "stop_recording") {
            console.log("Stop recording command received.");
            // Send a message to the control panel content script to stop recording
            // We need the control panel window ID from the global scope (access directly using self.) to find its tab
            if (self.controlPanelWindowId) {
                chrome.tabs.query({ windowId: self.controlPanelWindowId, active: true }, (tabs) => {
                    if (tabs.length > 0) {
                        const controlPanelTabId = tabs[0].id;
                        // Use sendMessageToTab which handles content script readiness
                        self.sendMessageToTab(controlPanelTabId, { action: "stopRecordingFromCommand" })
                            .then(response => console.log("Response from control panel after stop recording command:", response))
                            .catch(error => console.error("Error sending stopRecordingFromCommand to control panel:", error));
                    } else {
                        console.warn("No active tab found in control panel window.");
                    }
                });
            } else {
                console.warn("Control panel window ID not found. Cannot send stop recording command.");
            }
        }
        // Add handlers for other commands here if needed
    } catch (error) {
        console.error("Error in chrome.commands.onCommand listener:", error);
    }
});
// --- End Command Listener ---
