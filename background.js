// background.js (Main Entry Point)

// Import other background scripts using importScripts().
// The order matters for dependencies. manager.js should likely come first
// as it sets up global state and core functions used by others.
importScripts('manager.js', 'windows.js', 'messages.js');


// This file now primarily handles initial setup and the browser action click.
// It relies on the imported scripts for core logic and state.

// Access global variables and functions that are now available
// after importing the other scripts.
// DO NOT redeclare variables that are already declared in imported scripts.
// Use them directly from the global scope (which can be referred to as 'self'
// within a service worker, although direct access without 'self.' is also possible
// for top-level global variables/functions). Using 'self.' can sometimes improve clarity.

// Example: Accessing constants and functions directly



// Listen for the browser action (clicking the extension icon)
chrome.action.onClicked.addListener((tab) => {
    console.log("Extension icon clicked.");
    // Call the function directly from the global scope (or using self.)
    // Use a try-catch block for the main action handler
    try {
        self.createOrFocusWindows(); // createOrFocusWindows is available globally after importScripts
    } catch (error) {
        console.error("Error in chrome.action.onClicked listener:", error);
    }
});


// Listen for the install event
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed or updated.');
    // Use a try-catch block for the install handler
    try {
        // Perform any initial setup here, like setting default storage values
        // Clear any old original prompt format on install/update
        // Access constants directly from the global scope (or using self.)
        chrome.storage.local.remove(self.LEFT_AI_ORIGINAL_PROMPT_STORAGE_KEY);
        console.log('Cleared left AI original prompt on install/update.');

        // Initialize dual prompting status to false on install/update and store it
        // Access global variable directly (or using self.)
        self.isDualPromptingActive = false; // Update global variable in manager.js
        // Access constants directly from the global scope (or using self.)
        chrome.storage.local.set({ [self.DUAL_PROMPTING_STATUS_KEY]: self.isDualPromptingActive });
        console.log(`Initialized dual prompting status to ${self.isDualPromptingActive} on install/update.`);

        // Clear all tracking state on install/update
        // Call the function directly from the global scope (or using self.)
        self.resetAllTracking(); // resetAllTracking is available globally after importScripts
        console.log('Cleared all tracking state on install/update.');
    } catch (error) {
        console.error("Error in chrome.runtime.onInstalled listener:", error);
    }
});

// On service worker startup, load the dual prompting status from storage
chrome.runtime.onStartup.addListener(async () => {
    console.log('Background service worker starting up.');
    // Use a try-catch block for the startup handler
    try {
        // Access constants directly from the global scope (or using self.)
        const storedStatus = await chrome.storage.local.get(self.DUAL_PROMPTING_STATUS_KEY);
        // Access global variable directly (or using self.)
        self.isDualPromptingActive = storedStatus[self.DUAL_PROMPTING_STATUS_KEY] || false; // Update global variable in manager.js
        console.log(`Loaded dual prompting status on startup: ${self.isDualPromptingActive}`);
        // The status will be sent to content scripts when they report ready or on URL updates.

        // Clear all tracking state on startup
        // Call the function directly from the global scope (or using self.)
        self.resetAllTracking(); // resetAllTracking is available globally after importScripts
        console.log('Cleared all tracking state on service worker startup.');
    } catch (error) {
        console.error("Error in chrome.runtime.onStartup listener:", error);
    }
});

// Note: The listeners for chrome.tabs.onRemoved, chrome.webNavigation.onBeforeNavigate,
// and chrome.tabs.onUpdated are moved to manager.js as they are closely related
// to script injection and state management.
// The chrome.runtime.onMessage and chrome.commands.onCommand listeners are moved to messages.js.



