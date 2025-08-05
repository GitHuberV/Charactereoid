// record_manager.js

// Storage key for saved video metadata (in chrome.storage.local)
const SAVED_RECORDS_STORAGE_KEY = 'savedRecords';
// Removed IndexedDB settings as directory handle persistence is not possible

// Array to store metadata about recorded videos (loaded from storage + current session)
const recordedVideos = [];

// Removed variable for saved directory handle

// UI elements for the records modal and info modal
// These are declared in core.js but accessed here. Add checks before use.
// const recordsModal = document.getElementById('recordsModal'); // Now in core.js
// const closeRecordsModalBtn = document.getElementById('closeRecordsModal'); // Now in core.js
// const recordsListEl = document.getElementById('recordsList'); // Now in core.js
// const openRecordsModalBtn = document.getElementById('openRecordsModalBtn'); // Now in core.js
// const storageStatusEl = document.getElementById('storageStatus'); // Now in core.js

// const recordInfoModal = document.getElementById('recordInfoModal'); // Now in core.js
// const closeRecordInfoModalBtn = document.getElementById('closeRecordInfoModal'); // Now in core.js
// const recordInfoTitleEl = document.getElementById('recordInfoTitle'); // Now in core.js
// const recordInfoDateEl = document.getElementById('recordInfoDate'); // Now in core.js
// const recordInfoDescriptionEl = document.getElementById('recordInfoDescription'); // Now in core.js
// const recordInfoShortDescriptionEl = document.getElementById('recordInfoShortDescription'); // Now in core.js
// const recordInfoSeoTagsEl = document.getElementById('recordInfoSeoTags'); // Now in core.js
// const recordInfoScenarioEl = document.getElementById('recordInfoScenario'); // Now in core.js
// const recordInfoInstructionsEl = document.getElementById('recordInfoInstructions'); // Now in core.js
// const saveRecordInfoBtn = document.getElementById('saveRecordInfoBtn'); // Now in core.js
// const deleteRecordInfoBtn = document.getElementById('deleteRecordInfoBtn'); // Now in core.js
// const recordInfoThumbnailEl = document.getElementById('recordInfoThumbnail'); // Now in core.js


// --- Thumbnail Generation ---
// Function to generate a thumbnail from a video blob
// Called by addNewRecord
function generateThumbnail(videoBlob, recordId) {
    return new Promise((resolve) => {
        // Ensure recordInfoThumbnailEl is available (declared in core.js)
        if (typeof recordInfoThumbnailEl === 'undefined' || recordInfoThumbnailEl === null) {
             console.warn('recordInfoThumbnailEl not found for thumbnail generation.');
             resolve(null); // Resolve with null if element is missing
             return;
        }

        const video = document.createElement('video');
        video.preload = 'metadata'; // Only load metadata, not the whole video
        video.muted = true; // Mute video
        video.playsInline = true; // Required for some mobile browsers
        video.style.display = 'none'; // Hide the video element
        document.body.appendChild(video); // Append to body to allow loading

        const videoUrl = URL.createObjectURL(videoBlob);
        video.src = videoUrl;

        video.onloadedmetadata = function() {
            console.log('Video metadata loaded for thumbnail generation.');
            // Check if video duration is a finite number before attempting to seek
            if (isFinite(video.duration) && video.duration > 0) {
                // Attempt to seek to the middle of the video
                video.currentTime = video.duration / 2;
                console.log('Attempting to seek to:', video.currentTime);
            } else {
                console.warn('Video has zero or non-finite duration, cannot generate thumbnail.');
                // Clean up and resolve with null if duration is invalid
                 video.remove();
                 URL.revokeObjectURL(videoUrl);
                 resolve(null);
            }
        };

        video.onseeked = function() {
            console.log('Video seeked for thumbnail generation.');
            // Ensure video has valid dimensions before drawing
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                 const canvas = document.createElement('canvas');
                 const maxThumbnailSize = 150; // Max width/height for thumbnail
                 let width = video.videoWidth;
                 let height = video.videoHeight;

                 // Scale down thumbnail while maintaining aspect ratio
                 if (width > height) {
                     if (width > maxThumbnailSize) {
                         height *= maxThumbnailSize / width;
                         width = maxThumbnailSize;
                     }
                 } else {
                     if (height > maxThumbnailSize) {
                         width *= maxThumbnailSize / height;
                         height = maxThumbnailSize;
                     }
                 }

                 canvas.width = width;
                 canvas.height = height;
                 const ctx = canvas.getContext('2d');
                 ctx.drawImage(video, 0, 0, width, height);

                 // Convert canvas to data URL
                 const thumbnailUrl = canvas.toDataURL('image/jpeg'); // Use JPEG for smaller size

                 // Clean up
                 video.remove();
                 URL.revokeObjectURL(videoUrl);

                 // Resolve with the thumbnail data URL
                 console.log('Thumbnail generated successfully.');
                 resolve(thumbnailUrl);
            } else {
                 console.warn('Video has zero dimensions after seeking, cannot generate thumbnail.');
                 // Clean up and resolve with null if dimensions are invalid
                 video.remove();
                 URL.revokeObjectURL(videoUrl);
                 resolve(null);
            }
        };

        video.onerror = function(e) {
            console.error('Error loading video for thumbnail generation:', e);
             // Clean up and resolve with null on error
            video.remove();
            URL.revokeObjectURL(videoUrl);
            resolve(null);
        };

        // If onloadedmetadata or onseeked doesn't fire, add a timeout as a fallback
        const timeout = setTimeout(() => {
             console.warn('Thumbnail generation timed out.');
             video.remove();
             URL.revokeObjectURL(videoUrl);
             resolve(null);
        }, 5000); // 5 second timeout

    });
}


