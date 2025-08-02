// Pink Reader PWA - Utility Functions

/**
 * Utility functions for the Pink Reader PWA
 */
class Utils {
  /**
   * Generate a unique UUID v4
   * @returns {string} UUID string
   */
  static generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format time in MM:SS or HH:MM:SS format
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string
   */
  static formatTime(seconds) {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Determine media type from file extension
   * @param {string} fileName - File name
   * @returns {string} Media type: 'pdf', 'image', or 'video'
   */
  static getMediaType(fileName) {
    const extension = fileName.toLowerCase().split('.').pop();
    
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
    const pdfExtensions = ['pdf'];
    
    if (pdfExtensions.includes(extension)) return 'pdf';
    if (imageExtensions.includes(extension)) return 'image';
    if (videoExtensions.includes(extension)) return 'video';
    
    return 'pdf'; // Default
  }

  /**
   * Create a thumbnail from a file
   * @param {File} file - File object
   * @returns {Promise<string>} Base64 thumbnail data URL
   */
  static async createThumbnail(file) {
    const mediaType = Utils.getMediaType(file.name);
    
    try {
      if (mediaType === 'image') {
        return await Utils.createImageThumbnail(file);
      } else if (mediaType === 'video') {
        return await Utils.createVideoThumbnail(file);
      } else if (mediaType === 'pdf') {
        return await Utils.createPDFThumbnail(file);
      }
    } catch (error) {
      console.warn('Failed to create thumbnail:', error);
      return Utils.getDefaultThumbnail(mediaType);
    }
    
    return Utils.getDefaultThumbnail(mediaType);
  }

  /**
   * Create thumbnail for image file
   * @param {File} file - Image file
   * @returns {Promise<string>} Base64 thumbnail
   */
  static createImageThumbnail(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      img.onload = () => {
        const { width, height } = Utils.calculateThumbnailSize(img.width, img.height);
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Create thumbnail for video file
   * @param {File} file - Video file
   * @returns {Promise<string>} Base64 thumbnail
   */
  static createVideoThumbnail(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration * 0.1); // 10% into video or 1 second
      };
      
      video.onseeked = () => {
        const { width, height } = Utils.calculateThumbnailSize(video.videoWidth, video.videoHeight);
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(video, 0, 0, width, height);
        
        URL.revokeObjectURL(video.src);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
      video.load();
    });
  }

  /**
   * Create thumbnail for PDF file
   * @param {File} file - PDF file
   * @returns {Promise<string>} Base64 thumbnail
   */
  static async createPDFThumbnail(file) {
    if (typeof pdfjsLib === 'undefined') {
      return Utils.getDefaultThumbnail('pdf');
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const page = await pdf.getPage(1);
      
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const { width, height } = Utils.calculateThumbnailSize(viewport.width, viewport.height);
      
      canvas.width = width;
      canvas.height = height;
      
      const renderContext = {
        canvasContext: ctx,
        viewport: page.getViewport({ scale: Math.min(width / viewport.width, height / viewport.height) })
      };
      
      await page.render(renderContext).promise;
      
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (error) {
      console.warn('PDF thumbnail generation failed:', error);
      return Utils.getDefaultThumbnail('pdf');
    }
  }

  /**
   * Calculate thumbnail size maintaining aspect ratio
   * @param {number} originalWidth - Original width
   * @param {number} originalHeight - Original height
   * @returns {Object} {width, height} thumbnail dimensions
   */
  static calculateThumbnailSize(originalWidth, originalHeight, maxWidth = 100, maxHeight = 140) {
    const aspectRatio = originalWidth / originalHeight;
    
    let width = maxWidth;
    let height = maxWidth / aspectRatio;
    
    if (height > maxHeight) {
      height = maxHeight;
      width = maxHeight * aspectRatio;
    }
    
    return { width: Math.round(width), height: Math.round(height) };
  }

  /**
   * Get default thumbnail for media type
   * @param {string} mediaType - Media type
   * @returns {string} SVG data URL
   */
  static getDefaultThumbnail(mediaType) {
    const icons = {
      pdf: '📄',
      image: '🖼️',
      video: '🎬'
    };
    
    const icon = icons[mediaType] || '📄';
    const svg = `
      <svg width="100" height="140" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="140" fill="#FFEAEF" stroke="#FACCD9" stroke-width="2" rx="8"/>
        <text x="50" y="80" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#4D4D4D">${icon}</text>
      </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  /**
   * Show toast notification
   * @param {string} message - Message to show
   * @param {string} type - Toast type: 'success', 'error', 'warning'
   * @param {number} duration - Duration in milliseconds
   */
  static showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div>${message}</div>
      <button class="close-btn" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, duration);
  }

  /**
   * Debounce function execution
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function execution
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Cloned object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
    if (typeof obj === 'object') {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = Utils.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  }

  /**
   * Check if device is mobile
   * @returns {boolean} True if mobile device
   */
  static isMobile() {
    return window.innerWidth <= 768;
  }

  /**
   * Check if device supports touch
   * @returns {boolean} True if touch supported
   */
  static isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Sanitize filename for safe storage
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  static sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
  }

  /**
   * Convert File to ArrayBuffer
   * @param {File} file - File object
   * @returns {Promise<ArrayBuffer>} ArrayBuffer
   */
  static fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Check if File System Access API is supported
   * @returns {boolean} True if supported
   */
  static isFileSystemAccessSupported() {
    return 'showOpenFilePicker' in window;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export for use in other modules
window.Utils = Utils;