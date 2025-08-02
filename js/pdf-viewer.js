// Pink Reader PWA - PDF Viewer Component

/**
 * PDFViewer class - Handles PDF rendering and interaction using PDF.js
 * Equivalent to the Swift PDFReaderView and related components
 */
class PDFViewer {
  constructor(containerElement, mediaManager) {
    this.container = containerElement;
    this.mediaManager = mediaManager;
    
    // PDF.js objects
    this.pdfDocument = null;
    this.currentPage = 1;
    this.totalPages = 1;
    this.scale = 1.0;
    this.rotation = 0;
    
    // DOM elements
    this.canvas = null;
    this.context = null;
    this.pageNumElement = null;
    this.pageCountElement = null;
    this.pageSlider = null;
    this.prevButton = null;
    this.nextButton = null;
    this.toggleLayoutButton = null;
    
    // State
    this.isRendering = false;
    this.isTwoPageMode = false;
    this.currentFile = null;
    this.renderTask = null;
    
    // Gesture handling
    this.isDragging = false;
    this.lastPanPoint = { x: 0, y: 0 };
    this.panOffset = { x: 0, y: 0 };
    this.zoomCenter = { x: 0, y: 0 };
    
    this.init();
  }

  /**
   * Initialize PDF viewer
   */
  init() {
    this.setupDOM();
    this.setupEventListeners();
    this.setupPDFjs();
    
    // Listen for media manager events
    this.mediaManager.on('currentFileChanged', (file) => {
      if (file && file.mediaType === 'pdf') {
        this.loadPDF(file);
      } else {
        // Clear PDF if switching to different media type or no file
        if (this.currentFile && this.currentFile.mediaType === 'pdf') {
          this.clearPDF();
        }
      }
    });
    
    this.mediaManager.on('settingsChanged', (settings) => {
      if (settings.isTwoPageMode !== this.isTwoPageMode) {
        this.isTwoPageMode = settings.isTwoPageMode;
        this.updateLayout();
      }
    });
  }

