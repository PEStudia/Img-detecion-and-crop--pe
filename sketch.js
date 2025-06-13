let img; 			// Original image (current working image)
let imgOriginal; 	// Stores the very first loaded image to allow reloading
let processedImg; 	// Image after Sobel filter (grayscale edge detection)
let binaryImg; 		// Binary image after thresholding

// image variables
let yuvImg;
let yiqImg;
let labImg;
let hsbImg;
let hslImg;
let hsiImg;
let grayImg;
let cmykImg;


let fileInput;
let thresholdSlider;
let viewModeSelect;
let showBoundingBoxesCheckbox;
let cropButton;
let downloadButton;
let reloadImgButton; 
let objectCountSpan; 

let objects = []; 	// Array to store detected objects (bounding box data)
let selectedObjectIndex = -1; // Index of the currently selected object for cropping

// Variables for overlapping object selection logic
let lastClickX = -1, lastClickY = -1; // Stores coordinates of the last mouse click
let overlappingObjectsAtLastClick = []; // Stores indices of objects found at the last click, sorted by size

// Constants for different display view modes
const VIEW_ORIGINAL = 0;
const VIEW_EDGE = 1;
const VIEW_BINARY = 2;
const VIEW_HSB = 3;
const VIEW_HSL = 4;
const VIEW_HSI = 5;
const VIEW_GRAYSCALE = 6;
const VIEW_CMYK = 7;
const VIEW_YUV = 8;
const VIEW_YIQ = 9;
const VIEW_LAB = 10;



let currentViewMode = VIEW_ORIGINAL; // Default view mode when starting the application


function preload() {
    // Load an initial image from a reliable source.
    // Ensure the image URL is accessible and ideally under a permissive license.
    imgOriginal = loadImage('https://upload.wikimedia.org/wikipedia/en/7/7b/X-wing.jpg');
    img = imgOriginal; // Set the current working image to the original
}


function setup() {
    // Get references to the HTML containers for layout
    let canvasContainer = select('#p5-canvas-container');

    // Create canvas and parent it to its designated div
    // Set a responsive width based on the container's computed width
    let containerWidth = canvasContainer.width;
    createCanvas(containerWidth, 600).parent(canvasContainer); // You can adjust height as needed
    noLoop(); // Disable continuous redraw; redraw() will be called explicitly when needed

    // Select UI elements from the HTML DOM and attach event listeners
    // File Input
    fileInput = select('#fileUpload');
    fileInput.changed(handleFile); // Use .changed() for file input

    // Binarization Threshold Slider
    thresholdSlider = select('#thresholdSlider');
    thresholdSlider.input(triggerProcessing); // Call triggerProcessing when slider value changes

    // View Mode Selection Dropdown
    viewModeSelect = select('#viewModeSelect');
    viewModeSelect.changed(changeViewMode); // Call changeViewMode when selection changes

    // Show Detected Objects Checkbox
    showBoundingBoxesCheckbox = select('#showBoundingBoxesCheckbox');
    showBoundingBoxesCheckbox.changed(toggleBoundingBoxes); // Call toggleBoundingBoxes when state changes

    // Crop Button
    cropButton = select('#cropButton');
    cropButton.mousePressed(cropSelectedObject); // Call cropSelectedObject when button is pressed
    cropButton.attribute('disabled', 'true'); 	// Initially disable the button via attribute

    // Download Button
    downloadButton = select('#downloadButton');
    downloadButton.mousePressed(downloadCurrentImage); // Call downloadCurrentImage when pressed
    downloadButton.attribute('disabled', 'true'); 	// Initially disabled via attribute

    // Reload Original Image Button (renamed for consistency)
    reloadImgButton = select('#reloadImgButton'); // Assumes HTML ID is 'reloadImgButton'
    reloadImgButton.mousePressed(reloadImg); // Call reloadImg when pressed
    // This button should be enabled initially as there's an original image loaded
    reloadImgButton.removeAttribute('disabled');

    // Object Count Span
    objectCountSpan = select('#objectCount');

    // Initial processing: If an image is loaded (from preload), start the processing pipeline
    if (img && img.width > 0) {
        triggerProcessing();
    }
}

/**
 * triggerProcessing() function:
 * Orchestrates the entire image processing pipeline.
 * Called when an image is loaded, threshold changes, or image is cropped.
 */
