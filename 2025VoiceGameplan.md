# 2025 Azure Voice Live API Migration Plan

## Executive Summary

Migration from traditional Speech SDK orchestration to Azure's unified Voice Live API for superior real-time voice agent performance.

**Timeline**: 8 weeks (MAJOR architectural change)  
**Risk Level**: HIGH (Preview service, requires Azure Container Apps)  
**Expected Benefits**: 85% latency reduction (sub-300ms), professional voice quality, unified architecture
**CRITICAL**: Voice Live API is in PUBLIC PREVIEW - not production ready

---

## Current Architecture vs. 2025 Voice Live API

### **Current (Legacy 2024)**
```
Phone Call → Twilio → voice-twiml → Azure Speech Synthesis → Blob Storage → TwiML Play
                          ↓
User Speech → voice-stream → Speech-to-Text → OpenAI → Text-to-Speech → Blob → TwiML
```

**Issues:**
- 5-7 service hops per conversation turn
- Manual audio caching and blob management
- 2-4 second latency per response
- Complex error handling across multiple services

### **New (2025 Voice Live API)**
```
Phone Call → Twilio → WebSocket Gateway → Voice Live API → Direct Audio Stream
                                             ↓
                                    (Speech + AI + Voice unified)
```

**Benefits:**
- Single WebSocket connection
- Native real-time audio streaming
- Sub-second latency
- Built-in conversation management

---

## Technical Feasibility Analysis & Critical Constraints

### **🚨 CRITICAL LIMITATIONS**
- **PREVIEW SERVICE**: No SLA, potential breaking changes, service interruptions
- **REGIONAL RESTRICTIONS**: Only available in East US 2, Sweden Central, West US 2, Central India, South East Asia
- **AZURE FUNCTIONS INCOMPATIBLE**: Stateless design cannot handle persistent WebSocket connections
- **COMPLEX AUDIO CONVERSION**: Real-time 8kHz μ-law ↔ 24kHz PCM resampling required

### **✅ Compatible Requirements** 
- **Twilio Integration**: Voice Live API supports WebSocket (with audio format conversion)
- **Azure OpenAI**: Native integration with GPT-4o, GPT-4o-mini, Phi models
- **Enhanced Voice Quality**: Access to latest neural voices with advanced features
- **Cosmos DB**: Can still log conversations and leads (adapted for streaming events)

