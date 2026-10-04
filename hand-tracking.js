/**
 * Hand Tracking & Gesture Control Module
 * Uses MediaPipe Hands for real-time hand pose detection
 */

class HandGestureController {
    constructor() {
        this.isActive = false;
        this.videoElement = null;
        this.hands = null;
        this.camera = null;
        this.gestureState = 'open';
        this.previousGestureState = 'open';
        this.pointerX = 0;
        this.pointerY = 0;
        this.lastHandY = 0;
        this.gestureDebounce = 200;
        this.lastGestureTime = 0;
        this.mediaLoaded = false;

        console.log('HandGestureController initialized, loading MediaPipe...');
        this.loadMediaPipe();
    }

    async loadMediaPipe() {
        try {
            console.log('[HandTracking] Loading MediaPipe Hands...');
            
            // Load all required scripts sequentially with correct URLs
            await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
            console.log('[HandTracking] ✓ Camera utils loaded');
            
            await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
            console.log('[HandTracking] ✓ Drawing utils loaded');
            
            await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
            console.log('[HandTracking] ✓ Hands model loaded');

            // Wait for globals to be available with extended timeout
            let attempts = 0;
            while ((!window.Hands || !window.Camera) && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 200));
                attempts++;
                if (attempts % 5 === 0) {
                    console.log(`[HandTracking] Waiting for libraries... (${attempts}/50) Hands: ${!!window.Hands}, Camera: ${!!window.Camera}`);
                }
            }

