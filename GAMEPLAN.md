# BlueCollar AI - Multi-Tenant Voice Agent Bridge Architecture

## 🎯 Overview
Transform current single-tenant Azure voice agent into a multi-tenant SaaS platform that bridges with the main BlueCollar AI React.js/Firebase application.

## 🏗️ Architecture Decision
**HYBRID APPROACH** - Keep what works, bridge what's needed:
- **Azure Functions**: Handle all voice processing (real-time, optimized)
- **Vercel/React App**: Business management, dashboard, user interface
- **API Bridge**: Seamless integration between both systems

## 📋 Implementation Phases (Major Commits)

---

## **COMMIT 1: Multi-Tenant Foundation**

### 🎯 **WHAT** - What We're Building
Transform your single-tenant voice agent into a multi-tenant system that can handle calls for multiple businesses simultaneously.

**Core Features:**
- Phone number → Business identification system
- Firebase integration for business data lookup
- Multi-tenant database partitioning in Cosmos DB
- Business-specific AI prompts and greetings
- Backwards compatibility (current single calls still work)

### 📍 **WHERE** - What Gets Modified

#### **A) CODEBASE CHANGES (I'll handle these):**
```bash
# Azure Functions codebase modifications
├── shared/
│   ├── firebaseService.js        # NEW - Firebase Admin integration
│   ├── businessService.js        # NEW - Business lookup utilities  
│   └── multiTenantCosmosDB.js    # NEW - Multi-tenant DB operations
├── voice-twiml/index.js          # MODIFY - Add business lookup
├── voice-stream/index.js         # MODIFY - Business-scoped conversations
├── business-config/              # NEW - Business management API
│   ├── index.js                  # Get/update business voice settings
│   └── function.json             # HTTP trigger configuration
├── package.json                  # ADD - Firebase Admin SDK dependency
└── .env.example                  # UPDATE - New environment variables
```

#### **B) AZURE PORTAL CHANGES (You'll need to do these):**
```bash
# Azure Function App Configuration
1. Environment Variables to Add:
   - FB_PROJECT_ID=ai-assistant-c1c2c
   - FB_CLIENT_EMAIL=firebase-adminsdk-xxx@ai-assistant-c1c2c.iam.gserviceaccount.com
   - FB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

2. Function App Settings:
   - CORS: Add your React app domain (blucallerai.com)
   - Authentication: Enable if needed for business-config API

# No Cosmos DB changes needed in portal - we'll handle via code
```

#### **C) FIREBASE CHANGES (You might need to verify):**
- Ensure your Firebase project allows server-side Admin SDK access
- Verify service account has Firestore read permissions
- No code changes needed in your React app yet

### 🔧 **HOW** - Implementation Strategy

#### **Phase 1A: Firebase Integration (30 minutes)**
```javascript
// NEW: shared/firebaseService.js
const admin = require('firebase-admin');

class FirebaseService {
  constructor() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FB_PROJECT_ID,
          clientEmail: process.env.FB_CLIENT_EMAIL,
          privateKey: process.env.FB_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    }
    this.firestore = admin.firestore();
  }

  // Find business by phone number
  async findBusinessByPhone(phoneNumber) {
    const businessesQuery = await this.firestore.collection('businesses')
      .where('twilioNumbers', 'array-contains-any', [
        { phoneNumber: phoneNumber }
      ])
      .limit(1)
      .get();
    
    if (!businessesQuery.empty) {
      const businessDoc = businessesQuery.docs[0];
      return {
        businessId: businessDoc.id,
        data: businessDoc.data()
      };
    }
    
    // Fallback to default/demo business for backwards compatibility
    return {
      businessId: 'default',
      data: this.getDefaultBusinessConfig()
    };
  }
}
```

#### **Phase 1B: Multi-Tenant Database Operations (45 minutes)**
```javascript
// NEW: shared/multiTenantCosmosDB.js
class MultiTenantCosmosDB {
  constructor(cosmosClient) {
    this.client = cosmosClient;
    this.database = cosmosClient.database('VoiceAgentDB');
  }

  // Create business-scoped conversation session
  async createSession(businessId, callSid, customerPhone) {
    const container = this.database.container('conversations');
    const sessionId = `${businessId}_${callSid}`;
    
    const session = {
      id: sessionId,
      businessId: businessId,          // 🔥 NEW: Business partitioning
      callSid: callSid,
      customerPhone: customerPhone,
      messages: [],
      leadInfo: { contactInfo: {}, score: 0 },
      createdAt: new Date().toISOString(),
      businessScoped: true             // 🔥 NEW: Multi-tenant flag
    };
    
    await container.items.create(session);
    return session;
  }

  // Get business-scoped conversation
  async getSession(businessId, callSid) {
    const container = this.database.container('conversations');
    const sessionId = `${businessId}_${callSid}`;
    
    const { resource } = await container.item(sessionId).read();
    return resource;
  }
}
```

