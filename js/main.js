// Configure Tesseract.js
window.Tesseract = Tesseract.create({
    workerPath: 'https://cdn.rawgit.com/naptha/tesseract.js/0.2.0/dist/worker.js',
    corePath: 'https://cdn.rawgit.com/naptha/tesseract.js-core/0.1.0/index.js',
    langPath: 'https://cdn.rawgit.com/naptha/tessdata/gh-pages/3.02/'
});

// DOM elements
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const browseBtn = document.getElementById('browseBtn');
const cameraBtn = document.getElementById('cameraBtn');
const dropArea = document.getElementById('dropArea');
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzeSpinner = document.getElementById('analyzeSpinner');
const resultsCard = document.getElementById('resultsCard');

// Camera elements
const cameraModal = new bootstrap.Modal(document.getElementById('cameraModal'));
const cameraStream = document.getElementById('cameraStream');
const cameraCanvas = document.getElementById('cameraCanvas');
const captureBtn = document.getElementById('captureBtn');

let selectedFile = null;
let processing = false;
let stream = null;

// OCR result elements
const ocrProgress = document.getElementById('ocrProgress');
const ocrStatus = document.getElementById('ocrStatus');
const ocrConfidence = document.getElementById('ocrConfidence');
const transcribedText = document.getElementById('transcribedText');

// Graphology result elements
const mResult = document.getElementById('mResult');
const mResult2 = document.getElementById('mResult2');
const graphologyText = document.getElementById('graphologyText');
const graphologyProb = document.getElementById('graphologyProb');

// Canvas for symbol detection
const imgCanvas = document.getElementById('imgCanvas');
const ctx = imgCanvas.getContext('2d');

let selectedFile = null;
let processing = false;

// Event listeners
browseBtn.addEventListener('click', () => fileInput.click());
cameraBtn.addEventListener('click', openCamera);
fileInput.addEventListener('change', handleFileSelect);
cameraInput.addEventListener('change', handleFileSelect);
captureBtn.addEventListener('click', captureImage);
analyzeBtn.addEventListener('click', analyzeHandwriting);
dropArea.addEventListener('dragover', handleDragOver);
dropArea.addEventListener('drop', handleDrop);

// Handle camera modal close event
document.getElementById('cameraModal').addEventListener('hidden.bs.modal', function () {
    // Stop all tracks in the stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
});

// Handle file selection via browse button
function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        analyzeBtn.disabled = false;
    }
}

// Handle drag over event
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.add('bg-primary');
}

// Handle drop event
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('bg-primary');
    
    if (e.dataTransfer.files.length > 0) {
        selectedFile = e.dataTransfer.files[0];
        analyzeBtn.disabled = false;
    }
}

// Analyze handwriting
async function analyzeHandwriting() {
    if (processing || !selectedFile) return;
    
    processing = true;
    analyzeBtn.disabled = true;
    analyzeSpinner.classList.remove('d-none');
    resultsCard.style.display = 'block';
    
    try {
        // Reset UI
        ocrProgress.style.width = '0%';
        ocrStatus.textContent = 'Starting OCR...';
        ocrConfidence.textContent = '0%';
        transcribedText.textContent = 'Processing...';
        graphologyText.textContent = 'Analyzing...';
        graphologyProb.textContent = '0%';
        
        // Perform OCR with Tesseract
        const result = await Tesseract.recognize(selectedFile)
            .progress(progress => {
                const percent = Math.floor(progress.progress * 100);
                ocrProgress.style.width = percent + '%';
                ocrStatus.textContent = progress.status;
            });
        
        // Update OCR results
        transcribedText.textContent = result.text || 'No text detected';
        ocrConfidence.textContent = (result.confidence || 0).toFixed(2) + '%';
        ocrStatus.textContent = 'OCR Complete';
        
        // Process image for graphology analysis
        await processImageForGraphology(selectedFile, result);
    } catch (error) {
        console.error('Error during analysis:', error);
        ocrStatus.textContent = 'Error: ' + error.message;
        transcribedText.textContent = 'Analysis failed';
    } finally {
        processing = false;
        analyzeBtn.disabled = false;
        analyzeSpinner.classList.add('d-none');
    }
}

