const { AzureOpenAI } = require("openai");
const { CosmosClient } = require("@azure/cosmos");
const VoiceManager = require("../shared/voiceManager");
const BusinessService = require("../shared/businessService");
const MultiTenantCosmosDB = require("../shared/multiTenantCosmosDB");

// Initialize Azure OpenAI with defensive error handling
let openai = null;
try {
  if (process.env.OPENAI_ENDPOINT && process.env.OPENAI_KEY) {
    openai = new AzureOpenAI({
      endpoint: process.env.OPENAI_ENDPOINT,
      apiKey: process.env.OPENAI_KEY,
      apiVersion: "2024-02-15-preview",
      deployment: "gpt-35-turbo" // Your deployment name
    });
  }
} catch (error) {
  console.error("Failed to initialize OpenAI client:", error.message);
}

// Initialize Cosmos DB SQL API client
let cosmosClient = null;
let database = null;
let transcriptsContainer = null;
let leadsContainer = null;
let isDbConnected = false;

// Store conversation sessions (fallback)
const conversationSessions = new Map();

// Initialize Voice Manager for Azure Speech Services
const voiceManager = new VoiceManager();

// Initialize Business Service for Multi-Tenant Support
const businessService = new BusinessService();

// Multi-tenant Cosmos DB wrapper
let multiTenantDB = null;

// Initialize Cosmos DB SQL API connection with enhanced error handling
const initializeCosmosDB = async (context) => {
  if (isDbConnected) return true;
  
  try {
    if (!process.env.COSMOS_CONN) {
      context.log.warn('COSMOS_CONN not found, using memory storage');
      return false;
    }

    // Validate connection string format for SQL API
    if (!process.env.COSMOS_CONN.includes('AccountEndpoint=') || !process.env.COSMOS_CONN.includes('AccountKey=')) {
      context.log.error('COSMOS_CONN appears to be MongoDB format, not SQL API format');
      context.log.error('Expected format: AccountEndpoint=https://...;AccountKey=...');
      return false;
    }

    // Use the SQL API connection string with timeout
    cosmosClient = new CosmosClient(process.env.COSMOS_CONN);
    
    // Test connection with timeout
    const connectionTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    
    const connectPromise = (async () => {
      // Create database if it doesn't exist
      const { database: db } = await cosmosClient.databases.createIfNotExists({
        id: 'voiceai'
      });
      database = db;
      
      // Create containers if they don't exist
      const { container: transcripts } = await database.containers.createIfNotExists({
        id: 'transcripts',
        partitionKey: { paths: ['/callSid'] }
      });
      transcriptsContainer = transcripts;
      
      const { container: leads } = await database.containers.createIfNotExists({
        id: 'leads',
        partitionKey: { paths: ['/phoneNumber'] }
      });
      leadsContainer = leads;
    })();
    
    await Promise.race([connectPromise, connectionTimeout]);
    
    // 🔥 NEW: Initialize multi-tenant database wrapper
    multiTenantDB = new MultiTenantCosmosDB(cosmosClient);
    
    isDbConnected = true;
    context.log('✅ Connected to Cosmos DB SQL API with multi-tenant support');
    return true;
  } catch (error) {
    context.log.error('Failed to connect to Cosmos DB:', error.message);
    if (error.message.includes('timeout')) {
      context.log.error('Database connection timed out - check network connectivity');
    }
    if (error.message.includes('AccountEndpoint')) {
      context.log.error('Connection string format error - ensure SQL API format');
    }
    isDbConnected = false;
    return false;
  }
};

