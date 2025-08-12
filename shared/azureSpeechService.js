const sdk = require('microsoft-cognitiveservices-speech-sdk');

class AzureSpeechService {
    constructor() {
        this.speechConfig = null;
        this.blobService = null;
        this.initializeService();
    }

    initializeService() {
        try {
            // Check if required environment variables are present
            if (!process.env.SPEECH_KEY || !process.env.SPEECH_REGION) {
                console.warn('⚠️ Azure Speech Services not configured - missing SPEECH_KEY or SPEECH_REGION');
                return;
            }

            // Initialize Azure Speech Services
            this.speechConfig = sdk.SpeechConfig.fromSubscription(
                process.env.SPEECH_KEY,
                process.env.SPEECH_REGION
            );

            // Set the Alloy Turbo multilingual voice - the most natural voice available
            this.speechConfig.speechSynthesisVoiceName = 'en-US-AlloyMultilingualNeural';
            
            // Configure optimized audio output for better Twilio streaming
            this.speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

            // Debug environment variables
            console.log('🔍 Environment Variables Debug:');
            console.log('SPEECH_KEY:', process.env.SPEECH_KEY ? 'Present' : 'Missing');
            console.log('SPEECH_REGION:', process.env.SPEECH_REGION || 'Missing');
            console.log('AZURE_STORAGE_CONNECTION_STRING:', process.env.AZURE_STORAGE_CONNECTION_STRING ? 'Present' : 'Missing');
            
            // Initialize blob storage for audio caching (required for Alloy Turbo)
            if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
                try {
                    const { BlobServiceClient } = require('@azure/storage-blob');
                    this.blobService = BlobServiceClient.fromConnectionString(
                        process.env.AZURE_STORAGE_CONNECTION_STRING
                    );
                    console.log('✅ Azure Blob Storage initialized successfully');
                    console.log('Connection string length:', process.env.AZURE_STORAGE_CONNECTION_STRING.length);
                } catch (error) {
                    console.error('❌ Azure Blob Storage initialization failed:', error.message);
                    console.error('Full error:', error);
                }
            } else {
                console.error('❌ AZURE_STORAGE_CONNECTION_STRING is undefined or empty');
                console.log('All env vars:', Object.keys(process.env).filter(k => k.includes('STORAGE')));
            }

            console.log('✅ Azure Speech Service initialized with Alloy Turbo voice');
        } catch (error) {
            console.error('❌ Failed to initialize Azure Speech Service:', error);
        }
    }

    async synthesizeSpeech(text, options = {}) {
        try {
            if (!this.speechConfig) {
                console.warn('⚠️ Azure Speech Services not available, using fallback');
                return { success: false, error: 'Speech service not initialized' };
            }

            console.log(`🎤 Synthesizing speech with Alloy Turbo: "${text.substring(0, 50)}..."`);

            // Create enhanced SSML for natural speech
            const ssml = this.createSSML(text, options);

            // Create synthesizer
            const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, null);

            return new Promise((resolve, reject) => {
                synthesizer.speakSsmlAsync(
                    ssml,
                    result => {
                        synthesizer.close();
                        
                        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                            console.log('✅ Speech synthesis completed successfully');
                            
                            // Convert audio buffer to base64 for TwiML
                            const audioBase64 = Buffer.from(result.audioData).toString('base64');
                            
                            resolve({
                                success: true,
                                audioData: audioBase64,
                                format: 'mp3',
                                duration: result.audioDuration
                            });
                        } else {
                            console.error('❌ Speech synthesis failed:', result.errorDetails);
                            resolve({
                                success: false,
                                error: result.errorDetails
                            });
                        }
                    },
                    error => {
                        synthesizer.close();
                        console.error('❌ Speech synthesis error:', error);
                        resolve({
                            success: false,
                            error: error.message
                        });
                    }
                );
            });

        } catch (error) {
            console.error('❌ Speech synthesis exception:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    createSSML(text, options = {}) {
        const {
            rate = 'medium',
            pitch = 'medium',
            emphasis = false,
            emotion = 'neutral',
            isEmergency = false
        } = options;

        // Adjust voice characteristics based on content urgency
        let adjustedRate = rate;
        let adjustedPitch = pitch;
        let expressionStyle = 'chat'; // Default to conversational
        
        if (isEmergency) {
            adjustedRate = 'fast';
            adjustedPitch = 'medium';
            expressionStyle = 'customerservice'; // More authoritative for emergencies
        }

        // Clean text for SSML and add natural pauses
        const cleanText = this.cleanTextForSSML(text);

        // Create simplified SSML optimized for consistent playback
        const ssml = `
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
                   xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
                <voice name="en-US-AlloyTurboMultilingualNeural">
                    <mstts:express-as style="chat" styledegree="1.0">
                        <prosody rate="${adjustedRate}">
                            ${cleanText}
                        </prosody>
                    </mstts:express-as>
                </voice>
            </speak>
        `.trim();

        return ssml;
    }

    cleanTextForSSML(text) {
        return text
            // Escape XML special characters
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
            // Add natural pauses for more conversational flow
            .replace(/\./g, '.<break time="400ms"/>')
            .replace(/\?/g, '?<break time="500ms"/>')
            .replace(/!/g, '!<break time="400ms"/>')
            .replace(/,/g, ',<break time="250ms"/>')
            .replace(/;/g, ';<break time="300ms"/>');
    }

    async cacheAudio(text, audioBase64) {
        console.log('🔍 cacheAudio called - Debug info:');
        console.log('this.blobService exists:', !!this.blobService);
        console.log('AZURE_STORAGE_CONNECTION_STRING in cacheAudio:', !!process.env.AZURE_STORAGE_CONNECTION_STRING);
        console.log('Env var length in cacheAudio:', process.env.AZURE_STORAGE_CONNECTION_STRING?.length || 0);
        
        // If blob service isn't initialized but environment variable exists, try to initialize it now
        if (!this.blobService && process.env.AZURE_STORAGE_CONNECTION_STRING) {
            console.log('🔧 Attempting to re-initialize blob service...');
            try {
                const { BlobServiceClient } = require('@azure/storage-blob');
                this.blobService = BlobServiceClient.fromConnectionString(
                    process.env.AZURE_STORAGE_CONNECTION_STRING
                );
                console.log('✅ Blob service successfully re-initialized!');
            } catch (error) {
                console.error('❌ Blob service re-initialization failed:', error.message);
                console.error('Full error:', error);
                return null;
            }
        }
        
        if (!this.blobService) {
            console.error('❌ Blob service not initialized - AZURE_STORAGE_CONNECTION_STRING missing');
            console.log('🔍 Re-checking environment variable:', process.env.AZURE_STORAGE_CONNECTION_STRING ? 'Present' : 'Missing');
            return null;
        }

        try {
            const containerName = 'alloy-turbo-audio';
            const textHash = require('crypto').createHash('md5').update(text).digest('hex');
            const timestamp = Date.now();
            const blobName = `alloy-turbo-${textHash}-${timestamp}.mp3`;
            
            const containerClient = this.blobService.getContainerClient(containerName);
            
            // Ensure container exists with public read access for blobs
            await containerClient.createIfNotExists({ access: 'blob' });
            
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            
            // Upload with proper headers for audio playback
                            await blockBlobClient.upload(audioBuffer, audioBuffer.length, {
                    blobHTTPHeaders: {
                        blobContentType: 'audio/mpeg',
                        blobCacheControl: 'public, max-age=86400', // Cache for 24 hours
                        blobContentEncoding: 'identity' // Ensure no compression
                    }
                });

            console.log(`✅ Alloy Turbo audio cached successfully: ${blobName}`);
            console.log(`🔗 Public URL: ${blockBlobClient.url}`);
            return blockBlobClient.url;
        } catch (error) {
            console.error('❌ Audio caching error:', error.message);
            console.error('Full error:', error);
            return null;
        }
    }

    // Enhanced Twilio neural voice fallback options
    getTwilioFallbackVoice(isEmergency = false, customerName = null) {
        // Use different voices based on context with the best available Twilio neural voices
        if (isEmergency) {
            return 'en-US-Neural2-A'; // Clear and authoritative for emergencies
        } else {
            return 'en-US-Neural2-H'; // Warm and friendly for normal interactions
        }
    }

    // Get voice rate based on context - optimized for natural conversation
    getVoiceRate(isEmergency = false, urgencyLevel = 'normal') {
        if (isEmergency || urgencyLevel === 'emergency') {
            return 'medium';
        } else if (urgencyLevel === 'urgent') {
            return 'medium';
        } else {
            return 'medium'; // Natural conversational speed
        }
    }
}

module.exports = AzureSpeechService;