// Process image for graphology analysis
async function processImageForGraphology(file, ocrResult) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            
            img.onload = function() {
                // Set canvas dimensions
                imgCanvas.width = Math.min(img.width, 800);
                imgCanvas.height = img.height * (imgCanvas.width / img.width);
                
                // Draw image on canvas
                ctx.drawImage(img, 0, 0, imgCanvas.width, imgCanvas.height);
                
                // Find 'M' characters in OCR results
                let selectedChar = { confidence: 0 };
                
                if (ocrResult.symbols) {
                    for (let i = 0; i < ocrResult.symbols.length; i++) {
                        const s = ocrResult.symbols[i];
                        
                        // Map coordinates to canvas size
                        s.bbox.x0 = imgCanvas.width * s.bbox.x0 / img.width;
                        s.bbox.x1 = imgCanvas.width * s.bbox.x1 / img.width;
                        s.bbox.y0 = imgCanvas.height * s.bbox.y0 / img.height;
                        s.bbox.y1 = imgCanvas.height * s.bbox.y1 / img.height;
                        
                        // Draw bounding boxes for symbols with confidence > 50%
                        if (s.confidence > 50) {
                            ctx.beginPath();
                            ctx.strokeStyle = '#00ff00';
                            ctx.lineWidth = 2;
                            ctx.rect(
                                s.bbox.x0 - 2,
                                s.bbox.y0 - 2,
                                s.bbox.x1 - s.bbox.x0 + 4,
                                s.bbox.y1 - s.bbox.y0 + 4
                            );
                            ctx.stroke();
                        }
                        
                        // Select the 'M' with highest confidence
                        if (s.text.toUpperCase() === 'M' && s.confidence > selectedChar.confidence) {
                            selectedChar = s;
                        }
                    }
                }
                
                // If we found an 'M', process it for graphology analysis
                if (selectedChar.confidence > 0) {
                    extractAndAnalyzeM(selectedChar, imgCanvas);
                } else {
                    graphologyText.textContent = "No 'M' character detected in the text";
                    graphologyProb.textContent = "N/A";
                }
                
                resolve();
            };
            
            img.src = e.target.result;
        };
        
        reader.readAsDataURL(file);
    });
}

// Extract 'M' character and analyze it
function extractAndAnalyzeM(selectedChar, canvas) {
    // Create a canvas for the extracted 'M'
    const canvasM = document.createElement('canvas');
    const ctxM = canvasM.getContext('2d');
    
    // Set dimensions with padding
    const padding = 10;
    canvasM.width = (selectedChar.bbox.x1 - selectedChar.bbox.x0) + padding * 2;
    canvasM.height = (selectedChar.bbox.y1 - selectedChar.bbox.y0) + padding * 2;
    
    // Draw the 'M' on the new canvas with padding
    ctxM.drawImage(
        canvas,
        selectedChar.bbox.x0,
        selectedChar.bbox.y0,
        selectedChar.bbox.x1 - selectedChar.bbox.x0,
        selectedChar.bbox.y1 - selectedChar.bbox.y0,
        padding,
        padding,
        selectedChar.bbox.x1 - selectedChar.bbox.x0,
        selectedChar.bbox.y1 - selectedChar.bbox.y0
    );
    
    // Display the extracted 'M'
    mResult.src = canvasM.toDataURL();
    
    // Process the image for TensorFlow model
    processForTensorFlow(canvasM, ctxM);
}

// Process image for TensorFlow model
function processForTensorFlow(canvasM, ctxM) {
    // Get image data
    let imgData = ctxM.getImageData(0, 0, canvasM.width, canvasM.height);
    
    // Apply preprocessing
    imgData = blackAndWhite(imgData);
    imgData = addPadding(ctxM, imgData);
    ctxM.putImageData(imgData, 0, 0);
    
    // Display processed image
    mResult2.width = 28;
    mResult2.height = 28;
    const ctx2 = mResult2.getContext('2d');
    ctx2.drawImage(canvasM, 0, 0, 28, 28);
    
    // Get final image data for prediction
    const finalImgData = ctx2.getImageData(0, 0, 28, 28);
    predictWithModel(finalImgData);
}