// --- Record Management Functions ---

// Load record metadata from chrome.storage.local
// Called by core.js on DOMContentLoaded
async function loadRecordMetadata() {
    // Ensure storageStatusEl is available (declared in core.js)
    if (typeof storageStatusEl === 'undefined' || storageStatusEl === null) {
        console.warn('storageStatusEl not found in loadRecordMetadata.');
        // Continue loading data even if UI element is missing
    } else {
        storageStatusEl.textContent = 'Loading records...';
    }


    try {
        const result = await chrome.storage.local.get(SAVED_RECORDS_STORAGE_KEY);
        const loadedRecords = result[SAVED_RECORDS_STORAGE_KEY] || [];
        // Clear the current array and populate with loaded data
        recordedVideos.length = 0; // Clear existing array
        loadedRecords.forEach(record => recordedVideos.push(record));
        console.log('Loaded record metadata from storage:', loadedRecords);

        // Display the loaded records in the modal list
        displayRecordedVideos(); // displayRecordedVideos is defined in this file

        if (storageStatusEl) { // Check again if element exists
            storageStatusEl.textContent = `Loaded ${recordedVideos.length} records.`;
        }

    } catch (error) {
        console.error('Error loading record metadata from storage:', error);
         if (storageStatusEl) { // Check again if element exists
            storageStatusEl.textContent = 'Error loading records.';
        }
    }
}

// Save current record metadata to chrome.storage.local
// Called by addNewRecord, saveRecordInfo, deleteRecordInfo
async function saveRecordMetadata() {
    try {
        await chrome.storage.local.set({ [SAVED_RECORDS_STORAGE_KEY]: recordedVideos });
        console.log('Record metadata saved to storage.');
         // Ensure storageStatusEl is available (declared in core.js)
        if (typeof storageStatusEl !== 'undefined' && storageStatusEl !== null) { // Added null check
             storageStatusEl.textContent = `Saved ${recordedVideos.length} records.`;
        } else {
             console.warn('storageStatusEl not found when saving record metadata.');
        }
    } catch (error) {
        console.error('Error saving record metadata to storage:', error);
         // Ensure storageStatusEl is available (declared in core.js)
        if (typeof statusEl !== 'undefined' && statusEl !== null) { // Added null check
             statusEl.textContent = 'Error saving records.';
        } else {
             console.warn('statusEl not found when saving record metadata error.');
        }
    }
}