function triggerProcessing() {
    if (!img || img.width === 0) {
        // If no image, ensure controls are disabled and reset states
        selectedObjectIndex = -1;
        cropButton.attribute('disabled', 'true');
        downloadButton.attribute('disabled', 'true');
        reloadImgButton.attribute('disabled', 'true'); // Disable reload if no image
        if (objectCountSpan) {
            objectCountSpan.html('0');
        }
        redraw();
        return;
    }

    // Step 1: Apply Sobel filter for edge detection
    processImage();

    // Step 2: Binarize the edge-detected image
    detectObjects();

    // Step 3: Find and mark connected components (objects)
    markObjects();

    // Step 4: Convert to other color models (these don't depend on Sobel/Binarization, but the original image)
    // They are regenerated here to ensure they reflect the *current* `img` (which might be cropped)
    yuvImg = convertToYUV(img);
    yiqImg = convertToYIQ(img);
    labImg = convertToLab(img);
    hsbImg = convertToHSB(img);
    hslImg = convertToHSL(img);
    hsiImg = convertToHSI(img);
    grayImg = convertToGrayscale(img);
    cmykImg = convertToCMYK(img);


    // Reset selection and cropping state for the new image/processing results
    selectedObjectIndex = -1;
    cropButton.attribute('disabled', 'true');
    overlappingObjectsAtLastClick = []; // Clear stored overlapping objects
    lastClickX = -1; // Reset last click coordinates
    lastClickY = -1;

    // Update the object count display
    if (objectCountSpan) {
        objectCountSpan.html(objects.length);
    }

    // Enable download and reload buttons now that there's an image to save/reload
    downloadButton.removeAttribute('disabled');
    reloadImgButton.removeAttribute('disabled');


    redraw(); // Force a redraw of the canvas to display updated results
}

/**
 * changeViewMode() function:
 * Updates the current view mode based on dropdown selection.
 * Called when the 'View Mode' dropdown value changes.
 */
function changeViewMode() {
    currentViewMode = parseInt(viewModeSelect.value()); // Get the selected numerical view mode
    redraw(); // Force a redraw to display the new view
}

/**
 * toggleBoundingBoxes() function:
 * Simply triggers a redraw when the 'Show Detected Objects' checkbox state changes.
 */
function toggleBoundingBoxes() {
    redraw(); // Force a redraw to show/hide bounding boxes
}

/**
 * reloadImg() function:
 * Resets the current image to the initially loaded original image.
 */
function reloadImg() {
    img = imgOriginal; // Restore the original image
    triggerProcessing(); // Re-run the full processing pipeline on the original image
    currentViewMode = VIEW_ORIGINAL; // Optionally reset view mode to original
    viewModeSelect.value(VIEW_ORIGINAL); // Update dropdown to match
    redraw();
}

/**
 * handleFile() function:
 * Callback for the file input element. Handles uploaded image files.
 */
function handleFile() {
    // Access the file input element's files property directly
    const file = this.elt.files[0];

    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            loadImage(event.target.result, (newImg) => { // Load the uploaded image asynchronously
                img = newImg; 				// Assign the loaded image to 'img'
                imgOriginal = newImg.get(); // Also update imgOriginal to the new uploaded image for reload functionality
                img.loadPixels(); 			// Load pixel data for the new image
                triggerProcessing(); 		// Start the processing pipeline with the new image
                currentViewMode = VIEW_ORIGINAL; // Default to 'Original' view after upload
                viewModeSelect.value(VIEW_ORIGINAL); // Update dropdown to match
            });
        };
        reader.readAsDataURL(file); // Read the file as a Data URL
    } else {
        // Use a custom modal or message box instead of alert()
        console.error('Please upload an image file (e.g., .jpg, .png, .gif).');
        // Example of a simple UI message (you can expand this into a full modal)
        const messageDiv = createDiv('Please upload an image file (e.g., .jpg, .png, .gif).');
        messageDiv.style('position', 'absolute');
        messageDiv.style('top', '50%');
        messageDiv.style('left', '50%');
        messageDiv.style('transform', 'translate(-50%, -50%)');
        messageDiv.style('background', 'white');
        messageDiv.style('padding', '20px');
        messageDiv.style('border', '1px solid #ccc');
        messageDiv.style('border-radius', '8px');
        messageDiv.style('box-shadow', '0 4px 8px rgba(0,0,0,0.2)');
        messageDiv.style('z-index', '1000');
        messageDiv.style('text-align', 'center');
        messageDiv.style('font-size', '16px');
        messageDiv.style('color', 'red');
        setTimeout(() => messageDiv.remove(), 3000); // Remove message after 3 seconds
    }
}


