# Charactereoid  
**Version: 0.2.3**

---

## 💡 What It Is

**Charactereoid** is a high-quality canvas recorder packaged as a **Chrome extension**.  
It is designed to **capture a dynamic canvas animation**, using the **live output from two separate AI conversational tabs** (like Gemini and ChatGPT) as the background.

The extension provides a **control panel** for users to:
- Customize recording options
- Manage the visualizers that react to AI audio
- Organize past recordings

---

## ✨ Key Features

### 🔁 Dual AI Integration
Seamlessly integrates with multiple AI platforms:
- Gemini
- ChatGPT
- Grok
- Claude
- DeepSeek  

…by injecting content scripts to manage their behavior.

---

### 🎥 Customizable Recording
- Choose from different video resolutions (`1080p`, `720p`, etc.)
- Set the video format (`.mp4`, `.webm`)
- Control video and audio bitrates

---

### 🔊 Interactive Visualizers
- Displays dynamic **audio visualizers and avatars** that react to audio
- Customize visualizer diameter and canvas position
- Toggle between **light** and **dark** themes

---

### 🗣️ Audio Synthesis
- Appears to include **text-to-speech (TTS)** for AI responses
- Supports audio playback and synthesis

---

### 🪟 Window Management
- Automatically creates popup windows for AI tabs and control panel
- Streamlined tab/window handling

---

### 🗂️ Session Management
- Persists settings and recording status with `chrome.storage.local`
- Manages saved recordings with metadata and thumbnails

---

### ⌨️ Shortcuts
- `Alt + O`: Open extension windows  
- `Alt + S`: Stop recording  

---

## ⚙️ How It Works

The project uses **Manifest V3** Chrome extension architecture with a **service worker** as the brain, and **content scripts** for interacting with AI sites.

---

## 🔧 Core Components

- `manifest.json`  
  The core config file: permissions, background scripts, commands, and host settings.

- `background.js` (and imports)  
  Main service worker: Handles install logic, event listeners, window ops.

- `manager.js`  
  Tracks which tabs are ready, message queues, and window states.

- `windows.js`  
  Handles creating, focusing, and managing popup windows for control panel + AI tabs.

- `messages.js`  
  Listeners for inter-component messaging + keyboard shortcuts.

- `index.html` (with `core.js`, `event_listeners.js`, etc.)  
  The main UI control panel. Allows users to start recordings, configure settings, and manage saved sessions.

- **Content Scripts** (`chatgpt.js`, `gemini.js`, etc.)  
  Injected into AI pages. They report tab status, optionally hide UI, and respond to commands.

- `recording.js`  
  Uses `MediaRecorder API` to capture canvas + audio. Handles start/stop/pause.

- `visualizer.js`  
  Draws glowing animated waveforms and avatars that react to audio input.

- `storage.js`  
  Manages persistent user preferences/settings with `chrome.storage.local`.

- `player.html` & `player.js`  
  Audio player loaded in an `iframe`. Receives audio from the background, allows playback, and handles user interaction for unlocking audio.

---

## 🖼️ Screenshots

### Screenshot 1 – Control Panel  
![Screenshot 1](screenshots/screenshot_1.png)

---

### Screenshot 2 – Canvas Visualizer  
![Screenshot 2](screenshots/screenshot_2.png)

---

## 🔥 Demo Video

[![Watch the Demo](https://img.youtube.com/vi/YtqvI2BI650/0.jpg)](https://www.youtube.com/watch?v=YtqvI2BI650)

---

## 🚀 How to Use

1. **Install** the extension from the Chrome Web Store
2. Click the **extension icon** to open:
   - The main control panel
   - Two AI windows (left + right)
3. In the control panel, **choose your AI platforms**
4. Configure your recording:
   - Resolution
   - Format
   - Audio settings
5. Hit **Go** to launch a dual-AI session
6. Enter your **prompt** in the input field  
   (It auto-submits to both AI tabs)
7. Click **Start Recording** to begin capture
8. When done, click **Stop Recording**  
   Your session will be saved and can be viewed in the **Records modal**

---