// Add a new record (called by recording.js)
// recordData should include id, name, size, url, timestamp, title, description, etc.
// videoBlob is the actual video data blob
async function addNewRecord(recordData, videoBlob) {
    console.log('Adding new record:', recordData);

    // Generate thumbnail asynchronously
    const thumbnailUrl = await generateThumbnail(videoBlob, recordData.id);
    if (thumbnailUrl) {
        recordData.thumbnail = thumbnailUrl;
        console.log('Thumbnail added to recordData.');
    } else {
        console.warn('Could not generate thumbnail for new record.');
        // Optionally add a placeholder thumbnail URL if available
        recordData.thumbnail = 'assets/icons/video-placeholder.png'; // Ensure this path is correct
    }

    // Add the new record to the in-memory array
    recordedVideos.push(recordData);
    console.log('Added new record to recordedVideos array (session only):', recordData);

    // Save the updated metadata to storage
    await saveRecordMetadata(); // saveRecordMetadata is defined in this file

    // Update the displayed list in the modal if it's open
    displayRecordedVideos(); // displayRecordedVideos is defined in this file
    console.log('Displayed recorded videos list after adding new record.');

    // Added check for statusEl existence
    if (typeof statusEl !== 'undefined' && statusEl !== null) statusEl.textContent = `Recording saved to session: "${recordData.title || recordData.name}".`;
}


// Display recorded videos in the list (in the modal)
// Called by loadRecordMetadata and addNewRecord
function displayRecordedVideos() {
    // Ensure recordsListEl is available (declared in core.js)
    if (typeof recordsListEl === 'undefined' || recordsListEl === null) { // Added null check
        console.warn('recordsListEl not found when displaying recorded videos.');
        return;
    }

    recordsListEl.innerHTML = ''; // Clear current list
    console.log('Displaying recorded videos. Total videos:', recordedVideos.length);

    // Sort videos by timestamp (most recent first)
    recordedVideos.sort((a, b) => b.timestamp - a.timestamp);

    if (recordedVideos.length === 0) {
         const noRecordsMessage = document.createElement('li');
         noRecordsMessage.textContent = 'No recordings yet.';
         noRecordsMessage.style.textAlign = 'center';
         noRecordsMessage.style.fontStyle = 'italic';
         recordsListEl.appendChild(noRecordsMessage);
         return;
    }


    recordedVideos.forEach((record, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'record-item';
        // formatSize is assumed to be globally available from recording.js
        const fileSize = typeof formatSize === 'function' ? formatSize(record.size) : `${record.size} bytes`; // Fallback if formatSize is missing

        // Format date
        const date = new Date(record.timestamp).toLocaleString();

        // Determine the filename for download: use title if available, otherwise use the generated name
        const downloadFilename = record.title ? `${record.title}.${record.name.split('.').pop()}` : record.name; // Append original extension if using title

        listItem.innerHTML = `
            <div class="record-thumbnail-container">
                <img src="${record.thumbnail || 'assets/icons/video-placeholder.png'}" alt="Thumbnail" class="record-thumbnail">
            </div>
            <div class="record-info-preview">
                <strong class="record-title-preview">${record.title || record.name}</strong>
                <span class="record-date-preview">${date}</span>
                <span class="record-size-preview">${fileSize}</span>
            </div>
            <div class="record-actions-preview">
                <button class="view-info-btn" data-record-id="${record.id}" title="View/Edit Info">
                    <i class="fas fa-info-circle"></i> Info
                </button>
                 <a href="${record.url}" download="${downloadFilename}" class="download-record-link" title="Download Record">
                    <i class="fas fa-download"></i> Download
                </a>
                 </div>
        `;
        recordsListEl.appendChild(listItem);
        console.log('Added record to modal list:', record.title || record.name);
    });

    // Add event listeners to the new buttons
    recordsListEl.querySelectorAll('.view-info-btn').forEach(button => {
        button.addEventListener('click', handleViewInfo); // handleViewInfo is defined in this file
    });

     // Add listener for the direct download links
     recordsListEl.querySelectorAll('.download-record-link').forEach(link => {
        link.addEventListener('click', handleDirectDownloadClick); // Add a new handler for direct links
     });
}


