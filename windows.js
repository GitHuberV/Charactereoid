// windows.js

// This file handles the creation and management of extension windows.

// Access global variables and functions from manager.js
// In Manifest V3 service workers listed in manifest.json, these are globally available
// after importScripts() in the main service worker file (background.js).
// Access them directly from the global scope (self).

// The following variables/constants are declared in manager.js and made global.
// We access them using the 'self.' prefix.

// Function to create or focus the extension windows
async function createOrFocusWindows() {
    console.log('windows.js: createOrFocusWindows started.'); // Debug log
    // Try to get stored window IDs
    const storedIds = await chrome.storage.local.get(self.WINDOW_IDS_STORAGE_KEY);
    // Use the correct keys from storage
    const { controlWindowId: storedControlWindowId, leftWindowId: storedLeftWindowId, rightWindowId: storedRightWindowId } = storedIds[self.WINDOW_IDS_STORAGE_KEY] || {};

    console.log('windows.js: Stored window IDs from storage:', { storedControlWindowId, storedLeftWindowId, storedRightWindowId }); // Debug log

    let windowsExistAndAreValid = false;

    // Check if stored IDs exist and the corresponding windows are open and not minimized
    if (storedControlWindowId && storedLeftWindowId && storedRightWindowId) {
        try {
            // Check if all windows still exist and get their details
            // Using .catch(() => null) to gracefully handle cases where a window might have been closed manually
            // populate: true is needed to get the tabs within the window
            const controlWindow = await chrome.windows.get(storedControlWindowId, { populate: true }).catch(() => null);
            const leftWindow = await chrome.windows.get(storedLeftWindowId, { populate: true }).catch(() => null);
            const rightWindow = await chrome.windows.get(storedRightWindowId, { populate: true }).catch(() => null);

            // If all exist and are not minimized, focus them
            if (controlWindow && leftWindow && rightWindow &&
                controlWindow.state !== 'minimized' &&
                leftWindow.state !== 'minimized' &&
                rightWindow.state !== 'minimized') {
                console.log('windows.js: Extension windows found and are valid. Focusing them.'); // Debug log

                // --- Focusing order: Left, then Right, then Control ---
                // Focus left window first
                await chrome.windows.update(leftWindow.id, { focused: true });
                console.log(`windows.js: Focused left window ID: ${leftWindow.id}`); // Debug log

                // Then focus right window
                await chrome.windows.update(rightWindow.id, { focused: true });
                console.log(`windows.js: Focused right window ID: ${rightWindow.id}`); // Debug log

                // Finally, focus control window
                await chrome.windows.update(controlWindow.id, { focused: true });
                console.log(`windows.js: Focused control window ID: ${controlWindow.id}`); // Debug log
                // --- End Focusing Order ---


                // --- Capture and store tab IDs when focusing existing windows ---
                // Find the active tab in each window (assuming one active tab per window)
                // Use optional chaining in case tabs array is empty or tab is missing id
                let currentLeftTabId = leftWindow.tabs?.find(tab => tab.active)?.id || null;
                let currentRightTabId = rightWindow.tabs?.find(tab => tab.active)?.id || null;

                // Update the global variables in manager.js
                self.currentLeftTabId = currentLeftTabId;
                self.currentRightTabId = currentRightTabId;

                console.log(`windows.js: Stored Left Tab ID: ${self.currentLeftTabId}, Right Tab ID: ${self.currentRightTabId} after focusing existing windows.`); // Debug log
                // --- End Capture ---

                // Update the global window IDs in manager.js
                self.controlPanelWindowId = controlWindow.id;
                self.leftWindowId = leftWindow.id;
                self.rightWindowId = rightWindow.id;
                 console.log(`windows.js: Updated global window IDs: Control=${self.controlPanelWindowId}, Left=${self.leftWindowId}, Right=${self.rightWindowId}`); // Debug log

                // When focusing existing windows, the tabs might have navigated or the service worker might have restarted.
                // We should rely on the chrome.tabs.onUpdated listener in manager.js to handle re-injection
                // when the tab's status becomes 'complete'.
                console.log("windows.js: Focusing existing windows. Relying on manager.js onUpdated for script injection."); // Debug log


                windowsExistAndAreValid = true;

            } else {
                console.log('windows.js: One or more stored windows not found, minimized, or tabs not populated. Will create new windows.'); // Debug log
                // Clear potentially stale IDs
                await chrome.storage.local.remove(self.WINDOW_IDS_STORAGE_KEY);
                console.log('windows.js: Cleared stored window IDs due to invalid windows.'); // Debug log
                // Also clear global window and tab IDs in manager.js
                self.controlPanelWindowId = null;
                self.leftWindowId = null;
                self.rightWindowId = null;
                self.currentLeftTabId = null;
                self.currentRightTabId = null;
                console.log('windows.js: Cleared global window and tab IDs.'); // Debug log
                // Clear content script ready states, pending messages, ping times, complete times, and injection attempts for potentially old tabs.
                // This is crucial to ensure a clean state for the new windows and tabs.
                console.log('windows.js: Clearing content script ready states, pending messages, ping times, complete times, and injection attempts for potentially old tabs.'); // Debug log
                for (const tabId in self.contentScriptReadyTabs) delete self.contentScriptReadyTabs[tabId];
                for (const tabId in self.pendingMessages) delete self.pendingMessages[tabId];
                for (const tabId in self.lastPingTime) delete self.lastPingTime[tabId]; // Clear ping times
                for (const tabId in self.lastCompleteTime) delete self.lastCompleteTime[tabId]; // Clear complete times
                 // Clear injection attempt flags for old tabs
                 for (const key in self.injectionAttemptedForUrl) delete self.injectionAttemptedForUrl[key];
                 console.log('windows.js: Cleared tracking states.'); // Debug log
            }
        } catch (error) {
            console.log('windows.js: Error checking for existing windows:', error); // Debug log
            console.log('windows.js: Will create new windows.'); // Debug log
            // Clear potentially stale IDs on error
            await chrome.storage.local.remove(self.WINDOW_IDS_STORAGE_KEY);
            console.log('windows.js: Cleared stored window IDs on error.'); // Debug log
            // Also clear global window and tab IDs in manager.js
            self.controlPanelWindowId = null;
            self.leftWindowId = null;
            self.rightWindowId = null;
            self.currentLeftTabId = null;
            self.currentRightTabId = null;
            console.log('windows.js: Cleared global window and tab IDs on error.'); // Debug log
            console.log('windows.js: Clearing content script ready states, pending messages, ping times, complete times, and injection attempts on error during window check.'); // Debug log
            // Clear content script ready states and pending messages for the tabs that might have been created before the error
            for (const tabId in self.contentScriptReadyTabs) delete self.contentScriptReadyTabs[tabId];
            for (const tabId in self.pendingMessages) delete self.pendingMessages[tabId];
            for (const tabId in self.lastPingTime) delete self.lastPingTime[tabId]; // Clear ping times
            for (const tabId in self.lastCompleteTime) delete self.lastCompleteTime[tabId]; // Clear complete times
             // Clear injection attempt flags on error
             for (const key in self.injectionAttemptedForUrl) delete self.injectionAttemptedForUrl[key];
             console.log('windows.js: Cleared tracking states on error during creation.'); // Debug log
        }
    }

    // If windows didn't exist or couldn't be focused, create new ones
    if (!windowsExistAndAreValid) {
        console.log('windows.js: Creating new extension windows.'); // Debug log

        try {
            // Get display information to position windows
            const displays = await chrome.system.display.getInfo();
            // Use the primary display's work area
            const workArea = displays.find(display => display.isPrimary)?.workArea || { left: 0, top: 0, width: screen.availWidth, height: screen.availHeight };

            const screenLeft = workArea.left;
            const screenTop = workArea.top;
            const screenWidth = workArea.width;
            const screenHeight = workArea.height;

            // Left and Right tabs take roughly half the screen width each
            const tabWindowWidth = Math.floor(screenWidth / 2);
            const tabWindowHeight = screenHeight; // Tabs take full height

            // Get the selected AI from storage to determine the left tab URL
            const optionsData = await chrome.storage.sync.get(self.OPTIONS_STORAGE_KEY);
            const selectedAIKey = optionsData[self.OPTIONS_STORAGE_KEY]?.aiSelection || 'gemini'; // Default to gemini
            const leftTabUrl = self.aiInfo[selectedAIKey]?.url || self.aiInfo['gemini'].url; // Use selected AI URL or fallback

            console.log(`windows.js: Creating left window with URL: ${leftTabUrl}`); // Debug log
            // Create Left Tab Window (opens the selected AI URL)
            const leftWindow = await chrome.windows.create({
                url: leftTabUrl, // Use the dynamically determined URL
                type: "popup",
                left: screenLeft, // Position at the left edge of the screen
                top: screenTop, // Position at the top edge of the screen
                width: tabWindowWidth,
                height: tabWindowHeight,
                focused: false // Don't focus immediately
            });

            // --- Capture and store window and tab ID when creating left window ---
            let leftWindowId = leftWindow.id; // Store window ID
            // Use optional chaining in case tabs array is empty or tab is missing id
            let currentLeftTabId = leftWindow.tabs?.[0]?.id || null; // Get the ID of the initial tab
            // Update the global variables in manager.js
            self.leftWindowId = leftWindowId;
            self.currentLeftTabId = currentLeftTabId;
            console.log('windows.js: Left window created with ID:', self.leftWindowId, 'Initial Tab ID:', self.currentLeftTabId); // Added logging

            // *** Removed immediate injection attempt after creation ***
            // Relying solely on manager.js onUpdated listener for injection when status is 'complete'.
            console.log(`windows.js: Removed immediate injection attempt for new left tab ${self.currentLeftTabId}. Relying on manager.js onUpdated.`);

            // --- End Capture ---


            console.log(`windows.js: Creating right window with URL: ${self.aiInfo.chatgpt.url}`); // Debug log
            // Create Right Tab Window (opens chatgpt.com)
            const rightWindow = await chrome.windows.create({
                url: self.aiInfo.chatgpt.url, // Fixed URL for the right tab
                type: "popup",
                left: screenLeft + tabWindowWidth, // Position next to the left window
                top: screenTop, // Position at the top edge of the screen
                width: tabWindowWidth,
                height: tabWindowHeight,
                focused: false // Don't focus immediately
            });

            // --- Capture and store window and tab ID when creating right window ---
            let rightWindowId = rightWindow.id; // Store window ID
            // Use optional chaining in case tabs array is empty or tab is missing id
            let currentRightTabId = rightWindow.tabs?.[0]?.id || null; // Get the ID of the initial tab
            // Update the global variables in manager.js
            self.rightWindowId = rightWindowId;
            self.currentRightTabId = currentRightTabId;
            console.log('windows.js: Right window created with ID:', self.rightWindowId, 'Initial Tab ID:', self.currentRightTabId); // Added logging

            // *** Removed immediate injection attempt after creation ***
            // Relying solely on manager.js onUpdated listener for injection when status is 'complete'.
            console.log(`windows.js: Removed immediate injection attempt for new right tab ${self.currentRightTabId}. Relying on manager.js onUpdated.`);

            // --- End Capture ---


            console.log(`windows.js: Creating control window with URL: ${chrome.runtime.getURL("index.html")}`); // Debug log
            // Create Control Window (full screen)
            const controlWindow = await chrome.windows.create({
                url: chrome.runtime.getURL("index.html"),
                type: "popup",
                left: screenLeft, // Position at the left edge
                top: screenTop, // Position at the top edge
                width: screenWidth, // Take full screen width
                height: screenHeight, // Take full screen height
                focused: true // Focus the control window on creation
            });

            // Store the new window IDs
            let controlPanelWindowId = controlWindow.id; // Store window ID
            // Update the global variable in manager.js
            self.controlPanelWindowId = controlPanelWindowId;
            console.log('windows.js: Control window created with ID:', self.controlPanelWindowId); // Added logging


            const newWindowIds = {
                controlWindowId: self.controlPanelWindowId,
                leftWindowId: self.leftWindowId,
                rightWindowId: self.rightWindowId
            };
            await chrome.storage.local.set({ [self.WINDOW_IDS_STORAGE_KEY]: newWindowIds });
            console.log('windows.js: New window IDs stored:', newWindowIds); // Debug log

            // Initialize content script ready states, pending messages, ping times, complete times, and injection attempts for new tabs
            // They are NOT ready yet, waiting for the content script to signal back via chrome.runtime.onMessage
            if (self.currentLeftTabId) {
                self.contentScriptReadyTabs[self.currentLeftTabId] = false;
                self.pendingMessages[self.currentLeftTabId] = [];
                self.lastPingTime[self.currentLeftTabId] = Date.now(); // Initialize last ping time
                self.lastCompleteTime[self.currentLeftTabId] = Date.now(); // Initialize last complete time
                 // injectionAttemptedForUrl will be set by injectContentScript when it runs
                 console.log(`windows.js: Initialized tracking for new left tab ${self.currentLeftTabId}`); // Debug log
            }
            if (self.currentRightTabId) {
                self.contentScriptReadyTabs[self.currentRightTabId] = false;
                self.pendingMessages[self.currentRightTabId] = [];
                self.lastPingTime[self.currentRightTabId] = Date.now(); // Initialize last ping time
                self.lastCompleteTime[self.currentRightTabId] = Date.now(); // Initialize last complete time
                 // injectionAttemptedForUrl will be set by injectContentScript when it runs
                 console.log(`windows.js: Initialized tracking for new right tab ${self.currentRightTabId}`); // Debug log
            }
            console.log("windows.js: Content script ready states, pending messages, ping times, and complete times initialized for new tabs."); // Debug log


            // Clear any old original prompt format on new window creation
            await chrome.storage.local.remove(self.LEFT_AI_ORIGINAL_PROMPT_STORAGE_KEY);
            console.log('windows.js: Cleared left AI original prompt on new window creation.'); // Debug log

            // Initialize dual prompting status to false and store it
            self.isDualPromptingActive = false; // Update global variable
            await chrome.storage.local.set({ [self.DUAL_PROMPTING_STATUS_KEY]: self.isDualPromptingActive });
            console.log(`windows.js: Initialized dual prompting status to ${self.isDualPromptingActive} on new window creation.`); // Debug log


        } catch (error) {
            console.error('windows.js: Error creating extension windows:', error); // Debug log
            // Clear stored IDs if creation failed
            await chrome.storage.local.remove(self.WINDOW_IDS_STORAGE_KEY);
            console.log('windows.js: Cleared stored window IDs on error during creation.'); // Debug log
            // Also clear global window and tab IDs in manager.js
            self.controlPanelWindowId = null;
            self.leftWindowId = null;
            self.rightWindowId = null;
            self.currentLeftTabId = null;
            self.currentRightTabId = null;
            console.log('windows.js: Cleared global window and tab IDs on error during creation.'); // Debug log
            console.log('windows.js: Clearing content script ready states, pending messages, ping times, complete times, and injection attempts on error during window creation.'); // Debug log
            // Clear content script ready states and pending messages for the tabs that might have been created before the error
            for (const tabId in self.contentScriptReadyTabs) delete self.contentScriptReadyTabs[tabId];
            for (const tabId in self.pendingMessages) delete self.pendingMessages[tabId];
            for (const tabId in self.lastPingTime) delete self.lastPingTime[tabId]; // Clear ping times
            for (const tabId in self.lastCompleteTime) delete self.lastCompleteTime[tabId]; // Clear complete times
             // Clear injection attempt flags on error
             for (const key in self.injectionAttemptedForUrl) delete self.injectionAttemptedForUrl[key];
             console.log('windows.js: Cleared tracking states on error during creation.'); // Debug log
        }
    }
     console.log('windows.js: createOrFocusWindows finished.'); // Debug log
}

