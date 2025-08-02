// Pink Reader PWA - Media Manager

/**
 * MediaManager class - Handles file management and storage
 * Equivalent to the Swift MediaManager class but using web technologies
 */
class MediaManager {
  constructor() {
    this.files = [];
    this.currentFile = null;
    this.isTwoPageMode = false;
    this.sidebarVisible = true;
    this.forceUpdateTrigger = Utils.generateUUID();
    
    // IndexedDB setup
    this.dbName = 'PinkReaderDB';
    this.dbVersion = 1;
    this.db = null;
    
    // Event listeners
    this.eventListeners = {
      'filesChanged': [],
      'currentFileChanged': [],
      'settingsChanged': []
    };
    
    this.init();
  }

  /**
   * Initialize MediaManager
   */
  async init() {
    try {
      await this.initDB();
      await this.loadFiles();
      await this.loadSettings();
      this.setupAutoSave();
      
      console.log('MediaManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MediaManager:', error);
      Utils.showToast('初期化に失敗しました', 'error');
    }
  }

  /**
   * Initialize IndexedDB
   */
  initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create files object store
        if (!db.objectStoreNames.contains('files')) {
          const filesStore = db.createObjectStore('files', { keyPath: 'id' });
          filesStore.createIndex('fileName', 'fileName', { unique: false });
          filesStore.createIndex('mediaType', 'mediaType', { unique: false });
          filesStore.createIndex('importDate', 'importDate', { unique: false });
        }
        
        // Create file data object store (for actual file content)
        if (!db.objectStoreNames.contains('fileData')) {
          db.createObjectStore('fileData', { keyPath: 'id' });
        }
        
        // Create settings object store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Load files from IndexedDB
   */
  async loadFiles() {
    try {
      const transaction = this.db.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      const request = store.getAll();
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          this.files = request.result || [];
          this.emit('filesChanged', this.files);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to load files:', error);
      this.files = [];
    }
  }

  /**
   * Save files to IndexedDB
   */
  async saveFiles() {
    try {
      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      
      // Clear existing files
      await new Promise((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      });
      
      // Add all current files
      for (const file of this.files) {
        await new Promise((resolve, reject) => {
          const addRequest = store.add(file);
          addRequest.onsuccess = () => resolve();
          addRequest.onerror = () => reject(addRequest.error);
        });
      }
    } catch (error) {
      console.error('Failed to save files:', error);
    }
  }