// Open the records modal
// Called by event_listeners.js or handleDeleteRecordInfo
function openRecordsModal() {
    // Ensure recordsModal is available (declared in core.js)
    if (typeof recordsModal !== 'undefined' || recordsModal === null) { // Added null check
        recordsModal.style.display = 'flex';
        console.log('Records modal opened.');
        displayRecordedVideos(); // Refresh the list when opening
    } else {
        console.warn('recordsModal not found. Cannot open records modal.');
    }
}

// Close the records modal
// Called by event_listeners.js or closeAllModals
function closeRecordsModal() {
     // Ensure recordsModal is available (declared in core.js)
    if (typeof recordsModal !== 'undefined' || recordsModal === null) { // Added null check
        recordsModal.style.display = 'none';
        console.log('Records modal closed.');
    } else {
        console.warn('recordsModal not found. Cannot close records modal.');
    }
}

// Close the record info modal
// Called by event_listeners.js, handleDeleteRecordInfo, handleSaveRecordInfo, closeAllModals
function closeRecordInfoModal() {
    // Ensure recordInfoModal is available (declared in core.js)
    if (typeof recordInfoModal !== 'undefined' || recordInfoModal === null) { // Added null check
        recordInfoModal.style.display = 'none';
        console.log('Record info modal closed.');
    } else {
        console.warn('recordInfoModal not found. Cannot close record info modal.');
    }
}

// Close all modals
// Called by event_listeners.js
function closeAllModals() {
     closeRecordsModal(); // closeRecordsModal is defined in this file
     closeRecordInfoModal(); // closeRecordInfoModal is defined in this file
     console.log('All modals closed.');
}


// Handle click on View Info button
// Called by displayRecordedVideos
function handleViewInfo(event) {
    const button = event.target.closest('.view-info-btn');
    if (!button) return;

    const recordId = button.dataset.recordId;
    const record = recordedVideos.find(rec => rec.id === recordId);

    if (record) {
        // Ensure record info UI elements are available (declared in core.js)
        if (typeof recordInfoModal !== 'undefined' || recordInfoModal === null ||
            typeof recordInfoTitleEl !== 'undefined' || recordInfoTitleEl === null ||
            typeof recordInfoDateEl !== 'undefined' || recordInfoDateEl === null ||
            typeof recordInfoDescriptionEl !== 'undefined' || recordInfoDescriptionEl === null ||
            typeof recordInfoShortDescriptionEl !== 'undefined' || recordInfoShortDescriptionEl === null ||
            typeof recordInfoSeoTagsEl !== 'undefined' || recordInfoSeoTagsEl === null ||
            typeof recordInfoScenarioEl !== 'undefined' || recordInfoScenarioEl === null ||
            typeof recordInfoInstructionsEl !== 'undefined' || recordInfoInstructionsEl === null ||
            typeof recordInfoThumbnailEl !== 'undefined' || recordInfoThumbnailEl === null ||
            typeof saveRecordInfoBtn !== 'undefined' || saveRecordInfoBtn === null ||
            typeof deleteRecordInfoBtn !== 'undefined' || deleteRecordInfoBtn === null) { // Added null checks for all elements

            // Populate the info modal fields
            recordInfoTitleEl.value = record.title || record.name;
            recordInfoDateEl.textContent = new Date(record.timestamp).toLocaleString();
            recordInfoDescriptionEl.value = record.description || '';
            recordInfoShortDescriptionEl.value = record.shortDescription || '';
            recordInfoSeoTagsEl.value = record.seoTags || '';
            recordInfoScenarioEl.value = record.scenario || ''; // Scenario is readonly
            recordInfoInstructionsEl.value = record.instructions || ''; // Instructions are readonly
            recordInfoThumbnailEl.innerHTML = `<img src="${record.thumbnail || 'assets/icons/video-placeholder.png'}" alt="Thumbnail" class="record-thumbnail-large">`; // Display thumbnail

            // Store the record ID on the save and delete buttons
            saveRecordInfoBtn.dataset.recordId = recordId;
            deleteRecordInfoBtn.dataset.recordId = recordId;

            // Hide the records list and show the info modal
            closeRecordsModal(); // closeRecordsModal is defined in this file
            recordInfoModal.style.display = 'flex';
            console.log('Record info modal opened for record ID:', recordId);

        } else {
            console.warn('Required record info UI elements not found. Cannot open info modal.');
        }
    } else {
        console.error('Record not found for ID:', recordId);
    }
}

