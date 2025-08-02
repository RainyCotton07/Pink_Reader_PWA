// Pink Reader PWA - Video Player Component

/**
 * VideoPlayer class - Handles video playback with custom controls
 * Equivalent to the Swift VideoReaderView component
 */
class VideoPlayer {
  constructor(containerElement, mediaManager) {
    this.container = containerElement;
    this.mediaManager = mediaManager;
    
    // DOM elements
    this.videoElement = null;
    this.currentTimeElement = null;
    this.totalTimeElement = null;
    this.videoSlider = null;
    this.playPauseButton = null;
    this.rewindButton = null;
    this.forwardButton = null;
    
    // State
    this.currentFile = null;
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
    this.isLoading = false;
    this.isSeeking = false;
    
    // Auto-save position
    this.savePositionInterval = null;
    this.lastSavedPosition = 0;
    
    // Event listeners
    this.boundTimeUpdate = this.onTimeUpdate.bind(this);
    this.boundDurationChange = this.onDurationChange.bind(this);
    this.boundPlay = this.onPlay.bind(this);
    this.boundPause = this.onPause.bind(this);
    this.boundEnded = this.onEnded.bind(this);
    this.boundLoadStart = this.onLoadStart.bind(this);
    this.boundCanPlay = this.onCanPlay.bind(this);
    this.boundError = this.onError.bind(this);
    
    this.init();
  }

  /**
   * Initialize video player
   */
  init() {
    this.setupDOM();
    this.setupEventListeners();
    
    // Listen for media manager events
    this.mediaManager.on('currentFileChanged', (file) => {
      if (file && file.mediaType === 'video') {
        this.loadVideo(file);
      } else {
        // Clear video if switching to different media type or no file
        if (this.currentFile && this.currentFile.mediaType === 'video') {
          this.clearVideo();
        }
      }
    });
  }

