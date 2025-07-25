class VoiceChatbot {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.recordingTimer = null;
        this.speechSynthesis = window.speechSynthesis;

        this.initializeElements();
        this.bindEvents();
        this.loadMessages();
        this.checkMicrophonePermission();
    }

    initializeElements() {
        this.micBtn = document.getElementById('mic-btn');
        this.recordingStatus = document.getElementById('recording-status');
        this.recordingRing = document.getElementById('recording-ring');
        this.recordingDuration = document.getElementById('recording-duration');
        this.stopRecordingBtn = document.getElementById('stop-recording-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        this.helpBtn = document.getElementById('help-btn');
        this.messagesContainer = document.getElementById('messages');
        this.welcomeMessage = document.getElementById('welcome-message');
        this.errorMessage = document.getElementById('error-message');
        this.processingOverlay = document.getElementById('processing-overlay');
        this.statusText = document.getElementById('status-text');
        this.microphoneStatus = document.querySelector('.microphone-status');
        this.apiStatus = document.querySelector('.api-status');
    }

    bindEvents() {
        this.micBtn.addEventListener('click', () => this.toggleRecording());
        this.stopRecordingBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearChat());
        this.settingsBtn.addEventListener('click', () => this.showSettings());
        this.helpBtn.addEventListener('click', () => this.showHelp());
    }

    async checkMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            this.updateMicrophoneStatus('ready');
        } catch (error) {
            console.error('Microphone permission denied:', error);
            this.updateMicrophoneStatus('error');
        }
    }

    updateMicrophoneStatus(status) {
        const statusDot = this.microphoneStatus;
        statusDot.className = 'status-dot microphone-status';

        if (status === 'ready') {
            statusDot.classList.add('ready');
        } else if (status === 'error') {
            statusDot.classList.add('error');
        }
    }

    updateAPIStatus(status) {
        const statusDot = this.apiStatus;
        statusDot.className = 'status-dot api-status';

        if (status === 'connected') {
            statusDot.classList.add('ready');
        } else if (status === 'error') {
            statusDot.classList.add('error');
        }
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];
            this.isRecording = true;
            this.recordingStartTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };

            this.mediaRecorder.start();
            this.updateRecordingUI(true);
            this.startRecordingTimer();

            this.updateMicrophoneStatus('ready');

        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showError('Microphone access denied. Please allow microphone access to use voice features.');
            this.updateMicrophoneStatus('error');
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            this.updateRecordingUI(false);
            this.stopRecordingTimer();
        }
    }

    async processRecording() {
        if (this.audioChunks.length === 0) {
            this.showError('No audio was captured. Please try again.');
            return;
        }

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log('Audio blob created:', audioBlob.size, 'bytes');

        this.showProcessing(true);

        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');

            const response = await fetch('/api/voice-message', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to process voice message');
            }

            const data = await response.json();
            this.addMessage(data.user_message);
            this.addMessage(data.assistant_message);

            // Autoplay assistant response
            this.speakText(data.assistant_message.content);

            this.updateAPIStatus('connected');

        } catch (error) {
            console.error('Error processing voice message:', error);
            this.showError(`Failed to process voice message: ${error.message}`);
            this.updateAPIStatus('error');
        } finally {
            this.showProcessing(false);
        }
    }

    updateRecordingUI(recording) {
        if (recording) {
            this.micBtn.classList.add('recording');
            this.micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            this.recordingStatus.style.display = 'block';
            this.recordingRing.style.display = 'block';
            this.statusText.textContent = 'Recording...';
        } else {
            this.micBtn.classList.remove('recording');
            this.micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            this.recordingStatus.style.display = 'none';
            this.recordingRing.style.display = 'none';
            this.statusText.textContent = 'Ready to chat';
        }
    }

    startRecordingTimer() {
        this.recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.recordingDuration.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        this.recordingDuration.textContent = '00:00';
    }

    async loadMessages() {
        try {
            const response = await fetch('/api/messages');
            const messages = await response.json();

            if (messages.length > 0) {
                this.welcomeMessage.style.display = 'none';
                messages.forEach(message => this.addMessage(message));
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }

    addMessage(message) {
        if (this.welcomeMessage.style.display !== 'none') {
            this.welcomeMessage.style.display = 'none';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.role}`;

        const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        let actionsHtml = '';
        if (message.role === 'assistant') {
            actionsHtml = `
                <div class="message-actions">
                    <button class="play-btn" onclick="chatbot.speakText('${message.content.replace(/'/g, "\\'")}')">
                        <i class="fas fa-volume-up"></i> Play
                    </button>
                </div>
            `;
        } else if (message.role === 'user') {
            actionsHtml = `
                <div class="message-actions">
                    <i class="fas fa-microphone" style="color: #64748b; font-size: 0.75rem;"></i>
                    <span style="color: #64748b; font-size: 0.75rem;">Voice</span>
                </div>
            `;
        }

        messageDiv.innerHTML = `
            <div class="message-content">
                ${message.content}
            </div>
            <div class="message-info">
                <span>${timestamp}</span>
                ${actionsHtml}
            </div>
        `;

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    speakText(text) {
        if (this.speechSynthesis.speaking) {
            this.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        // Try to find a good voice
        const voices = this.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice =>
            voice.lang.startsWith('en') &&
            (voice.name.includes('Enhanced') || voice.name.includes('Premium'))
        ) || voices.find(voice => voice.lang.startsWith('en'));

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        this.speechSynthesis.speak(utterance);
    }

    async clearChat() {
        try {
            const response = await fetch('/api/messages', {
                method: 'DELETE'
            });

            if (response.ok) {
                this.messagesContainer.innerHTML = '';
                this.welcomeMessage.style.display = 'block';
                this.messagesContainer.appendChild(this.welcomeMessage);
                this.showSuccessMessage('Chat history cleared');
            }
        } catch (error) {
            console.error('Failed to clear chat:', error);
            this.showError('Failed to clear chat history');
        }
    }

    showSettings() {
        alert('Audio settings will be available in a future update.');
    }

    showHelp() {
        alert('Voice AI Chat Help:\n\nClick the microphone button to start recording your message. The AI will respond with both text and audio.\n\n• Hold the microphone button to record\n• Release to send your message\n• Click Play to hear AI responses\n• Use Clear to reset the conversation');
    }

    showError(message) {
        const errorDiv = this.errorMessage;
        errorDiv.querySelector('.error-description').textContent = message;
        errorDiv.style.display = 'block';

        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    showSuccessMessage(message) {
        // Create a temporary success notification
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.innerHTML = `
            <div class="success-content">
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            </div>
        `;
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dcfce7;
            border: 1px solid #bbf7d0;
            color: #166534;
            padding: 1rem;
            border-radius: 8px;
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        `;

        document.body.appendChild(successDiv);

        setTimeout(() => {
            document.body.removeChild(successDiv);
        }, 3000);
    }

    showProcessing(show) {
        this.processingOverlay.style.display = show ? 'flex' : 'none';
        this.statusText.textContent = show ? 'Processing...' : 'Ready to chat';
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// Initialize the chatbot when the page loads
let chatbot;
document.addEventListener('DOMContentLoaded', () => {
    chatbot = new VoiceChatbot();
});

// Handle speech synthesis voices loading
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
        // Voices loaded, ready to use
    };}