### **⚠️ MAJOR Architecture Changes Required**
- **Deploy Azure Container Apps** or App Service (Functions won't work)
- **Implement real-time audio resampling** (8kHz μ-law ↔ 24kHz PCM)
- **WebSocket-to-Twilio MediaStream bridge** with persistent connections
- **Replace ALL current Azure Functions** with Container Apps
- **Migrate to streaming conversation events** instead of request/response

### **✅ Backward Compatibility**
- Keep existing Cosmos DB schema
- Maintain same lead tracking logic
- Preserve existing environment variables
- Can run parallel during migration

---

## Migration Strategy (Zero-Downtime)

### **Phase 1: Parallel Implementation (Days 1-2)**
1. Create new WebSocket server alongside existing Azure Functions
2. Implement Voice Live API integration
3. Test with development phone number
4. Verify voice quality and conversation flow

### **Phase 2: Traffic Migration (Day 3)**
1. Update Twilio webhook to point to new WebSocket bridge
2. Monitor performance and error rates
3. Rollback capability to Azure Functions if needed

### **Phase 3: Cleanup (Day 4)**
1. Remove legacy Azure Functions if migration successful
2. Update documentation and monitoring

---

## Implementation Architecture

### **New Components Needed**

#### **1. WebSocket Bridge Server**
```javascript
// WebSocket server that bridges Twilio MediaStreams to Voice Live API
const WebSocket = require('ws');
const express = require('express');

class TwilioVoiceLiveBridge {
  constructor() {
    this.voiceLiveConnections = new Map();
    this.twilioConnections = new Map();
  }
  
  async handleTwilioCall(callSid, mediaStream) {
    // Create Voice Live API connection
    const voiceLiveWS = new WebSocket('wss://voicelive.azure.com/realtime');
    
    // Bridge audio between Twilio and Voice Live API
    this.bridgeAudioStreams(mediaStream, voiceLiveWS);
  }
}
```

#### **2. Voice Live API Configuration**
```javascript
const voiceLiveConfig = {
  model: 'gpt-4o-realtime-preview', // or gpt-4o-mini for cost savings
  voice: 'phoebe', // Native Phoebe integration
  instructions: 'You are Sarah, an AI assistant for Blue Caller HVAC...',
  modalities: ['text', 'audio'],
  temperature: 0.7
};
```

#### **3. Conversation Logger**
```javascript
// Stream conversation events to Cosmos DB
class ConversationLogger {
  async logVoiceLiveEvent(event, callSid) {
    switch(event.type) {
      case 'conversation.item.created':
        await this.saveMessage(event.item, callSid);
        break;
      case 'response.audio_transcript.done':
        await this.updateTranscript(event.transcript, callSid);
        break;
    }
  }
}
```

---

## Detailed Implementation Steps

### **Step 1: Environment Setup**
```bash
# Install additional dependencies
npm install ws express socket.io twilio-media-streams

# New environment variables
VOICE_LIVE_ENDPOINT=wss://voicelive.azure.com/realtime
VOICE_LIVE_KEY=your_voice_live_api_key
VOICE_LIVE_REGION=westus
```

### **Step 2: Create WebSocket Bridge**
Create new file: `voice-live-bridge/server.js`
- Express server for Twilio webhooks
- WebSocket server for media streams
- Voice Live API client integration
- Real-time audio bridging

### **Step 3: Voice Live API Integration**
Create new file: `voice-live-bridge/voiceLiveClient.js`
- WebSocket connection to Voice Live API
- Session management and configuration
- Event handling and response processing
- Error handling and reconnection logic

### **Step 4: Twilio Media Streams**
Create new file: `voice-live-bridge/twilioMediaHandler.js`
- Handle Twilio MediaStream WebSockets
- Audio format conversion (μ-law to PCM)
- Bidirectional audio streaming
- Call session management

### **Step 5: Conversation Logging**
Update existing: `shared/cosmosClient.js`
- Adapt to stream-based conversation events
- Maintain lead scoring and analytics
- Preserve existing database schema

---

## Cost Analysis - CORRECTED WITH ACTUAL PRICING

### **Current Costs (Estimated Monthly)**
- **Azure Functions**: ~$50/month (based on current usage)
- **Azure Speech Synthesis**: ~$200/month (per audio generation)
- **Azure Blob Storage**: ~$20/month (audio file storage)
- **Azure OpenAI**: ~$300/month (conversation processing)
- **Total Current**: ~$570/month

### **Voice Live API ACTUAL Costs (Effective July 2025)**

Based on official pricing from Azure documentation:

#### **🔥 Voice Live Pro (GPT-4o models)**
- **Text Tokens**: $5.50 per 1M tokens
- **Audio Input**: $17-$44 per 1M audio tokens
- **Audio Output**: $17-$44 per 1M audio tokens
- **Token Usage**: ~10 tokens/sec input, ~20 tokens/sec output
- **Estimated Monthly**: $800-1500/month for moderate usage ⚠️

#### **💰 Voice Live Basic (GPT-4o-mini models)** ⭐ RECOMMENDED
- **Text Tokens**: $0.66 per 1M tokens
- **Audio Input**: $11-$33 per 1M audio tokens  
- **Audio Output**: $11-$33 per 1M audio tokens
- **Estimated Monthly**: $400-800/month for moderate usage

#### **💸 Voice Live Lite (Phi models)**
- **Text Tokens**: $0.08 per 1M tokens
- **Audio Input**: $4-$50 per 1M audio tokens
- **Audio Output**: $4-$50 per 1M audio tokens
- **Estimated Monthly**: $200-600/month for moderate usage

### **Additional Infrastructure Costs**
- **Azure Container Apps**: ~$100-200/month (WebSocket hosting)
- **Azure AI Foundry Resource**: ~$50/month (base cost)
- **No blob storage costs** (direct streaming)
- **Regional data transfer**: ~$50-100/month

### **⚠️ TOTAL ESTIMATED COSTS - MUCH HIGHER THAN CURRENT**
- **Pro Tier**: $1000-1900/month (75-230% INCREASE)
- **Basic Tier**: $600-1200/month (5-110% INCREASE)  
- **Lite Tier**: $400-950/month (30-65% DECREASE to 65% INCREASE)

### **💭 Cost Reality Check**
Voice Live API is SIGNIFICANTLY more expensive than current architecture for most usage levels. Cost benefits only appear at very high volume with Lite tier.

---

## Voice Quality Comparison

### **Current Setup**
- Voice: Various attempts (Alloy, Phoebe with different names)
- Quality: Good but still "robotic" according to feedback
- Latency: 2-4 seconds per response
- Interruption: Not supported

### **Voice Live API**
- Voice: Native Phoebe with full personality traits
- Quality: Near-human with advanced neural processing
- Latency: <1 second response time
- Interruption: Built-in interruption detection and handling
- Features: Noise suppression, echo cancellation

---

## Risk Assessment

### **🟢 Low Risks**
- **Parallel Implementation**: Can test without affecting production
- **Rollback Plan**: Keep existing Azure Functions during migration
- **Proven Technology**: Voice Live API is Microsoft's production service
- **Same Data**: Cosmos DB and lead tracking remain unchanged

### **🟡 Medium Risks**
- **Learning Curve**: New WebSocket-based architecture
- **Twilio Integration**: Need to implement MediaStream bridge
- **Cost Variables**: Usage-based pricing requires monitoring

### **🔴 Mitigation Strategies**
- **Phased Rollout**: Start with test calls only
- **Monitoring**: Comprehensive logging and error tracking
- **Budget Alerts**: Set up cost monitoring and alerts
- **Documentation**: Detailed implementation guides

---

## Success Metrics

### **Performance Goals**
- **Latency**: <1 second average response time (vs. current 2-4s)
- **Voice Quality**: Subjective improvement in naturalness
- **Reliability**: >99.5% uptime
- **Cost**: 20-60% cost reduction

### **Business Goals**
- **Customer Experience**: More natural conversations
- **Lead Quality**: Maintain or improve lead capture rates
- **Operational**: Reduced maintenance complexity

---

## CORRECTED Implementation Timeline (8 Weeks)

### **🏗️ AZURE PORTAL SETUP REQUIREMENTS (Week 1)**

#### **CRITICAL: Create Azure AI Foundry Resource**
1. **Navigate to Azure Portal** → **Create a resource** → **Azure AI Foundry**
2. **MUST deploy in supported region**:
   - East US 2 ⭐ (recommended)
   - Sweden Central
   - West US 2
   - Central India
   - South East Asia
3. **Select pricing tier**: Standard (required for Voice Live API)
4. **Enable Voice Live API preview**: Contact Azure support or check preview access

#### **Create Azure Container Apps Environment**
1. **Azure Portal** → **Container Apps** → **Create**
2. **Resource Group**: Same as AI Foundry
3. **Region**: SAME as AI Foundry (critical for latency)
4. **Workload profiles**: Consumption + General purpose
5. **Networking**: VNet integration for security

#### **Configure Authentication**
1. **Azure AI Foundry** → **Access control (IAM)**
2. **Add role assignment**: "Cognitive Services User"
3. **Assign to**: Your managed identity or user account
4. **Enable Microsoft Entra ID authentication** (recommended over API keys)

### **Week 1-2: Infrastructure Foundation**
- [ ] Deploy Azure AI Foundry in supported region
- [ ] Create Container Apps environment
- [ ] Set up authentication and permissions
- [ ] Test Voice Live API connectivity
- [ ] Establish WebSocket connection framework

### **Week 3-4: Audio Processing Development**
- [ ] Implement real-time audio resampling (8kHz μ-law ↔ 24kHz PCM)
- [ ] Create Twilio MediaStream WebSocket handler
- [ ] Build audio buffering and streaming logic
- [ ] Test audio format conversion accuracy

### **Week 5-6: Voice Live API Integration**
- [ ] Implement Voice Live WebSocket client
- [ ] Handle session management and configuration
- [ ] Process streaming conversation events
- [ ] Integrate with existing Cosmos DB logging

### **Week 7-8: Testing and Deployment**
- [ ] End-to-end testing with development phone number
- [ ] Load testing and performance optimization
- [ ] Deploy to production Container Apps
- [ ] Gradual traffic migration with monitoring

---

## File Structure Changes

### **New Files to Create**
```
voice-live-bridge/
├── server.js                 # Main WebSocket bridge server
├── voiceLiveClient.js        # Voice Live API integration
├── twilioMediaHandler.js     # Twilio MediaStream handling
├── conversationLogger.js     # Cosmos DB logging adapter
├── config/
│   ├── voiceLiveConfig.js   # Voice Live API configuration
│   └── serverConfig.js      # Server and port configuration
├── utils/
│   ├── audioConverter.js    # Audio format conversion utilities
│   └── errorHandler.js      # Centralized error handling
└── package.json             # New dependencies
```

### **Files to Modify**
```
shared/
├── cosmosClient.js          # Adapt for streaming events
└── config.js               # Add new environment variables

README.md                    # Update architecture documentation
PROJECT_OVERVIEW.md          # Add Voice Live API section
```

### **Files to Potentially Remove** (after successful migration)
```
voice-twiml/                 # Legacy TwiML generation
voice-stream/                # Legacy conversation processing
shared/
├── azureSpeechService.js   # Legacy speech synthesis
└── voiceManager.js         # Legacy voice management
```

---

## CRITICAL Technical Requirements You Need to Address

### **🚨 REGIONAL CONSTRAINT CHECK**
**BEFORE STARTING**: Verify Voice Live API is available in your current region:
- Your current resources appear to be in **West US**
- Voice Live API requires **East US 2, Sweden Central, West US 2, Central India, or South East Asia**
- **West US 2** (not West US) is supported - you may need to migrate

### **🔧 Azure Portal Actions Required**
1. **Check current region** of existing resources
2. **Deploy Azure AI Foundry** in supported region (may be different from current)
3. **Create Container Apps environment** (cannot use existing Azure Functions)
4. **Request Voice Live API preview access** if not automatically available
5. **Configure cross-region connectivity** if AI Foundry is in different region

### **💾 Audio Processing Complexity**
Real-time audio format conversion is the most challenging aspect:
- **Twilio**: 8kHz μ-law audio in 20ms chunks
- **Voice Live API**: 24kHz 16-bit PCM base64 encoded
- **Requirements**: Sub-100ms conversion latency, minimal audio distortion
- **Tools needed**: scipy.signal, numpy, professional audio processing libraries

### **🔌 Architecture Replacement**
Your entire current system needs replacement:
- **Azure Functions → Container Apps** (Functions cannot handle WebSockets)
- **TwiML responses → Real-time streaming** (completely different pattern)
- **Blob storage → Direct streaming** (eliminate file operations)
- **Request/response → Event-driven** (streaming conversation events)

---

## HONEST RECOMMENDATION

### **🟥 HIGH RISK FACTORS**
1. **Preview Service**: No production SLA, potential service interruptions
2. **Cost Increase**: 50-200% higher costs for most usage patterns
3. **Complex Migration**: 8-week implementation with significant technical challenges
4. **Regional Constraints**: May require moving resources to different Azure region

### **🟨 ALTERNATIVE APPROACH**
Consider improving your current architecture instead:
- **Better voice name**: Continue fixing Phoebe voice name in current system
- **Optimize existing flow**: Reduce latency in current Azure Functions approach
- **Wait for GA**: Wait for Voice Live API general availability (more stable, potentially lower cost)

### **🟩 PROCEED ONLY IF**
- You're comfortable with preview service risks
- Budget allows for 50-200% cost increase
- You can dedicate 8 weeks to migration
- You have expertise in real-time audio processing

---

## Next Steps

### **Ready for Implementation?**

1. **Review this plan** and confirm it meets your requirements
2. **Choose cost tier** (Pro/Basic/Lite) based on your budget
3. **Green light the migration** and we'll begin Day 1 implementation
4. **Set up monitoring** for costs and performance during migration

### **Questions for You**

1. **Budget preference**: Which cost tier works best? (Pro: $450-550, Basic: $250-350, Lite: $150-200)
2. **Migration timing**: Preferred time for production switch (low-traffic hours)?
3. **Risk tolerance**: Comfortable with parallel implementation approach?
4. **Success criteria**: Any specific voice quality or performance benchmarks?

**Once you give the green light, I'll begin implementing this modern, efficient voice agent architecture! 🚀**
