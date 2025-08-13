# Twilio Integration & External API Documentation

## Overview

This document provides comprehensive information about Twilio phone number mapping, authentication methods for external integrations (Azure Functions), industry categorization, and API endpoints with webhook configurations.

## Table of Contents

1. [Twilio Number Mapping](#twilio-number-mapping)
2. [Authentication Methods](#authentication-methods)
3. [Industry Types](#industry-types)
4. [API Endpoints](#api-endpoints)
5. [Webhook Configuration](#webhook-configuration)
6. [Code Examples](#code-examples)

---

## Twilio Number Mapping

### Phone Number to Business Relationship

The application maps Twilio phone numbers to businesses using a dual-system approach:

#### 1. **Firebase Firestore Storage** (Production)
Each business document stores Twilio numbers in the `twilioNumbers` array:

```typescript
interface TwilioNumber {
  phoneNumber: string;        // E.164 format: "+12792405162"
  sid: string;               // Twilio SID: "PNxxxxxx"
  friendlyName: string;      // Human-readable name
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  dateAssigned: string;      // ISO timestamp
  isActive: boolean;         // Active status
  isMock: boolean;          // Development mode flag
}

// Business document structure
interface Business {
  twilioNumbers: TwilioNumber[];
  meta: {
    phoneNumberProvisioned: boolean;
    phoneNumberProvisionedAt: string;
  };
  // ... other business fields
}
```

#### 2. **JSON Configuration File** (Twilio AI Backend)
The `twilio-ai-backend/config/businesses.json` file provides real-time call routing:

```json
{
  "+12792405162": {
    "businessId": "new-user-789",
    "businessName": "New User HVAC Business",
    "businessType": "HVAC",
    "greeting": "Hello! Thank you for calling New User HVAC Business...",
    "services": ["heating repair", "air conditioning service"],
    "businessHours": {
      "timezone": "America/New_York",
      "schedule": {
        "monday": { "open": "08:00", "close": "18:00", "isOpen": true }
      }
    },
    "emergencyNumber": "+12792405162",
    "lastUpdated": "2025-07-23T20:24:21.107Z"
  }
}
```

### Shared Number Support

For development/testing, multiple businesses can share the same phone number using unique keys:

```json
{
  "+12792405162-debug-final-999": {
    "businessKey": "+12792405162-debug-final-999",
    "isSharedNumber": true,
    "registeredAt": "2025-07-23T20:25:14.078Z",
    "phoneNumber": "+12792405162"
  }
}
```

### Number Assignment Logic

```typescript
// Auto-assignment logic
export async function autoAssignPhoneNumber(
  businessId: string,
  preferences: {
    areaCode?: string;
    region?: string;
    friendlyName?: string;
  } = {}
): Promise<PhoneNumberPurchaseResult> {
  
  // Check environment mode
  const shouldActuallyPurchase = await checkShouldPurchaseNumbers();
  
  if (!shouldActuallyPurchase) {
    // Development mode - use shared development number
    const developmentNumber = '+12792405162';
    return await purchasePhoneNumber(developmentNumber, businessId, preferences.friendlyName);
  }
  
  // Production mode - search and purchase new numbers
  const availableNumbers = await searchAvailablePhoneNumbers({
    voiceEnabled: true,
    smsEnabled: true,
    mmsEnabled: true,
    limit: 5,
    ...preferences,
  });
  
  return await purchasePhoneNumber(availableNumbers[0].phoneNumber, businessId);
}
```

---

## Authentication Methods

### Firebase Authentication Integration

The application uses Firebase Authentication with multiple integration points for external services:

#### 1. **Session Cookie Authentication** (Recommended for Azure Functions)

```typescript
// Server-side session verification
import { adminAuth } from '@/libs/firebaseAdmin';

export async function verifySessionCookie(sessionCookie: string) {
  try {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    return {
      uid: decodedClaims.uid,
      email: decodedClaims.email,
      businessId: decodedClaims.uid // Business owner's UID = business ID
    };
  } catch (error) {
    throw new Error('Invalid session cookie');
  }
}

// Usage in Azure Function
async function azureFunctionHandler(req: any) {
  const sessionCookie = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!sessionCookie) {
    return { status: 401, body: { error: 'Missing session cookie' } };
  }
  
  try {
    const user = await verifySessionCookie(sessionCookie);
    // Proceed with authenticated request
    return { status: 200, body: { user } };
  } catch (error) {
    return { status: 401, body: { error: 'Invalid authentication' } };
  }
}
```

#### 2. **ID Token Verification** (Alternative Method)

```typescript
// Verify Firebase ID token
export async function verifyIdToken(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };
  } catch (error) {
    throw new Error('Invalid ID token');
  }
}

// Client-side token generation
import { auth } from '@/libs/firebaseClient';

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return await user.getIdToken();
}
```

#### 3. **API Key Authentication** (Twilio AI Backend)

For the Twilio AI backend, API key authentication is used:

```typescript
// Middleware for API key validation
function validateApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'Unauthorized: API key required',
      hint: 'Include X-API-Key header or apiKey query parameter'
    });
  }

  const expectedApiKey = process.env.API_KEY || 'your-secret-api-key';
  
  if (apiKey !== expectedApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  
  next();
}

// Usage
app.use('/api/business', validateApiKey);
```

#### 4. **Authorization Headers Format**

```bash
# Session Cookie (Recommended)
Authorization: Bearer <session-cookie>

# ID Token
Authorization: Bearer <firebase-id-token>

# API Key (For Twilio Backend)
X-API-Key: <api-key>
```

---

## Industry Types

### Normalized Industry Categories

The application uses a normalized industry system for consistent categorization:

```typescript
// Primary industry categories
const CANONICAL_INDUSTRIES = [
  'hvac',
  'plumbing', 
  'electrical',
  'roofing',
  'general-contractor',
  'handyman',
  'landscaping',
  'pest-control',
  'cleaning',
  'locksmith',
  'painting',
  'flooring',
  'windows-doors',
  'pool-spa',
  'dental',
  'medical',
  'veterinary',
  'auto-repair',
  'law-firm',
  'accounting',
  'real-estate',
  'insurance',
  'consulting',
  'general'
] as const;

type Industry = typeof CANONICAL_INDUSTRIES[number];
```

### Industry Normalization Function

```typescript
// Industry normalization with alias mapping
const ALIAS_TO_INDUSTRY: Record<string, string> = {
  // Exact canonical values
  hvac: "hvac",
  plumbing: "plumbing",
  electrical: "electrical",
  
  // Legacy values
  residential_hvac: "hvac",
  commercial_hvac: "hvac", 
  home_services: "general",
  other: "general",
  
  // Common aliases/typos
  "heating-cooling": "hvac",
  "heating_cooling": "hvac",
  heating: "hvac",
  cooling: "hvac",
  electrician: "electrical",
  roofer: "roofing",
  contractor: "general-contractor",
};

export const normalizeBusinessTypeToIndustry = (value: string | undefined | null): string => {
  if (!value) return "general";
  
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const mapped = ALIAS_TO_INDUSTRY[normalized];
  
  if (mapped) return mapped;
  
  console.warn(`Unknown business type: "${value}" → using "general"`);
  return "general";
};
```

### Industry Configuration for AI

```typescript
// AI prompt templates by industry
const INDUSTRY_TEMPLATES = {
  hvac: {
    template: "hvac_base",
    services: ["heating", "cooling", "air conditioning", "ventilation", "ductwork"],
    commonIssues: ["no heat", "no cooling", "strange noises", "high bills"],
    emergencyKeywords: ["no heat", "no air", "leak", "emergency"]
  },
  plumbing: {
    template: "plumbing_base", 
    services: ["leak repair", "drain cleaning", "water heater", "pipe installation"],
    commonIssues: ["clogged drain", "water leak", "no hot water", "running toilet"],
    emergencyKeywords: ["leak", "flood", "no water", "burst pipe"]
  },
  electrical: {
    template: "electrical_base",
    services: ["wiring", "outlet installation", "panel upgrade", "lighting"],
    commonIssues: ["power outage", "flickering lights", "outlet not working"],
    emergencyKeywords: ["no power", "sparks", "burning smell", "shock"]
  }
};
```

---

## API Endpoints

### Base URLs and Configuration

```typescript
// Environment-based URLs
const API_BASE_URLS = {
  development: 'http://localhost:3000',
  production: process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com'
};

// Twilio AI Backend
const TWILIO_BACKEND_URL = {
  development: 'http://localhost:3000',
  production: 'https://your-twilio-backend.com'
};
```

### Main Application API Endpoints

#### Authentication Endpoints
```typescript
// POST /api/auth/login - User login
interface LoginRequest {
  idToken: string; // Firebase ID token
}

interface LoginResponse {
  ok: boolean;
  redirectTo: string;
  needsBusinessSetup: boolean;
  isGoogleUser: boolean;
}

// POST /api/auth/signup - User registration
interface SignupRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  companyName: string;
  businessType: string;
  // ... additional business fields
}

// POST /api/auth/logout - User logout
```

#### Business Management Endpoints
```typescript
// GET /api/business/data - Get business data
interface BusinessDataResponse {
  profile: BusinessProfile;
  services: Service[];
  team: TeamMember[];
  subscription: SubscriptionData;
}

// PUT /api/business/profile - Update business profile
interface BusinessProfileUpdateRequest {
  profile: Partial<BusinessProfile>;
  services?: Partial<ServicesConfig>;
  schedule?: Partial<ScheduleConfig>;
}

// POST /api/business/start-trial - Start trial subscription
// POST /api/business/complete-walkthrough - Complete onboarding
```

#### Team Management Endpoints  
```typescript
// GET /api/team-members - Get team members
// POST /api/team-members - Add team member
// PUT /api/team-members - Update team member
// DELETE /api/team-members?id={id} - Remove team member

// POST /api/team-members/invite - Send invitation
interface InviteRequest {
  email: string;
  name: string;
  role: 'Admin' | 'Technician' | 'Dispatcher';
  phone?: string;
}

// GET /api/team-members/invitations - Get pending invitations
```

#### Customer Management Endpoints
```typescript
// GET /api/costumers - Get customers
// POST /api/costumers - Add customer
// PUT /api/costumers - Update customer  
// DELETE /api/costumers?id={id} - Delete customer

interface CustomerRequest {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  customerType: 'Residential' | 'Commercial';
  notes?: string;
}
```

#### Calendar Management Endpoints
```typescript
// GET /api/calendar/events - Get calendar events
// POST /api/calendar/events - Create event
// PUT /api/calendar/events/[id] - Update event
// DELETE /api/calendar/events/[id] - Delete event

interface CalendarEvent {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  businessId: string;
  teamMember?: TeamMemberInfo;
  customer?: CustomerInfo;
  service?: ServiceInfo;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
}
```

#### AI Assistant Endpoints
```typescript
// GET /api/ai-assistant - Get AI configuration
// PUT /api/ai-assistant - Update AI configuration

interface AIAssistantConfig {
  voiceStyle: 'professional' | 'friendly' | 'casual' | 'authoritative';
  gender: 'neutral' | 'male' | 'female';
  responseTone: 'friendly' | 'professional' | 'casual' | 'energetic';
  greetingMessage: string;
  businessSlogan: string;
  bufferTime: number;
  serviceRadius: number;
  humanForwarding: HumanForwardingConfig;
  smsConfirmation: SMSConfig;
  reviewRequests: ReviewConfig;
  callAnalytics: CallAnalyticsData;
}

// POST /api/ai-assistant/init-analytics - Initialize analytics
```

#### Twilio Integration Endpoints
```typescript
// POST /api/twilio/provision-number - Provision phone number
interface ProvisionNumberRequest {
  areaCode?: string;
  region?: string;
  friendlyName?: string;
  force?: boolean;
}

// POST /api/twilio/voice - Voice webhook (Twilio calls this)
// POST /api/twilio/sms - SMS webhook
// POST /api/twilio/status - Call status webhook

// GET /api/twilio/init-config - Initialize Twilio configuration
```

#### Stripe Integration Endpoints
```typescript
// POST /api/stripe/checkout - Create checkout session
interface CheckoutRequest {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}

// POST /api/stripe/portal - Create customer portal session
// POST /api/stripe/webhook - Stripe webhook handler
```

### Twilio AI Backend Endpoints

```typescript
// Base URL: http://localhost:3000 (development)

// POST /twilio/incoming-call - Main webhook for incoming calls
interface IncomingCallRequest {
  CallSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction: string;
}

// POST /twilio/process-recording - Process recorded audio
// POST /twilio/follow-up - Handle follow-up responses
// GET /health - Health check endpoint

// Business management endpoints (require API key)
// GET /api/businesses - List all businesses
// POST /api/businesses - Register new business
// PUT /api/businesses/:businessId - Update business configuration
// DELETE /api/businesses/:businessId - Remove business

// Testing endpoints
// POST /upload-audio - Upload audio file for testing
```

---

## Webhook Configuration

### Twilio Webhook Setup

#### 1. **Voice Webhooks**
Configure in Twilio Console → Phone Numbers → Manage → Active numbers:

```bash
# Voice URL (when call is received)
https://your-domain.com/api/twilio/voice
Method: POST

# Voice Fallback URL (if primary fails)
https://your-domain.com/api/twilio/voice
Method: POST

# Status Callback URL (call status updates)
https://your-domain.com/api/twilio/status  
Method: POST
```

#### 2. **SMS Webhooks**
```bash
# SMS URL (when SMS is received)
https://your-domain.com/api/twilio/sms
Method: POST

# SMS Fallback URL
https://your-domain.com/api/twilio/sms
Method: POST
```

#### 3. **Webhook Security**
```typescript
// Verify Twilio signature (recommended)
import { validateRequest } from 'twilio';

export function verifyTwilioSignature(req: Request) {
  const signature = req.headers['x-twilio-signature'];
  const url = req.url;
  const body = req.body;
  
  const isValid = validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    body,
    url,
    signature
  );
  
  if (!isValid) {
    throw new Error('Invalid Twilio signature');
  }
}
```

### Stripe Webhook Configuration

```bash
# Webhook endpoint URL
https://your-domain.com/api/stripe/webhook
Events: customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed

# Webhook signature verification
export function verifyStripeSignature(req: Request) {
  const signature = req.headers['stripe-signature'];
  const payload = req.body;
  
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
  
  return event;
}
```

---

## Code Examples

### Complete Authentication Flow for Azure Functions

```typescript
// Azure Function with Firebase authentication
import { adminAuth } from './firebase-admin-config';

export async function azureFunction(context: any, req: any) {
  try {
    // Extract session cookie from Authorization header
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      context.res = {
        status: 401,
        body: { error: 'Missing or invalid authorization header' }
      };
      return;
    }
    
    const sessionCookie = authHeader.substring(7); // Remove "Bearer "
    
    // Verify session cookie
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    
    // Get business data from Firestore
    const businessId = decodedClaims.uid;
    const businessDoc = await firestore.collection('businesses').doc(businessId).get();
    
    if (!businessDoc.exists) {
      context.res = {
        status: 404,
        body: { error: 'Business not found' }
      };
      return;
    }
    
    const businessData = businessDoc.data();
    
    // Your business logic here
    const result = await processBusinessData(businessData);
    
    context.res = {
      status: 200,
      body: {
        success: true,
        data: result,
        businessId: businessId
      }
    };
    
  } catch (error) {
    context.log.error('Authentication error:', error);
    context.res = {
      status: 401,
      body: { error: 'Authentication failed' }
    };
  }
}
```

### Phone Number Lookup and Business Configuration

```typescript
// Get business configuration by phone number
export async function getBusinessByPhoneNumber(phoneNumber: string) {
  // Method 1: Search in Firestore businesses collection
  const businessesQuery = await firestore.collection('businesses')
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
  
  // Method 2: Check Twilio AI backend configuration  
  const twilioConfig = await fetch(`${TWILIO_BACKEND_URL}/api/businesses?phoneNumber=${phoneNumber}`, {
    headers: {
      'X-API-Key': process.env.TWILIO_API_KEY!
    }
  });
  
  if (twilioConfig.ok) {
    const config = await twilioConfig.json();
    return {
      businessId: config.businessId,
      data: config
    };
  }
  
  throw new Error(`No business found for phone number: ${phoneNumber}`);
}
```

### Industry-Specific AI Configuration

```typescript
// Configure AI assistant based on industry
export async function configureAIForIndustry(businessId: string, industry: string) {
  const industryTemplates = {
    hvac: {
      voiceStyle: 'professional',
      greetingMessage: 'Thank you for calling! How can we help with your heating and cooling needs today?',
      services: ['heating repair', 'AC installation', 'maintenance', 'emergency service'],
      emergencyKeywords: ['no heat', 'no cooling', 'leak', 'emergency'],
      businessHours: {
        typical: { open: '07:00', close: '19:00' },
        emergency: true
      }
    },
    plumbing: {
      voiceStyle: 'friendly',
      greetingMessage: 'Thanks for calling! What plumbing issue can we help you with?',
      services: ['leak repair', 'drain cleaning', 'water heater', 'pipe installation'],
      emergencyKeywords: ['leak', 'flood', 'no water', 'burst pipe'],
      businessHours: {
        typical: { open: '08:00', close: '18:00' },
        emergency: true
      }
    }
  };
  
  const config = industryTemplates[industry] || industryTemplates['general'];
  
  // Update AI assistant configuration
  await firestore.collection('aiAssistants').doc(businessId).set({
    businessId,
    voiceStyle: config.voiceStyle,
    greetingMessage: config.greetingMessage,
    services: config.services,
    emergencyKeywords: config.emergencyKeywords,
    businessHours: config.businessHours,
    industry: industry,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  
  return config;
}
```

### Complete API Request Examples

```bash
# Get business data with session cookie
curl -X GET "https://your-domain.com/api/business/data" \
  -H "Authorization: Bearer <session-cookie>" \
  -H "Content-Type: application/json"

# Provision Twilio number
curl -X POST "https://your-domain.com/api/twilio/provision-number" \
  -H "Authorization: Bearer <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "areaCode": "555", 
    "region": "US",
    "friendlyName": "Main Business Line"
  }'

# Update AI assistant configuration
curl -X PUT "https://your-domain.com/api/ai-assistant" \
  -H "Authorization: Bearer <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "voiceStyle": "professional",
    "greetingMessage": "Thank you for calling ACME HVAC!",
    "bufferTime": 15,
    "humanForwarding": {
      "enabled": true,
      "phoneNumber": "+15551234567"
    }
  }'

# Register business with Twilio AI backend
curl -X POST "https://twilio-backend.com/api/businesses" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "user-123",
    "phoneNumber": "+12792405162",
    "businessName": "ACME HVAC",
    "businessType": "HVAC",
    "greeting": "Thank you for calling ACME HVAC!"
  }'
```

### Environment Variables Reference

```bash
# Main Application (.env.local)
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase Admin
FB_PROJECT_ID=your-project-id
FB_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_ACTUALLY_PURCHASE=false  # Set to true for production

# Twilio AI Backend (.env)
API_KEY=your-secret-api-key-for-business-management
TWILIO_ACCOUNT_SID=ACxxxxx  
TWILIO_AUTH_TOKEN=your-auth-token
OPENAI_API_KEY=sk-...
PORT=3000
ALLOWED_ORIGINS=https://your-domain.com
```

---

This documentation provides a complete reference for integrating with the HVAC AI platform's Twilio system, authentication methods, industry categorization, and API endpoints. Use the code examples as templates for your Azure Functions or other external integrations.