// Helper function to get or create conversation session with business context
const getOrCreateSession = async (callSid, phoneNumber, context, businessContext = null) => {
  if (isDbConnected) {
    try {
      // Get existing conversation from this call
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.callSid = @callSid ORDER BY c.timestamp DESC',
        parameters: [{ name: '@callSid', value: callSid }]
      };
      
      const { resources: existingMessages } = await transcriptsContainer.items
        .query(querySpec)
        .fetchAll();
      
      // Check for previous calls from this number
      const historyQuery = {
        query: 'SELECT TOP 3 * FROM c WHERE c.phoneNumber = @phoneNumber ORDER BY c.timestamp DESC',
        parameters: [{ name: '@phoneNumber', value: phoneNumber }]
      };
      
      const { resources: previousCalls } = await transcriptsContainer.items
        .query(historyQuery)
        .fetchAll();
      
      // 🔥 NEW: Generate business-specific system prompt
      const systemPrompt = businessContext ? 
        businessService.generateSystemPrompt(businessContext) :
        `You are a friendly customer service agent for Blue Caller HVAC. Have natural conversations and be genuinely helpful.

PRIMARY GOALS:
- Help with heating, cooling, and home comfort questions
- Understand what the customer needs
- Get contact information naturally during conversation
- Handle emergencies with immediate assistance

CONVERSATION STYLE:
- Be warm, conversational, and relatable
- Listen carefully and respond to what they actually say
- Keep responses SHORT (1-2 sentences) but natural
- Ask helpful follow-up questions
- It's OK to have brief small talk or acknowledge their situation

HANDLE EVERYTHING:
- HVAC issues (heating, cooling, repairs, maintenance)
- General questions about our services
- Scheduling and appointments
- Pricing and estimates
- Emergency situations (no heat/AC, gas smell, urgent repairs)

BE FLEXIBLE: If they mention something not directly HVAC-related but you can help connect it to home comfort, do so naturally.`;

      // Add returning customer context
      const finalSystemPrompt = systemPrompt + (previousCalls.length > 0 ? `\n\nReturning customer (${previousCalls.length} previous calls)` : '');

      // Build conversation context
      let messages = [{
        role: "system",
        content: finalSystemPrompt
      }];
      
      // Add existing messages from this call
      if (existingMessages.length > 0) {
        existingMessages.reverse().forEach(msg => {
          if (msg.role !== 'system') {
            messages.push({
              role: msg.role,
              content: msg.content
            });
          }
        });
      }
      
      // Get or create lead info
      let leadInfo = {
        hasEmergency: false,
        serviceType: null,
        contactInfo: {},
        urgencyLevel: 'normal',
        qualificationScore: 0
      };
      
      try {
        const { resource: existingLead } = await leadsContainer
          .item(phoneNumber, phoneNumber)
          .read();
        if (existingLead) {
          leadInfo = { ...leadInfo, ...existingLead.leadInfo };
        }
      } catch (err) {
        // Lead doesn't exist yet
      }
      
      return {
        messages,
        leadInfo,
        callSid,
        phoneNumber,
        isFromDb: true
      };
    } catch (error) {
      context.log.error('Database error in getOrCreateSession:', error.message);
    }
  }

  // Fallback to memory
  if (!conversationSessions.has(callSid)) {
    conversationSessions.set(callSid, {
      messages: [{
        role: "system",
        content: `You are a friendly customer service agent for Blue Caller HVAC. Have natural conversations and be genuinely helpful.

PRIMARY GOALS:
- Help with heating, cooling, and home comfort questions
- Understand what the customer needs
- Get contact information naturally during conversation
- Handle emergencies with immediate assistance

CONVERSATION STYLE:
- Be warm, conversational, and relatable
- Listen carefully and respond to what they actually say
- Keep responses SHORT (1-2 sentences) but natural
- Ask helpful follow-up questions
- It's OK to have brief small talk or acknowledge their situation

HANDLE EVERYTHING:
- HVAC issues (heating, cooling, repairs, maintenance)
- General questions about our services
- Scheduling and appointments
- Pricing and estimates
- Emergency situations (no heat/AC, gas smell, urgent repairs)

BE FLEXIBLE: If they mention something not directly HVAC-related but you can help connect it to home comfort, do so naturally.`
      }],
      leadInfo: {
        hasEmergency: false,
        serviceType: null,
        contactInfo: {},
        urgencyLevel: 'normal',
        qualificationScore: 0
      },
      callSid,
      phoneNumber,
      isFromDb: false
    });
  }

  return conversationSessions.get(callSid);
};

