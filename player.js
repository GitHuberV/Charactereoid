// player.js
// Removed fileInput element reference
const audioPlayer = document.getElementById('audioPlayer');
const status = document.getElementById('status');

// --- Modal Elements ---
const audioUnlockModalOverlay = document.getElementById('audioUnlockModalOverlay');
const audioUnlockButton = document.getElementById('audioUnlockButton');
// --- End Modal Elements ---


let currentObjectURL = null; // Still potentially useful if you handle Blob URLs later
let currentResponseText = ''; // Variable to store the text currently being spoken
let currentSourceAI = ''; // Variable to store which AI generated the text

// Keep track of the AudioContext state
let audioContextResumed = false;
let audioContext = null; // Variable to hold the AudioContext

// --- Local AI Voice Map ---
// Map AI source names to their desired voice IDs
const aiVoiceMap = {
    'chatgpt': 'lisa', // Example voice ID for ChatGPT
    'gemini': 'kristy',     // Example voice ID for Gemini
    'claude': 'monica',   // Example voice ID for Claude
    'grok': 'henry',      // Example voice ID for Grok
    'deepseek': 'charles'    // Example voice ID for Deepseek
    // Add other AI sources and their voice IDs here as needed
};
console.log('player.js: AI Voice Map defined:', aiVoiceMap);
// --- End Local AI Voice Map ---

// --- Extension Verification Key ---
// This key is needed to authenticate with your server's /synthesize endpoint.
// IMPORTANT: This should ideally be loaded securely, e.g., from extension storage
// or passed from the background script, NOT hardcoded in a public content script.
// Using a placeholder for now. Replace with your actual key retrieval logic.
const SYNTHESIZE_AUTH_KEY = 'P5CtsAw3jZxgYDn53B1Uw44JpKljCYQF'; // <<< REPLACE WITH YOUR ACTUAL KEY
console.log('player.js: SYNTHESIZE_AUTH_KEY placeholder set.');
// --- End Extension Verification Key ---


// --- Emoji to Speechify Emotion Map ---
const emojiEmotionMap = {
    // angry - Forceful, intense expression
    '😠': 'angry',
    '😡': 'angry',
    '🤬': 'angry',
    '👿': 'angry',
    '💢': 'angry',
    '👹': 'angry',
    '😤': 'angry',
    '🗯️': 'angry',

    // cheerful - Upbeat, positive tone
    '😊': 'cheerful',
    '😁': 'cheerful',
    '😄': 'cheerful',
    '😃': 'cheerful',
    '😀': 'cheerful',
    '😆': 'cheerful',
    '🤗': 'cheerful',
    '🥳': 'cheerful',

    // sad - Downcast, melancholic delivery
    '😞': 'sad',
    '😢': 'sad',
    '😭': 'sad',
    '😔': 'sad',
    '😥': 'sad',
    '😩': 'sad',
    '😿': 'sad',
    '💔': 'sad',

    // terrified - Extreme fear expression
    '😨': 'terrified',
    '😱': 'terrified',
    '😖': 'terrified',
    '😫': 'terrified',
    '😳': 'terrified',
    '🥶': 'terrified',
    '😰': 'terrified',
    '😵': 'terrified',

    // relaxed - Calm, at-ease delivery
    '😌': 'relaxed',
    '🧘': 'relaxed',
    '🌿': 'relaxed',
    '🛀': 'relaxed',
    '🍃': 'relaxed',
    '🧿': 'relaxed',
    '🧖': 'relaxed',

    // fearful - Anxious, worried tone
    '😟': 'fearful',
    '😧': 'fearful',
    '😬': 'fearful',
    '😦': 'fearful',
    '😕': 'fearful',
    '🙀': 'fearful',
    '😯': 'fearful',
    '🥺': 'fearful',

    // surprised - Astonished, unexpected reaction
    '😮': 'surprised',
    '😲': 'surprised',
    '🤯': 'surprised',
    '😯': 'surprised',
    '🤨': 'surprised',
    '😲': 'surprised',
    '🙊': 'surprised',

    // calm - Tranquil, peaceful delivery
    '😇': 'calm',
    '🌊': 'calm',
    '🧘‍♀️': 'calm',
    '☮️': 'calm',
    '🕊️': 'calm',
    '🌅': 'calm',
    '🌄': 'calm',
    '🙏': 'calm',

    // assertive - Confident, authoritative tone
    '💪': 'assertive',
    '🗣️': 'assertive',
    '🧍': 'assertive',
    '🧍‍♀️': 'assertive',
    '👊': 'assertive',
    '👑': 'assertive',
    '🏆': 'assertive',
    '😎': 'assertive',

    // energetic - Dynamic, lively expression
    '⚡': 'energetic',
    '🏃': 'energetic',
    '🔥': 'energetic',
    '💥': 'energetic',
    '🚀': 'energetic',
    '💃': 'energetic',
    '🕺': 'energetic',
    '🎆': 'energetic',

    // warm - Friendly, inviting delivery
    '🥰': 'warm',
    '❤️': 'warm',
    '💖': 'warm',
    '😍': 'warm',
    '💗': 'warm',
    '💓': 'warm',
    '💕': 'warm',

    // direct - Straightforward, clear tone
    '👉': 'direct',
    '📣': 'direct',
    '🔊': 'direct',
    '☝️': 'direct',
    '📢': 'direct',
    '🎯': 'direct',
    '📍': 'direct',
    '🔍': 'direct',

    // bright - Optimistic, cheerful delivery
    '✨': 'bright',
    '🌟': 'bright',
    '🌞': 'bright',
    '💫': 'bright',
    '🌈': 'bright',
    '☀️': 'bright',
    '⭐': 'bright',
    '🌠': 'bright'
};