  /**
   * Load settings from IndexedDB
   */
  async loadSettings() {
    try {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      
      const settings = await Promise.all([
        this.getSetting('isTwoPageMode'),
        this.getSetting('sidebarVisible')
      ]);
      
      this.isTwoPageMode = settings[0]?.value ?? false;
      this.sidebarVisible = settings[1]?.value ?? true;
      
      this.emit('settingsChanged', {
        isTwoPageMode: this.isTwoPageMode,
        sidebarVisible: this.sidebarVisible
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Get a setting from IndexedDB
   */
  getSetting(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save a setting to IndexedDB
   */
  saveSetting(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Setup auto-save functionality
   */
  setupAutoSave() {
    // Debounced save function
    this.debouncedSave = Utils.debounce(async () => {
      await this.saveFiles();
    }, 1000);
    
    // Auto-save when files change
    this.on('filesChanged', this.debouncedSave);
  }

  /**
   * Add a file to the library
   */
  async addFile(file) {
    try {
      // Generate unique ID and create file metadata
      const fileId = Utils.generateUUID();
      const mediaType = Utils.getMediaType(file.name);
      const importDate = new Date().toISOString();
      
      // Create thumbnail
      const thumbnailDataUrl = await Utils.createThumbnail(file);
      
      // Store file content
      await this.storeFileData(fileId, file);
      
      // Create file metadata object
      const mediaFile = {
        id: fileId,
        fileName: file.name,
        displayName: file.name,
        mediaType,
        fileSize: file.size,
        importDate,
        thumbnailDataUrl,
        
        // PDF specific
        pageCount: mediaType === 'pdf' ? await this.getPDFPageCount(file) : null,
        lastViewedPage: 1,
        
        // Video specific
        lastViewedTime: 0.0,
        videoDuration: null
      };
      
      // Add to files array
      this.files.push(mediaFile);
      this.setCurrentFile(mediaFile);
      
      this.emit('filesChanged', this.files);
      
      Utils.showToast(`${file.name} を追加しました`, 'success');
      
      return mediaFile;
    } catch (error) {
      console.error('Failed to add file:', error);
      Utils.showToast('ファイルの追加に失敗しました', 'error');
      throw error;
    }
  }

  /**
   * Store file data in IndexedDB
   */
  async storeFileData(fileId, file) {
    const arrayBuffer = await Utils.fileToArrayBuffer(file);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['fileData'], 'readwrite');
      const store = transaction.objectStore('fileData');
      const request = store.put({
        id: fileId,
        data: arrayBuffer,
        type: file.type,
        name: file.name
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get file data from IndexedDB
   */
  async getFileData(fileId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['fileData'], 'readonly');
      const store = transaction.objectStore('fileData');
      const request = store.get(fileId);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve(new Blob([result.data], { type: result.type }));
        } else {
          reject(new Error('File data not found'));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get PDF page count
   */
  async getPDFPageCount(file) {
    if (typeof pdfjsLib === 'undefined') return null;
    
    try {
      const arrayBuffer = await Utils.fileToArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      return pdf.numPages;
    } catch (error) {
      console.warn('Failed to get PDF page count:', error);
      return null;
    }
  }

  /**
   * Remove a file from the library
   */
  async removeFile(file) {
    try {
      // Remove from files array
      this.files = this.files.filter(f => f.id !== file.id);
      
      // Remove file data from IndexedDB
      const transaction = this.db.transaction(['fileData'], 'readwrite');
      const store = transaction.objectStore('fileData');
      store.delete(file.id);
      
      // Update current file if necessary
      if (this.currentFile && this.currentFile.id === file.id) {
        this.setCurrentFile(this.files.length > 0 ? this.files[0] : null);
      }
      
      this.emit('filesChanged', this.files);
      
      Utils.showToast(`${file.fileName} を削除しました`, 'success');
    } catch (error) {
      console.error('Failed to remove file:', error);
      Utils.showToast('ファイルの削除に失敗しました', 'error');
    }
  }

  /**
   * Remove all files from the library
   */
  async removeAllFiles() {
    try {
      // Clear files array
      this.files = [];
      this.setCurrentFile(null);
      
      // Clear IndexedDB stores
      const transaction = this.db.transaction(['files', 'fileData'], 'readwrite');
      const filesStore = transaction.objectStore('files');
      const fileDataStore = transaction.objectStore('fileData');
      
      await Promise.all([
        new Promise((resolve, reject) => {
          const request = filesStore.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
        new Promise((resolve, reject) => {
          const request = fileDataStore.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
      ]);
      
      this.emit('filesChanged', this.files);
      
      Utils.showToast('すべてのファイルを削除しました', 'success');
    } catch (error) {
      console.error('Failed to remove all files:', error);
      Utils.showToast('ファイルの削除に失敗しました', 'error');
    }
  }

  /**
   * Set current file
   */
  setCurrentFile(file) {
    if (this.currentFile !== file || file !== null) {
      this.currentFile = file;
      this.forceUpdateTrigger = Utils.generateUUID();
      this.emit('currentFileChanged', file);
    }
  }

  /**
   * Update last viewed page for a PDF file
   */
  async updateLastViewedPage(file, page) {
    const fileIndex = this.files.findIndex(f => f.id === file.id);
    if (fileIndex !== -1) {
      this.files[fileIndex].lastViewedPage = page;
      
      // Update current file if it's the same
      if (this.currentFile && this.currentFile.id === file.id) {
        this.currentFile.lastViewedPage = page;
      }
      
      this.debouncedSave();
    }
  }

  /**
   * Update last viewed time for a video file
   */
  async updateLastViewedTime(file, time) {
    const fileIndex = this.files.findIndex(f => f.id === file.id);
    if (fileIndex !== -1) {
      this.files[fileIndex].lastViewedTime = time;
      
      // Update current file if it's the same
      if (this.currentFile && this.currentFile.id === file.id) {
        this.currentFile.lastViewedTime = time;
      }
      
      this.debouncedSave();
    }
  }

  /**
   * Update video duration
   */
  async updateVideoDuration(file, duration) {
    const fileIndex = this.files.findIndex(f => f.id === file.id);
    if (fileIndex !== -1) {
      this.files[fileIndex].videoDuration = duration;
      
      // Update current file if it's the same
      if (this.currentFile && this.currentFile.id === file.id) {
        this.currentFile.videoDuration = duration;
      }
      
      this.debouncedSave();
    }
  }

  /**
   * Toggle two-page mode
   */
  async toggleTwoPageMode() {
    this.isTwoPageMode = !this.isTwoPageMode;
    await this.saveSetting('isTwoPageMode', this.isTwoPageMode);
    this.emit('settingsChanged', {
      isTwoPageMode: this.isTwoPageMode,
      sidebarVisible: this.sidebarVisible
    });
  }

  /**
   * Toggle sidebar visibility
   */
  async toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
    await this.saveSetting('sidebarVisible', this.sidebarVisible);
    this.emit('settingsChanged', {
      isTwoPageMode: this.isTwoPageMode,
      sidebarVisible: this.sidebarVisible
    });
  }

  /**
   * Get file by ID
   */
  getFileById(id) {
    return this.files.find(file => file.id === id);
  }

  /**
   * Get files by media type
   */
  getFilesByType(mediaType) {
    return this.files.filter(file => file.mediaType === mediaType);
  }

  /**
   * Search files by name
   */
  searchFiles(query) {
    const lowerQuery = query.toLowerCase();
    return this.files.filter(file => 
      file.fileName.toLowerCase().includes(lowerQuery) ||
      file.displayName.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Event listener management
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  off(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Get library statistics
   */
  getStats() {
    const totalSize = this.files.reduce((sum, file) => sum + file.fileSize, 0);
    const typeCount = this.files.reduce((acc, file) => {
      acc[file.mediaType] = (acc[file.mediaType] || 0) + 1;
      return acc;
    }, {});
    
    return {
      totalFiles: this.files.length,
      totalSize: totalSize,
      formattedSize: Utils.formatFileSize(totalSize),
      typeCount,
      oldestFile: this.files.length > 0 ? 
        this.files.reduce((oldest, file) => 
          new Date(file.importDate) < new Date(oldest.importDate) ? file : oldest
        ) : null,
      newestFile: this.files.length > 0 ? 
        this.files.reduce((newest, file) => 
          new Date(file.importDate) > new Date(newest.importDate) ? file : newest
        ) : null
    };
  }

  /**
   * Export library data
   */
  async exportLibrary() {
    try {
      const libraryData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        files: this.files.map(file => ({
          ...file,
          // Remove binary data for export
          thumbnailDataUrl: undefined
        })),
        settings: {
          isTwoPageMode: this.isTwoPageMode,
          sidebarVisible: this.sidebarVisible
        }
      };
      
      const blob = new Blob([JSON.stringify(libraryData, null, 2)], {
        type: 'application/json'
      });
      
      return blob;
    } catch (error) {
      console.error('Failed to export library:', error);
      throw error;
    }
  }

  /**
   * Cleanup - dispose resources
   */
  dispose() {
    this.eventListeners = {};
    if (this.db) {
      this.db.close();
    }
  }
}

// Make MediaManager available globally
window.MediaManager = MediaManager;