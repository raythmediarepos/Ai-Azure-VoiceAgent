# Firebase Database Setup & Collections Documentation

## Overview

This document provides a comprehensive overview of our Firebase Firestore database setup, including all collections, schemas, security rules, and design patterns used in the HVAC AI application.

## Firebase Configuration

### Project Details
- **Project ID**: `ai-assistant-c1c2c`
- **Environment**: Production/Development
- **Region**: Default (us-central1)

### Configuration Files
- **`firebase.json`**: Firebase project configuration
- **`firestore.rules`**: Security rules for Firestore collections
- **`firestore.indexes.json`**: Database indexes (currently empty)

## Database Architecture

### Design Patterns
1. **Document-per-Business**: Each business gets its own document ID (using business owner's UID)
2. **Nested Collections**: Team members and sub-documents stored as subcollections or arrays
3. **Permission-based Access**: Role-based security with owner/team member hierarchy
4. **Client-side Caching**: Extensive caching layer for performance optimization

### Security Model
- **Business Owners**: Full read/write access to their business data
- **Team Members**: Read access to business data, limited write access
- **Role-based Permissions**: Owner > Admin > Technician > Dispatcher

## Collection Schemas

### 1. `users/{userId}`
**Purpose**: Individual user authentication and profile data

```typescript
interface User {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: 'Owner' | 'Admin' | 'Technician' | 'Dispatcher';
  businessId: string; // References the business they belong to
  isGoogle: boolean;
  isInvitedUser: boolean;
  invitedBy?: string; // Email of inviter (for team members)
  createdAt: string;
}
```

**Security Rules**:
- Users can only read/write their own document
- Used for permission validation in other collections

---

### 2. `businesses/{businessId}`
**Purpose**: Core business profile and configuration data

```typescript
interface Business {
  profile: {
    companyName: string;
    businessType: string; // Legacy field
    industry: string; // Normalized industry (NEW)
    businessCategory: string; // Category classification
    industryTemplate: string; // AI prompt template
    industryTemplateRef: string; // Template reference
    companySize: number;
    yearsInBusiness: number;
    businessAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
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
    weekdayHours: {
      open: string;
      close: string;
    };
    weekendHours: {
      open: string;
      close: string;
    };
    emergencyHours?: string;
    emergencyFee: number;
    lunchBreak?: string;
  };
  owner: {
    uid: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    isGoogle: boolean;
  };
  meta: {
    status: 'active' | 'inactive';
    createdAt: string;
    updatedAt: string;
    subscription?: BusinessSubscription;
  };
  // Legacy: team subcollection (member_1, member_2, etc.)
  team?: {
    [memberId: string]: TeamMemberLegacy;
  };
}
```

**Security Rules**:
- Read: Business owners and team members
- Write: Business owners only

---

### 3. `teamMembers/{businessId}`
**Purpose**: Team member management for each business

```typescript
interface TeamMembersDocument {
  businessId: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string; // User UID
  name: string;
  email: string;
  phone?: string;
  role: 'Owner' | 'Admin' | 'Technician' | 'Dispatcher';
  status: 'Active' | 'Inactive';
  joinDate: string;
  createdAt: string;
  updatedAt: string;
}
```

**Security Rules**:
- Read: Business owners and team members
- Write: Business owners only

---

### 4. `invitations/{invitationToken}`
**Purpose**: Team member invitation management

```typescript
interface Invitation {
  token: string; // Unique invitation token
  email: string;
  role: 'Admin' | 'Technician' | 'Dispatcher';
  name: string;
  phone?: string;
  businessId: string;
  businessName: string;
  invitedBy: {
    uid: string;
    email: string;
    name: string;
  };
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  createdAt: string;
  expiresAt: string; // 7 days from creation
}
```

**Security Rules**:
- Read: Business owners and invited email recipients
- Write: Business owners only
- Create: Business owners only

---

### 5. `customers/{businessId}`
**Purpose**: Customer management and contact information

```typescript
interface CustomersDocument {
  businessId: string;
  customers: Customer[];
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  id: string; // UUID
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  status: 'Active' | 'Inactive' | 'Prospect';
  customerType: 'Residential' | 'Commercial';
  totalJobs: number; // Calculated from calendar events
  totalSpent: number; // Calculated from services
  lastServiceDate: string;
  notes: string;
  rating: number; // 0-5 stars
  createdAt: string;
  updatedAt: string;
}
```

**Security Rules**:
- Read/Write: Business owners and team members

---

### 6. `calendars/{eventId}`
**Purpose**: Appointment and job scheduling

```typescript
interface CalendarEvent {
  id: string; // Event UUID
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  businessId: string; // Business this event belongs to
  teamMember?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  customer?: {
    id: string; // References customer from customers collection
    name: string;
    phone: string;
    address: string;
    email: string;
  };
  service?: {
    id: string;
    name: string;
    price: number;
    description?: string;
    category?: string;
  };
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled' | 'busy';
  priority: 'low' | 'medium' | 'high';
  recurring?: {
    pattern: 'daily' | 'weekly' | 'monthly';
    endDate?: Date;
  };
  conflictsWith?: string[]; // Array of conflicting event IDs
  createdAt: Date;
  updatedAt: Date;
}
```

**Security Rules**:
- Read/Update/Delete: Business owners and team members
- Create: Business owners and team members (with businessId validation)

---

### 7. `aiAssistants/{businessId}`
**Purpose**: AI assistant configuration and analytics

```typescript
interface AIAssistantConfig {
  businessId: string;
  
  // Voice & Personality
  voiceStyle: 'professional' | 'friendly' | 'casual' | 'authoritative';
  gender: 'neutral' | 'male' | 'female';
  responseTone: 'friendly' | 'professional' | 'casual' | 'energetic';
  greetingMessage: string;
  businessSlogan: string;
  
  // Business Operations
  bufferTime: number; // Minutes between appointments
  serviceRadius: number; // Miles
  humanForwarding: {
    enabled: boolean;
    phoneNumber: string;
    transferThreshold: number;
    transferReasons?: string[];
    operatorMessage?: string;
  };
  
  // Communication Features
  smsConfirmation: {
    enabled: boolean;
    template: string;
    testPhoneNumber?: string;
    appointmentReminder?: {
      enabled?: boolean;
      hours?: number;
      template?: string;
    };
    followUpMessage?: {
      enabled?: boolean;
      hours?: number;
      template?: string;
    };
  };
  
  reviewRequests: {
    enabled: boolean;
    reviewLink: string;
    customPrompt?: string;
    timing?: string;
    automationRules?: {
      postService?: boolean;
      highRatings?: boolean;
      delayDays?: number;
      delayHours?: number;
      followUpEnabled?: boolean;
    };
  };
  
  // Advanced Configuration
  advancedPersonality?: {
    conversationStyle?: string;
    businessValues?: string[];
    customResponses?: {
      greeting?: string;
      booking?: string;
      pricing?: string;
      availability?: string;
      fallback?: string;
      closing?: string;
      hold?: string;
      unavailable?: string;
    };
    followUpBehavior?: {
      enabled?: boolean;
      frequency?: string;
      maxAttempts?: number;
    };
  };
  
  businessHours?: {
    enabled?: boolean;
    timezone?: string;
    schedule?: {
      [dayOfWeek: string]: {
        open: string;
        close: string;
        isOpen: boolean;
      };
    };
    holidayMode?: boolean;
    emergencyHandling?: {
      enabled?: boolean;
      afterHoursMessage?: string;
      emergencyKeywords?: string[];
      escalationNumber?: string;
    };
  };
  
  callHandling?: {
    holdMusic?: {
      enabled?: boolean;
      type?: string;
      customUrl?: string;
    };
    maxWaitTime?: number;
    transferMessage?: string;
    callRecording?: {
      enabled?: boolean;
      notification?: boolean;
      transcription?: boolean;
      retention?: number;
    };
    voicemail?: {
      enabled?: boolean;
      greeting?: string;
      transcription?: boolean;
      emailNotification?: boolean;
    };
  };
  
  // Analytics
  callAnalytics: {
    callsHandled: number;
    successRate: number;
    avgDurationMinutes: number;
    lastMonthCallsHandled: number;
    lastMonthSuccessRate: number;
    lastMonthAvgDurationMinutes: number;
  };
  
  createdAt: string;
  updatedAt: string;
}
```

**Security Rules**:
- Read: Business owners and team members
- Write: Business owners only

---

### 8. `calls/{callId}`
**Purpose**: Call history and analytics (future implementation)

```typescript
interface Call {
  id: string;
  businessId: string;
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
```

**Security Rules**:
- Read/Write: Business owners and team members

---

### 9. `interests/{industry}/entries/{entryId}`
**Purpose**: Lead capture for industry-specific coming soon pages

```typescript
interface InterestEntry {
  email: string;
  source: string; // 'coming-soon' | 'landing-page' | etc.
  createdAt: string;
}
```

**Collection Structure**:
```
interests/
  ├── hvac/
  │   └── entries/
  │       ├── {entryId1}
  │       └── {entryId2}
  ├── plumbing/
  │   └── entries/
  │       └── {entryId1}
  └── electrical/
      └── entries/
          └── {entryId1}
```

**Security Rules**:
- Write: Public (rate-limited)
- Read: Admin only

---

## Subscription & Payment Integration

### Stripe Integration
The application integrates with Stripe for subscription management:

```typescript
interface BusinessSubscription {
  plan: 'none' | 'free' | 'trial' | 'starter' | 'pro' | 'elite';
  status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'cancelled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  checkoutSessionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEndsAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  willCancelAt?: string;
  lastPaymentFailed?: string;
  updatedAt: string;
  trialStatus?: {
    hasUsedTrial: boolean;
    trialStartDate?: string;
    trialEndDate?: string;
  };
}
```

**Plan Configurations**:
- **Free**: 0 calls, basic features
- **Trial**: 1200 calls, full pro features for trial period
- **Starter**: 600 calls/month, $150/month
- **Pro**: 1200 calls/month, $350/month
- **Elite**: 1500+ calls/month, $600/month

---

## Security Rules

### Core Security Principles

1. **Authentication Required**: All operations require valid Firebase Auth
2. **Business Isolation**: Users can only access data for their business
3. **Role-based Access**: Different permissions based on user role
4. **Owner Privileges**: Business owners have full control

### Helper Functions

```javascript
// Check if user is business owner
function isBusinessOwner(businessId) {
  return request.auth != null && request.auth.uid == businessId;
}

// Check if user is team member
function isTeamMember(businessId) {
  return request.auth != null && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.businessId == businessId;
}

// Check if user has business access (owner or team member)
function hasBusinessAccess(businessId) {
  return isBusinessOwner(businessId) || isTeamMember(businessId);
}
```

### Collection-specific Rules

```javascript
// Users - own document access only
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}

// Businesses - read access for team, write for owners only
match /businesses/{businessId} {
  allow read: if hasBusinessAccess(businessId);
  allow write: if isBusinessOwner(businessId);
}

// Team Members - read access for team, write for owners only
match /teamMembers/{businessId} {
  allow read: if hasBusinessAccess(businessId);
  allow write: if isBusinessOwner(businessId);
}

// Invitations - complex rules for invitation management
match /invitations/{invitationId} {
  allow read: if request.auth != null && 
                 (request.auth.uid == resource.data.businessId || 
                  request.auth.email == resource.data.email);
  allow write: if request.auth != null && request.auth.uid == resource.data.businessId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.businessId;
}

// Calendar events - business team access
match /calendars/{eventId} {
  allow read, update, delete: if request.auth != null && 
                                 hasBusinessAccess(resource.data.businessId);
  allow create: if request.auth != null && 
                  hasBusinessAccess(request.resource.data.businessId);
}

// AI Assistants - read for team, write for owners
match /aiAssistants/{businessId} {
  allow read: if hasBusinessAccess(businessId);
  allow write: if isBusinessOwner(businessId);
}
```

---

## Caching Strategy

### Client-side Caching
The application implements extensive client-side caching for performance:

1. **Local Storage Cache**: 5-minute TTL for team members, customers
2. **Background Refresh**: Stale-while-revalidate pattern
3. **Cache Invalidation**: Manual refresh options available
4. **Business-scoped**: Cache keys include business ID

### Cache Implementation
```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  businessId: string;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
```

---

## API Integration Points

### External Services
1. **Twilio**: Voice calls and SMS
2. **Stripe**: Payment processing
3. **Address Validation**: Business address verification
4. **Email Services**: Invitation and notification emails

### Webhook Handlers
- **Stripe Webhooks**: `/api/stripe/webhook`
- **Twilio Webhooks**: `/api/twilio/voice`, `/api/twilio/sms`

---

## Migration & Data Management

### Recent Migrations
1. **Industry Normalization** (Ticket 1): Added `industry` field to businesses
2. **Subscription System**: Integrated Stripe payment processing
3. **Team Member Restructure**: Moved from subcollections to array-based storage

### Backup Strategy
- **Firebase Console**: Automated daily backups
- **Export Scripts**: Manual export capabilities for data migration

---

## Performance Optimization

### Indexing Strategy
- **Composite Indexes**: Created as needed for complex queries
- **Single Field Indexes**: Automatic for most fields
- **Query Optimization**: Limit results and use pagination

### Real-time Listeners
- **Business Profile**: Real-time updates via onSnapshot
- **Calendar Events**: Live updates for scheduling
- **Team Changes**: Immediate reflection of team modifications

---

## Development & Testing

### Environment Setup
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

### Local Development
```bash
# Start Firestore emulator
firebase emulators:start --only firestore

# Run with emulator
npm run dev
```

### Testing Strategy
- **Unit Tests**: Individual hook and utility testing
- **Integration Tests**: API endpoint validation
- **Security Rule Tests**: Firestore rules validation

---

## Monitoring & Analytics

### Firebase Console
- **Usage Metrics**: Read/write operations tracking
- **Performance Monitoring**: Query performance analysis
- **Error Reporting**: Real-time error tracking

### Custom Analytics
- **Business Metrics**: Subscription conversions, trial usage
- **Feature Usage**: AI assistant configuration adoption
- **System Health**: API response times, error rates

---

## Troubleshooting

### Common Issues
1. **Permission Denied**: Check security rules and user authentication
2. **Cache Stale Data**: Use manual refresh or clear cache
3. **Missing Documents**: Verify business profile completion
4. **Subscription Sync**: Check Stripe webhook processing

### Debug Tools
- **Firebase Console**: Real-time database viewer
- **Browser DevTools**: Network and console logging
- **API Logging**: Server-side request/response tracking

---

## Future Enhancements

### Planned Features
1. **Call Analytics Collection**: Detailed call tracking and metrics
2. **Advanced Reporting**: Business intelligence dashboard
3. **Multi-location Support**: Franchise and chain business support
4. **API Access**: Third-party integration capabilities

### Scalability Considerations
1. **Sharding Strategy**: Large business data partitioning
2. **Archive System**: Historical data management
3. **Read Replicas**: Geographic distribution for performance
4. **Batch Operations**: Bulk data processing optimizations

---

This documentation represents the current state of the Firebase database architecture and will be updated as the system evolves. For specific implementation details, refer to the codebase and individual API documentation.
