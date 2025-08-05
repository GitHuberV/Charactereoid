// manager.js

// This file contains core state management and utility functions for the background service worker.

// --- Global State Variables ---

// Map to track which content scripts are ready { tabId: boolean }
// This map is populated by the 'contentScriptReady' message from the content scripts.
const contentScriptReadyTabs = {};

// Map to queue messages for content scripts that are not yet ready { tabId: [message, sendResponse] }
const pendingMessages = {};

// Map to track the last ping time from each tab { tabId: timestamp }
const lastPingTime = {};

// Map to track the last time a tab was marked as 'complete' in onUpdated
const lastCompleteTime = {};

// Map to track injection attempts per tab and URL
// This is CRUCIAL for preventing injecting the same script multiple times into the same page load.
// Key format: `${tabId}-${url}`
const injectionAttemptedForUrl = {};

// Global variables to store the current tab IDs for the left and right windows
// These should be updated whenever windows/tabs are created or focused.
let currentLeftTabId = null;
let currentRightTabId = null;

// Global variables to store the window IDs
let controlPanelWindowId = null;
let leftWindowId = null; // Store window IDs as well
let rightWindowId = null; // Store window IDs as well

// Global variable for the dual prompting status, persisted in storage
let isDualPromptingActive = false; // Default to false

// --- Constants ---

// Keys for storing window IDs and recording status in chrome.storage.local
const WINDOW_IDS_STORAGE_KEY = 'extensionWindowIds';
const RECORDING_STATUS_KEY = 'isRecording';
const OPTIONS_STORAGE_KEY = 'options'; // Key for options in chrome.storage.sync
const LEFT_AI_ORIGINAL_PROMPT_STORAGE_KEY = 'leftAiOriginalPrompt'; // Key to store the LEFT AI's initial prompt
const DUAL_PROMPTING_STATUS_KEY = 'isDualPromptingActive'; // Key to store the dual prompting status

// URLs and corresponding content scripts for AI platforms
const aiInfo = {
    gemini: { url: 'https://gemini.google.com/', script: 'gemini.js' },
    // ChatGPT is always the right tab
    chatgpt: { url: 'https://chatgpt.com/', script: 'chatgpt.js' },
    // Note: Grok is currently X AI, URL might change or require specific access
    grok: { url: 'https://grok.com/', script: 'grok.js' },
    claude: { url: 'https://claude.ai/', script: 'claude.js' },
    deepseek: { url: 'https://chat.deepseek.com/', script: 'deepseek.js' },
};

// Map origins to AI keys for easy lookup
const originToAiKey = Object.keys(aiInfo).reduce((map, key) => {
    try {
        const origin = new URL(aiInfo[key].url).origin;
        map[origin] = key;
    } catch (e) {
        console.error(`manager.js: Invalid URL for AI key ${key}: ${aiInfo[key].url}`, e); // Debug log
    }
    return map;
}, {});

// Constants for Ping/Check-in Logic
const PING_INTERVAL_SECONDS = 25; // Content script sends ping every 25 seconds
const BACKGROUND_CHECK_INTERVAL_SECONDS = 30; // Background script checks every 30 seconds
const PING_TIMEOUT_SECONDS = PING_INTERVAL_SECONDS + 10; // If no ping in 35 seconds, assume unresponsive
const INITIAL_READY_TIMEOUT_SECONDS = 10; // How long to wait for initial ready signal after 'complete'


// --- Core Utility Functions ---

