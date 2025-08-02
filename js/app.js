// Pink Reader PWA - Main Application

/**
 * PinkReaderApp - Main application class that orchestrates all components
 * Equivalent to the Swift PinkReaderApp and ContentView
 */
class PinkReaderApp {
  constructor() {
    // Core components
    this.mediaManager = null;
    this.pdfViewer = null;
    this.imageViewer = null;
    this.videoPlayer = null;
    
    // DOM elements
    this.loadingScreen = null;
    this.mainApp = null;
    this.sidebar = null;
    this.fileGrid = null;
    this.welcomeScreen = null;
    this.pdfViewerElement = null;
    this.imageViewerElement = null;
    this.videoViewerElement = null;
    this.fileInput = null;
    this.addFileButton = null;
    this.toggleSidebarButton = null;
    this.clearAllButton = null;
    this.tabsContainer = null;
    this.dropZone = null;
    this.contextMenu = null;
    
    // State
    this.currentContextFile = null;
    this.isDragOver = false;
    
    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      this.setupDOM();
      this.setupComponents();
      this.setupEventListeners();
      
      // Show main app after short delay for loading animation
      setTimeout(() => {
        this.showMainApp();
      }, 1500);
      
      console.log('Pink Reader PWA initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      Utils.showToast('アプリケーションの初期化に失敗しました', 'error');
    }
  }

  /**
   * Setup DOM elements
   */
  setupDOM() {
    // Main containers
    this.loadingScreen = document.getElementById('loading-screen');
    this.mainApp = document.getElementById('main-app');
    this.sidebar = document.getElementById('sidebar');
    this.fileGrid = document.getElementById('file-grid');
    this.welcomeScreen = document.getElementById('welcome-screen');
    
    // Viewers
    this.pdfViewerElement = document.getElementById('pdf-viewer');
    this.imageViewerElement = document.getElementById('image-viewer');
    this.videoViewerElement = document.getElementById('video-viewer');
    
    // Controls
    this.fileInput = document.getElementById('file-input');
    this.addFileButton = document.getElementById('add-file-btn');
    this.toggleSidebarButton = document.getElementById('toggle-sidebar');
    this.clearAllButton = document.getElementById('clear-all-btn');
    this.tabsContainer = document.getElementById('tabs');
    
    // Overlays
    this.dropZone = document.getElementById('drop-zone');
    this.contextMenu = document.getElementById('context-menu');
  }