            if (window.Hands && window.Camera) {
                this.mediaLoaded = true;
                console.log('[HandTracking] ✅ MediaPipe fully loaded and ready!');
                this.updateGestureStatus('✅ MediaPipe ready - Click GESTURE MODE', 'success');
            } else {
                console.error(`[HandTracking] Libraries not available. Hands: ${!!window.Hands}, Camera: ${!!window.Camera}`);
                throw new Error('MediaPipe libraries failed to initialize');
            }
        } catch (error) {
            console.error('[HandTracking] Error loading MediaPipe:', error);
            this.updateGestureStatus('❌ Failed to load MediaPipe: ' + error.message, 'error');
        }
    }

    async loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if script already exists
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                console.log(`[HandTracking] Script already loaded: ${src.split('/').pop()}`);
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = false; // Load synchronously to maintain order
            script.crossOrigin = 'anonymous';
            
            script.onload = () => {
                console.log(`[HandTracking] Script loaded: ${src.split('/').pop()}`);
                // Small delay to ensure globals are available
                setTimeout(() => resolve(), 100);
            };
            
            script.onerror = (error) => {
                const err = `Failed to load: ${src}`;
                console.error(`[HandTracking] ${err}`, error);
                reject(new Error(err));
            };
            
            // Add timeout
            const timeout = setTimeout(() => {
                script.remove();
                reject(new Error(`Script load timeout: ${src}`));
            }, 20000);
            
            script.addEventListener('load', () => clearTimeout(timeout), { once: true });
            
            document.head.appendChild(script);
        });
    }

    async startHandTracking() {
        if (this.isActive) {
            console.log('[HandTracking] Already active, ignoring start request');
            return;
        }

        // Check if MediaPipe is ready
        if (!this.mediaLoaded) {
            console.log('[HandTracking] Waiting for MediaPipe to load...');
            this.updateGestureStatus('⏳ Loading gesture model...', 'info');
            
            // Wait a bit more for loading
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!this.mediaLoaded) {
                console.error('[HandTracking] MediaPipe still not loaded after waiting');
                this.updateGestureStatus('❌ MediaPipe failed to load. Check console.', 'error');
                return;
            }
        }

        try {
            console.log('[HandTracking] Starting hand tracking...');
            this.updateGestureStatus('📹 Initializing webcam...', 'info');

            // Create video element
            if (!this.videoElement) {
                this.createVideoElement();
                console.log('[HandTracking] Video element created');
            }

            // Verify MediaPipe globals
            if (!window.Hands) {
                throw new Error('window.Hands is undefined - MediaPipe Hands failed to load');
            }
            if (!window.Camera) {
                throw new Error('window.Camera is undefined - Camera utils failed to load');
            }

            // Initialize Hands
            console.log('[HandTracking] Creating Hands instance...');
            this.hands = new window.Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 0, // Use lighter model for better performance
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.5
            });

            this.hands.onResults((results) => this.onHandsResults(results));
            console.log('[HandTracking] Hands instance configured');

            // Initialize Camera
            if (!this.camera) {
                console.log('[HandTracking] Creating Camera instance...');
                this.camera = new window.Camera(this.videoElement, {
                    onFrame: async () => {
                        if (this.hands && this.isActive) {
                            try {
                                await this.hands.send({ image: this.videoElement });
                            } catch (e) {
                                console.error('[HandTracking] Error sending frame:', e);
                            }
                        }
                    },
                    width: 320,
                    height: 240
                });

                console.log('[HandTracking] Initializing camera...');
                await this.camera.initialize();
                console.log('[HandTracking] Camera initialized successfully');
            }

            // Start camera
            console.log('[HandTracking] Starting camera stream...');
            this.camera.start();

            this.isActive = true;
            this.showGestureOverlay();
            this.updateGestureStatus('✅ Gesture control ACTIVE!', 'success');
            console.log('[HandTracking] ✅ Hand tracking started successfully!');

        } catch (error) {
            console.error('[HandTracking] Error starting hand tracking:', error);
            this.updateGestureStatus(`❌ Error: ${error.message}`, 'error');
            this.isActive = false;
        }
    }

    stopHandTracking() {
        if (!this.isActive) return;

        try {
            console.log('[HandTracking] Stopping hand tracking...');
            
            if (this.camera) {
                this.camera.stop();
                this.camera = null;
                console.log('[HandTracking] Camera stopped');
            }
            
            if (this.hands) {
                this.hands.close();
                this.hands = null;
                console.log('[HandTracking] Hands closed');
            }
            
            this.isActive = false;
            this.hideGestureOverlay();
            this.updateGestureStatus('Gesture control stopped', 'info');
            console.log('[HandTracking] ✅ Hand tracking stopped');
        } catch (error) {
            console.error('[HandTracking] Error stopping hand tracking:', error);
        }
    }

    createVideoElement() {
        this.videoElement = document.createElement('video');
        this.videoElement.id = 'gesture-control-video';
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);
    }

    onHandsResults(results) {
        try {
            if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
                this.gestureState = 'open';
                return;
            }

            const landmarks = results.multiHandLandmarks[0];
            if (!landmarks || landmarks.length < 21) return;

            const palmBase = landmarks[0];
            this.pointerX = Math.round(palmBase.x * window.innerWidth);
            this.pointerY = Math.round(palmBase.y * window.innerHeight);

            this.gestureState = this.detectGesture(landmarks);

            if (this.gestureState !== this.previousGestureState) {
                this.handleGestureTransition();
                this.previousGestureState = this.gestureState;
            }

            this.updatePointer();

        } catch (error) {
            console.error('[HandTracking] Error in hand results:', error);
        }
    }

    detectGesture(landmarks) {
        const palmBase = landmarks[0];
        const fingerTips = [4, 8, 12, 16, 20];
        const fingerPIPs = [3, 6, 10, 14, 18];
        
        let closedFingers = 0;
        
        for (let i = 0; i < fingerTips.length; i++) {
            const tip = landmarks[fingerTips[i]];
            const pip = landmarks[fingerPIPs[i]];
            
            const tipDistance = Math.hypot(
                tip.x - palmBase.x,
                tip.y - palmBase.y,
                tip.z - palmBase.z
            );
            
            const pipDistance = Math.hypot(
                pip.x - palmBase.x,
                pip.y - palmBase.y,
                pip.z - palmBase.z
            );
            
            if (tipDistance < pipDistance * 0.8) {
                closedFingers++;
            }
        }
        
        return closedFingers >= 4 ? 'fist' : 'open';
    }

    handleGestureTransition() {
        const now = Date.now();
        if (now - this.lastGestureTime < this.gestureDebounce) return;

        this.lastGestureTime = now;

        if (this.gestureState === 'fist') {
            this.updateGestureStatus('✊ FIST - Move to scroll', 'active');
            this.lastHandY = this.pointerY;
        } else if (this.previousGestureState === 'fist' && this.gestureState === 'open') {
            this.triggerClick();
        }
    }

    triggerClick() {
        const element = document.elementFromPoint(this.pointerX, this.pointerY);
        if (!element) return;

        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: this.pointerX,
            clientY: this.pointerY
        });

        element.dispatchEvent(clickEvent);
        this.updateGestureStatus('👆 Click!', 'click');
        this.createClickFeedback(this.pointerX, this.pointerY);
    }

    triggerScroll(deltaY) {
        window.scrollBy({
            top: deltaY,
            behavior: 'smooth'
        });
    }

    updatePointer() {
        let pointerEl = document.getElementById('gesture-pointer');
        if (!pointerEl) {
            pointerEl = document.createElement('div');
            pointerEl.id = 'gesture-pointer';
            document.body.appendChild(pointerEl);
        }

        const isFist = this.gestureState === 'fist';
        pointerEl.style.cssText = `
            position: fixed;
            width: 40px;
            height: 40px;
            border: 3px solid ${isFist ? '#FF0000' : '#00FF00'};
            border-radius: 50%;
            pointer-events: none;
            z-index: 10000;
            background: rgba(${isFist ? '255, 0' : '0, 255'}, 0, 0.1);
            box-shadow: ${isFist ? '0 0 20px rgba(255,0,0,0.8)' : '0 0 20px rgba(0,255,0,0.8)'};
            left: ${this.pointerX - 20}px;
            top: ${this.pointerY - 20}px;
        `;

        if (this.gestureState === 'fist') {
            const scrollDelta = this.lastHandY - this.pointerY;
            if (Math.abs(scrollDelta) > 5) {
                this.triggerScroll(scrollDelta * 2);
                this.lastHandY = this.pointerY;
            }
        }
    }

    createClickFeedback(x, y) {
        const feedback = document.createElement('div');
        feedback.style.cssText = `
            position: fixed;
            left: ${x - 25}px;
            top: ${y - 25}px;
            width: 50px;
            height: 50px;
            border: 2px solid #FBFF48;
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            animation: clickRipple 0.6s ease-out forwards;
        `;
        document.body.appendChild(feedback);
        setTimeout(() => feedback.remove(), 600);
    }

    updateGestureStatus(message, type = 'info') {
        let statusEl = document.getElementById('gesture-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'gesture-status';
            statusEl.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: #1a1a1a;
                color: #FBFF48;
                padding: 12px 20px;
                border: 2px solid #FBFF48;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                border-radius: 4px;
                z-index: 9998;
                box-shadow: 4px 4px 0px #000;
                transition: all 0.3s;
            `;
            document.body.appendChild(statusEl);
        }

        statusEl.textContent = message;
        const colorMap = {
            error: '#FF0000',
            success: '#00FF00',
            active: '#FBFF48',
            click: '#00FF00',
            info: '#FBFF48'
        };
        statusEl.style.borderColor = colorMap[type] || '#FBFF48';
        statusEl.style.color = colorMap[type] || '#FBFF48';
    }

    showGestureOverlay() {
        let overlay = document.getElementById('gesture-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'gesture-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 200px;
                height: 160px;
                background: rgba(0, 0, 0, 0.9);
                border: 2px solid #00FF00;
                border-radius: 8px;
                z-index: 9997;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #00FF00;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                text-align: center;
                box-shadow: 4px 4px 0px rgba(0, 255, 0, 0.3);
            `;
            overlay.innerHTML = `
                <div style="line-height: 1.7;">
                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">✋ GESTURE ACTIVE</div>
                    <div style="font-size: 11px; opacity: 0.85;">
                        ✋ Open = Move<br>
                        ✊ Fist = Scroll<br>
                        ✊ → ✋ = Click
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }

    hideGestureOverlay() {
        const overlay = document.getElementById('gesture-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    toggleTracking() {
        if (this.isActive) {
            this.stopHandTracking();
        } else {
            this.startHandTracking();
        }
    }
}

// Initialize when DOM is ready
function initializeHandTracking() {
    if (!window.handGestureController) {
        console.log('[HandTracking] Initializing HandGestureController...');
        window.handGestureController = new HandGestureController();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHandTracking);
} else {
    initializeHandTracking();
}

// Log support info
console.log('[HandTracking] Module loaded. Browser info:', {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    onLine: navigator.onLine
});