console.log('player.js: Emoji to Emotion Map defined:', emojiEmotionMap);
// --- End Emoji to Speechify Emotion Map ---

// --- Function to convert text with emoji to SSML ---
function convertTextToSsml(text) {
    let ssmlText = text;
    let emotionFound = null;

    // Iterate through the emojiEmotionMap to find a match
    // Note: This simple approach checks for the presence of *any* emoji.
    // More complex logic might be needed for multiple emojis or specific placement.
    for (const emoji in emojiEmotionMap) {
        if (ssmlText.includes(emoji)) {
            emotionFound = emojiEmotionMap[emoji];
            // DO NOT remove the emoji from the text before wrapping
            // ssmlText = ssmlText.replace(emoji, '').trim(); // Removed this line
            // For simplicity, we'll use the first emotion found.
            // More advanced logic could handle multiple emotions or prioritize.
            break; // Stop after finding the first matching emoji
        }
    }

    // If no emotion was found after checking all emojis, default to 'calm'
    if (!emotionFound) {
        emotionFound = 'calm';
    }

    // Remove newline characters from the text before wrapping in SSML
    const cleanedText = ssmlText.replace(/[\r\n]+/g, ' ').trim(); // Replace one or more newlines with a space and trim

    // Wrap the cleaned text (with emojis still included) in SSML with the determined emotion
    return `
    <speak>
        <speechify:style emotion="${emotionFound}">
            ${cleanedText}
        </speechify:style>
    </speak>`;
}
console.log('player.js: convertTextToSsml function declared.');
// --- End Function to convert text with emoji to SSML ---



// --- Function to resume AudioContext ---
// This function should be called in response to a user gesture (like clicking the modal button)
async function resumeAudioContext() {
    if (audioContextResumed) {
        console.log('player.js: AudioContext already resumed.');
        return;
    }

    // Create an AudioContext if it doesn't exist
    if (!audioContext) {
        try {
            // Use the standard way to create AudioContext
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('player.js: AudioContext created.');
        } catch (error) {
            console.error('player.js: Failed to create AudioContext:', error);
            return; // Cannot proceed without AudioContext
        }
    }

    // Attempt to resume the AudioContext
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
            console.log('player.js: AudioContext resumed successfully.');
            audioContextResumed = true;
            // Optionally notify parent that context is resumed
            // window.parent.postMessage({ action: 'audioContextResumed' }, '*'); // Notify parent script - optional now with modal
        } catch (error) {
            console.error('player.js: Failed to resume AudioContext:', error);
        }
    } else if (audioContext.state === 'running') {
        console.log('player.js: AudioContext is already running.');
        audioContextResumed = true;
        // Still notify parent in case they missed the initial message - optional now with modal
        // window.parent.postMessage({ action: 'audioContextResumed' }, '*');
    } else {
        console.log(`player.js: AudioContext state is ${audioContext.state}. Cannot resume.`);
    }
}
console.log('player.js: resumeAudioContext function declared.');
// --- End Function to resume AudioContext ---


// Removed fileInput event listener