  /**
   * Setup core components
   */
  async setupComponents() {
    // Initialize MediaManager
    this.mediaManager = new MediaManager();
    
    // Initialize viewers
    this.pdfViewer = new PDFViewer(this.pdfViewerElement, this.mediaManager);
    this.imageViewer = new ImageViewer(this.imageViewerElement, this.mediaManager);
    this.videoPlayer = new VideoPlayer(this.videoViewerElement, this.mediaManager);
    
    // Wait for MediaManager to initialize
    await new Promise(resolve => {
      const checkInit = () => {
        if (this.mediaManager.db) {
          resolve();
        } else {
          setTimeout(checkInit, 100);
        }
      };
      checkInit();
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // MediaManager events
    this.mediaManager.on('filesChanged', (files) => this.updateFileGrid(files));
    this.mediaManager.on('currentFileChanged', (file) => this.updateCurrentView(file));
    this.mediaManager.on('settingsChanged', (settings) => this.updateSettings(settings));
    
    // File input
    this.addFileButton?.addEventListener('click', () => this.openFileDialog());
    this.fileInput?.addEventListener('change', (e) => this.handleFileInput(e));
    
    // Sidebar toggle
    this.toggleSidebarButton?.addEventListener('click', () => this.toggleSidebar());
    
    // Clear all files
    this.clearAllButton?.addEventListener('click', () => this.confirmClearAll());
    
    // Drag and drop
    this.setupDragAndDrop();
    
    // Context menu
    this.setupContextMenu();
    
    // Window events
    window.addEventListener('resize', Utils.debounce(() => this.handleResize(), 250));
    window.addEventListener('beforeunload', () => this.cleanup());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    
    // Click outside to close context menu
    document.addEventListener('click', () => this.hideContextMenu());
  }

  /**
   * Setup drag and drop functionality
   */
  setupDragAndDrop() {
    // Prevent default drag behaviors on document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    // Handle drag enter/over
    ['dragenter', 'dragover'].forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        if (this.hasValidFiles(e.dataTransfer)) {
          this.showDropZone();
        }
      });
    });
    
    // Handle drag leave
    document.addEventListener('dragleave', (e) => {
      // Only hide if leaving the window
      if (e.clientX === 0 && e.clientY === 0) {
        this.hideDropZone();
      }
    });
    
    // Handle drop
    document.addEventListener('drop', async (e) => {
      this.hideDropZone();
      
      const files = Array.from(e.dataTransfer.files);
      const validFiles = files.filter(file => this.isValidFile(file));
      
      if (validFiles.length > 0) {
        await this.importFiles(validFiles);
      } else {
        Utils.showToast('サポートされていないファイル形式です', 'warning');
      }
    });
    
    // Drop zone specific events
    if (this.dropZone) {
      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      
      this.dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        this.hideDropZone();
        
        const files = Array.from(e.dataTransfer.files);
        const validFiles = files.filter(file => this.isValidFile(file));
        
        if (validFiles.length > 0) {
          await this.importFiles(validFiles);
        }
      });
    }
  }

  /**
   * Setup context menu
   */
  setupContextMenu() {
    const deleteButton = document.getElementById('delete-file');
    deleteButton?.addEventListener('click', () => {
      if (this.currentContextFile) {
        this.deleteFile(this.currentContextFile);
      }
      this.hideContextMenu();
    });
  }

  /**
   * Show main app (hide loading screen)
   */
  showMainApp() {
    if (this.loadingScreen) {
      this.loadingScreen.style.opacity = '0';
      setTimeout(() => {
        this.loadingScreen.style.display = 'none';
        this.mainApp?.classList.remove('hidden');
      }, 500);
    }
  }

  /**
   * Open file dialog
   */
  openFileDialog() {
    this.fileInput?.click();
  }

  /**
   * Handle file input change
   */
  async handleFileInput(e) {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => this.isValidFile(file));
    
    if (validFiles.length > 0) {
      await this.importFiles(validFiles);
    }
    
    // Reset input
    e.target.value = '';
  }

  /**
   * Import multiple files
   */
  async importFiles(files) {
    let importedCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        await this.mediaManager.addFile(file);
        importedCount++;
      } catch (error) {
        console.error(`Failed to import ${file.name}:`, error);
        errorCount++;
      }
    }
    
    // Show summary toast
    if (importedCount > 0) {
      const message = files.length === 1 
        ? `${files[0].name} を追加しました`
        : `${importedCount}個のファイルを追加しました`;
      Utils.showToast(message, 'success');
    }
    
    if (errorCount > 0) {
      Utils.showToast(`${errorCount}個のファイルの追加に失敗しました`, 'error');
    }
  }

  /**
   * Check if file is valid
   */
  isValidFile(file) {
    const mediaType = Utils.getMediaType(file.name);
    return ['pdf', 'image', 'video'].includes(mediaType);
  }

  /**
   * Check if drag data has valid files
   */
  hasValidFiles(dataTransfer) {
    if (!dataTransfer.items) return false;
    
    for (let item of dataTransfer.items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && this.isValidFile(file)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Show drop zone
   */
  showDropZone() {
    if (!this.isDragOver) {
      this.isDragOver = true;
      this.dropZone?.classList.remove('hidden');
    }
  }

  /**
   * Hide drop zone
   */
  hideDropZone() {
    this.isDragOver = false;
    this.dropZone?.classList.add('hidden');
  }

  /**
   * Update file grid display
   */
  updateFileGrid(files) {
    if (!this.fileGrid) return;
    
    this.fileGrid.innerHTML = '';
    
    files.forEach(file => {
      const thumbnail = this.createFileThumbnail(file);
      this.fileGrid.appendChild(thumbnail);
    });
    
    // Update tabs
    this.updateTabs(files);
  }

  /**
   * Create file thumbnail element
   */
  createFileThumbnail(file) {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'file-thumbnail';
    thumbnail.dataset.fileId = file.id;
    
    // Check if this is the current file
    if (this.mediaManager.currentFile && this.mediaManager.currentFile.id === file.id) {
      thumbnail.classList.add('selected');
    }
    
    thumbnail.innerHTML = `
      <img class="thumbnail-image" 
           src="${file.thumbnailDataUrl || Utils.getDefaultThumbnail(file.mediaType)}" 
           alt="${Utils.escapeHtml(file.fileName)}">
      <div class="file-type-icon">${this.getFileTypeIcon(file.mediaType)}</div>
      <div class="file-name">${Utils.escapeHtml(file.displayName)}</div>
    `;
    
    // Click handler
    thumbnail.addEventListener('click', () => {
      this.selectFile(file);
    });
    
    // Context menu handler
    thumbnail.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, file);
    });
    
    return thumbnail;
  }

  /**
   * Get file type icon
   */
  getFileTypeIcon(mediaType) {
    const icons = {
      pdf: '📄',
      image: '🖼️',
      video: '🎬'
    };
    return icons[mediaType] || '📄';
  }

  /**
   * Select file
   */
  selectFile(file) {
    this.mediaManager.setCurrentFile(file);
    this.updateFileSelection();
  }

  /**
   * Update file selection in grid
   */
  updateFileSelection() {
    const thumbnails = this.fileGrid?.querySelectorAll('.file-thumbnail');
    thumbnails?.forEach(thumb => {
      const fileId = thumb.dataset.fileId;
      if (this.mediaManager.currentFile && this.mediaManager.currentFile.id === fileId) {
        thumb.classList.add('selected');
      } else {
        thumb.classList.remove('selected');
      }
    });
  }

  /**
   * Update tabs display
   */
  updateTabs(files) {
    if (!this.tabsContainer) return;
    
    this.tabsContainer.innerHTML = '';
    
    files.forEach(file => {
      const tab = document.createElement('button');
      tab.className = 'tab-item';
      tab.dataset.fileId = file.id;
      tab.textContent = file.displayName;
      
      if (this.mediaManager.currentFile && this.mediaManager.currentFile.id === file.id) {
        tab.classList.add('active');
      }
      
      tab.addEventListener('click', () => this.selectFile(file));
      
      this.tabsContainer.appendChild(tab);
    });
  }

  /**
   * Update current view based on selected file
   */
  updateCurrentView(file) {
    // Hide all viewers
    this.pdfViewerElement?.classList.add('hidden');
    this.imageViewerElement?.classList.add('hidden');
    this.videoViewerElement?.classList.add('hidden');
    this.welcomeScreen?.classList.remove('hidden');
    
    if (file) {
      // Show appropriate viewer
      switch (file.mediaType) {
        case 'pdf':
          this.pdfViewerElement?.classList.remove('hidden');
          this.welcomeScreen?.classList.add('hidden');
          break;
        case 'image':
          this.imageViewerElement?.classList.remove('hidden');
          this.welcomeScreen?.classList.add('hidden');
          break;
        case 'video':
          this.videoViewerElement?.classList.remove('hidden');
          this.welcomeScreen?.classList.add('hidden');
          break;
      }
      
      // Update UI selection
      this.updateFileSelection();
      this.updateTabs(this.mediaManager.files);
    }
  }

  /**
   * Update settings
   */
  updateSettings(settings) {
    if (settings.sidebarVisible !== undefined) {
      if (settings.sidebarVisible) {
        this.sidebar?.classList.remove('hidden');
      } else {
        this.sidebar?.classList.add('hidden');
      }
    }
  }

  /**
   * Toggle sidebar
   */
  toggleSidebar() {
    this.mediaManager.toggleSidebar();
  }

  /**
   * Confirm clear all files
   */
  confirmClearAll() {
    if (this.mediaManager.files.length === 0) return;
    
    if (confirm('すべてのファイルを削除しますか？この操作は元に戻せません。')) {
      this.mediaManager.removeAllFiles();
    }
  }

  /**
   * Show context menu
   */
  showContextMenu(e, file) {
    if (!this.contextMenu) return;
    
    this.currentContextFile = file;
    
    this.contextMenu.style.left = `${e.pageX}px`;
    this.contextMenu.style.top = `${e.pageY}px`;
    this.contextMenu.classList.remove('hidden');
    
    e.stopPropagation();
  }

  /**
   * Hide context menu
   */
  hideContextMenu() {
    this.contextMenu?.classList.add('hidden');
    this.currentContextFile = null;
  }

  /**
   * Delete file
   */
  deleteFile(file) {
    if (confirm(`${file.fileName} を削除しますか？`)) {
      this.mediaManager.removeFile(file);
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardShortcuts(e) {
    // Global shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'o':
          e.preventDefault();
          this.openFileDialog();
          break;
        case 'w':
          e.preventDefault();
          if (this.mediaManager.currentFile) {
            this.deleteFile(this.mediaManager.currentFile);
          }
          break;
        case 'b':
          e.preventDefault();
          this.toggleSidebar();
          break;
      }
    }
    
    // File navigation
    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            this.selectPreviousFile();
          } else {
            this.selectNextFile();
          }
          break;
        case 'Escape':
          this.hideContextMenu();
          break;
      }
    }
  }

  /**
   * Select next file
   */
  selectNextFile() {
    const files = this.mediaManager.files;
    if (files.length === 0) return;
    
    let currentIndex = -1;
    if (this.mediaManager.currentFile) {
      currentIndex = files.findIndex(f => f.id === this.mediaManager.currentFile.id);
    }
    
    const nextIndex = (currentIndex + 1) % files.length;
    this.selectFile(files[nextIndex]);
  }

  /**
   * Select previous file
   */
  selectPreviousFile() {
    const files = this.mediaManager.files;
    if (files.length === 0) return;
    
    let currentIndex = -1;
    if (this.mediaManager.currentFile) {
      currentIndex = files.findIndex(f => f.id === this.mediaManager.currentFile.id);
    }
    
    const prevIndex = currentIndex <= 0 ? files.length - 1 : currentIndex - 1;
    this.selectFile(files[prevIndex]);
  }

  /**
   * Handle window resize
   */
  handleResize() {
    // Update mobile layout
    if (Utils.isMobile()) {
      this.sidebar?.classList.add('mobile');
    } else {
      this.sidebar?.classList.remove('mobile');
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.pdfViewer?.dispose();
    this.imageViewer?.dispose();
    this.videoPlayer?.dispose();
    this.mediaManager?.dispose();
  }

  /**
   * Get app statistics
   */
  getStats() {
    return this.mediaManager ? this.mediaManager.getStats() : null;
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.pinkReaderApp = new PinkReaderApp();
});

// Make app available globally for debugging
window.PinkReaderApp = PinkReaderApp;