// --- New: Handle click on Direct Download Link ---
// This function is primarily for logging or potential future enhancements
// The download itself is handled by the <a> tag's download attribute
function handleDirectDownloadClick(event) {
    const link = event.target.closest('.download-record-link');
    if (!link) return;

    const recordId = link.dataset.recordId;
    const record = recordedVideos.find(rec => rec.id === recordId);

    if (record) {
        console.log(`Direct download link clicked for record ID: ${recordId}, Filename: ${record.name}`);
        // Check if the URL is likely invalid (e.g., from a previous session)
        // This is a basic check; a more robust solution would involve IndexedDB
        if (!record.url || !record.url.startsWith('blob:')) {
             console.warn(`Download link for record ID ${recordId} might be invalid (not a blob URL).`);
             // The browser's default download behavior will likely fail silently or with an error in the console.
             // We could add an alert here, but it might interfere with the browser's native download prompt.
             // For now, just logging the warning.
        } else {
            console.log(`Initiating direct download for record ID: ${recordId}`);
            // The browser handles the download automatically via the <a> tag
             // Ensure statusEl is available (declared in core.js)
            if (typeof statusEl !== 'undefined' && statusEl !== null) { // Added null check
                statusEl.textContent = `Direct download initiated for "${record.title || record.name}". Check your browser's download list.`;
            } else {
                 console.warn('statusEl not found when reporting direct download initiated.');
            }
        }

    } else {
        console.error('Record not found for direct download link with ID:', recordId);
         // Ensure statusEl is available (declared in core.js)
        if (typeof statusEl !== 'undefined' && statusEl !== null) { // Added null check
             statusEl.textContent = 'Error initiating download: Record not found.';
        } else {
             console.warn('statusEl not found when reporting direct download error.');
        }
    }
}
// --- End New ---


// Handle click on Save Info button
// Called by addRecordsModalListeners
async function handleSaveRecordInfo(event) {
     // Ensure saveRecordInfoBtn, recordInfoTitleEl, recordInfoDescriptionEl, recordInfoShortDescriptionEl, recordInfoSeoTagsEl are available (declared in core.js)
    if (typeof saveRecordInfoBtn === 'undefined' || saveRecordInfoBtn === null ||
        typeof recordInfoTitleEl === 'undefined' || recordInfoTitleEl === null ||
        typeof recordInfoDescriptionEl === 'undefined' || recordInfoDescriptionEl === null ||
        typeof recordInfoShortDescriptionEl === 'undefined' || recordInfoShortDescriptionEl === null ||
        typeof recordInfoSeoTagsEl === 'undefined' || recordInfoSeoTagsEl === null) { // Added null checks
        console.warn('Required record info UI elements not found for saving info.');
        return;
    }

    const recordId = saveRecordInfoBtn.dataset.recordId;
    const record = recordedVideos.find(rec => rec.id === recordId);

    if (record) {
        // Update the record metadata with the edited values
        record.title = recordInfoTitleEl.value;
        record.description = recordInfoDescriptionEl.value;
        record.shortDescription = recordInfoShortDescriptionEl.value;
        record.seoTags = recordInfoSeoTagsEl.value;
        // Scenario and Instructions are readonly, so no need to save changes from those fields

        // Save the updated metadata to storage
        await saveRecordMetadata(); // saveRecordMetadata is defined in this file

        console.log('Record info saved for ID:', recordId);
        // Ensure statusEl is available (declared in core.js)
        if (typeof statusEl !== 'undefined' && statusEl !== null) { // Added null check
            statusEl.textContent = 'Record info saved.';
        } else {
             console.warn('statusEl not found when reporting info saved.');
        }

        // Optionally close the info modal and refresh the records list
        // closeRecordInfoModal(); // closeRecordInfoModal is defined in this file // Keep info modal open for further edits
        displayRecordedVideos(); // Refresh the list to show updated title (if records modal is open)
    } else {
        console.error('Record not found for ID:', recordId);
         // Ensure statusEl is available (declared in core.js)
        if (typeof statusEl !== 'undefined' && statusEl !== null) { // Added null check
             statusEl.textContent = 'Error saving record info: Record not found.';
        } else {
             console.warn('statusEl not found when reporting info save error.');
        }
    }
}

