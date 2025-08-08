# 🎯 AI Voice Agent with Business Intelligence

A production-ready AI voice assistant built on Azure that handles phone calls, conducts intelligent conversations, and automatically tracks leads with business intelligence.

## 🚀 What This System Does

### Core Functionality
- **Phone-based AI Assistant**: Customers call a phone number and have natural conversations with GPT-3.5-turbo
- **Persistent Memory**: All conversations are stored in Cosmos DB and remembered across calls
- **Lead Generation**: Automatically detects and scores potential customers
- **Business Intelligence**: Analyzes conversations for service types, urgency levels, and contact information
- **Real-time Dashboard**: Live analytics showing leads, conversations, and business metrics

### Business Value
- **Never lose a lead**: Every conversation is captured and analyzed
- **Automatic qualification**: AI scores leads based on urgency and service needs
- **Customer relationship building**: Remembers previous conversations and customer preferences
- **Emergency detection**: Immediately identifies urgent HVAC issues requiring same-day service
- **Performance analytics**: Track call volume, conversion rates, and service demand patterns

## 🏗️ Architecture Overview

### Azure Resources Used
- **Azure Functions** (`func-blucallerai`): Hosts the voice processing logic
- **Azure OpenAI** (`oai-blucallerai`): GPT-3.5-turbo for intelligent responses
- **Cosmos DB** (`cosmos-blucallerai`): MongoDB API for persistent storage
- **Application Insights**: Monitoring and logging

### Third-Party Integrations
- **Twilio**: Phone number management and speech recognition
- **Azure Speech Services**: Available but not currently used (Twilio handles STT/TTS)

## 📱 Call Flow

```
📞 Customer calls Twilio number
    ↓
🎵 Twilio performs speech-to-text
    ↓
📡 HTTP POST to voice-stream function
    ↓
🧠 Azure OpenAI generates response
    ↓
💾 Conversation saved to Cosmos DB
    ↓
📊 Business intelligence analysis
    ↓
🔊 TwiML response with AI speech
    ↓
🔄 Conversation continues...
```

## 🛠️ Technical Implementation

### Functions Overview

#### `voice-twiml` Function
- **Purpose**: Initial call handler that generates TwiML for Twilio
- **Returns**: XML with greeting and speech recognition setup
- **Triggers**: Incoming phone calls via Twilio webhook

#### `voice-stream` Function  
- **Purpose**: Core conversation processor
- **Receives**: Speech recognition results from Twilio (form-urlencoded)
- **Processing**: 
  - Parses speech results
  - Filters low-confidence responses
  - Manages conversation context with Cosmos DB
  - Calls Azure OpenAI for responses
  - Performs business intelligence analysis
  - Returns TwiML for continued conversation

#### `lead-dashboard` Function
- **Purpose**: Real-time analytics dashboard
- **Features**: Lead scoring, service type breakdown, conversation history
- **Access**: `https://func-blucallerai-....azurewebsites.net/api/lead-dashboard`

#### `voice-test` Function
- **Purpose**: System health check and service verification
- **Tests**: Azure OpenAI connectivity, Speech service config, environment variables

### Data Models

#### Conversation Document
```javascript
{
  callSid: "CA1234...",           // Twilio call identifier
  phoneNumber: "+1234567890",     // Caller's phone number
  timestamp: Date,                // Call start time
  messages: [                     // Complete conversation history
    { role: "system", content: "..." },
    { role: "user", content: "I need heating repair" },
    { role: "assistant", content: "I can help with that..." }
  ],
  leadInfo: {
    hasEmergency: false,
    serviceType: "heating",
    contactInfo: { name: "John Smith" },
    urgencyLevel: "normal",
    qualificationScore: 75
  },
  status: "active"
}
```

#### Lead Document
```javascript
{
  phoneNumber: "+1234567890",
  firstContact: Date,
  lastContact: Date,
  score: 75,                      // 0-100 qualification score
  hasEmergency: false,
  serviceType: "heating",
  contactInfo: { name: "John", phone: "..." },
  urgencyLevel: "normal",
  callHistory: ["CA123...", "CA456..."],
  status: "new"
}
```

## 🎯 Business Intelligence Features

### Automatic Lead Scoring
- **Base Score**: 10 points for any interaction
- **Emergency**: +50 points (gas smell, no heat, electrical issues)
- **Service Types**: Installation (+40), Heating/Cooling (+30), Repair (+25), Maintenance (+15)
- **Contact Info**: Name (+15), Phone (+20)
- **Urgency**: Emergency (+30), High (+15)

### Service Type Detection
- **Heating**: Keywords like "heat", "furnace", "boiler", "warm"
- **Cooling**: Keywords like "cool", "AC", "air conditioning", "cold"  
- **Maintenance**: Keywords like "service", "tune up", "check", "inspect"
- **Installation**: Keywords like "install", "new", "replace"
- **Repair**: Keywords like "repair", "fix", "broken", "not working"