#### **Phase 1C: Voice Function Updates (60 minutes)**
```javascript
// MODIFY: voice-twiml/index.js
const { FirebaseService } = require('../shared/firebaseService');
const { MultiTenantCosmosDB } = require('../shared/multiTenantCosmosDB');

module.exports = async function (context, req) {
  const firebase = new FirebaseService();
  const twilioPhoneNumber = req.body.To; // Twilio webhook data
  
  // 🔥 NEW: Business lookup
  const business = await firebase.findBusinessByPhone(twilioPhoneNumber);
  context.log(`📞 Call for business: ${business.data.profile?.companyName || 'Default'}`);
  
  // Get business-specific AI configuration
  const aiConfig = await firebase.getBusinessAIConfig(business.businessId);
  
  // Use business-specific greeting or fallback to current
  const greeting = aiConfig?.greetingMessage || 
                   `Thank you for calling ${business.data.profile?.companyName || 'Blue Caller HVAC'}. How may I assist you today?`;
  
  // Generate voice response with business context
  const voiceResponse = await voiceManager.generateVoiceResponse(greeting, {
    emotion: 'friendly',
    urgencyLevel: 'normal',
    businessId: business.businessId,    // 🔥 NEW: Business context
    followUpPrompt: "I'm listening..."
  });
  
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: voiceResponse
  };
};
```

#### **Phase 1D: Business Configuration API (45 minutes)**
```javascript
// NEW: business-config/index.js
module.exports = async function (context, req) {
  const firebase = new FirebaseService();
  
  if (req.method === 'GET') {
    // Get business configuration
    const businessId = req.query.businessId;
    const businessData = await firebase.getBusinessData(businessId);
    const aiConfig = await firebase.getBusinessAIConfig(businessId);
    
    return {
      status: 200,
      body: {
        businessId,
        profile: businessData.profile,
        services: businessData.services,
        aiAssistant: aiConfig,
        industry: businessData.profile.industry
      }
    };
  }
  
  if (req.method === 'POST') {
    // Update business voice configuration
    const { businessId, aiConfig } = req.body;
    await firebase.updateBusinessAIConfig(businessId, aiConfig);
    
    return {
      status: 200,
      body: { success: true, message: 'Business configuration updated' }
    };
  }
};
```

### 🎯 **INTENDED GOAL** - Success Criteria

#### **Immediate Goals (After COMMIT 1):**
1. **✅ Multi-Business Support**: Single Azure Functions app handles calls for multiple businesses
2. **✅ Business Identification**: Phone number automatically routes to correct business context  
3. **✅ Custom Greetings**: Each business gets their own AI greeting message
4. **✅ Data Isolation**: Conversations and leads are business-scoped in Cosmos DB
5. **✅ Backwards Compatibility**: Existing calls still work exactly the same

#### **Technical Validation:**
```bash
# Test scenarios after COMMIT 1:
1. Call current number → Still works with "Blue Caller HVAC" greeting
2. Call with business lookup → Gets custom business greeting
3. Database check → Conversations have businessId field
4. API test → business-config endpoint returns business data
5. Multi-tenant test → Multiple businesses can use system simultaneously
```

#### **Business Value:**
- **🚀 Scalability**: Can onboard unlimited businesses without code changes
- **💰 Revenue**: Each business becomes a paying customer  
- **🎯 Personalization**: Industry-specific AI responses per business
- **📊 Analytics**: Business-specific call tracking and metrics
- **🔧 Management**: Centralized control via your React dashboard

#### **Risk Mitigation:**
- **Zero Downtime**: Current voice agent continues working during deployment
- **Gradual Rollout**: New businesses opt-in, existing usage unchanged
- **Fallback System**: Unknown phone numbers default to current behavior
- **Data Safety**: Business data isolation prevents cross-contamination

**🔥 COMMIT 1 transforms your voice agent from single-tenant to enterprise-ready multi-tenant SaaS platform!**