function draw() {
    background(220); // Clear the canvas with a light gray background

    let displayImg = null; // Variable to hold the image to be displayed

    // Determine which image to display based on the current view mode
    switch (currentViewMode) {
        case VIEW_ORIGINAL:
            displayImg = img;
            break;
        case VIEW_EDGE:
            displayImg = processedImg; // The result of Sobel filter
            break;
        case VIEW_BINARY:
            displayImg = binaryImg; 	// The binarized image
            break;
        case VIEW_YUV:
            displayImg = yuvImg;
            break;
        case VIEW_YIQ:
            displayImg = yiqImg;
            break;
        case VIEW_LAB:
            displayImg = labImg;
            break;
        case VIEW_HSB:
            displayImg = hsbImg;
            break;
        case VIEW_HSL:
            displayImg = hslImg;
            break;
        case VIEW_HSI:
            displayImg = hsiImg;
            break;
        case VIEW_GRAYSCALE:
            displayImg = grayImg;
            break;
        case VIEW_CMYK:
            displayImg = cmykImg;
            break;
    }

    // Only draw if a valid image exists
    if (displayImg && displayImg.width > 0) {
        // Calculate dimensions to fit the image within the canvas while maintaining aspect ratio
        let imgAspectRatio = displayImg.width / displayImg.height;
        let canvasContentWidth = width;
        let canvasContentHeight = height;

        let displayWidth, displayHeight;
        let drawX, drawY;

        if (imgAspectRatio > (canvasContentWidth / canvasContentHeight)) {
            displayWidth = canvasContentWidth;
            displayHeight = canvasContentWidth / imgAspectRatio;
        } else {
            displayHeight = canvasContentHeight;
            displayWidth = canvasContentHeight * imgAspectRatio;
        }
        drawX = (canvasContentWidth - displayWidth) / 2; // Center the image horizontally
        drawY = (canvasContentHeight - displayHeight) / 2; // Center the image vertically

        image(displayImg, drawX, drawY, displayWidth, displayHeight); // Draw the selected image

        // Draw bounding boxes ONLY if the checkbox is checked AND objects have been detected
        // Note: Bounding boxes are drawn on the original image space, not the color-transformed one.
        // This is generally desired as they relate to objects in the visual spectrum.
        if (showBoundingBoxesCheckbox.checked() && objects.length > 0) {
            drawBoundingBoxes(displayWidth, displayHeight, drawX, drawY);
        }
    } else {
        // Display a message if no image is loaded
        textAlign(CENTER, CENTER);
        textSize(24);
        fill(50);
        text("Upload an image to start!", width / 2, height / 2);
    }
}


function drawBoundingBoxes(displayWidth, displayHeight, offsetX, offsetY) {
    strokeWeight(2); // Set stroke thickness
    noFill(); 	// No fill for the rectangles

    for (let i = 0; i < objects.length; i++) {
        let obj = objects[i];
        // Scale bounding box coordinates from original image size to displayed canvas size
        let rectX = offsetX + (obj.minX / img.width) * displayWidth;
        let rectY = offsetY + (obj.minY / img.height) * displayHeight;
        let rectW = ((obj.maxX - obj.minX) / img.width) * displayWidth;
        let rectH = ((obj.maxY - obj.minY) / img.height) * displayHeight;

        // Set color: red for selected object, green for others
        if (i === selectedObjectIndex) {
            stroke(255, 0, 0); // Red
        } else {
            stroke(0, 255, 0); // Green
        }
        rect(rectX, rectY, rectW, rectH); // Draw the rectangle
    }
}

/**
 * mousePressed() function:
 * Handles mouse clicks, primarily for selecting detected objects.
 */