  /**
   * Setup DOM elements
   */
  setupDOM() {
    this.videoElement = this.container.querySelector('#video-display');
    
    this.currentTimeElement = this.container.querySelector('#current-time');
    this.totalTimeElement = this.container.querySelector('#total-time');
    this.videoSlider = this.container.querySelector('#video-slider');
    
    this.playPauseButton = this.container.querySelector('#play-pause-btn');
    this.rewindButton = this.container.querySelector('#rewind-btn');
    this.forwardButton = this.container.querySelector('#forward-btn');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Video element events
    if (this.videoElement) {
      this.videoElement.addEventListener('timeupdate', this.boundTimeUpdate);
      this.videoElement.addEventListener('durationchange', this.boundDurationChange);
      this.videoElement.addEventListener('play', this.boundPlay);
      this.videoElement.addEventListener('pause', this.boundPause);
      this.videoElement.addEventListener('ended', this.boundEnded);
      this.videoElement.addEventListener('loadstart', this.boundLoadStart);
      this.videoElement.addEventListener('canplay', this.boundCanPlay);
      this.videoElement.addEventListener('error', this.boundError);
      
      // Disable default controls
      this.videoElement.controls = false;
    }
    
    // Control buttons
    this.playPauseButton?.addEventListener('click', () => this.togglePlayPause());
    this.rewindButton?.addEventListener('click', () => this.rewind());
    this.forwardButton?.addEventListener('click', () => this.forward());
    
    // Seek slider
    if (this.videoSlider) {
      this.videoSlider.addEventListener('input', (e) => this.onSliderInput(e));
      this.videoSlider.addEventListener('change', (e) => this.onSliderChange(e));
      
      // Handle slider interaction states
      this.videoSlider.addEventListener('mousedown', () => this.startSeeking());
      this.videoSlider.addEventListener('mouseup', () => this.endSeeking());
      this.videoSlider.addEventListener('touchstart', () => this.startSeeking());
      this.videoSlider.addEventListener('touchend', () => this.endSeeking());
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.currentFile || this.currentFile.mediaType !== 'video') return;
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.seek(Math.max(0, this.currentTime - 10));
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.seek(Math.min(this.duration, this.currentTime + 10));
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.seek(Math.max(0, this.currentTime - 30));
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.seek(Math.min(this.duration, this.currentTime + 30));
          break;
        case 'Home':
          e.preventDefault();
          this.seek(0);
          break;
        case 'End':
          e.preventDefault();
          this.seek(this.duration);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          this.toggleMute();
          break;
      }
    });
  }

  /**
   * Load video file
   */
  async loadVideo(file) {
    try {
      this.currentFile = file;
      this.setLoadingState(true);
      
      // Get file data from MediaManager
      const fileBlob = await this.mediaManager.getFileData(file.id);
      const videoUrl = URL.createObjectURL(fileBlob);
      
      // Load video
      this.videoElement.src = videoUrl;
      this.videoElement.load();
      
      console.log(`Video loaded: ${file.fileName}`);
    } catch (error) {
      console.error('Failed to load video:', error);
      Utils.showToast('動画の読み込みに失敗しました', 'error');
      this.setLoadingState(false);
    }
  }

  /**
   * Clear current video
   */
  clearVideo() {
    this.stopAutoSave();
    
    if (this.videoElement) {
      // Remove event listeners temporarily to prevent error events
      this.videoElement.removeEventListener('error', this.boundError);
      
      this.videoElement.pause();
      
      // Revoke old object URL to prevent memory leaks
      if (this.videoElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.videoElement.src);
      }
      
      this.videoElement.src = '';
      this.videoElement.load();
      
      // Re-add event listener
      this.videoElement.addEventListener('error', this.boundError);
    }
    
    this.currentFile = null;
    this.resetState();
  }

  /**
   * Reset player state
   */
  resetState() {
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
    this.isLoading = false;
    this.isSeeking = false;
    
    this.updateTimeDisplay();
    this.updateSlider();
    this.updateControls();
    this.setLoadingState(false);
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause() {
    if (!this.videoElement || !this.currentFile) return;
    
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Play video
   */
  async play() {
    if (!this.videoElement || !this.currentFile) return;
    
    try {
      await this.videoElement.play();
      this.startAutoSave();
    } catch (error) {
      console.error('Failed to play video:', error);
      Utils.showToast('動画の再生に失敗しました', 'error');
    }
  }

  /**
   * Pause video
   */
  pause() {
    if (!this.videoElement) return;
    
    this.videoElement.pause();
    this.saveCurrentPosition();
  }

  /**
   * Seek to specific time
   */
  seek(time) {
    if (!this.videoElement || !this.currentFile) return;
    
    const clampedTime = Math.max(0, Math.min(this.duration, time));
    this.videoElement.currentTime = clampedTime;
    
    // Save position immediately when seeking
    this.saveCurrentPosition();
  }

  /**
   * Rewind by 10 seconds
   */
  rewind() {
    this.seek(this.currentTime - 10);
  }

  /**
   * Forward by 10 seconds
   */
  forward() {
    this.seek(this.currentTime + 10);
  }

  /**
   * Toggle fullscreen
   */
  toggleFullscreen() {
    if (!this.videoElement) return;
    
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.videoElement.requestFullscreen();
    }
  }

  /**
   * Toggle mute
   */
  toggleMute() {
    if (!this.videoElement) return;
    
    this.videoElement.muted = !this.videoElement.muted;
  }

  /**
   * Start seeking
   */
  startSeeking() {
    this.isSeeking = true;
  }

  /**
   * End seeking
   */
  endSeeking() {
    this.isSeeking = false;
  }

  /**
   * Handle slider input
   */
  onSliderInput(e) {
    if (!this.videoElement || !this.currentFile) return;
    
    const time = (parseFloat(e.target.value) / 100) * this.duration;
    this.currentTime = time;
    this.updateTimeDisplay();
  }

  /**
   * Handle slider change
   */
  onSliderChange(e) {
    if (!this.videoElement || !this.currentFile) return;
    
    const time = (parseFloat(e.target.value) / 100) * this.duration;
    this.seek(time);
  }

  /**
   * Handle video time update
   */
  onTimeUpdate() {
    if (!this.isSeeking) {
      this.currentTime = this.videoElement.currentTime;
      this.updateTimeDisplay();
      this.updateSlider();
    }
  }

  /**
   * Handle video duration change
   */
  onDurationChange() {
    this.duration = this.videoElement.duration || 0;
    
    // Update MediaManager with duration
    if (this.currentFile) {
      this.mediaManager.updateVideoDuration(this.currentFile, this.duration);
    }
    
    this.updateTimeDisplay();
    this.updateSlider();
    this.updateControls();
    
    // Restore saved position
    this.restoreSavedPosition();
  }

  /**
   * Handle video play
   */
  onPlay() {
    this.isPlaying = true;
    this.updateControls();
  }

  /**
   * Handle video pause
   */
  onPause() {
    this.isPlaying = false;
    this.updateControls();
  }

  /**
   * Handle video ended
   */
  onEnded() {
    this.isPlaying = false;
    this.updateControls();
    this.saveCurrentPosition();
  }

  /**
   * Handle video load start
   */
  onLoadStart() {
    this.setLoadingState(true);
  }

  /**
   * Handle video can play
   */
  onCanPlay() {
    this.setLoadingState(false);
  }

  /**
   * Handle video error
   */
  onError() {
    // Only show error if we're actually trying to display a video
    if (this.currentFile && this.currentFile.mediaType === 'video') {
      console.error('Video playback error');
      Utils.showToast('動画の再生でエラーが発生しました', 'error');
    }
    this.setLoadingState(false);
  }

  /**
   * Restore saved position
   */
  restoreSavedPosition() {
    if (this.currentFile && this.currentFile.lastViewedTime) {
      const savedTime = Math.min(this.currentFile.lastViewedTime, this.duration);
      if (savedTime > 5) { // Only restore if more than 5 seconds in
        this.seek(savedTime);
      }
    }
  }

  /**
   * Save current position
   */
  saveCurrentPosition() {
    if (this.currentFile && Math.abs(this.currentTime - this.lastSavedPosition) > 1) {
      this.mediaManager.updateLastViewedTime(this.currentFile, this.currentTime);
      this.lastSavedPosition = this.currentTime;
    }
  }

  /**
   * Start auto-save timer
   */
  startAutoSave() {
    this.stopAutoSave();
    
    // Save position every 5 seconds during playback
    this.savePositionInterval = setInterval(() => {
      this.saveCurrentPosition();
    }, 5000);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave() {
    if (this.savePositionInterval) {
      clearInterval(this.savePositionInterval);
      this.savePositionInterval = null;
    }
  }

  /**
   * Update time display
   */
  updateTimeDisplay() {
    if (this.currentTimeElement) {
      this.currentTimeElement.textContent = Utils.formatTime(this.currentTime);
    }
    if (this.totalTimeElement) {
      this.totalTimeElement.textContent = Utils.formatTime(this.duration);
    }
  }

  /**
   * Update slider position
   */
  updateSlider() {
    if (this.videoSlider && this.duration > 0) {
      const percentage = (this.currentTime / this.duration) * 100;
      this.videoSlider.value = percentage.toString();
    }
  }

  /**
   * Update control buttons
   */
  updateControls() {
    if (this.playPauseButton) {
      this.playPauseButton.textContent = this.isPlaying ? '⏸️' : '▶️';
      this.playPauseButton.title = this.isPlaying ? '一時停止' : '再生';
    }
    
    const hasVideo = this.currentFile !== null;
    
    if (this.rewindButton) {
      this.rewindButton.disabled = !hasVideo;
    }
    if (this.forwardButton) {
      this.forwardButton.disabled = !hasVideo;
    }
    if (this.videoSlider) {
      this.videoSlider.disabled = !hasVideo;
    }
  }

  /**
   * Set loading state
   */
  setLoadingState(loading) {
    this.isLoading = loading;
    
    if (loading) {
      this.container.classList.add('loading');
    } else {
      this.container.classList.remove('loading');
    }
  }

  /**
   * Get playback info
   */
  getPlaybackInfo() {
    return {
      currentTime: this.currentTime,
      duration: this.duration,
      isPlaying: this.isPlaying,
      volume: this.videoElement?.volume || 1.0,
      muted: this.videoElement?.muted || false,
      playbackRate: this.videoElement?.playbackRate || 1.0
    };
  }

  /**
   * Set playback rate
   */
  setPlaybackRate(rate) {
    if (this.videoElement) {
      this.videoElement.playbackRate = Math.max(0.25, Math.min(4.0, rate));
    }
  }

  /**
   * Set volume
   */
  setVolume(volume) {
    if (this.videoElement) {
      this.videoElement.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Get video metadata
   */
  getVideoMetadata() {
    if (!this.videoElement) return null;
    
    return {
      duration: this.duration,
      videoWidth: this.videoElement.videoWidth,
      videoHeight: this.videoElement.videoHeight,
      readyState: this.videoElement.readyState,
      networkState: this.videoElement.networkState
    };
  }

  /**
   * Dispose player resources
   */
  dispose() {
    this.stopAutoSave();
    
    // Remove event listeners
    if (this.videoElement) {
      this.videoElement.removeEventListener('timeupdate', this.boundTimeUpdate);
      this.videoElement.removeEventListener('durationchange', this.boundDurationChange);
      this.videoElement.removeEventListener('play', this.boundPlay);
      this.videoElement.removeEventListener('pause', this.boundPause);
      this.videoElement.removeEventListener('ended', this.boundEnded);
      this.videoElement.removeEventListener('loadstart', this.boundLoadStart);
      this.videoElement.removeEventListener('canplay', this.boundCanPlay);
      this.videoElement.removeEventListener('error', this.boundError);
    }
    
    this.clearVideo();
    this.currentFile = null;
  }
}

// Make VideoPlayer available globally
window.VideoPlayer = VideoPlayer;