// Function to send a message to a tab, waiting if content script is not ready
async function sendMessageToTab(tabId, message, sendResponse) {
    // console.log(`manager.js: Attempting to send message to tab ${tabId}. Action: ${message.action}`); // Debug log

    // Check if the content script in this tab is ready OR if it's a ping message (pings should always go through)
    // Also, allow 'contentScriptReady' messages to bypass the ready check, as this is how readiness is signaled.
    if (self.contentScriptReadyTabs[tabId] || message.action === "ping" || message.action === "contentScriptReady") {
        // console.log(`manager.js: Content script in tab ${tabId} is ready or message is ping/ready. Sending message directly.`); // Debug log
        try {
            const response = await chrome.tabs.sendMessage(tabId, message);
            // console.log(`manager.js: Response from tab ${tabId} for action "${message.action}":`, response); // Debug log
            if (sendResponse) {
                sendResponse(response);
            }
        } catch (error) {
            console.error(`manager.js: Error sending message to tab ${tabId} for action "${message.action}":`, error); // Debug log
            // If there's an error (e.g., tab closed, extension context invalidated), mark content script as not ready
            // This allows for potential re-injection if the tab is still valid later.
            delete self.contentScriptReadyTabs[tabId];
            delete self.lastPingTime[tabId]; // Clear last ping time
             // Clear injection attempt flag on send message error
             // If sending a message fails, it might indicate the content script is gone,
             // so clear the flag to allow re-injection on next check/update.
             Object.keys(self.injectionAttemptedForUrl).forEach(key => {
                 if (key.startsWith(`${tabId}-`)) {
                     delete self.injectionAttemptedForUrl[key];
                 }
             });
            console.log(`manager.js: Marked tab ${tabId} as not ready due to send message error.`); // Debug log
            if (sendResponse) {
                sendResponse({ status: "Error", message: "Failed to send message to tab." });
            }
        }
    } else {
        console.log(`manager.js: Content script in tab ${tabId} not ready. Queueing message.`); // Debug log
        // If not ready, queue the message
        if (!self.pendingMessages[tabId]) {
            self.pendingMessages[tabId] = [];
        }
        self.pendingMessages[tabId].push({ message, sendResponse });
    }
}

// Function to inject the correct content script based on tab URL
async function injectContentScript(tabId, url) {
    console.log(`manager.js: injectContentScript called for tab ${tabId} with URL ${url}`); // Debug log
    try {
        // Create a unique key for this tab+url combination
        const injectionKey = `${tabId}-${url}`;

        // *** CORE LOGIC TO PREVENT MULTIPLE INJECTIONS PER PAGE LOAD ***
        // Check if we've already tried injecting for this specific tab+url.
        // This flag is reset by onBeforeNavigate when the user navigates or refreshes.
        if (self.injectionAttemptedForUrl[injectionKey]) {
            console.log(`manager.js: Already attempted injection for tab ${tabId} with URL ${url}. Skipping.`); // Debug log
            return;
        }

        const origin = new URL(url).origin;
        const aiKey = self.originToAiKey[origin];
        let scriptToInject = null;

        if (aiKey) {
            scriptToInject = self.aiInfo[aiKey].script;
            console.log(`manager.js: Identified AI origin: ${origin}. Script to inject: ${scriptToInject}`); // Debug log
        } else {
            console.log(`manager.js: Origin ${origin} is not a supported AI site. No script to inject.`); // Debug log
            // If it's a managed tab but not an AI site, ensure it's not marked as ready
            if (tabId === self.currentLeftTabId || tabId === self.currentRightTabId) {
                delete self.contentScriptReadyTabs[tabId];
                delete self.lastPingTime[tabId];
                 // Clear injection attempt flag for non-AI managed tabs
                 Object.keys(self.injectionAttemptedForUrl).forEach(key => {
                     if (key.startsWith(`${tabId}-`)) {
                         delete self.injectionAttemptedForUrl[key];
                     }
                 });
                console.log(`manager.js: Tab ${tabId} is managed but not an AI site. Marked as not ready.`); // Debug log
            }
            return; // Do not inject if not a supported AI site
        }

        if (scriptToInject) {
            console.log(`manager.js: Attempting to inject ${scriptToInject} into tab ${tabId}.`); // Debug log

            // Before injecting, check if the tab still exists and is valid
            const tab = await chrome.tabs.get(tabId).catch(() => null);
            if (!tab) {
                 console.warn(`manager.js: injectContentScript: Tab ${tabId} no longer exists. Skipping injection.`); // Debug log
                 cleanupTabTracking(tabId); // Clean up ready state if tab is gone
                 return;
            }

            // Check if the tab's current URL still matches the expected URL before injecting
            // This prevents injecting the wrong script if the user navigated away quickly
            if (tab.url !== url) {
                 console.warn(`manager.js: injectContentScript: Tab ${tabId} URL changed during injection attempt. Expected ${url}, but found ${tab.url}. Skipping injection.`); // Debug log
                 // The onUpdated listener should handle the new URL when it completes
                 return;
            }

            // *** Mark this tab+url combination as having had an injection attempt *before* executing ***
            // This is crucial to prevent race conditions where onUpdated might fire multiple times
            // for the same page load or if executeScript takes time.
            self.injectionAttemptedForUrl[injectionKey] = true;
            console.log(`manager.js: Marked injection attempted for key: ${injectionKey}`); // Debug log


            console.log(`manager.js: Executing chrome.scripting.executeScript for tab ${tabId}, file: ${scriptToInject}`); // Debug log
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [scriptToInject]
            });
            // Note: chrome.scripting.executeScript resolves when the script *starts* executing, not when it's fully initialized or ready.
            console.log(`manager.js: Successfully initiated injection of ${scriptToInject} into tab ${tabId}. Waiting for content script to signal readiness.`); // Debug log
            // Do NOT set contentScriptReadyTabs[tabId] = true here.
            // The content script itself sends a message back when it's fully fully ready.
            // The contentScriptReady handler will set the ready state and send pending messages.

            // After successful injection, the content script will send 'contentScriptReady'.
            // The handler for 'contentScriptReady' will then set the ready state and send pending messages.

        }
    } catch (error) {
        console.error(`manager.js: Error injecting script into tab ${tabId}:`, error); // Debug log
        // If injection fails, ensure the ready state is false and clear ping time
        delete self.contentScriptReadyTabs[tabId];
        delete self.lastPingTime[tabId];
        // Clear injection attempt flag on injection error
        // If injection fails, clear the flag to allow a retry on the next periodic check or update.
        // Consider adding a counter or backoff strategy for more complex error handling if needed.
         Object.keys(self.injectionAttemptedForUrl).forEach(key => {
             if (key.startsWith(`${tabId}-`)) {
                 delete self.injectionAttemptedForUrl[key];
             }
         });
        console.log(`manager.js: Injection failed for tab ${tabId}. Marked as not ready.`); // Debug log
    }
}