function mousePressed() {
    // Only allow selection if bounding boxes are shown and an image is loaded with detected objects
    if (showBoundingBoxesCheckbox.checked() && img && objects.length > 0) {
        // Recalculate image display properties for accurate click detection
        let imgAspectRatio = img.width / img.height;
        let canvasContentWidth = width; // Canvas width
        let canvasContentHeight = height; // Canvas height

        let displayWidth, displayHeight;
        let offsetX, offsetY;

        // Determine displayed image dimensions and offset
        if (imgAspectRatio > (canvasContentWidth / canvasContentHeight)) {
            displayWidth = canvasContentWidth;
            displayHeight = canvasContentWidth / imgAspectRatio;
        } else {
            displayHeight = canvasContentHeight;
            displayWidth = canvasContentHeight * imgAspectRatio;
        }
        offsetX = (canvasContentWidth - displayWidth) / 2;
        offsetY = (canvasContentHeight - displayHeight) / 2;

        let clickTolerance = 5; // Pixels to consider for "same click location" to cycle through overlapping objects

        // 1. Find all objects under the current mouse click and store their index and area
        let hoveredObjectsWithArea = [];
        for (let i = 0; i < objects.length; i++) {
            let obj = objects[i];
            // Scale bounding box coordinates from original image size to displayed canvas size
            let rectX = offsetX + (obj.minX / img.width) * displayWidth;
            let rectY = offsetY + (obj.minY / img.height) * displayHeight;
            let rectW = ((obj.maxX - obj.minX) / img.width) * displayWidth;
            let rectH = ((obj.maxY - obj.minY) / img.height) * displayHeight;

            // Check if mouse click is within the bounding box
            if (mouseX > rectX && mouseX < rectX + rectW &&
                mouseY > rectY && mouseY < rectY + rectH) {
                let area = (obj.maxX - obj.minX) * (obj.maxY - obj.minY); // Calculate area for sorting
                hoveredObjectsWithArea.push({ index: i, area: area });
            }
        }

        // Sort hovered objects by area (smallest first). This ensures smaller objects are selected first.
        hoveredObjectsWithArea.sort((a, b) => a.area - b.area);
        let hoveredObjectsIndices = hoveredObjectsWithArea.map(item => item.index); // Extract just the indices after sorting

        // 2. Determine selection based on current click and previous click
        let isRepeatClick = (abs(mouseX - lastClickX) < clickTolerance && abs(mouseY - lastClickY) < clickTolerance);

        if (isRepeatClick && overlappingObjectsAtLastClick.length > 0 && selectedObjectIndex !== -1) {
            // If it's a repeat click and we have a list of overlapping objects from last time
            // AND the currently selected object is still among the new hovered objects (from sorted list)
            let currentIndexInOverlapping = overlappingObjectsAtLastClick.indexOf(selectedObjectIndex);
            if (currentIndexInOverlapping !== -1) {
                // Cycle to the next object in the remembered overlapping list
                let nextIndexInList = (currentIndexInOverlapping + 1) % overlappingObjectsAtLastClick.length;
                selectedObjectIndex = overlappingObjectsAtLastClick[nextIndexInList];
            } else {
                // Current selection is no longer in the overlapping group (e.g., clicked outside but near),
                // so select the first (smallest) object from the newly hovered group.
                selectedObjectIndex = hoveredObjectsIndices[0];
                overlappingObjectsAtLastClick = hoveredObjectsIndices; // Update the list with the newly sorted ones
            }
        } else {
            // This is the first click in this area, or clicked outside the previous overlap group.
            // Select the first (smallest) object in the newly hovered group.
            selectedObjectIndex = hoveredObjectsIndices[0];
            overlappingObjectsAtLastClick = hoveredObjectsIndices; // Store this new sorted list for potential future cycling
        }

        // Enable crop button only if an object is selected
        if (selectedObjectIndex !== -1) {
            cropButton.removeAttribute('disabled');
        } else {
            cropButton.attribute('disabled', 'true');
        }

        lastClickX = mouseX; // Store current click coordinates for next comparison
        lastClickY = mouseY;

        redraw(); // Force a redraw to highlight the selected object
    }
}


function cropSelectedObject() {
    if (selectedObjectIndex !== -1 && img && img.width > 0) {
        let obj = objects[selectedObjectIndex]; // Get the data of the selected object

        // Ensure crop coordinates are within image bounds
        let cropX = max(0, obj.minX);
        let cropY = max(0, obj.minY);
        let cropW = min(obj.maxX - obj.minX, img.width - cropX);
        let cropH = min(obj.maxY - obj.minY, img.height - cropY);

        // Get the cropped image from the original image
        let tempCroppedImg = img.get(cropX, cropY, cropW, cropH);

        // --- CORE FEATURE: Replace the original image with the cropped one ---
        img = tempCroppedImg; 		// The 'img' variable now holds the cropped portion
        img.loadPixels(); 			// Load pixel data for the new 'img'

        // Re-run the entire processing pipeline on the new, smaller 'img'.
        // This will automatically update processedImg, binaryImg, and objects for the cropped area.
        triggerProcessing();

        // Optionally, reset view mode to original for the new image
        currentViewMode = VIEW_ORIGINAL;
        viewModeSelect.value(VIEW_ORIGINAL); // Update dropdown to show 'Original'

        redraw(); // Force a redraw after all updates
    } else {
        // Use a custom message instead of alert()
        console.error("Please select an object first!");
        const messageDiv = createDiv("Please select an object first!");
        messageDiv.style('position', 'absolute');
        messageDiv.style('top', '50%');
        messageDiv.style('left', '50%');
        messageDiv.style('transform', 'translate(-50%, -50%)');
        messageDiv.style('background', 'white');
        messageDiv.style('padding', '20px');
        messageDiv.style('border', '1px solid #ccc');
        messageDiv.style('border-radius', '8px');
        messageDiv.style('box-shadow', '0 4px 8px rgba(0,0,0,0.2)');
        messageDiv.style('z-index', '1000');
        messageDiv.style('text-align', 'center');
        messageDiv.style('font-size', '16px');
        messageDiv.style('color', 'orange');
        setTimeout(() => messageDiv.remove(), 3000); // Remove message after 3 seconds
    }
}