### Emergency Detection
Automatically flags calls containing: "emergency", "urgent", "no heat", "no air", "gas smell", "electrical", "flooding", "leak"

## 🔧 Configuration

### Environment Variables
```
OPENAI_ENDPOINT=https://oai-blucallerai.openai.azure.com/
OPENAI_KEY=your_openai_key
COSMOS_CONN=mongodb://cosmos-connection-string
SPEECH_ENDPOINT=https://speech-blucallerai.cognitiveservices.azure.com/
SPEECH_KEY=your_speech_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
```

### Twilio Configuration
- **Phone Number Webhook**: `https://func-blucallerai-....azurewebsites.net/api/voice-twiml`
- **HTTP Method**: POST
- **Speech Recognition**: Handled automatically by Twilio

## 📊 Monitoring & Analytics

### Azure Application Insights Queries

#### Recent Conversations
```kusto
traces
| where timestamp > ago(1h)
| where message has "VOICE-STREAM FUNCTION CALLED"
| order by timestamp desc
```

#### Speech Recognition vs AI Responses
```kusto
traces  
| where timestamp > ago(1h)
| where message has "Speech Result:" or message has "AI Response:"
| order by timestamp asc
```

#### Error Tracking
```kusto
traces
| where timestamp > ago(24h) 
| where severityLevel >= 3
| summarize count() by bin(timestamp, 1h)
```

### Lead Dashboard Metrics
- **Total Leads**: All unique phone numbers that have called
- **Emergency Calls**: Calls flagged as urgent/emergency
- **High-Value Leads**: Leads with scores ≥ 70
- **Average Score**: Mean qualification score across all leads
- **Service Type Breakdown**: Distribution of service requests
- **Recent Activity**: Latest conversations and lead updates

## 🔒 Reliability & Fallbacks

### Database Resilience
- **Primary**: Cosmos DB for persistent storage
- **Fallback**: In-memory storage if database unavailable
- **Timeout**: 5-second connection timeout prevents call delays

### Error Handling
- **Low Confidence Speech**: Automatic clarification requests
- **API Failures**: Graceful error messages, fallback responses
- **Database Errors**: Seamless fallback to memory storage
- **Connection Issues**: Calls never fail due to database problems

## 🚀 Next Steps & Enhancements

### Immediate Improvements
1. **Confidence Filtering**: ✅ Already implemented (filters <0.5 confidence)
2. **Enhanced Prompts**: ✅ Business-focused HVAC assistant prompts
3. **Lead Analytics**: ✅ Real-time dashboard with scoring

### Advanced Features
1. **Follow-up System**: Automatic callbacks for high-value leads
2. **CRM Integration**: Connect to existing customer management systems
3. **Voice Quality**: Switch to Azure Speech for more natural voices
4. **Appointment Scheduling**: Integration with calendar systems
5. **Multi-language Support**: Expand beyond English
6. **Sentiment Analysis**: Track customer satisfaction
7. **Real-time Alerts**: Notifications for emergency calls or high-value leads

### Performance Optimizations
1. **Connection Pooling**: Optimize database connections
2. **Caching**: Cache frequent responses for faster processing
3. **Load Balancing**: Scale across multiple Azure regions
4. **Cost Optimization**: Monitor and optimize Azure resource usage

## 📞 Testing Your Voice Agent

### Basic Test
1. Call your Twilio phone number
2. Have a conversation about HVAC services
3. Check the lead dashboard: `https://func-blucallerai-....azurewebsites.net/api/lead-dashboard`
4. Verify conversation was recorded in Azure logs

### Emergency Test
Say: "This is an emergency, my furnace is not working and there's a gas smell"
- Should be flagged as emergency
- High qualification score
- Appropriate urgent response

### Lead Qualification Test
Say: "Hi, my name is John Smith, I need a new air conditioning system installed"
- Should extract name
- Detect installation service type
- High qualification score

## 🎯 Success Metrics

### Technical KPIs
- **Call Success Rate**: >99% calls processed without errors
- **Response Time**: <2 seconds from speech to AI response
- **Database Uptime**: >99.9% Cosmos DB availability
- **Speech Recognition Accuracy**: >85% confidence scores

### Business KPIs  
- **Lead Capture Rate**: % of calls that generate qualified leads
- **Emergency Response Time**: <1 minute for urgent dispatches
- **Customer Satisfaction**: Quality of AI responses and conversations
- **Conversion Rate**: Leads that become actual service appointments

---

## 🔧 Development Setup

### Prerequisites
- Azure subscription with Function Apps, OpenAI, and Cosmos DB
- Twilio account with phone number
- Node.js 18+ for local development

### Local Development
```bash
# Install dependencies
npm install

# Start local development
func start

# Deploy to Azure
func azure functionapp publish func-blucallerai --javascript
```

### Deployment Notes
- MongoDB driver automatically installed for Cosmos DB connectivity
- Function timeout set to 10 minutes for complex conversations
- Auto-scaling enabled for high call volumes

---

**Built with Azure, powered by AI, designed for business growth** 🚀 