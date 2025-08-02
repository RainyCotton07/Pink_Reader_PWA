// Pink Reader PWA - Image Viewer Component

/**
 * ImageViewer class - Handles image display with zoom and pan functionality
 * Equivalent to the Swift ImageReaderView component
 */
class ImageViewer {
  constructor(containerElement, mediaManager) {
    this.container = containerElement;
    this.mediaManager = mediaManager;
    
    // DOM elements
    this.imageElement = null;
    this.imageContainer = null;
    this.zoomInButton = null;
    this.zoomOutButton = null;
    this.zoomResetButton = null;
    
    // State
    this.currentFile = null;
    this.scale = 1.0;
    this.minScale = 0.1;
    this.maxScale = 5.0;
    this.panOffset = { x: 0, y: 0 };
    this.imageNaturalSize = { width: 0, height: 0 };
    this.containerSize = { width: 0, height: 0 };
    
    // Interaction state
    this.isDragging = false;
    this.lastPointerPos = { x: 0, y: 0 };
    this.initialPinchDistance = 0;
    this.initialScale = 1.0;
    this.lastPinchCenter = { x: 0, y: 0 };
    
    // Animation
    this.animationId = null;
    
    this.init();
  }

  /**
   * Initialize image viewer
   */
  init() {
    this.setupDOM();
    this.setupEventListeners();
    
    // Listen for media manager events
    this.mediaManager.on('currentFileChanged', (file) => {
      if (file && file.mediaType === 'image') {
        this.loadImage(file);
      } else {
        // Clear image if switching to different media type or no file
        if (this.currentFile && this.currentFile.mediaType === 'image') {
          this.clearImage();
        }
      }
    });
  }