// Handle click on Delete Record button
// Called by addRecordsModalListeners
async function handleDeleteRecordInfo(event) {
    // Ensure deleteRecordInfoBtn is available (declared in core.js)
    if (typeof deleteRecordInfoBtn === 'undefined' || deleteRecordInfoBtn === null) { // Added null check
        console.warn('deleteRecordInfoBtn not found for deleting record.');
        return;
    }

    const recordId = deleteRecordInfoBtn.dataset.recordId;
     // Find the index of the record in the array
    const index = recordedVideos.findIndex(rec => rec.id === recordId);

    if (index !== -1) {
        // Confirm deletion
        if (confirm(`Are you sure you want to delete this record?`)) {
            // Revoke the object URL to free up memory (if it exists)
            if (recordedVideos[index].url) {
                URL.revokeObjectURL(recordedVideos[index].url);
                console.log('Revoked object URL:', recordedVideos[index].url);
            }

            // Remove the record from the array
            recordedVideos.splice(index, 1);
            console.log('Deleted record from local array with ID:', recordId);

            // Save the updated metadata to storage
            await saveRecordMetadata(); // saveRecordMetadata is defined in this file

            console.log('Record deleted from storage with ID:', recordId);
            // Ensure statusEl is available (declared in core.js)
             if (typeof statusEl !== 'undefined' && statusEl !== null) { // Added null check
                statusEl.textContent = 'Record deleted.';
             } else {
                 console.warn('statusEl not found when reporting record deleted.');
             }


            // --- FIX: Close info modal and open records list modal ---
            closeRecordInfoModal(); // Close the info modal
            displayRecordedVideos(); // Refresh the records list
            openRecordsModal(); // Open the records list modal
            console.log('Closed info modal, refreshed list, and opened records modal after deletion.');
            // --- END FIX ---

        }
    } else {
        console.error('Record not found for deletion with ID:', recordId);
         // Ensure statusEl is available (declared in core.js)
        if (typeof statusEl !== 'undefined' && statusEl !== null) { // Added null check
             statusEl.textContent = 'Error deleting record: Record not found.';
        } else {
             console.warn('statusEl not found when reporting record deletion error.');
        }
    }
}


// --- Removed: Function to download via background script ---
/*
async function downloadRecord(recordData, blob) {
     console.log('Attempting to initiate download via background script for record:', recordData.name);
     try {
         const blobUrl = URL.createObjectURL(blob);
         console.log('Created temporary blob URL for download:', blobUrl);

         await chrome.runtime.sendMessage({
             action: "downloadVideoBlob",
             blobUrl: blobUrl,
             filename: recordData.name,
             saveAs: true
         });

         console.log('Message sent to background script to initiate download.');

         if (typeof statusEl !== 'undefined' && statusEl !== null) statusEl.textContent = `Download initiated for "${recordData.title || recordData.name}". Check your browser's download list.`;

     } catch (error) {
         console.error('Error sending download message to background script:', error);
         if (typeof statusEl !== 'undefined' && statusEl !== null) {
             statusEl.textContent = 'Error initiating download.';
         } else {
              console.warn('statusEl not found when reporting download initiation error.');
         }
     }
}
*/
// --- End Removed ---