// Convert to black and white
function blackAndWhite(imageData) {
    const pixels = imageData.data;
    
    for (let i = 0, n = pixels.length; i < n; i += 4) {
        const R = pixels[i];
        const G = pixels[i + 1];
        const B = pixels[i + 2];
        const gray = 0.299 * R + 0.587 * G + 0.114 * B;
        
        if (gray > 140) {
            pixels[i] = 0;        // red
            pixels[i + 1] = 0;    // green
            pixels[i + 2] = 0;    // blue
        } else {
            pixels[i] = 255;      // red
            pixels[i + 1] = 255;  // green
            pixels[i + 2] = 255;  // blue
        }
    }
    
    return imageData;
}

// Add padding to image
function addPadding(ctx, imageData) {
    const padding = Math.floor(imageData.width * 0.15); // 15% padding
    const newWidth = imageData.width + padding * 2;
    const newHeight = imageData.height + padding * 2;
    
    // Create new canvas with padding
    const newCanvas = document.createElement('canvas');
    newCanvas.width = newWidth;
    newCanvas.height = newHeight;
    const newCtx = newCanvas.getContext('2d');
    
    // Fill with black
    newCtx.fillStyle = 'black';
    newCtx.fillRect(0, 0, newWidth, newHeight);
    
    // Draw original image with padding
    newCtx.putImageData(imageData, padding, padding);
    
    return newCtx.getImageData(0, 0, newWidth, newHeight);
}

// Predict using TensorFlow model
async function predictWithModel(imageData) {
    try {
        // Load the model
        const model = await tf.loadModel('./model/model.json');
        
        // Reshape image data for model input
        const pixels = [];
        for (let i = 0, n = imageData.data.length; i < n; i += 4) {
            pixels.push(imageData.data[i] / 255); // Normalize to 0-1
        }
        
        // Make prediction
        const prediction = model.predict(tf.tensor2d([pixels], [1, 784]));
        const probabilities = prediction.dataSync();
        
        const probWorried = probabilities[0];
        const probNotWorried = probabilities[1];
        
        // Update UI with results
        if (probWorried > probNotWorried) {
            graphologyText.textContent = "Shown by the increasing height of the humps on the m's. We predicted that this person has a little fear of being ridiculed and tends to worry what others might think when around strangers.";
            graphologyProb.textContent = (probWorried * 100).toFixed(2) + "%";
        } else {
            graphologyText.textContent = "Shown by the decreasing height of the humps on the m's. We predicted that this person doesn't tend to worry about what strangers might think about him/her.";
            graphologyProb.textContent = (probNotWorried * 100).toFixed(2) + "%";
        }
    } catch (error) {
        console.error('Error during prediction:', error);
        graphologyText.textContent = "Error during analysis: " + error.message;
        graphologyProb.textContent = "N/A";
    }
}

// Open camera for capturing image
async function openCamera() {
    // Check if we're on a secure context (HTTPS)
    if (!window.isSecureContext) {
        alert('Camera access requires a secure connection (HTTPS). Please ensure you are accessing this site via HTTPS.');
        cameraInput.click(); // Fallback to file input
        return;
    }
    
    try {
        // Request camera access
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        // Set the video stream
        cameraStream.srcObject = stream;
        
        // Show the camera modal
        cameraModal.show();
    } catch (error) {
        console.error('Error accessing camera:', error);
        
        // Handle different error types
        if (error.name === 'NotAllowedError') {
            alert('Camera access was denied. Please allow camera access in your browser settings.');
        } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
            alert('No camera found or camera not supported.');
        } else {
            alert('Error accessing camera: ' + error.message);
        }
        
        // Fallback to file input if camera is not available
        cameraInput.click();
    }
}

// Capture image from camera
function captureImage() {
    // Set canvas dimensions to match video
    cameraCanvas.width = cameraStream.videoWidth;
    cameraCanvas.height = cameraStream.videoHeight;
    
    // Draw video frame to canvas
    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraStream, 0, 0, cameraCanvas.width, cameraCanvas.height);
    
    // Convert to blob and create file object
    cameraCanvas.toBlob(blob => {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        selectedFile = file;
        analyzeBtn.disabled = false;
        
        // Stop camera stream
        stream.getTracks().forEach(track => track.stop());
        cameraModal.hide();
    }, 'image/jpeg');
}