// Helper function to clean up tracking for a tab
function cleanupTabTracking(tabId) {
    console.log(`manager.js: Cleaning up tracking for tab ${tabId}`); // Debug log
    delete self.contentScriptReadyTabs[tabId];
    delete self.pendingMessages[tabId];
    // scriptInjectionTracker is less critical now, but can be cleared if used elsewhere
    // delete self.scriptInjectionTracker[tabId];
    delete self.lastPingTime[tabId];
    delete self.lastCompleteTime[tabId];
    // Clear all injection tracking keys for this tab
    Object.keys(self.injectionAttemptedForUrl).forEach(key => {
        if (key.startsWith(`${tabId}-`)) {
            delete self.injectionAttemptedForUrl[key];
        }
    });

    // Also clear the stored tab IDs if the removed tab was one of our managed tabs
    if (self.currentLeftTabId === tabId) {
        console.log(`manager.js: Clearing currentLeftTabId (${self.currentLeftTabId}) because tab ${tabId} was removed.`); // Added logging
        self.currentLeftTabId = null;
    }
    if (self.currentRightTabId === tabId) {
        console.log(`manager.js: Clearing currentRightTabId (${self.currentRightTabId}) because tab ${tabId} was removed.`); // Added logging
        self.currentRightTabId = null;
    }
    console.log(`manager.js: Cleanup complete for tab ${tabId}. Current managed IDs: Left=${self.currentLeftTabId}, Right=${self.currentRightTabId}`); // Added logging
}

// Function to reset injection status for a tab when navigation starts
// This function is called by onBeforeNavigate
function resetInjectionStatusForTab(tabId) {
    console.log(`manager.js: Attempting to reset injection status for tab ${tabId} (onBeforeNavigate).`); // Debug log
    // Clearing injectionAttemptedForUrl for this tab is the main goal here
    Object.keys(self.injectionAttemptedForUrl).forEach(key => {
        if (key.startsWith(`${tabId}-`)) {
            delete self.injectionAttemptedForUrl[key];
        }
    });

    // Also reset content script ready state, ping time, and complete time for this tab
    delete self.contentScriptReadyTabs[tabId];
    delete self.lastPingTime[tabId];
    delete self.lastCompleteTime[tabId];

    console.log(`manager.js: Reset injection status, ready state, ping time, and complete time for tab ${tabId}.`); // Debug log
}


// Function to reset all tracking when extension is restarted or installed/updated
function resetAllTracking() {
    console.log('manager.js: resetAllTracking called.'); // Debug log
    // Clear all tracking maps
    // for (const tabId in self.scriptInjectionTracker) delete self.scriptInjectionTracker[tabId]; // If used
    for (const tabId in self.contentScriptReadyTabs) delete self.contentScriptReadyTabs[tabId];
    for (const tabId in self.pendingMessages) delete self.pendingMessages[tabId];
    for (const tabId in self.lastPingTime) delete self.lastPingTime[tabId];
    for (const tabId in self.lastCompleteTime) delete self.lastCompleteTime[tabId];
    for (const key in self.injectionAttemptedForUrl) delete self.injectionAttemptedForUrl[key];

    // Reset global tab and window IDs
    self.currentLeftTabId = null;
    self.currentRightTabId = null;
    self.controlPanelWindowId = null;
    self.leftWindowId = null;
    self.rightWindowId = null;

    console.log('manager.js: All tracking states and global IDs have been reset'); // Debug log
}