// --- Event Listeners for Modals ---
// Add event listeners for modal interactions
// Called by core.js on DOMContentLoaded
function addRecordsModalListeners() {
    // Ensure modal UI elements are available (declared in core.js)
     if (typeof recordsModal === 'undefined' || recordsModal === null || typeof closeRecordsModalBtn === 'undefined' || closeRecordsModalBtn === null ||
        typeof recordInfoModal === 'undefined' || recordInfoModal === null || typeof closeRecordInfoModalBtn === 'undefined' || closeRecordInfoModalBtn === null ||
        typeof saveRecordInfoBtn === 'undefined' || saveRecordInfoBtn === null || typeof deleteRecordInfoBtn === 'undefined' || deleteRecordInfoBtn === null ||
        typeof openRecordsModalBtn === 'undefined' || openRecordsModalBtn === null || typeof backToRecordsBtn === 'undefined' || backToRecordsBtn === null) { // Corrected null checks
        console.warn('Required modal UI elements not found. Cannot add modal listeners.');
        return;
    }

    // Open records modal button
    openRecordsModalBtn.addEventListener('click', openRecordsModal); // openRecordsModal is defined in this file
    console.log('Added click listener for openRecordsModalBtn.');


    // Close records modal button
    closeRecordsModalBtn.addEventListener('click', closeRecordsModal); // closeRecordsModal is defined in this file
    console.log('Added click listener for closeRecordsModalBtn.');

    // Close record info modal button
    closeRecordInfoModalBtn.addEventListener('click', closeRecordInfoModal); // closeRecordInfoModal is defined in this file
    console.log('Added click listener for closeRecordInfoModalBtn.');


    // Close modals when clicking outside the modal content
    window.addEventListener('click', (event) => {
        // Ensure modals exist before checking event target
        if (recordsModal && event.target === recordsModal) {
            closeRecordsModal();
        }
        if (recordInfoModal && event.target === recordInfoModal) {
            closeRecordInfoModal();
        }
    });
     console.log('Added window click listener for recordsModal.');
     console.log('Added window click listener for recordInfoModal.');


    // Save record info button
    saveRecordInfoBtn.addEventListener('click', handleSaveRecordInfo); // handleSaveRecordInfo is defined in this file
    console.log('Added click listener for saveRecordInfoBtn.');

    // Delete record button
    deleteRecordInfoBtn.addEventListener('click', handleDeleteRecordInfo); // handleDeleteRecordInfo is defined in this file
    console.log('Added click listener for deleteRecordInfoBtn.');

     // Back to Records button in info modal
    backToRecordsBtn.addEventListener('click', () => {
        closeRecordInfoModal(); // Close info modal
        openRecordsModal(); // Open records modal
        console.log('Clicked Back to Records button.');
    });
     console.log('Added click listener for backToRecordsBtn.');

     // --- Removed: Listener for download buttons (now direct links) ---
     // The listener for the direct download links is added dynamically in displayRecordedVideos
     // --- End Removed ---
}


// --- Initialization ---
// loadRecordMetadata is now called from core.js after DOMContentLoaded


// Expose necessary functions to the global scope or via an object if preferred
// For simplicity with existing code structure, exposing globally for now.
// In a more complex app, consider a module pattern.
window.loadRecordMetadata = loadRecordMetadata; // Needed by core.js
window.addRecordsModalListeners = addRecordsModalListeners; // Needed by core.js
window.openRecordsModal = openRecordsModal; // Needed by event_listeners.js
window.closeRecordsModal = closeRecordsModal; // Needed by event_listeners.js
window.addNewRecord = addNewRecord; // Needed by recording.js
window.closeAllModals = closeAllModals; // Expose for potential external use
window.generateThumbnail = generateThumbnail; // Expose for potential debugging or external use


// Note: statusEl is assumed to be globally available from core.js
// generatedPromptTitle, generatedPromptDescription, etc. are assumed to be globally available from event_listeners.js
// Added null checks for all accessed UI elements for robustness.
// backToRecordsBtn is assumed to be globally available from core.js
// formatSize is assumed to be globally available from recording.js
// recordsModal, closeRecordsModalBtn, recordsListEl, openRecordsModalBtn, storageStatusEl, recordInfoModal, closeRecordInfoModalBtn, recordInfoTitleEl, recordInfoDateEl, recordInfoDescriptionEl, recordInfoShortDescriptionEl, recordInfoSeoTagsEl, recordInfoScenarioEl, recordInfoInstructionsEl, saveRecordInfoBtn, deleteRecordInfoBtn, recordInfoThumbnailEl, backToRecordsBtn are declared in core.js and assumed to be globally available after DOMContentLoaded.