### Firebase Business Structure (From Your Docs)
```typescript
// Exact structure from your Firebase businesses collection
interface Business {
  profile: {
    companyName: string;
    businessType: string; // Legacy field
    industry: string; // Normalized industry (hvac, plumbing, electrical, etc.)
    businessCategory: string;
    industryTemplate: string;
    companySize: number;
    yearsInBusiness: number;
    businessAddress: { street, city, state, zip };
    website?: string;
    businessDescription?: string;
    serviceAreas: string[];
  };
  services: {
    list: string[];
    consultDuration: number;
    consultFee: number;
  };
  schedule: {
    weekdayHours: { open: string; close: string; };
    weekendHours: { open: string; close: string; };
    emergencyHours?: string;
    emergencyFee: number;
    lunchBreak?: string;
  };
  owner: {
    uid: string; // This IS the businessId
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    isGoogle: boolean;
  };
  meta: {
    status: 'active' | 'inactive';
    phoneNumberProvisioned: boolean; // ✅ Critical for phone mapping
    phoneNumberProvisionedAt: string;
    subscription?: BusinessSubscription;
  };
  twilioNumbers: TwilioNumber[]; // ✅ Phone mapping structure
}

// Twilio number mapping structure
interface TwilioNumber {
  phoneNumber: string; // E.164 format: "+12792405162"
  sid: string; // Twilio SID: "PNxxxxxx"
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean; };
  dateAssigned: string;
  isActive: boolean;
  isMock: boolean; // For development mode
}

// AI Assistant configuration (separate collection)
interface AIAssistantConfig {
  businessId: string; // References business owner's UID
  voiceStyle: 'professional' | 'friendly' | 'casual' | 'authoritative';
  gender: 'neutral' | 'male' | 'female';
  responseTone: 'friendly' | 'professional' | 'casual' | 'energetic';
  greetingMessage: string;
  businessSlogan: string;
  bufferTime: number;
  serviceRadius: number;
  humanForwarding: {
    enabled: boolean;
    phoneNumber: string;
    transferThreshold: number;
  };
  // ... extensive configuration from your docs
}
```

---

## **COMMIT 2: Business Configuration API Bridge**
### What We're Building
Create API endpoints that allow your React app to manage voice agent settings.

### New Azure Function Endpoints
- [ ] `GET /api/business-config` - Retrieve business configuration
- [ ] `POST /api/business-config` - Update business settings
- [ ] `GET /api/business-stats` - Get call analytics for business
- [ ] `POST /api/test-voice` - Test voice configuration

### React App Integration Points
- [ ] API service to communicate with Azure Functions
- [ ] Authentication/authorization for API calls
- [ ] Business settings management UI

### Authentication & API Configuration (From Your Docs)
```typescript
// ✅ CONFIRMED: Session Cookie Authentication (Recommended)
const authConfig = {
  method: "session_cookie", // Your preferred method
  azureFunctionUrl: "https://func-blucallerai-dkavgbhvdkesgmer.westus-01.azurewebsites.net",
  
  // Session cookie verification (server-side)
  verifySessionCookie: async (sessionCookie: string) => {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    return {
      uid: decodedClaims.uid, // This IS the businessId 
      email: decodedClaims.email,
      businessId: decodedClaims.uid // Business owner's UID = business ID
    };
  }
}

// Firebase Admin config for Azure Functions
const firebaseAdminConfig = {
  projectId: "ai-assistant-c1c2c",
  privateKey: process.env.FB_PRIVATE_KEY,
  clientEmail: process.env.FB_CLIENT_EMAIL
}

// Phone number lookup strategy
const phoneToBusinessLookup = {
  // Method 1: Query Firebase businesses collection
  findByPhoneNumber: (phone: string) => {
    return firestore.collection('businesses')
      .where('twilioNumbers', 'array-contains-any', [{ phoneNumber: phone }])
      .limit(1).get();
  },
  
  // Method 2: Twilio AI backend JSON config (for real-time routing)
  configPath: "twilio-ai-backend/config/businesses.json"
}
```

---

## **COMMIT 3: Real-Time Call Data Sync**
### What We're Building
Webhook system to sync call data from Azure Functions back to your Firebase.

### Azure Functions Changes
- [ ] Add webhook sender after each call
- [ ] Call transcript and analytics posting
- [ ] Lead data synchronization
- [ ] Error handling and retry logic

### React App Webhook Endpoints
- [ ] `/api/webhooks/call-completed` - Receive call data
- [ ] `/api/webhooks/lead-created` - Receive new lead data
- [ ] `/api/webhooks/call-analytics` - Real-time analytics updates