// Call this to get a debugging view of all tracked scripts
function debugScriptTracker() {
    console.log('=== manager.js: Script Injection Tracker Debug ==='); // Debug log
    // console.log('scriptInjectionTracker:', JSON.stringify(self.scriptInjectionTracker, null, 2)); // If used
    console.log('contentScriptReadyTabs:', JSON.stringify(self.contentScriptReadyTabs, null, 2));
    console.log('Pending Messages (counts):', JSON.stringify(Object.keys(self.pendingMessages).reduce((acc, key) => {
        acc[key] = self.pendingMessages[key].length;
        return acc;
    }, {}), null, 2));
    console.log('lastPingTime:', JSON.stringify(self.lastPingTime, null, 2));
    console.log('lastCompleteTime:', JSON.stringify(self.lastCompleteTime, null, 2));
    console.log('injectionAttemptedForUrl:', JSON.stringify(self.injectionAttemptedForUrl, null, 2));
    console.log('currentLeftTabId:', self.currentLeftTabId);
    console.log('currentRightTabId:', self.currentRightTabId);
    console.log('controlPanelWindowId:', self.controlPanelWindowId);
    console.log('leftWindowId:', self.leftWindowId);
    console.log('rightWindowId:', self.rightWindowId);
    console.log('isDualPromptingActive:', self.isDualPromptingActive);
    console.log('=== End Debug ==='); // Debug log
}

// Expose the debugging function to the console (useful during development)
// In a service worker, the global scope is the WorkerGlobalScope, not window.
// We can attach properties directly to the global scope object,
// which is implicitly available, or use `self` which refers to the global scope.
// Expose variables and functions needed by other imported scripts (background.js, messages.js, windows.js)
self.contentScriptReadyTabs = contentScriptReadyTabs;
self.pendingMessages = pendingMessages;
self.lastPingTime = lastPingTime;
self.lastCompleteTime = lastCompleteTime;
self.injectionAttemptedForUrl = injectionAttemptedForUrl;
self.currentLeftTabId = currentLeftTabId;
self.currentRightTabId = currentRightTabId;
self.controlPanelWindowId = controlPanelWindowId;
self.leftWindowId = leftWindowId;
self.rightWindowId = rightWindowId;
self.isDualPromptingActive = isDualPromptingActive;
self.aiInfo = aiInfo;
self.originToAiKey = originToAiKey;
self.WINDOW_IDS_STORAGE_KEY = WINDOW_IDS_STORAGE_KEY;
self.RECORDING_STATUS_KEY = RECORDING_STATUS_KEY;
self.OPTIONS_STORAGE_KEY = OPTIONS_STORAGE_KEY;
self.LEFT_AI_ORIGINAL_PROMPT_STORAGE_KEY = LEFT_AI_ORIGINAL_PROMPT_STORAGE_KEY;
self.DUAL_PROMPTING_STATUS_KEY = DUAL_PROMPTING_STATUS_KEY;
self.PING_INTERVAL_SECONDS = PING_INTERVAL_SECONDS;
self.BACKGROUND_CHECK_INTERVAL_SECONDS = BACKGROUND_CHECK_INTERVAL_SECONDS;
self.PING_TIMEOUT_SECONDS = PING_TIMEOUT_SECONDS;
self.INITIAL_READY_TIMEOUT_SECONDS = INITIAL_READY_TIMEOUT_SECONDS;

// Expose core utility functions
self.sendMessageToTab = sendMessageToTab;
self.injectContentScript = injectContentScript; // Although primarily called internally by onUpdated, expose if needed elsewhere
self.cleanupTabTracking = cleanupTabTracking;
self.resetInjectionStatusForTab = resetInjectionStatusForTab; // Expose for onBeforeNavigate
self.resetAllTracking = resetAllTracking;
self.debugScriptTracker = debugScriptTracker; // Expose debug function


// Listen for tab removal to clean up script tracker state
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`manager.js: Tab ${tabId} removed.`); // Debug log
    cleanupTabTracking(tabId);
});