// Save message to Cosmos DB
const saveMessage = async (callSid, phoneNumber, role, content, context) => {
  if (!isDbConnected) return false;
  
  try {
    const messageDoc = {
      id: `${callSid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callSid,
      phoneNumber,
      role,
      content,
      timestamp: new Date().toISOString(),
      ttl: 60 * 60 * 24 * 365 // 1 year retention
    };
    
    await transcriptsContainer.items.create(messageDoc);
    context.log(`Saved ${role} message to Cosmos DB`);
    return true;
  } catch (error) {
    context.log.error('Error saving message to Cosmos DB:', error.message);
    return false;
  }
};

// Business intelligence analysis
const analyzeMessage = (message) => {
  const lowerMessage = message.toLowerCase();
  const analysis = {
    hasEmergency: false,
    serviceType: null,
    urgencyLevel: 'normal',
    contactInfo: {}
  };

  // Emergency detection
  const emergencyKeywords = ['emergency', 'urgent', 'no heat', 'no air', 'gas smell', 'electrical', 'flooding'];
  if (emergencyKeywords.some(keyword => lowerMessage.includes(keyword))) {
    analysis.hasEmergency = true;
    analysis.urgencyLevel = 'emergency';
  }

  // Service type detection
  const serviceTypes = {
    'heating': ['heat', 'furnace', 'boiler', 'warm'],
    'cooling': ['cool', 'air conditioning', 'ac', 'cold'],
    'maintenance': ['service', 'tune up', 'check'],
    'installation': ['install', 'new', 'replace'],
    'repair': ['repair', 'fix', 'broken']
  };

  for (const [type, keywords] of Object.entries(serviceTypes)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      analysis.serviceType = type;
      break;
    }
  }

  // Extract contact information
  const nameMatch = message.match(/(?:my name is|i'm|i am)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (nameMatch) {
    analysis.contactInfo.name = nameMatch[1].trim();
  }

  return analysis;
};

// Calculate lead score
const calculateLeadScore = (leadInfo) => {
  let score = 10;
  if (leadInfo.hasEmergency) score += 50;
  if (leadInfo.serviceType === 'installation') score += 40;
  else if (leadInfo.serviceType) score += 20;
  if (leadInfo.contactInfo.name) score += 15;
  if (leadInfo.urgencyLevel === 'emergency') score += 30;
  return Math.min(score, 100);
};

// Update lead information
const updateLead = async (phoneNumber, leadInfo, callSid, context) => {
  if (!isDbConnected) return false;
  
  try {
    const leadDoc = {
      id: phoneNumber,
      phoneNumber,
      leadInfo,
      lastContact: new Date().toISOString(),
      lastCallSid: callSid,
      score: calculateLeadScore(leadInfo),
      ttl: 60 * 60 * 24 * 365 * 2 // 2 year retention
    };
    
    await leadsContainer.items.upsert(leadDoc);
    context.log('Lead information updated in Cosmos DB');
    return true;
  } catch (error) {
    context.log.error('Error updating lead:', error.message);
    return false;
  }
};

// Get AI response from Azure OpenAI with enhanced error handling
const getAIResponse = async (messages) => {
  try {
    if (!openai) {
      throw new Error('OpenAI client not initialized');
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-35-turbo", // This should match your deployment name
      messages: messages,
      max_tokens: 80,
      temperature: 0.7
    });
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Azure OpenAI error:", error.message);
    if (error.message.includes('not initialized')) {
      return "I'm having trouble with my AI service. Let me connect you with someone who can help.";
    }
    if (error.message.includes('deployment')) {
      return "I'm having configuration issues. Please call back in a few minutes.";
    }
    return "I'm having trouble right now. Could you try again?";
  }
};

module.exports = async function (context, req) {
  context.log("🎙️ MULTI-TENANT VOICE-STREAM WITH BUSINESS CONTEXT!");
  context.log("🔍 Voice-stream debug - VoiceManager exists:", !!voiceManager);
  context.log("🔍 Business service initialized:", !!businessService);
  
  // Early validation of critical dependencies
  if (!process.env.OPENAI_ENDPOINT || !process.env.OPENAI_KEY) {
    context.log.error("Missing OpenAI configuration - OPENAI_ENDPOINT or OPENAI_KEY not set");
  }
  
  if (!process.env.COSMOS_CONN) {
    context.log.warn("Missing COSMOS_CONN - will use memory fallback");
  } else if (!process.env.COSMOS_CONN.includes('AccountEndpoint=')) {
    context.log.error("COSMOS_CONN appears to be MongoDB format - SQL API format required");
  }
  
  // Initialize Cosmos DB with timeout
  const dbPromise = initializeCosmosDB(context);
  const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), 5000));
  const dbConnected = await Promise.race([dbPromise, timeoutPromise]);
  
  context.log("Cosmos DB Status:", dbConnected ? "Connected" : "Memory fallback");
  
  try {
    if (req.method === "POST" && req.body) {
      const querystring = require('querystring');
      const formData = typeof req.body === 'string' ? querystring.parse(req.body) : req.body;
      
      const speechResult = formData.SpeechResult;
      const callSid = formData.CallSid;
      const phoneNumber = formData.From;
      const confidence = parseFloat(formData.Confidence || 0);
      
      context.log("Speech Result:", speechResult);
      context.log("Confidence:", confidence);
      
      // Filter only extremely low-confidence results  
      if (confidence < 0.1 || (!speechResult || speechResult.trim().length < 1)) {
        context.log(`⚠️ Very low confidence (${confidence}) or empty speech, requesting clarification`);
        
        const clarificationResponse = await voiceManager.generateVoiceResponse(
          "I did not catch that. Could you please repeat?",
          { 
            emotion: 'helpful',
            urgencyLevel: 'normal',
            followUpPrompt: "I'm listening..."
          }
        );
        
        context.res = {
          headers: { "Content-Type": "text/xml" },
          body: clarificationResponse
        };
        return;
      }
      
      if (speechResult && speechResult.trim().length > 0) {
        // 🔥 NEW: Get business context for this call
        const twilioPhoneNumber = formData.To; // The business number that was called
        const businessContext = await businessService.getBusinessContext(null, twilioPhoneNumber);
        
        context.log(`🏢 Business context: ${businessContext.companyName} (${businessContext.industry})`);
        
        // Get or create session with business context
        const session = await getOrCreateSession(callSid, phoneNumber, context, businessContext);
        
        // Add user message
        session.messages.push({
          role: "user",
          content: speechResult
        });
        
        // Save user message (non-blocking)
        saveMessage(callSid, phoneNumber, 'user', speechResult, context);
        
        // 🔥 NEW: Business-specific emergency analysis
        const analysis = businessContext ? 
          businessService.analyzeEmergency(speechResult, businessContext) :
          analyzeMessage(speechResult);
        
        // Update lead info
        if (analysis.hasEmergency) session.leadInfo.hasEmergency = true;
        if (analysis.serviceType) session.leadInfo.serviceType = analysis.serviceType;
        if (analysis.urgencyLevel) session.leadInfo.urgencyLevel = analysis.urgencyLevel;
        if (analysis.contactInfo && analysis.contactInfo.name) session.leadInfo.contactInfo.name = analysis.contactInfo.name;
        
        session.leadInfo.qualificationScore = calculateLeadScore(session.leadInfo);
        
        // Get AI response with timing
        const aiStart = Date.now();
        const aiResponse = await getAIResponse(session.messages);
        const aiEnd = Date.now();
        context.log("🤖 AI Response:", aiResponse);
        context.log("🔍 AI Response length:", aiResponse.length);
        context.log("🔍 AI Response first 100 chars:", aiResponse.substring(0, 100));
        context.log(`⏱️ AI Generation Time: ${aiEnd - aiStart}ms`);
        
        // Add AI response to session
        session.messages.push({
          role: "assistant",
          content: aiResponse
        });
        
        // Save AI response and update lead (non-blocking)
        saveMessage(callSid, phoneNumber, 'assistant', aiResponse, context);
        updateLead(phoneNumber, session.leadInfo, callSid, context);
        
        // Analyze conversation context for voice characteristics
        const voiceContext = voiceManager.analyzeConversationContext(session);
        
        // Generate contextual follow-up prompt
        const followUpPrompt = voiceManager.generateContextualFollowUp(session);
        
        // Generate enhanced voice response with context awareness and timing
        const voiceStart = Date.now();
        const responseTwiml = await voiceManager.generateVoiceResponse(aiResponse, {
          ...voiceContext,
          businessId: businessContext?.businessId,              // 🔥 NEW: Business context
          industry: businessContext?.industry,                  // 🔥 NEW: Industry context  
          companyName: businessContext?.companyName,            // 🔥 NEW: Company context
          customerName: session.leadInfo?.contactInfo?.name,
          followUpPrompt: followUpPrompt
        });
        const voiceEnd = Date.now();
        context.log(`⏱️ Voice Synthesis + Upload Time: ${voiceEnd - voiceStart}ms`);
        context.log(`⏱️ Total Response Time: ${voiceEnd - aiStart}ms`);
        
        context.res = {
          headers: { "Content-Type": "text/xml" },
          body: responseTwiml
        };
        return;
      } else {
        // No speech detected - use enhanced voice response
        context.log("🔇 No speech detected, using enhanced voice response");
        
        const noSpeechResponse = await voiceManager.generateVoiceResponse(
          "I didn't hear anything. What can I help you with today?",
          { 
            emotion: 'patient',
            urgencyLevel: 'normal',
            followUpPrompt: "I'm listening..."
          }
        );
        
        context.res = {
          headers: { "Content-Type": "text/xml" },
          body: noSpeechResponse
        };
      }
    } else {
      // Default response
      context.res = { 
        status: 200,
        body: "Voice stream endpoint ready"
      };
    }
  } catch (error) {
    context.log.error("❌ Function error:", error.message);
    context.log.error("Stack trace:", error.stack);
    
    // Create enhanced error response
    const errorResponse = voiceManager.createErrorResponse(
      "I'm sorry, I'm having technical difficulties. Please try calling back in a moment."
    );
    
    context.res = { 
      status: 200,
      headers: { "Content-Type": "text/xml" },
      body: errorResponse
    };
  }
};