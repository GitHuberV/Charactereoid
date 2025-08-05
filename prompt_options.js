// prompt_options.js

// AI Information and Avatars
// Added URLs for updating tabs
const aiInfo = {
    gemini: { name: 'Gemini', avatar: 'assets/avatars/gemini.jpeg', url: 'https://gemini.google.com/' }, // Example avatar URL
    chatgpt: { name: 'ChatGPT', avatar: 'assets/avatars/chatgpt.png', url: 'https://chatgpt.com/' }, // Placeholder avatar URL
    grok: { name: 'Grok', avatar: 'assets/avatars/grok.jpeg', url: 'https://grok.com/' }, // Note: Grok is currently X AI, URL might change or require specific access
    claude: { name: 'Claude', avatar: 'assets/avatars/claude.jpeg', url: 'https://claude.ai/' }, // Placeholder avatar URL
    deepseek: { name: 'DeepSeek', avatar: 'assets/avatars/deepseek.jpeg', url: 'https://chat.deepseek.com/' }, // Placeholder avatar URL
};

// Genre Options based on Category
const genreOptions = {
    education: ['Science', 'Math', 'History', 'Language', 'Programming', 'Art', 'Music', 'General Knowledge'],
    tutorial: ['Software', 'Hardware', 'Cooking', 'DIY', 'Crafts', 'Fitness', 'Gaming', 'Photography'],
    story: ['Fantasy', 'Sci-Fi', 'Horror', 'Comedy', 'Drama', 'Adventure', 'Mystery', 'Historical', 'Modern'],
    podcast: ['Technology', 'News', 'Comedy', 'True Crime', 'Health', 'Business', 'Arts', 'Sports'],
    // Added Game Genres
    game: ['Tic Tac Toe', 'Connect 4', 'Chess', 'Other'],
    other: ['Custom'] // Placeholder for 'Other' category
};

// UI elements for Prompt Options are now declared in core.js
// configureSectionTitle is assumed to be in core.js


// Function to get selected genres from checkboxes
function getSelectedGenres() {
    // Ensure genreSelectionContainerEl is available (declared in core.js)
    if (typeof window.genreSelectionContainerEl === 'undefined') { // Use window.genreSelectionContainerEl
        console.warn('genreSelectionContainerEl not found in getSelectedGenres.');
        return [];
    }
    const selectedGenres = [];
    // Select checkboxes within the genre-grid container, which is inside genreSelectionContainerEl
    const checkboxes = window.genreSelectionContainerEl.querySelectorAll('.checkbox-group.genre-grid input[type="checkbox"]'); // Use window.genreSelectionContainerEl
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedGenres.push(checkbox.value);
        }
    });
    return selectedGenres;
}

// Function to populate genre checkboxes based on selected category
// Called from loadOptions and categorySelectionEl change listener
function populateGenreCheckboxes(category, selectedGenres = []) {
     // Ensure genreSelectionContainerEl is available (declared in core.js)
    if (typeof window.genreSelectionContainerEl === 'undefined') { // Use window.genreSelectionContainerEl
        console.warn('genreSelectionContainerEl not found in populateGenreCheckboxes.');
        return;
    }

    // Find the specific container for the grid *within* the genreSelectionContainerEl
    const genresContainer = window.genreSelectionContainerEl.querySelector('.checkbox-group.genre-grid'); // Use window.genreSelectionContainerEl
    if (!genresContainer) {
        console.error('Genre grid container (.checkbox-group.genre-grid) not found within genreSelectionContainerEl.');
        return;
    }

    genresContainer.innerHTML = ''; // Clear existing checkboxes from the container

    const genres = genreOptions[category] || [];

    genres.forEach(genre => {
        const checkboxId = `genre-${genre.replace(/\s+/g, '-').toLowerCase()}`;
        const isChecked = selectedGenres.includes(genre);

        // Create a container div for each checkbox/label pair to ensure proper grid item behavior
        const genreItemDiv = document.createElement('div');
        genreItemDiv.classList.add('genre-item'); // Add a class for potential item styling

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.name = 'genre';
        checkbox.value = genre;
        checkbox.checked = isChecked;

        const label = document.createElement('label');
        label.htmlFor = checkboxId;
        label.textContent = genre;

        // Append checkbox and label to the item div
        genreItemDiv.appendChild(checkbox);
        genreItemDiv.appendChild(label);

        // Append the item div to the main genres grid container
        genresContainer.appendChild(genreItemDiv);

        // Add event listener to save options when a genre is checked/unchecked
        // debouncedSaveOptions is assumed to be in storage.js
        if (typeof window.debouncedSaveOptions === 'function') { // Use window.debouncedSaveOptions
            checkbox.addEventListener('change', window.debouncedSaveOptions); // Use window.debouncedSaveOptions
        } else {
            console.warn('debouncedSaveOptions function not found when adding genre listener.');
        }
    });
     console.log(`Populated genre checkboxes for category: ${category}.`);
}