// Handle tab refresh or navigation - we need to reset the injection status for that tab
// This ensures that when the tab finishes loading the new page (status 'complete'),
// the script injection will be attempted again for the new URL.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    const tabId = details.tabId;

    // Only care about main frame navigations for managed tabs
    // frameId 0 indicates the main frame
    if (details.frameId !== 0 || (tabId !== self.currentLeftTabId && tabId !== self.currentRightTabId)) {
        return;
    }

    try {
        // Use details.url for the URL the tab is navigating *to*
        const navigatingToUrl = details.url;
        console.log(`manager.js: Navigation detected for tab ${tabId} to ${navigatingToUrl} (onBeforeNavigate).`); // Debug log

        // Reset the injection status and other tracking for this specific tab.
        // This clears the injectionAttemptedForUrl flag for this tab, allowing
        // injectContentScript to run again when the page load completes.
        resetInjectionStatusForTab(tabId);

        console.log(`manager.js: onBeforeNavigate - Reset state for tab ${tabId}. Injection will be attempted on 'complete'.`);


    } catch (error) {
        console.error(`manager.js: Error in onBeforeNavigate for tab ${tabId}:`, error); // Debug log
        // If there's an error getting the URL, still attempt to clear state for the tabId
        cleanupTabTracking(tabId);
    }
});

// Listen for tab URL changes and completion to track when to inject scripts
// This listener is the primary trigger for injecting content scripts after a page loads or refreshes.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // console.log(`manager.js: tabs.onUpdated fired for tab ${tabId}. changeInfo:`, changeInfo, 'tab:', tab); // Keep quiet unless debugging
    console.log(`manager.js: onUpdated - Current managed IDs: Left=${self.currentLeftTabId}, Right=${self.currentRightTabId}`); // Added logging

    // We only care about updates for our managed tabs where the URL is available.
    const isManagedTab = tabId === self.currentLeftTabId || tabId === self.currentRightTabId;

    if (!isManagedTab || !tab.url) {
        // console.log(`manager.js: onUpdated - Tab ${tabId} is not managed or has no URL. Skipping.`); // Keep quiet
        return;
    }

    // Check if the tab's current URL is one of our supported AI sites
    // Note: We use tab.url here, which is the final URL after redirects.
    const origin = new URL(tab.url).origin;
    const aiKey = self.originToAiKey[origin];

    if (!aiKey) {
        // If it's a managed tab but navigated away from an AI site, clean up state
        console.log(`manager.js: onUpdated - Managed tab ${tabId} navigated to non-AI URL: ${tab.url}. Cleaning up tracking.`); // Debug log
        cleanupTabTracking(tabId); // Use cleanup function
        return; // Do not inject if not an AI site
    }

    // *** Trigger injection when the status becomes 'complete' ***
    // This is the most reliable point to inject content scripts after the DOM is ready.
    if (changeInfo.status === 'complete') {
         console.log(`manager.js: Tab Updated (Complete): Managed AI tab ${tabId} completed loading, URL: ${tab.url}. Attempting injection.`); // Debug log

        // Record the time of completion
        self.lastCompleteTime[tabId] = Date.now();
        console.log(`manager.js: Tab Updated (Complete): Tab ${tabId} completed loading. Recorded complete time.`); // Debug log

        // Attempt to inject the content script for this tab and its *current* URL.
        // The injectContentScript function contains the logic to check
        // if injection has already been attempted for this specific tab+URL combination.
        // Add a small delay to allow the page to settle after the 'complete' status.
        setTimeout(async () => {
            console.log(`manager.js: Delayed injection started for tab ${tabId} after 500ms.`);
            await injectContentScript(tabId, tab.url); // Pass the current tab.url
            console.log(`manager.js: Delayed injection attempt finished for tab ${tabId}.`);
        }, 500); // 500ms delay

        // After successful injection (handled by injectContentScript), the content script
        // will send 'contentScriptReady'. The handler for that message will set the
        // ready state and send any pending messages for this tab.

    } else {
        // Log updates for non-complete status changes on managed tabs if needed for debugging, but keep it quiet usually.
        // console.log(`manager.js: Tab Updated (Other Status): Managed AI tab ${tabId} updated, status: ${changeInfo.status}.`);
    }
});
// --- End Listener for tab URL updates ---


// Note: selectTabs, stopStreaming, toggleRecordPause, stopRecording are assumed to be defined elsewhere, likely in recording.js
// These functions will need to be accessible in the global scope of the service worker
// if called directly from messages.js or windows.js.
// For example, if they are in recording.js, recording.js should also be listed in manifest.json
// in the service_worker array.