function downloadCurrentImage() {
    let imageToSave = null;
    let filename = 'img'; // Default filename prefix

    // Determine which image is currently displayed and set filename accordingly
    switch (currentViewMode) {
        case VIEW_ORIGINAL:
            imageToSave = img;
            filename += '_original';
            break;
        case VIEW_EDGE:
            imageToSave = processedImg;
            filename += '_edge_detected';
            break;
        case VIEW_BINARY:
            imageToSave = binaryImg;
            filename += '_binary';
            break;
        case VIEW_YUV:
            imageToSave = yuvImg;
            filename += '_yuv';
            break;
        case VIEW_YIQ:
            imageToSave = yiqImg;
            filename += '_yiq';
            break;
        case VIEW_LAB:
            imageToSave = labImg;
            filename += '_lab';
            break;
        case VIEW_HSB:
            imageToSave = hsbImg;
            filename += '_hsb';
            break;
        case VIEW_HSL:
            imageToSave = hslImg;
            filename += '_hsl';
            break;
        case VIEW_HSI:
            imageToSave = hsiImg;
            filename += '_hsi';
            break;
        case VIEW_GRAYSCALE:
            imageToSave = grayImg;
            filename += '_grayscale';
            break;
        case VIEW_CMYK:
            imageToSave = cmykImg;
            filename += '_cmyk';
            break;
    }

    if (imageToSave) {
        // p5.js save() function handles downloading the image
        // We'll save it as a PNG, which is generally good for image quality
        save(imageToSave, filename + '.png');
    } else {
        console.error("No image to download."); // This shouldn't happen if the button is correctly enabled/disabled
        // Use a custom message instead of alert()
        const messageDiv = createDiv("There's no image to download yet. Please upload or process an image.");
        messageDiv.style('position', 'absolute');
        messageDiv.style('top', '50%');
        messageDiv.style('left', '50%');
        messageDiv.style('transform', 'translate(-50%, -50%)');
        messageDiv.style('background', 'white');
        messageDiv.style('padding', '20px');
        messageDiv.style('border', '1px solid #ccc');
        messageDiv.style('border-radius', '8px');
        messageDiv.style('box-shadow', '0 4px 8px rgba(0,0,0,0.2)');
        messageDiv.style('z-index', '1000');
        messageDiv.style('text-align', 'center');
        messageDiv.style('font-size', '16px');
        messageDiv.style('color', 'orange');
        setTimeout(() => messageDiv.remove(), 3000); // Remove message after 3 seconds
    }
}

/**
 * processImage() function:
 * Applies the Sobel edge detection filter to the global 'img'.
 * Stores the result in 'processedImg'.
 */
function processImage() {
    if (!img || img.width === 0) return;

    img.loadPixels(); // Load pixel data of the original image for reading

    // Create a new image for the processed output (Sobel result)
    processedImg = createImage(img.width, img.height);
    processedImg.loadPixels(); // Load pixel data for processedImg before writing to it

    // Sobel kernels for X and Y gradient components
    let sobelX = [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
    ];
    let sobelY = [
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1]
    ];

    let w = img.width;
    let h = img.height;

    // Apply Sobel filter by convolving kernels with image pixels
    for (let x = 1; x < w - 1; x++) { // Iterate through image pixels, avoiding borders
        for (let y = 1; y < h - 1; y++) {
            let sumX = 0; // Sum for X gradient
            let sumY = 0; // Sum for Y gradient

            // Convolve with 3x3 neighborhood
            for (let i = -1; i <= 1; i++) { // Kernel row index
                for (let j = -1; j <= 1; j++) { // Kernel column index
                    // Calculate index in the original image's pixels array
                    let originalPixelIndex = ((x + i) + (y + j) * w) * 4;

                    // Get grayscale value of the pixel
                    // Ensure pixel data is valid before accessing
                    let gray = 0;
                    if (originalPixelIndex + 2 < img.pixels.length) {
                        gray = (img.pixels[originalPixelIndex] + img.pixels[originalPixelIndex + 1] + img.pixels[originalPixelIndex + 2]) / 3;
                    }


                    // Apply kernel values
                    sumX += gray * sobelX[i + 1][j + 1];
                    sumY += gray * sobelY[i + 1][j + 1];
                }
            }

            // Calculate magnitude of gradient (edge strength)
            let magnitude = sqrt(sumX * sumX + sumY * sumY);
            magnitude = constrain(magnitude, 0, 255); // Clamp magnitude to 0-255 range

            // Set the pixel in the processed image (grayscale for edge strength)
            let outputPixelIndex = (x + y * w) * 4;
            // Ensure index is within bounds before writing
            if (outputPixelIndex + 3 < processedImg.pixels.length) {
                processedImg.pixels[outputPixelIndex] = magnitude; 	// Red channel
                processedImg.pixels[outputPixelIndex + 1] = magnitude; // Green channel
                processedImg.pixels[outputPixelIndex + 2] = magnitude; // Blue channel
                processedImg.pixels[outputPixelIndex + 3] = 255; 	// Alpha channel (fully opaque)
            }
        }
    }
    processedImg.updatePixels(); // Apply all pixel changes to processedImg
}