  /**
   * Setup DOM elements
   */
  setupDOM() {
    this.imageContainer = this.container.querySelector('.image-container');
    this.imageElement = this.container.querySelector('#image-display');
    
    this.zoomInButton = this.container.querySelector('#zoom-in');
    this.zoomOutButton = this.container.querySelector('#zoom-out');
    this.zoomResetButton = this.container.querySelector('#zoom-reset');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Zoom buttons
    this.zoomInButton?.addEventListener('click', () => this.zoomIn());
    this.zoomOutButton?.addEventListener('click', () => this.zoomOut());
    this.zoomResetButton?.addEventListener('click', () => this.resetZoom());
    
    // Image element events
    if (this.imageElement) {
      this.boundImageLoad = this.onImageLoad.bind(this);
      this.boundImageError = this.onImageError.bind(this);
      
      this.imageElement.addEventListener('load', this.boundImageLoad);
      this.imageElement.addEventListener('error', this.boundImageError);
      
      // Mouse events
      this.imageElement.addEventListener('mousedown', (e) => this.handlePointerStart(e));
      this.imageElement.addEventListener('mousemove', (e) => this.handlePointerMove(e));
      this.imageElement.addEventListener('mouseup', (e) => this.handlePointerEnd(e));
      this.imageElement.addEventListener('mouseleave', (e) => this.handlePointerEnd(e));
      this.imageElement.addEventListener('wheel', (e) => this.handleWheel(e));
      
      // Touch events
      this.imageElement.addEventListener('touchstart', (e) => this.handleTouchStart(e));
      this.imageElement.addEventListener('touchmove', (e) => this.handleTouchMove(e));
      this.imageElement.addEventListener('touchend', (e) => this.handleTouchEnd(e));
      
      // Double-click to zoom
      this.imageElement.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
      
      // Prevent context menu
      this.imageElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    // Container resize
    if (this.imageContainer) {
      const resizeObserver = new ResizeObserver(() => {
        this.updateContainerSize();
        this.fitImageToContainer();
      });
      resizeObserver.observe(this.imageContainer);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.currentFile || this.currentFile.mediaType !== 'image') return;
      
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          this.zoomIn();
          break;
        case '-':
          e.preventDefault();
          this.zoomOut();
          break;
        case '0':
          e.preventDefault();
          this.resetZoom();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.fitImageToContainer();
          break;
      }
    });
  }

  /**
   * Load image file
   */
  async loadImage(file) {
    try {
      this.currentFile = file;
      this.setLoadingState(true);
      
      // Reset previous state
      this.resetTransform();
      
      // Get file data from MediaManager
      const fileBlob = await this.mediaManager.getFileData(file.id);
      const imageUrl = URL.createObjectURL(fileBlob);
      
      // Load image
      this.imageElement.src = imageUrl;
      
      console.log(`Image loaded: ${file.fileName}`);
    } catch (error) {
      console.error('Failed to load image:', error);
      Utils.showToast('画像の読み込みに失敗しました', 'error');
      this.onImageError();
    }
  }

  /**
   * Clear current image
   */
  clearImage() {
    if (this.imageElement) {
      // Remove event listeners temporarily to prevent error events
      this.imageElement.removeEventListener('load', this.boundImageLoad);
      this.imageElement.removeEventListener('error', this.boundImageError);
      
      // Revoke old object URL to prevent memory leaks
      if (this.imageElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.imageElement.src);
      }
      this.imageElement.src = '';
      
      // Re-add event listeners
      this.imageElement.addEventListener('load', this.boundImageLoad);
      this.imageElement.addEventListener('error', this.boundImageError);
    }
    
    this.currentFile = null;
    this.resetTransform();
    this.setLoadingState(false);
  }

  /**
   * Handle image load event
   */
  onImageLoad() {
    this.imageNaturalSize = {
      width: this.imageElement.naturalWidth,
      height: this.imageElement.naturalHeight
    };
    
    this.updateContainerSize();
    
    // Ensure image is properly displayed and sized
    setTimeout(() => {
      this.fitImageToContainer();
      this.centerImage();
    }, 50);
    
    this.setLoadingState(false);
    
    // Update controls state
    this.updateControls();
  }

  /**
   * Handle image error event
   */
  onImageError() {
    // Only show error if we're actually trying to display an image
    if (this.currentFile && this.currentFile.mediaType === 'image') {
      console.error('Failed to load image');
      Utils.showToast('画像を開けませんでした', 'error');
    }
    this.setLoadingState(false);
  }

  /**
   * Update container size
   */
  updateContainerSize() {
    if (this.imageContainer) {
      const rect = this.imageContainer.getBoundingClientRect();
      this.containerSize = {
        width: Math.max(rect.width, 300), // Minimum width
        height: Math.max(rect.height, 200) // Minimum height
      };
    }
  }

  /**
   * Fit image to container
   */
  fitImageToContainer() {
    if (!this.imageNaturalSize.width || !this.imageNaturalSize.height || 
        !this.containerSize.width || !this.containerSize.height) {
      return;
    }
    
    const containerAspect = this.containerSize.width / this.containerSize.height;
    const imageAspect = this.imageNaturalSize.width / this.imageNaturalSize.height;
    
    let fitScale;
    if (imageAspect > containerAspect) {
      // Image is wider - fit to width
      fitScale = (this.containerSize.width - 40) / this.imageNaturalSize.width;
    } else {
      // Image is taller - fit to height
      fitScale = (this.containerSize.height - 40) / this.imageNaturalSize.height;
    }
    
    // Allow scaling up to fill container, but limit maximum scale
    fitScale = Math.min(fitScale, 3.0);
    fitScale = Math.max(fitScale, 0.1);
    
    this.setScale(fitScale);
  }

  /**
   * Center image in container
   */
  centerImage() {
    if (!this.imageElement || !this.imageContainer) return;
    
    // Reset transform first to get accurate measurements
    this.imageElement.style.transform = `scale(${this.scale})`;
    
    const scaledWidth = this.imageNaturalSize.width * this.scale;
    const scaledHeight = this.imageNaturalSize.height * this.scale;
    
    const centerX = (this.containerSize.width - scaledWidth) / 2;
    const centerY = (this.containerSize.height - scaledHeight) / 2;
    
    this.panOffset = { x: centerX, y: centerY };
    this.applyTransform();
  }

  /**
   * Set scale with bounds checking
   */
  setScale(newScale, zoomCenter = null) {
    const clampedScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    
    if (clampedScale === this.scale) return;
    
    if (zoomCenter) {
      // Adjust pan offset to zoom around specific point
      const scaleRatio = clampedScale / this.scale;
      this.panOffset.x = zoomCenter.x - (zoomCenter.x - this.panOffset.x) * scaleRatio;
      this.panOffset.y = zoomCenter.y - (zoomCenter.y - this.panOffset.y) * scaleRatio;
    }
    
    this.scale = clampedScale;
    this.applyTransform();
    this.updateControls();
  }

  /**
   * Apply current transform to image
   */
  applyTransform() {
    if (this.imageElement) {
      // Set natural size first, then apply scale and translation
      this.imageElement.style.width = `${this.imageNaturalSize.width}px`;
      this.imageElement.style.height = `${this.imageNaturalSize.height}px`;
      this.imageElement.style.transform = 
        `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.scale})`;
    }
  }

  /**
   * Reset transform to initial state
   */
  resetTransform() {
    this.scale = 1.0;
    this.panOffset = { x: 0, y: 0 };
    
    if (this.imageElement) {
      this.imageElement.style.transform = 'translate(0px, 0px) scale(1)';
    }
    
    this.updateControls();
  }

  /**
   * Zoom in
   */
  zoomIn() {
    const containerCenter = {
      x: this.containerSize.width / 2,
      y: this.containerSize.height / 2
    };
    this.setScale(this.scale * 1.25, containerCenter);
  }

  /**
   * Zoom out
   */
  zoomOut() {
    const containerCenter = {
      x: this.containerSize.width / 2,
      y: this.containerSize.height / 2
    };
    this.setScale(this.scale * 0.8, containerCenter);
  }

  /**
   * Reset zoom to fit container
   */
  resetZoom() {
    this.fitImageToContainer();
    this.centerImage();
  }

  /**
   * Handle pointer start (mouse/touch)
   */
  handlePointerStart(e) {
    if (!this.currentFile) return;
    
    this.isDragging = true;
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
    this.imageElement.style.cursor = 'grabbing';
    
    e.preventDefault();
  }

  /**
   * Handle pointer move
   */
  handlePointerMove(e) {
    if (!this.isDragging || !this.currentFile) return;
    
    const dx = e.clientX - this.lastPointerPos.x;
    const dy = e.clientY - this.lastPointerPos.y;
    
    this.panOffset.x += dx;
    this.panOffset.y += dy;
    
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
    this.applyTransform();
    
    e.preventDefault();
  }

  /**
   * Handle pointer end
   */
  handlePointerEnd(e) {
    this.isDragging = false;
    this.imageElement.style.cursor = 'grab';
    
    e.preventDefault();
  }

  /**
   * Handle wheel zoom
   */
  handleWheel(e) {
    if (!this.currentFile) return;
    
    e.preventDefault();
    
    const rect = this.imageElement.getBoundingClientRect();
    const zoomCenter = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    this.setScale(this.scale * zoomFactor, zoomCenter);
  }

  /**
   * Handle touch start
   */
  handleTouchStart(e) {
    if (!this.currentFile) return;
    
    if (e.touches.length === 1) {
      // Single touch - start panning
      const touch = e.touches[0];
      this.handlePointerStart({ clientX: touch.clientX, clientY: touch.clientY });
    } else if (e.touches.length === 2) {
      // Two touches - start pinch zoom
      this.isDragging = false; // Stop panning
      this.startPinchZoom(e);
    }
    
    e.preventDefault();
  }

  /**
   * Handle touch move
   */
  handleTouchMove(e) {
    if (!this.currentFile) return;
    
    if (e.touches.length === 1 && this.isDragging) {
      // Single touch - continue panning
      const touch = e.touches[0];
      this.handlePointerMove({ clientX: touch.clientX, clientY: touch.clientY });
    } else if (e.touches.length === 2) {
      // Two touches - continue pinch zoom
      this.continuePinchZoom(e);
    }
    
    e.preventDefault();
  }

  /**
   * Handle touch end
   */
  handleTouchEnd(e) {
    if (e.touches.length === 0) {
      // All touches ended
      this.handlePointerEnd(e);
      this.endPinchZoom();
    } else if (e.touches.length === 1) {
      // One touch remaining - switch to panning
      this.endPinchZoom();
      const touch = e.touches[0];
      this.handlePointerStart({ clientX: touch.clientX, clientY: touch.clientY });
    }
    
    e.preventDefault();
  }

  /**
   * Start pinch zoom
   */
  startPinchZoom(e) {
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    this.initialPinchDistance = this.getTouchDistance(touch1, touch2);
    this.initialScale = this.scale;
    this.lastPinchCenter = this.getTouchCenter(touch1, touch2);
  }

  /**
   * Continue pinch zoom
   */
  continuePinchZoom(e) {
    if (e.touches.length !== 2) return;
    
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const currentDistance = this.getTouchDistance(touch1, touch2);
    const currentCenter = this.getTouchCenter(touch1, touch2);
    
    if (this.initialPinchDistance > 0) {
      const scaleChange = currentDistance / this.initialPinchDistance;
      const newScale = this.initialScale * scaleChange;
      
      // Convert touch coordinates to image coordinates
      const rect = this.imageContainer.getBoundingClientRect();
      const zoomCenter = {
        x: currentCenter.x - rect.left,
        y: currentCenter.y - rect.top
      };
      
      this.setScale(newScale, zoomCenter);
    }
  }

  /**
   * End pinch zoom
   */
  endPinchZoom() {
    this.initialPinchDistance = 0;
    this.initialScale = 1.0;
  }

  /**
   * Get distance between two touches
   */
  getTouchDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get center point between two touches
   */
  getTouchCenter(touch1, touch2) {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  }

  /**
   * Handle double-click to zoom
   */
  handleDoubleClick(e) {
    if (!this.currentFile) return;
    
    e.preventDefault();
    
    const rect = this.imageElement.getBoundingClientRect();
    const clickPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    if (this.scale > 1.5) {
      // Zoom out to fit
      this.fitImageToContainer();
    } else {
      // Zoom in to 2x
      this.setScale(2.0, clickPoint);
    }
  }

  /**
   * Update control buttons state
   */
  updateControls() {
    if (this.zoomInButton) {
      this.zoomInButton.disabled = this.scale >= this.maxScale;
    }
    if (this.zoomOutButton) {
      this.zoomOutButton.disabled = this.scale <= this.minScale;
    }
    if (this.zoomResetButton) {
      this.zoomResetButton.disabled = !this.currentFile;
    }
  }

  /**
   * Set loading state
   */
  setLoadingState(loading) {
    if (loading) {
      this.container.classList.add('loading');
    } else {
      this.container.classList.remove('loading');
    }
  }

  /**
   * Get current zoom info
   */
  getZoomInfo() {
    return {
      scale: this.scale,
      minScale: this.minScale,
      maxScale: this.maxScale,
      panOffset: { ...this.panOffset },
      imageSize: { ...this.imageNaturalSize },
      containerSize: { ...this.containerSize }
    };
  }

  /**
   * Set zoom info (for restoring state)
   */
  setZoomInfo(info) {
    this.scale = info.scale || 1.0;
    this.panOffset = info.panOffset || { x: 0, y: 0 };
    this.applyTransform();
    this.updateControls();
  }

  /**
   * Dispose viewer resources
   */
  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    this.clearImage();
    this.currentFile = null;
  }
}

// Make ImageViewer available globally
window.ImageViewer = ImageViewer;