// Function to set the theme (light or dark)
// Called from loadOptions and themeToggleBtn click listener
function setTheme(theme) {
    // Ensure themeToggleBtn is available (declared in core.js)
     if (typeof window.themeToggleBtn === 'undefined') { // Use window.themeToggleBtn
        console.warn('themeToggleBtn not found when setting theme.');
        return;
     }

    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme'); // Ensure light-theme is removed
        window.themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>'; // Moon icon for dark mode // Use window.themeToggleBtn
    } else {
        document.body.classList.add('light-theme'); // Ensure light-theme is added
        document.body.classList.remove('dark-theme'); // Ensure dark-theme is removed
        window.themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>'; // Sun icon for light mode // Use window.themeToggleBtn
    }
     console.log(`Theme set to: ${theme}.`);
}

// Function to toggle theme
// Called from themeToggleBtn click listener
function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    // saveOptions is assumed to be in storage.js
    if (typeof window.saveOptions === 'function') { // Use window.saveOptions
        window.saveOptions(); // Save theme preference
    } else {
        console.error('saveOptions is not defined when toggling theme.');
    }
}

// Function to update the AI avatar image
// Called from loadOptions and leftAiSelectionEl/rightAiSelectionEl change listeners
function updateAIAvatar(aiKey) {
    const ai = aiInfo[aiKey];
    if (ai && ai.avatar) {
        // leftProfileImage is assumed to be in visualizer.js
        if (typeof window.leftProfileImage !== 'undefined') { // Use window.leftProfileImage
             window.leftProfileImage.src = ai.avatar; // Use window.leftProfileImage
             console.log(`Left avatar updated to: ${ai.avatar}`);
        } else {
             console.warn('leftProfileImage not found in updateAIAvatar.');
        }
    } else {
        console.warn(`Avatar not found for AI key: ${aiKey}. Using default.`);
        // Optionally set a default placeholder if avatar is missing
        // leftProfileImage is assumed to be in visualizer.js
        if (typeof window.leftProfileImage !== 'undefined') { // Use window.leftProfileImage
             window.leftProfileImage.src = 'assets/avatars/default.png'; // Make sure you have a default image
        } else {
             console.warn('leftProfileImage not found when setting default avatar.');
        }
    }
}


// Function to update the left tab's URL based on selected AI
// Called from leftAiSelectionEl change listener
async function updateLeftTabUrl(aiKey) {
    const ai = aiInfo[aiKey];
    if (ai && ai.url) {
        console.log(`Attempting to update left tab URL to: ${ai.url}`);
        // Send message to background script to update the left tab's URL
        // Need to ensure the background script has a listener for 'updateLeftTabUrl'
        try {
            const response = await chrome.runtime.sendMessage({
                action: "updateLeftTabUrl",
                url: ai.url
            });
            console.log('Background script response for URL update:', response);
        } catch (error) {
            console.error('Error sending message to background script for URL update:', error);
        }
    } else {
        console.warn(`URL not found for AI key: ${aiKey}. Cannot update left tab.`);
    }
}

// Function to update the configure section title based on the selected AI
// Called from loadOptions and leftAiSelectionEl/rightAiSelectionEl change listeners
function updateConfigureText(aiKey) {
     // Ensure configureSectionTitle is available (declared in core.js)
     if (typeof window.configureSectionTitle === 'undefined') { // Use window.configureSectionTitle
         console.warn('configureSectionTitle not found in updateConfigureText.');
         return;
     }

     const ai = aiInfo[aiKey];
     const aiName = ai ? ai.name : 'Unknown AI';
     window.configureSectionTitle.textContent = `Configure Left Tab (${aiName})`; // Use window.configureSectionTitle
     console.log(`Configure section title updated to: ${window.configureSectionTitle.textContent}`);
}


// Note: All UI element variables (leftAiSelectionEl, rightAiSelectionEl, durationSelectionEl, etc.) are assumed to be in core.js.
// defaultOptions, saveOptions, loadOptions, debouncedSaveOptions, updateVisualizerUIBasedOnSelection, loadedAiSettings are assumed to be in storage.js.
// leftProfileImage is assumed to be in visualizer.js.
// aiAvatarEl is no longer used.
// configureSectionTitle is assumed to be in core.js.
// themeToggleBtn is assumed to be globally available from core.js
// genreSelectionContainerEl is assumed to be globally available from core.js