/**
 * detectObjects() function:
 * Converts the 'processedImg' (edge-detected) into a binary image based on a threshold.
 * Stores the result in 'binaryImg'.
 */
function detectObjects() {
    if (!processedImg || processedImg.width === 0) return;

    processedImg.loadPixels(); // Load pixel data of processedImg for reading

    let threshold = thresholdSlider.value(); // Get threshold value from the slider
    let w = processedImg.width;
    let h = processedImg.height;

    // Create a new image for the binary output
    binaryImg = createImage(w, h);
    binaryImg.loadPixels(); // Load pixel data for binaryImg before writing to it

    // Iterate through pixels and apply threshold
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let index = (x + y * w) * 4; // Index for current pixel (R channel)
            // Ensure index is within bounds before reading
            let val = 0;
            if (index < processedImg.pixels.length) {
                val = processedImg.pixels[index]; // Get grayscale value from processedImg
            }


            // If pixel value is above threshold, set to white (255), otherwise to black (0)
            if (index + 3 < binaryImg.pixels.length) { // Ensure index is valid for writing
                if (val > threshold) {
                    binaryImg.pixels[index] = 255;
                    binaryImg.pixels[index + 1] = 255;
                    binaryImg.pixels[index + 2] = 255;
                    binaryImg.pixels[index + 3] = 255; // Alpha
                } else {
                    binaryImg.pixels[index] = 0;
                    binaryImg.pixels[index + 1] = 0;
                    binaryImg.pixels[index + 2] = 0;
                    binaryImg.pixels[index + 3] = 255; // Alpha
                }
            }
        }
    }
    binaryImg.updatePixels(); // Apply all pixel changes to binaryImg
}

/**
 * markObjects() function:
 * Identifies distinct objects (connected components) in the 'binaryImg'
 * using a flood-fill algorithm and stores their bounding box coordinates.
 */
function markObjects() {
    if (!binaryImg || binaryImg.width === 0 || !img || img.width === 0) return;

    binaryImg.loadPixels(); // Load pixel data of binaryImg for reading

    let w = binaryImg.width;
    let h = binaryImg.height;
    let visited = new Array(w * h).fill(false); // Keeps track of visited pixels during flood fill
    objects = []; // Reset the list of detected objects

    /**
     * floodFill() helper function:
     * Iteratively explores connected white pixels using a stack.
     * @param {number} startX - Starting X coordinate
     * @param {number} startY - Starting Y coordinate
     * @returns {Array<Array<number>>} - An array of [x, y] pixel coordinates belonging to the current object.
     */
    function floodFill(startX, startY) {
        let stack = [[startX, startY]]; // Use a stack for iterative flood fill
        let pixels = []; 		// Stores pixels belonging to the current object

        while (stack.length > 0) {
            let [cx, cy] = stack.pop(); // Get current pixel from stack
            let index = (cx + cy * w) * 4; // Pixel index in the binary image's pixels array
            let idx = cx + cy * w; 		// Flat index for visited array

            // Boundary and visited checks, and ensure it's a white pixel
            if (cx < 0 || cx >= w || cy < 0 || cy >= h || visited[idx] || binaryImg.pixels[index] === 0) {
                continue; // Skip if out of bounds, already visited, or black pixel
            }

            visited[idx] = true; // Mark as visited
            pixels.push([cx, cy]); // Add pixel to the current object

            // Add 4-connected neighbors to the stack to explore them
            stack.push([cx + 1, cy]); // Right
            stack.push([cx - 1, cy]); // Left
            stack.push([cx, cy + 1]); // Down
            stack.push([cx, cy - 1]); // Up
        }
        return pixels; // Return all pixels found for this object
    }

    // Iterate through every pixel to find unvisited white pixels (start of new objects)
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let idx = x + y * w; // Flat index
            // If pixel is white and not visited, start a new flood fill
            // Ensure pixel access is within bounds
            if (!visited[idx] && (x + y * w) * 4 < binaryImg.pixels.length && binaryImg.pixels[(x + y * w) * 4] === 255) {
                let objPixels = floodFill(x, y); // Get all pixels for this object

                if (objPixels.length > 50) { // Filter out very small areas (noise)
                    let minX = w, minY = h, maxX = 0, maxY = 0; // Initialize bounding box coordinates

                    // Calculate bounding box for the current object
                    for (let [px, py] of objPixels) {
                        minX = min(minX, px);
                        minY = min(minY, py);
                        maxX = max(maxX, px);
                        maxY = max(maxY, py);
                    }
                    // Store the bounding box and pixel count of the detected object
                    objects.push({ minX, minY, maxX, maxY, pixelCount: objPixels.length });
                }
            }
        }
    }
}