  /**
   * Setup DOM elements
   */
  setupDOM() {
    this.canvas = this.container.querySelector('#pdf-canvas');
    this.context = this.canvas.getContext('2d');
    
    this.pageNumElement = this.container.querySelector('#page-num');
    this.pageCountElement = this.container.querySelector('#page-count');
    this.pageSlider = this.container.querySelector('#page-slider');
    
    this.prevButton = this.container.querySelector('#prev-page');
    this.nextButton = this.container.querySelector('#next-page');
    this.toggleLayoutButton = this.container.querySelector('#toggle-layout');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Page navigation
    this.prevButton?.addEventListener('click', () => this.previousPage());
    this.nextButton?.addEventListener('click', () => this.nextPage());
    
    // Page slider
    this.pageSlider?.addEventListener('input', (e) => {
      this.goToPage(parseInt(e.target.value));
    });
    
    // Layout toggle
    this.toggleLayoutButton?.addEventListener('click', () => {
      this.mediaManager.toggleTwoPageMode();
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.currentFile || this.currentFile.mediaType !== 'pdf') return;
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          this.previousPage();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          this.nextPage();
          break;
        case 'Home':
          e.preventDefault();
          this.goToPage(1);
          break;
        case 'End':
          e.preventDefault();
          this.goToPage(this.totalPages);
          break;
      }
    });

    // Canvas interaction for zoom and pan
    this.setupCanvasInteraction();
    
    // Window resize
    window.addEventListener('resize', Utils.debounce(() => {
      if (this.currentFile) {
        this.renderPage();
      }
    }, 250));
  }

  /**
   * Setup canvas interaction (zoom, pan)
   */
  setupCanvasInteraction() {
    if (!this.canvas) return;

    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.handlePanStart(e));
    this.canvas.addEventListener('mousemove', (e) => this.handlePanMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handlePanEnd(e));
    this.canvas.addEventListener('wheel', (e) => this.handleZoom(e));
    
    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    
    // Prevent context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Setup PDF.js
   */
  setupPDFjs() {
    if (typeof pdfjsLib !== 'undefined') {
      // Configure PDF.js worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  /**
   * Load PDF file
   */
  async loadPDF(file) {
    try {
      this.currentFile = file;
      
      // Show loading state
      this.setLoadingState(true);
      
      // Get file data from MediaManager
      const fileBlob = await this.mediaManager.getFileData(file.id);
      const arrayBuffer = await fileBlob.arrayBuffer();
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument(arrayBuffer);
      this.pdfDocument = await loadingTask.promise;
      
      this.totalPages = this.pdfDocument.numPages;
      this.currentPage = file.lastViewedPage || 1;
      
      // Update UI
      this.updatePageInfo();
      this.updateControls();
      
      // Render first page
      await this.renderPage();
      
      this.setLoadingState(false);
      
      console.log(`PDF loaded: ${file.fileName}, ${this.totalPages} pages`);
    } catch (error) {
      console.error('Failed to load PDF:', error);
      Utils.showToast('PDFの読み込みに失敗しました', 'error');
      this.setLoadingState(false);
    }
  }

  /**
   * Clear current PDF
   */
  clearPDF() {
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }
    
    this.pdfDocument = null;
    this.currentFile = null;
    this.currentPage = 1;
    this.totalPages = 1;
    this.scale = 1.0;
    this.panOffset = { x: 0, y: 0 };
    
    // Clear canvas
    if (this.context && this.canvas) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    this.updatePageInfo();
    this.updateControls();
  }

  /**
   * Render current page
   */
  async renderPage() {
    if (!this.pdfDocument || this.isRendering) return;
    
    try {
      this.isRendering = true;
      
      // Cancel previous render task
      if (this.renderTask) {
        this.renderTask.cancel();
      }
      
      // Get page
      const page = await this.pdfDocument.getPage(this.currentPage);
      
      // Calculate scale and viewport
      const containerRect = this.canvas.parentElement.getBoundingClientRect();
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Calculate scale to fit container
      const scaleX = (containerRect.width - 40) / viewport.width;
      const scaleY = (containerRect.height - 40) / viewport.height;
      const fitScale = Math.min(scaleX, scaleY, 2.0); // Max scale 2.0
      
      this.scale = fitScale;
      const scaledViewport = page.getViewport({ 
        scale: this.scale,
        rotation: this.rotation
      });
      
      // Set canvas size
      this.canvas.width = scaledViewport.width;
      this.canvas.height = scaledViewport.height;
      
      // Apply pan offset
      this.canvas.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
      
      // Render page
      const renderContext = {
        canvasContext: this.context,
        viewport: scaledViewport
      };
      
      this.renderTask = page.render(renderContext);
      await this.renderTask.promise;
      
      this.renderTask = null;
      
      // Save current page to MediaManager
      if (this.currentFile) {
        this.mediaManager.updateLastViewedPage(this.currentFile, this.currentPage);
      }
      
    } catch (error) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('Failed to render page:', error);
      }
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Go to specific page
   */
  async goToPage(pageNumber) {
    if (!this.pdfDocument) return;
    
    const page = Math.max(1, Math.min(pageNumber, this.totalPages));
    if (page === this.currentPage) return;
    
    this.currentPage = page;
    this.updatePageInfo();
    await this.renderPage();
  }

  /**
   * Go to previous page
   */
  previousPage() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  /**
   * Go to next page
   */
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  /**
   * Update page information display
   */
  updatePageInfo() {
    if (this.pageNumElement) {
      this.pageNumElement.textContent = this.currentPage;
    }
    if (this.pageCountElement) {
      this.pageCountElement.textContent = this.totalPages;
    }
    if (this.pageSlider) {
      this.pageSlider.min = '1';
      this.pageSlider.max = this.totalPages.toString();
      this.pageSlider.value = this.currentPage.toString();
    }
  }

  /**
   * Update control buttons state
   */
  updateControls() {
    if (this.prevButton) {
      this.prevButton.disabled = this.currentPage <= 1;
    }
    if (this.nextButton) {
      this.nextButton.disabled = this.currentPage >= this.totalPages;
    }
    if (this.toggleLayoutButton) {
      this.toggleLayoutButton.textContent = this.isTwoPageMode ? '📄' : '📖';
      this.toggleLayoutButton.title = this.isTwoPageMode ? 'シングルページ' : 'ツーページ';
    }
  }

  /**
   * Update layout based on settings
   */
  updateLayout() {
    this.updateControls();
    if (this.currentFile) {
      this.renderPage();
    }
  }

  /**
   * Handle zoom with mouse wheel
   */
  handleZoom(e) {
    if (!this.currentFile) return;
    
    e.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(3.0, this.scale * zoomFactor));
    
    if (newScale !== this.scale) {
      // Calculate zoom center
      this.zoomCenter = { x, y };
      
      // Adjust pan offset for zoom center
      const scaleRatio = newScale / this.scale;
      this.panOffset.x = x - (x - this.panOffset.x) * scaleRatio;
      this.panOffset.y = y - (y - this.panOffset.y) * scaleRatio;
      
      this.scale = newScale;
      this.renderPage();
    }
  }

  /**
   * Handle pan start
   */
  handlePanStart(e) {
    if (!this.currentFile) return;
    
    this.isDragging = true;
    this.lastPanPoint = { x: e.clientX, y: e.clientY };
    this.canvas.style.cursor = 'grabbing';
  }

  /**
   * Handle pan move
   */
  handlePanMove(e) {
    if (!this.isDragging || !this.currentFile) return;
    
    const dx = e.clientX - this.lastPanPoint.x;
    const dy = e.clientY - this.lastPanPoint.y;
    
    this.panOffset.x += dx;
    this.panOffset.y += dy;
    
    this.lastPanPoint = { x: e.clientX, y: e.clientY };
    
    // Apply transform immediately for smooth panning
    this.canvas.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px)`;
  }

  /**
   * Handle pan end
   */
  handlePanEnd(e) {
    this.isDragging = false;
    this.canvas.style.cursor = 'grab';
  }

  /**
   * Handle touch start
   */
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      // Single touch - pan
      const touch = e.touches[0];
      this.handlePanStart({ clientX: touch.clientX, clientY: touch.clientY });
    }
    e.preventDefault();
  }

  /**
   * Handle touch move
   */
  handleTouchMove(e) {
    if (e.touches.length === 1 && this.isDragging) {
      // Single touch - pan
      const touch = e.touches[0];
      this.handlePanMove({ clientX: touch.clientX, clientY: touch.clientY });
    } else if (e.touches.length === 2) {
      // Pinch to zoom
      this.handlePinchZoom(e);
    }
    e.preventDefault();
  }

  /**
   * Handle touch end
   */
  handleTouchEnd(e) {
    this.handlePanEnd(e);
    e.preventDefault();
  }

  /**
   * Handle pinch to zoom
   */
  handlePinchZoom(e) {
    if (e.touches.length !== 2) return;
    
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const distance = Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
    
    if (this.lastPinchDistance) {
      const zoomFactor = distance / this.lastPinchDistance;
      const newScale = Math.max(0.5, Math.min(3.0, this.scale * zoomFactor));
      
      if (newScale !== this.scale) {
        // Calculate center point between touches
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        
        const rect = this.canvas.getBoundingClientRect();
        this.zoomCenter = { 
          x: centerX - rect.left, 
          y: centerY - rect.top 
        };
        
        // Adjust pan offset for zoom center
        const scaleRatio = newScale / this.scale;
        this.panOffset.x = this.zoomCenter.x - (this.zoomCenter.x - this.panOffset.x) * scaleRatio;
        this.panOffset.y = this.zoomCenter.y - (this.zoomCenter.y - this.panOffset.y) * scaleRatio;
        
        this.scale = newScale;
        this.renderPage();
      }
    }
    
    this.lastPinchDistance = distance;
  }

  /**
   * Reset zoom and pan
   */
  resetZoom() {
    this.scale = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.renderPage();
  }

  /**
   * Zoom in
   */
  zoomIn() {
    const newScale = Math.min(3.0, this.scale * 1.2);
    if (newScale !== this.scale) {
      this.scale = newScale;
      this.renderPage();
    }
  }

  /**
   * Zoom out
   */
  zoomOut() {
    const newScale = Math.max(0.5, this.scale * 0.8);
    if (newScale !== this.scale) {
      this.scale = newScale;
      this.renderPage();
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
   * Get current page info
   */
  getCurrentPageInfo() {
    return {
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      scale: this.scale,
      rotation: this.rotation
    };
  }

  /**
   * Dispose viewer resources
   */
  dispose() {
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }
    
    if (this.pdfDocument) {
      this.pdfDocument.destroy();
      this.pdfDocument = null;
    }
    
    this.currentFile = null;
  }
}

// Make PDFViewer available globally
window.PDFViewer = PDFViewer;