// --- Function to fetch audio with retry ---
async function fetchAudioWithRetry(url, options, retries = 1, delay = 1000) { // Retry once after 1 second delay
    for (let i = 0; i <= retries; i++) {
        try {
            console.log(`player.js: Attempt ${i + 1} to fetch audio from ${url}`);
            const response = await fetch(url, options);

            if (!response.ok) {
                // If response is not OK, it's a server-side error or bad request.
                // We might still want to retry certain status codes, but for now,
                // let's retry on any non-OK response.
                console.warn(`player.js: Fetch attempt ${i + 1} failed with status: ${response.status}`);
                if (i < retries) {
                    console.log(`player.js: Retrying fetch in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Continue to the next iteration for retry
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            }

            // If successful, return the response
            console.log(`player.js: Fetch attempt ${i + 1} successful.`);
            return response;

        } catch (error) {
            console.error(`player.js: Fetch attempt ${i + 1} failed:`, error);
            if (i < retries) {
                console.log(`player.js: Retrying fetch in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // If this was the last attempt, re-throw the error
                throw error;
            }
        }
    }
    // This part should theoretically not be reached if retries >= 0, but as a fallback:
    throw new Error("player.js: Max retries reached for fetching audio.");
}
console.log('player.js: fetchAudioWithRetry function declared.');
// --- End Function to fetch audio with retry ---


// Listen for messages from the parent window (content script)
window.addEventListener('message', async (event) => { // Made listener async
    // IMPORTANT: In a real application, always verify the origin of the message
    // to prevent security vulnerabilities. For development, '*' is used,
    // but replace with the specific origin of your content scripts.
    // if (event.origin !== 'chrome-extension://YOUR_EXTENSION_ID') { return; }
    // You can get your extension ID from chrome.runtime.id in your content script.

    const data = event.data; // The message data

    if (data.action === 'playAudioForText') {
        console.log('player.js: Received playAudioForText message:', data);

        const textToSpeak = data.text;
        const sourceAI = data.sourceAI; // 'chatgpt' or 'gemini'
        // Removed apiToken and voiceId from received data

        // Look up the voiceId using the sourceAI from the local map
        const voiceId = aiVoiceMap[sourceAI];

        // Store the current text and source AI for use in the 'ended' event
        currentResponseText = textToSpeak;
        currentSourceAI = sourceAI;

        console.log(`player.js: Received request to play audio for text from ${sourceAI}: "${textToSpeak}"`);
        console.log(`player.js: Using Voice ID: ${voiceId}`); // Log the looked-up voice ID


        // --- Fetch audio and speech marks from your server ---
        // Construct the full URL to your TTS endpoint
        const ttsServerBaseUrl = 'https://3000-firebase-voice-1747243935493.cluster-zkm2jrwbnbd4awuedc2alqxrpk.cloudworkstations.dev'; // Your server base URL
        // Update the endpoint to /synthesize
        const ttsEndpoint = '/synthesize'; // Your TTS endpoint path
        const ttsServerUrl = `${ttsServerBaseUrl}${ttsEndpoint}`;

        // Check if a valid voiceId was found
        if (!voiceId) {
            console.error(`player.js: No voice ID found for AI source: ${sourceAI}`);
            status.textContent = `Error: No voice found for ${sourceAI}.`;
            window.parent.postMessage({
                action: 'audioPlaybackFinished',
                responseText: currentResponseText,
                sourceAI: currentSourceAI,
                status: 'error',
                errorMessage: `No voice ID found for AI source: ${sourceAI}`
            }, '*');
            // --- Send message to resume recording ---
            console.log('player.js: Sending message to resume recording after voice ID lookup failed...');
            window.parent.postMessage({ action: 'resumeRecording' }, '*');
            // --- End Send message ---
            return; // Exit the function if no voice ID is found
        }

        // Convert the text to SSML, incorporating emotion based on emoji
        const ssmlTextToSend = convertTextToSsml(textToSpeak);
        console.log('player.js: Converted text to SSML:', ssmlTextToSend);


        try {
            // Update status (will be logged to console as element is hidden)
            status.textContent = `Fetching audio for ${sourceAI}...`;
            console.log(`player.js: Initiating audio fetch with retry from ${ttsServerUrl}`);

            // --- Send message to pause recording BEFORE fetching ---
            console.log('player.js: Sending message to pause recording...');
            // window.parent.postMessage({ action: 'pauseRecording' }, '*');
            // --- End Send message ---


            // Use the new fetchAudioWithRetry function
            const response = await fetchAudioWithRetry(ttsServerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Include the verification header
                    'x-synthesize-auth': SYNTHESIZE_AUTH_KEY // <<< Use the verification key here
                },
                // Send xmlText (now SSML) and voiceId in the request body
                body: JSON.stringify({
                    xmlText: ssmlTextToSend, // Send the SSML text
                    voiceId: voiceId // Use the looked-up voice ID
                }),
            });

            // Assuming your server returns a JSON object like { audioUrl: '...', speechMarksUrl: '...', speechMarks: [...] }
            const result = await response.json();
            console.log('player.js: Received response from TTS server after fetch (possibly retried):', result);

            // Extract the audioUrl from the response
            const audioPath = result.audioUrl; // Path like '/audio-cache/...'
            // speechMarksPath and speechMarks are also available in the result if needed later

            if (audioPath) {
                // Construct the full URL for the audio file
                const fullAudioUrl = `${ttsServerBaseUrl}${audioPath}`;
                console.log('player.js: Full Audio URL:', fullAudioUrl);

                // --- Note: Speech Marks handling is already present but can be enhanced ---
                // You can use result.speechMarks here if you want to implement text highlighting
                // based on the received speech marks data directly, instead of fetching the URL.
                // The current code fetches the speech marks URL if provided, which is fine too.
                // --- End Note ---


                // Load the audio using the full URL
                // Clean up previous Blob URL if it exists (from manual file selection)
                if (currentObjectURL) {
                    URL.revokeObjectURL(currentObjectURL);
                    currentObjectURL = null;
                }
                audioPlayer.src = fullAudioUrl;

                // --- Send message to resume recording AFTER audio is loaded but BEFORE playback starts ---
                console.log('player.js: Sending message to resume recording after audio loaded...');
                window.parent.postMessage({ action: 'audioPlaybackReady' }, '*');
                // --- End Send message ---


                // Attempt to play the audio. This should work if AudioContext was resumed.
                audioPlayer.play().then(() => {
                    // Update status (will be logged to console as element is hidden)
                    status.textContent = `Playing audio for ${sourceAI}...`;
                    console.log('player.js: Audio playback started.');

                    // The resumeRecording message is now sent BEFORE playback starts.
                    // No need to send it again here.

                }).catch(err => {
                    console.error('player.js: Playback failed:', err);
                    // Update status (will be logged to console as element is hidden)
                    status.textContent = `Error playing audio for ${sourceAI}.`;
                    // Notify parent script about playback failure
                    window.parent.postMessage({
                        action: 'audioPlaybackFinished',
                        responseText: currentResponseText, // Send back the original text
                        sourceAI: currentSourceAI,
                        status: 'error',
                        errorMessage: err.message
                    }, '*'); // Use '*' for now, specify origin for security

                    // --- Send message to resume recording even on playback failure (as a fallback) ---
                    // This is important if the resume message wasn't sent before play() failed.
                    console.log('player.js: Sending message to resume recording after playback failed...');
                    window.parent.postMessage({ action: 'resumeRecording' }, '*');
                    // --- End Send message ---
                });
            } else {
                console.error('player.js: TTS server response did not contain audioUrl.');
                // Update status (will be logged to console as element is hidden)
                status.textContent = `Error: No audio URL from server for ${sourceAI}.`;
                // Notify parent script about missing audio
                window.parent.postMessage({
                    action: 'audioPlaybackFinished',
                    responseText: currentResponseText, // Send back the original text
                    sourceAI: currentSourceAI,
                    status: 'error',
                    errorMessage: 'No audio URL received from server'
                }, '*'); // Use '*' for now, specify origin for security

                // --- Send message to resume recording even on missing audio URL ---
                console.log('player.js: Sending message to resume recording after missing audio URL...');
                window.parent.postMessage({ action: 'resumeRecording' }, '*');
                // --- End Send message ---
            }

        } catch (error) {
            console.error('player.js: Final error fetching or processing audio from server after retries:', error);
            // Update status (will be logged to console as element is hidden)
            status.textContent = `Error fetching audio for ${sourceAI}.`;
            // Notify parent script about fetch/processing failure
            window.parent.postMessage({
                action: 'audioPlaybackFinished',
                responseText: currentResponseText, // Send back the original text
                sourceAI: currentSourceAI,
                status: 'error',
                errorMessage: error.message
            }, '*'); // Use '*' for now, specify origin for security

            // --- Send message to resume recording even on fetch/processing failure ---
            console.log('player.js: Sending message to resume recording after fetch/processing failed...');
            window.parent.postMessage({ action: 'resumeRecording' }, '*');
            // --- End Send message ---
        }
        // --- End Fetch audio and speech marks ---

    }
    // Handle other message actions if needed
});

// Listen for the 'ended' event on the audio player
audioPlayer.addEventListener('ended', () => {
    console.log('player.js: Audio playback finished.');
    // Update status (will be logged to console as element is hidden)
    status.textContent = 'Playback finished.';

    // Clean up the Blob URL if one was created (though we are now using direct URLs)
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }

    // Notify the parent window (content script) that playback is finished
    // Use the stored original text and source AI
    window.parent.postMessage({
        action: 'audioPlaybackFinished',
        responseText: currentResponseText, // Send back the original text
        sourceAI: currentSourceAI
    }, '*'); // Use '*' for now, but specify origin if possible for security

    // Clear stored text and source AI
    currentResponseText = '';
    currentSourceAI = '';
});



// Function to hide the modal
function hideAudioUnlockModal() {
    console.log('player.js: Hiding audio unlock modal.');
    window.parent.postMessage({ action: 'hideAudioIframe' }, '*');
}

// Add event listener to the OK button in the modal
audioUnlockButton.addEventListener('click', () => {
    console.log('player.js: Audio unlock button clicked.');
    resumeAudioContext();
    hideAudioUnlockModal();
});

