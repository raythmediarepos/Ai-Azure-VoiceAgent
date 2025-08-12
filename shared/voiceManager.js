const AzureSpeechService = require('./azureSpeechService');

class VoiceManager {
    constructor() {
        console.log('🔍 VoiceManager Constructor - Debugging Environment Variables:');
        console.log('AZURE_STORAGE_CONNECTION_STRING exists:', !!process.env.AZURE_STORAGE_CONNECTION_STRING);
        console.log('AZURE_STORAGE_CONNECTION_STRING length:', process.env.AZURE_STORAGE_CONNECTION_STRING?.length || 0);
        console.log('All STORAGE env vars:', Object.keys(process.env).filter(k => k.includes('STORAGE')));
        
        this.azureSpeech = new AzureSpeechService();
        this.fallbackEnabled = true;
        this.baseUrl = 'https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net/api';
    }

    async generateVoiceResponse(text, context = {}) {
        console.log(`🎙️ Generating ALLOY TURBO voice response for: "${text.substring(0, 50)}..."`);
        
        const {
            isEmergency = false,
            customerName = null,
            emotion = 'neutral',
            urgencyLevel = 'normal',
            followUpPrompt = "I'm listening..."
        } = context;

        try {
            // ONLY use Azure Speech Services with Alloy Turbo - NO FALLBACKS
            console.log('🎤 Synthesizing with Azure Alloy Turbo (All-or-Nothing mode)');
            
            const azureResult = await this.azureSpeech.synthesizeSpeech(text, {
                isEmergency,
                emotion: this.getEmotionFromContext(urgencyLevel),
                emphasis: isEmergency,
                rate: this.azureSpeech.getVoiceRate(isEmergency, urgencyLevel)
            });

            if (azureResult.success) {
                console.log('✅ Azure Alloy Turbo synthesis successful');
                
                // Upload main audio to blob storage and get URL
                const audioUrl = await this.azureSpeech.cacheAudio(text, azureResult.audioData);
                
                if (audioUrl) {
                    console.log('✅ Main audio uploaded to blob storage');
                    
                    // Use single audio for cleaner, faster playback
                    return this.createAlloyTurboTwiML(audioUrl, null, context);
                } else {
                    console.error('❌ Failed to upload audio to blob storage');
                    throw new Error('Audio upload failed - no fallback allowed');
                }
            } else {
                console.error('❌ Azure Speech synthesis failed');
                throw new Error('Azure Speech failed - no fallback allowed');
            }

        } catch (error) {
            console.error('❌ ALLOY TURBO FAILED:', error.message);
            throw error; // Re-throw to cause function failure - no fallbacks!
        }
    }

    createAlloyTurboTwiML(audioUrl, followUpUrl, context = {}) {
        const { isEmergency = false } = context;
        
        // Use the actual Azure Alloy Turbo audio URLs from blob storage
        console.log('🎵 Creating TwiML with Alloy Turbo audio URLs');
        console.log('Main audio:', audioUrl.substring(0, 50) + '...');
        if (followUpUrl) console.log('Follow-up audio:', followUpUrl.substring(0, 50) + '...');
        
        const timeout = isEmergency ? '15' : '30';
        
        return `
            <Response>
                <Play>${audioUrl}</Play>
                <Gather input="speech" 
                        timeout="${timeout}" 
                        speechTimeout="auto" 
                        action="${this.baseUrl}/voice-stream" 
                        method="POST">
                </Gather>
                <Redirect>${this.baseUrl}/voice-twiml</Redirect>
            </Response>
        `.trim();
    }

    createTwilioFallbackTwiML(text, followUpPrompt, context = {}) {
        const { isEmergency = false, urgencyLevel = 'normal' } = context;
        const voice = this.azureSpeech.getTwilioFallbackVoice(isEmergency);
        const rate = this.azureSpeech.getVoiceRate(isEmergency, urgencyLevel);
        const timeout = isEmergency ? '15' : '30';
        
        return `
            <Response>
                <Say voice="${voice}" rate="${rate}">
                    ${this.escapeXML(text)}
                </Say>
                <Pause length="1"/>
                <Gather input="speech" 
                        timeout="${timeout}" 
                        speechTimeout="auto" 
                        action="${this.baseUrl}/voice-stream" 
                        method="POST">
                    ${this.createFollowUpSpeech(followUpPrompt, context)}
                </Gather>
                <Redirect>${this.baseUrl}/voice-twiml</Redirect>
            </Response>
        `.trim();
    }