// Konwersja do modelu YUV
function convertToYUV(srcImg) {
    let yuvImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    yuvImg.loadPixels();

    for (let i = 0; i < srcImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i];
        let g = srcImg.pixels[i + 1];
        let b = srcImg.pixels[i + 2];

        let y = 0.299 * r + 0.587 * g + 0.114 * b;
        let u = -0.14713 * r - 0.28886 * g + 0.436 * b + 128;
        let v = 0.615 * r - 0.51499 * g - 0.10001 * b + 128;

        yuvImg.pixels[i] = y;
        yuvImg.pixels[i + 1] = u;
        yuvImg.pixels[i + 2] = v;
        yuvImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Copy alpha
    }

    yuvImg.updatePixels();
    return yuvImg;
}

// Konwersja do modelu YIQ
function convertToYIQ(srcImg) {
    let yiqImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    yiqImg.loadPixels();

    for (let i = 0; i < srcImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i];
        let g = srcImg.pixels[i + 1];
        let b = srcImg.pixels[i + 2];

        let y = 0.299 * r + 0.587 * g + 0.114 * b;
        let iChannel = 0.596 * r - 0.274 * g - 0.322 * b;
        let q = 0.211 * r - 0.523 * g + 0.312 * b;

        yiqImg.pixels[i] = y;
        yiqImg.pixels[i + 1] = iChannel + 128;
        yiqImg.pixels[i + 2] = q + 128;
        yiqImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Copy alpha
    }

    yiqImg.updatePixels();
    return yiqImg;
}

// Konwersja do modelu Lab
function convertToLab(srcImg) {
    let labImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    labImg.loadPixels();

    for (let i = 0; i < srcImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i] / 255;
        let g = srcImg.pixels[i + 1] / 255;
        let b = srcImg.pixels[i + 2] / 255;

        let xyz = RGBtoXYZ(r, g, b);
        let lab = XYZtoLab(xyz[0], xyz[1], xyz[2]);

        labImg.pixels[i] = constrain(lab[0] * 2.55, 0, 255); // L (0-100, scale to 0-255)
        labImg.pixels[i + 1] = constrain(lab[1] + 128, 0, 255); // a* (-128 to 127, shift to 0-255)
        labImg.pixels[i + 2] = constrain(lab[2] + 128, 0, 255); // b* (-128 to 127, shift to 0-255)
        labImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Copy alpha
    }

    labImg.updatePixels();
    return labImg;
}

function RGBtoXYZ(r, g, b) {
    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    // Observer. = 2°, Illuminant = D65
    let X = r * 0.4124 + g * 0.3576 + b * 0.1805;
    let Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let Z = r * 0.0193 + g * 0.1192 + b * 0.9505;

    return [X * 100, Y * 100, Z * 100]; // Scale to D65 White Point
}

function XYZtoLab(x, y, z) {
    // Reference white point D65
    let refX = 95.047;
    let refY = 100.000;
    let refZ = 108.883;

    x /= refX;
    y /= refY;
    z /= refZ;

    function f(t) { return (t > 0.008856) ? Math.pow(t, 1/3) : (7.787 * t) + (16 / 116); }

    let L = (116 * f(y)) - 16;
    let a = 500 * (f(x) - f(y));
    let b = 200 * (f(y) - f(z));

    return [L, a, b];
}

// Konwersja do modelu HSB
function convertToHSB(srcImg) {
    let hsbImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    hsbImg.loadPixels();

    for (let i = 0; i < srcImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i];
        let g = srcImg.pixels[i + 1];
        let b = srcImg.pixels[i + 2];

        // Konwersja RGB na HSB
        let hsb = RGBtoHSB(r, g, b);
        hsbImg.pixels[i] = hsb[0];        // H (odcień)
        hsbImg.pixels[i + 1] = hsb[1];    // S (nasycenie)
        hsbImg.pixels[i + 2] = hsb[2];    // B (jasność)
        hsbImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Copy alpha
    }

    hsbImg.updatePixels();
    return hsbImg;
}