### Webhook Integration (Based on Your Existing Structure)
```typescript
// ✅ Your existing webhook endpoints
const webhookEndpoints = {
  // Main app webhooks (already exist in your app)
  twilioVoice: "https://blucallerai.com/api/twilio/voice",
  twilioSms: "https://blucallerai.com/api/twilio/sms", 
  twilioStatus: "https://blucallerai.com/api/twilio/status",
  stripeWebhook: "https://blucallerai.com/api/stripe/webhook",
  
  // NEW: Azure Functions webhooks (we'll add these)
  callCompleted: "https://blucallerai.com/api/azure/call-completed",
  leadCreated: "https://blucallerai.com/api/azure/lead-created", 
  analytics: "https://blucallerai.com/api/azure/analytics"
}

// Firebase calls collection structure (matches your schema)
interface Call {
  id: string; // Twilio CallSid
  businessId: string; // Business owner's UID
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  status: 'completed' | 'missed' | 'failed' | 'transferred';
  duration: number; // Seconds
  recordingUrl?: string;
  transcription?: string;
  summary?: string;
  aiHandled: boolean;
  transferredToHuman: boolean;
  customerInfo?: {
    id?: string;
    name?: string;
    email?: string;
  };
  appointmentScheduled?: boolean;
  appointmentId?: string;
  createdAt: string;
  updatedAt: string;
}

// Webhook security (following your Twilio pattern)
const webhookAuth = {
  // Use HMAC signature verification (like Twilio)
  secret: process.env.AZURE_WEBHOOK_SECRET,
  headers: {
    'x-azure-signature': 'signature_here',
    'authorization': 'Bearer session-cookie' // For admin operations
  }
}
```

---

## **COMMIT 4: Industry-Specific AI Customization**
### What We're Building
Different AI personalities and knowledge bases for each industry.

### Azure Functions Changes
- [ ] Industry-specific system prompts
- [ ] Custom voice greetings per business
- [ ] Industry terminology and knowledge
- [ ] Emergency detection patterns per industry

### Industry Templates
- [ ] HVAC: Heating/cooling expertise, seasonal patterns
- [ ] Plumbing: Emergency prioritization, water damage
- [ ] Electrical: Safety-first approach, permit requirements
- [ ] Roofing: Weather damage, insurance claims
- [ ] General Contractor: Project scope, timeline estimation

### Industry Templates (From Your Normalized System)
```typescript
// ✅ Your normalized industry categories
const CANONICAL_INDUSTRIES = [
  'hvac', 'plumbing', 'electrical', 'roofing', 'general-contractor',
  'handyman', 'landscaping', 'pest-control', 'cleaning', 'locksmith',
  'painting', 'flooring', 'windows-doors', 'pool-spa', 'dental',
  'medical', 'veterinary', 'auto-repair', 'law-firm', 'accounting',
  'real-estate', 'insurance', 'consulting', 'general'
] as const;

// ✅ Your existing industry templates (from Twilio backend docs)
const INDUSTRY_TEMPLATES = {
  hvac: {
    template: "hvac_base",
    services: ["heating", "cooling", "air conditioning", "ventilation", "ductwork"],
    commonIssues: ["no heat", "no cooling", "strange noises", "high bills"],
    emergencyKeywords: ["no heat", "no air", "leak", "emergency"],
    systemPrompt: `You are a friendly customer service agent for {companyName}. 
                   Focus on heating, cooling, and ventilation services. 
                   Prioritize emergency calls with no heat or AC.`,
    greetingTemplate: "Thank you for calling {companyName}! How can we help with your heating and cooling needs today?"
  },
  plumbing: {
    template: "plumbing_base", 
    services: ["leak repair", "drain cleaning", "water heater", "pipe installation"],
    commonIssues: ["clogged drain", "water leak", "no hot water", "running toilet"],
    emergencyKeywords: ["leak", "flood", "no water", "burst pipe"],
    systemPrompt: `You are a friendly customer service agent for {companyName}.
                   Handle plumbing emergencies urgently, especially leaks and floods.`,
    greetingTemplate: "Thanks for calling {companyName}! What plumbing issue can we help you with?"
  },
  electrical: {
    template: "electrical_base",
    services: ["wiring", "outlet installation", "panel upgrade", "lighting"],
    commonIssues: ["power outage", "flickering lights", "outlet not working"],
    emergencyKeywords: ["no power", "sparks", "burning smell", "shock"],
    systemPrompt: `You are a professional electrical service representative for {companyName}.
                   Prioritize safety - any mention of sparks, burning smells, or shocks is an emergency.`,
    greetingTemplate: "Hello! Thank you for calling {companyName}. How can we help with your electrical needs?"
  }
  // ... we'll build out all 24 industries
};
```