    createFollowUpSpeech(followUpPrompt, context = {}) {
        const { isEmergency = false } = context;
        const voice = this.azureSpeech.getTwilioFallbackVoice(isEmergency);
        
        return `<Say voice="${voice}" rate="medium">${this.escapeXML(followUpPrompt)}</Say>`;
    }

    getEmotionFromContext(urgencyLevel) {
        switch (urgencyLevel) {
            case 'emergency': return 'concerned';
            case 'urgent': return 'helpful';
            case 'normal': return 'friendly';
            default: return 'neutral';
        }
    }

    escapeXML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Analyze conversation for voice context and personalization
    analyzeConversationContext(conversation) {
        if (!conversation || !conversation.messages) {
            return { urgencyLevel: 'normal' };
        }

        const recentMessages = conversation.messages.slice(-6);
        const allText = recentMessages.map(m => m.content).join(' ').toLowerCase();
        
        // Detect emergency indicators for voice adaptation
        const emergencyKeywords = ['emergency', 'urgent', 'no heat', 'no air', 'gas smell', 'broken', 'flooding', 'leak'];
        const isEmergency = emergencyKeywords.some(keyword => allText.includes(keyword));
        
        // Extract customer name if available for personalization
        const customerName = conversation.leadInfo?.contactInfo?.name || null;
        
        // Determine urgency level for voice tone
        let urgencyLevel = 'normal';
        if (isEmergency) urgencyLevel = 'emergency';
        else if (allText.includes('urgent') || allText.includes('asap') || allText.includes('soon')) urgencyLevel = 'urgent';
        
        return {
            isEmergency,
            customerName,
            urgencyLevel,
            emotion: isEmergency ? 'concerned' : 'friendly',
            serviceType: conversation.leadInfo?.serviceType || null
        };
    }

    // Generate contextual follow-up prompts based on conversation state
    generateContextualFollowUp(conversation) {
        if (!conversation || !conversation.leadInfo) {
            return "What else can I help you with today?";
        }

        const { leadInfo } = conversation;
        
        // Emergency situations get priority follow-up
        if (leadInfo.hasEmergency) {
            return "Can I get your address so we can send someone out right away?";
        }
        
        // If we have service type but no contact info
        if (leadInfo.serviceType && !leadInfo.contactInfo?.name) {
            return "What's your name for our records?";
        }
        
        // If we have name but no phone confirmation
        if (leadInfo.contactInfo?.name && !leadInfo.contactInfo?.phone) {
            return "And what's the best phone number to reach you?";
        }
        
        // If we have basic info but no specific service details
        if (leadInfo.contactInfo?.name && !leadInfo.serviceType) {
            return "What type of HVAC service do you need help with?";
        }
        
        // Default follow-up
        return "Is there anything else I can help you with today?";
    }

    // Create error response with appropriate voice
    createErrorResponse(errorMessage = "I'm sorry, I'm having technical difficulties. Please try calling back in a moment.") {
        const voice = this.azureSpeech.getTwilioFallbackVoice(false);
        
        return `
            <Response>
                <Say voice="${voice}">
                    ${this.escapeXML(errorMessage)}
                </Say>
                <Hangup />
            </Response>
        `.trim();
    }

    // Create greeting with potential personalization
    async createPersonalizedGreeting(customerName = null, isReturningCustomer = false) {
        let greetingText;
        
        if (isReturningCustomer && customerName) {
            greetingText = `Hi ${customerName}! Welcome back to Blue Caller HVAC. How can I help you today?`;
        } else if (customerName) {
            greetingText = `Hi ${customerName}! Thank you for calling Blue Caller HVAC. How can I help you today?`;
        } else {
            greetingText = "Hi! Thank you for calling Blue Caller HVAC. I'm your AI assistant and I'm here to help with all your heating and cooling needs. What can I help you with today?";
        }
        
        return await this.generateVoiceResponse(greetingText, {
            emotion: 'friendly',
            urgencyLevel: 'normal',
            followUpPrompt: "I'm listening..."
        });
    }
}

module.exports = VoiceManager;