// Funkcja konwertująca obraz do modelu HSL
function convertToHSL(srcImg) {
    let hslImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    hslImg.loadPixels();

    for (let i = 0; i < srcImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i];
        let g = srcImg.pixels[i + 1];
        let b = srcImg.pixels[i + 2];

        // Konwersja RGB na HSL
        let hsl = RGBtoHSL(r, g, b);
        hslImg.pixels[i] = hsl[0];        // H (odcień)
        hslImg.pixels[i + 1] = hsl[1];    // S (nasycenie)
        hslImg.pixels[i + 2] = hsl[2];    // L (lightness)
        hslImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Copy alpha
    }

    hslImg.updatePixels();
    return hslImg;
}

// Funkcja konwertująca obraz do modelu HSI
function convertToHSI(srcImg) {
    let hsiImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    hsiImg.loadPixels();

    for (let i = 0; i < hsiImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i];
        let g = srcImg.pixels[i + 1];
        let b = srcImg.pixels[i + 2];

        // Konwersja RGB na HSI
        let hsi = RGBtoHSI(r, g, b);
        hsiImg.pixels[i] = hsi[0];        // H (odcień)
        hsiImg.pixels[i + 1] = hsi[1];    // S (nasycenie)
        hsiImg.pixels[i + 2] = hsi[2];    // I (intensywność)
        hsiImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Copy alpha
    }

    hsiImg.updatePixels();
    return hsiImg;
}

// Funkcja konwertująca obraz do odcieni szarości
function convertToGrayscale(srcImg) {
    let grayImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    grayImg.loadPixels();

    for (let i = 0; i < srcImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i];
        let g = srcImg.pixels[i + 1];
        let b = srcImg.pixels[i + 2];

        // Obliczenie jasności (średnia ważona)
        let brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        grayImg.pixels[i] = brightness;      // R
        grayImg.pixels[i + 1] = brightness; // G
        grayImg.pixels[i + 2] = brightness; // B
        grayImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Alpha
    }

    grayImg.updatePixels();
    return grayImg;
}

// Funkcja symulująca konwersję do modelu CMYK
function convertToCMYK(srcImg) {
    let cmykImg = createImage(srcImg.width, srcImg.height);
    srcImg.loadPixels(); // Ensure source image pixels are loaded
    cmykImg.loadPixels();

    for (let i = 0; i < srcImg.pixels.length; i += 4) {
        let r = srcImg.pixels[i];
        let g = srcImg.pixels[i + 1];
        let b = srcImg.pixels[i + 2];

        // Konwersja RGB na CMYK (symulacja)
        let c = 255 - r;
        let m = 255 - g;
        let y = 255 - b;
        let k = min(c, m, y); // Black component

        cmykImg.pixels[i] = c - k;      // C
        cmykImg.pixels[i + 1] = m - k; // M
        cmykImg.pixels[i + 2] = y - k; // Y
        cmykImg.pixels[i + 3] = srcImg.pixels[i + 3]; // Alpha
    }

    cmykImg.updatePixels();
    return cmykImg;
}

// Funkcja pomocnicza do konwersji RGB na HSB
function RGBtoHSB(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, v = max;

    let d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // Scaling to 0-255 range for display (p5.js pixel values)
    return [h * 255, s * 255, v * 255];
}

// Funkcja pomocnicza do konwersji RGB na HSL
function RGBtoHSL(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = 0; // achromatic
        s = 0;
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // Scaling to 0-255 range for display (p5.js pixel values)
    return [h * 255, s * 255, l * 255];
}

// Funkcja pomocnicza do konwersji RGB na HSI
function RGBtoHSI(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    let i = (r + g + b) / 3; // Intensity
    let minVal = Math.min(r, g, b);
    let s = i === 0 ? 0 : 1 - minVal / i; // Saturation

    let h = 0;
    if (s !== 0) { // Avoid division by zero when saturation is 0 (grayscale)
        let numerator = (0.5 * ((r - g) + (r - b)));
        let denominator = Math.sqrt((r - g) ** 2 + (r - b) * (g - b));
        if (denominator !== 0) { // Avoid division by zero
             h = Math.acos(numerator / denominator);
        }

        if (b > g) {
            h = 2 * Math.PI - h;
        }
    }


    // Scaling to 0-255 range for display (p5.js pixel values)
    return [h * (255 / (2 * Math.PI)), s * 255, i * 255];
}