---

## **COMMIT 5: Advanced Business Features**
### What We're Building
Premium features for business owners to customize their AI agent.

### Azure Functions Features
- [ ] Custom hold music/messages
- [ ] Appointment scheduling integration
- [ ] Multiple voice options per business
- [ ] A/B testing for different greetings
- [ ] Call routing rules

### React App Dashboard Features
- [ ] Voice agent simulator/tester
- [ ] Real-time call monitoring
- [ ] AI performance analytics
- [ ] Customer feedback collection

---

## **COMMIT 6: Scalability & Performance Optimization**
### What We're Building
Production-ready optimizations for handling thousands of businesses.

### Azure Functions Optimizations
- [ ] Connection pooling for databases
- [ ] Caching frequently accessed business configs
- [ ] Audio compression optimization
- [ ] Error handling and monitoring

### Monitoring & Analytics
- [ ] Application Insights integration
- [ ] Business-specific usage tracking
- [ ] Cost tracking per business
- [ ] Performance metrics and alerts

---

## **COMMIT 7: API Documentation & Testing**
### What We're Building
Complete API documentation and testing suite.

### Documentation
- [ ] OpenAPI/Swagger documentation
- [ ] Integration guides for React app
- [ ] Webhook documentation
- [ ] Error code reference

### Testing
- [ ] Unit tests for all functions
- [ ] Integration tests for API bridge
- [ ] Load testing for multiple businesses
- [ ] End-to-end voice call testing

---

## 🔧 All Information Collected! ✅

### ✅ Firebase Business Structure - CONFIRMED
- **Project ID**: `ai-assistant-c1c2c`
- **Business ID**: Business owner's UID (owner.uid)
- **Phone Mapping**: `twilioNumbers[]` array in business documents
- **Collections**: businesses, aiAssistants, calls, teamMembers, etc.

### ✅ Authentication Method - CONFIRMED  
- **Method**: Session Cookie Authentication
- **Firebase Admin**: Available with private key + client email
- **Authorization Header**: `Bearer <session-cookie>`
- **Business ID Resolution**: `decodedClaims.uid === businessId`

### ✅ Twilio Number Management - CONFIRMED
- **Provisioning**: `/api/twilio/provision-number` endpoint exists
- **Mapping Storage**: `twilioNumbers[]` array in Firebase business docs
- **Dev Mode**: Shared number `+12792405162` with unique business keys
- **Production**: Individual numbers per business

### ✅ Industry Data - CONFIRMED
- **24 Normalized Industries**: hvac, plumbing, electrical, roofing, etc.
- **Industry Templates**: Existing in Twilio backend config
- **AI Prompts**: Industry-specific system prompts defined
- **Emergency Keywords**: Per-industry emergency detection

### ✅ Webhook Security - CONFIRMED
- **Pattern**: HMAC signature verification (like Twilio)
- **Existing Endpoints**: Twilio + Stripe webhooks already implemented
- **New Endpoints**: `/api/azure/*` webhooks to add
- **Authentication**: Session cookies for admin operations

## 🚀 Ready to Start Building!

**ALL INFORMATION COLLECTED!** I have everything I need from your Firebase structure, authentication system, Twilio integration, and industry templates.

### **Next Step: COMMIT 1 - Multi-Tenant Foundation**

I'll now begin transforming your single-tenant Azure voice agent into a multi-tenant SaaS platform that seamlessly bridges with your BlueCollar AI React app.

**Key Integration Points Identified:**
- 📞 Phone number → Business lookup via Firebase `twilioNumbers[]`
- 🔐 Session cookie authentication with Firebase Admin
- 🏢 24 industry templates for specialized AI prompts  
- 📊 Real-time call data sync to your existing Firebase collections
- 🎯 Backwards compatible with your current voice agent

Each commit will be:
- ✅ Fully functional
- ✅ Backwards compatible  
- ✅ Ready for production
- ✅ Properly tested

**🔥 Ready to start COMMIT 1? Say "Let's build it!" and I'll begin the multi-tenant transformation!** 🎯