// Listen for window removal to potentially clean up more state if needed
chrome.windows.onRemoved.addListener(async (windowId) => {
    console.log(`windows.js: Window with ID ${windowId} closed.`); // Debug log
    // Use a try-catch block for the window removal handler
    try {
        const storedIds = await chrome.storage.local.get(self.WINDOW_IDS_STORAGE_KEY);
        // Use the correct keys from storage
        const { controlWindowId: storedControlWindowId, leftWindowId: storedLeftWindowId, rightWindowId: storedRightWindowId } = storedIds[self.WINDOW_IDS_STORAGE_KEY] || {};

        console.log('windows.js: Stored window IDs on removal:', { storedControlWindowId, storedLeftWindowId, storedRightWindowId }); // Debug log

        // Check if the closed window is one of our managed windows
        if (windowId === storedControlWindowId || windowId === storedLeftWindowId || windowId === storedRightWindowId) {
            console.log('windows.js: One of the extension windows was closed.'); // Debug log

            // Check if recording is active
            const recordingStatus = await chrome.storage.local.get(self.RECORDING_STATUS_KEY);
            const isRecording = recordingStatus[self.RECORDING_STATUS_KEY] || false;
            console.log('windows.js: Current recording status:', isRecording); // Debug log

            if (isRecording) {
                console.log('windows.js: Recording is active. The browser\'s beforeunload will handle confirmation.'); // Debug log
                // If recording is active, the browser's beforeunload event in the content script
                // (presumably in index.js for the control panel) will prompt the user.
                // We don't need to do anything further here to prevent closure.
            } else {
                console.log('windows.js: Recording is not active. Closing all extension windows.'); // Debug log
                // If recording is not active, close the other two windows if they still exist
                const windowIdsToClose = [];
                if (storedControlWindowId && windowId !== storedControlWindowId) windowIdsToClose.push(storedControlWindowId);
                if (storedLeftWindowId && windowId !== storedLeftWindowId) windowIdsToClose.push(storedLeftWindowId);
                if (storedRightWindowId && windowId !== storedRightWindowId) windowIdsToClose.push(storedRightWindowId);

                console.log('windows.js: Window IDs to close:', windowIdsToClose); // Debug log

                for (const id of windowIdsToClose) {
                    try {
                        // Check if the window still exists before trying to remove it
                        await chrome.windows.get(id); // This will throw an error if the window doesn't exist
                        chrome.windows.remove(id);
                        console.log(`windows.js: Closed window with ID ${id}.`); // Debug log
                    } catch (error) {
                        console.log(`windows.js: Window with ID ${id} already closed or not found. Skipping removal.`); // Debug log
                    }
                }

                // Clear the stored window IDs after closing them
                await chrome.storage.local.remove(self.WINDOW_IDS_STORAGE_KEY);
                console.log('windows.js: Cleared stored window IDs.'); // Debug log
                // Also clear global window and tab IDs in manager.js
                self.controlPanelWindowId = null;
                self.leftWindowId = null;
                self.rightWindowId = null;
                self.currentLeftTabId = null;
                self.currentRightTabId = null;
                 console.log('windows.js: Cleared global window and tab IDs on removal.'); // Debug log
                // Clear content script ready states and pending messages for the closed windows' tabs
                console.log('windows.js: Clearing content script ready states, pending messages, ping times, complete times, and injection attempts for closed windows.'); // Debug log
                Object.keys(self.contentScriptReadyTabs).forEach(tabId => delete self.contentScriptReadyTabs[tabId]);
                Object.keys(self.pendingMessages).forEach(tabId => delete self.pendingMessages[tabId]);
                Object.keys(self.lastPingTime).forEach(tabId => delete self.lastPingTime[tabId]); // Clear ping times
                Object.keys(self.lastCompleteTime).forEach(tabId => delete self.lastCompleteTime[tabId]); // Clear complete times
                 // Clear injection attempt flags for closed windows
                 Object.keys(self.injectionAttemptedForUrl).forEach(key => delete self.injectionAttemptedForUrl[key]);
                 console.log('windows.js: Cleared tracking states on removal.'); // Debug log
            }
        }
    } catch (error) {
        console.error("Error in chrome.windows.onRemoved listener:", error);
        // Attempt to clear stored IDs and global state on error as a fallback
        chrome.storage.local.remove(self.WINDOW_IDS_STORAGE_KEY).catch(e => console.error("Error clearing storage on window remove error:", e));
        self.controlPanelWindowId = null;
        self.leftWindowId = null;
        self.rightWindowId = null;
        self.currentLeftTabId = null;
        self.currentRightTabId = null;
        for (const tabId in self.contentScriptReadyTabs) delete self.contentScriptReadyTabs[tabId];
        for (const tabId in self.pendingMessages) delete self.pendingMessages[tabId];
        for (const tabId in self.lastPingTime) delete self.lastPingTime[tabId];
        for (const tabId in self.lastCompleteTime) delete self.lastCompleteTime[tabId];
        for (const key in self.injectionAttemptedForUrl) delete self.injectionAttemptedForUrl[key];
        console.log('windows.js: Attempted to clear state on error during window removal.');
    }
});

// Expose the function that needs to be called from background.js
// In a service worker, we can attach properties directly to the global scope object (self).
self.createOrFocusWindows = createOrFocusWindows;
