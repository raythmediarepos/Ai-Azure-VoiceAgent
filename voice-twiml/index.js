const VoiceManager = require('../shared/voiceManager');
const BusinessService = require('../shared/businessService');

const voiceManager = new VoiceManager();
const businessService = new BusinessService();

module.exports = async function (context, req) {
    context.log("🎬 Multi-Tenant TwiML with Business-Specific Greetings");

    try {
        // Extract Twilio webhook data (prioritize POST body over query params)
        const callerNumber = req.body?.From || req.query.From;
        const twilioPhoneNumber = req.body?.To || req.query.To; // The business phone number called
        
        context.log(`📞 Call from ${callerNumber} to business number ${twilioPhoneNumber}`);

        // 🔥 NEW: Multi-tenant business lookup
        const businessContext = await businessService.getBusinessContext(null, twilioPhoneNumber);
        
        context.log(`🏢 Business identified: ${businessContext.companyName} (${businessContext.industry}) - Found: ${businessContext.found}`);
        
        // 🔥 NEW: Generate business-specific greeting
        const greeting = businessService.generateGreeting(businessContext);
        
        // 🔥 NEW: Check business hours
        const hoursAnalysis = businessService.analyzeBusinessHours(businessContext);
        let finalGreeting = greeting;
        
        if (!hoursAnalysis.isOpen && hoursAnalysis.message) {
            finalGreeting = `${greeting} ${hoursAnalysis.message}`;
            context.log(`⏰ After hours message added for ${businessContext.companyName}`);
        }

        // Generate voice response with business context
        const voiceResponse = await voiceManager.generateVoiceResponse(finalGreeting, {
            emotion: 'friendly',
            urgencyLevel: 'normal',
            businessId: businessContext.businessId,              // 🔥 NEW: Business context
            industry: businessContext.industry,                  // 🔥 NEW: Industry context
            companyName: businessContext.companyName,            // 🔥 NEW: Company context
            followUpPrompt: "I'm listening..."
        });

        context.log(`✅ Generated ${businessContext.industry} greeting for ${businessContext.companyName}`);

        context.res = {
            headers: { "Content-Type": "text/xml" },
            body: voiceResponse
        };
        
    } catch (error) {
        context.log.error("❌ Error generating multi-tenant TwiML:", error);
        
        // Fallback to default error response
        const errorResponse = voiceManager.createErrorResponse(
            "Thank you for calling. I'm having some technical difficulties right now. Please try calling back in just a moment."
        );
        
        context.res = {
            status: 200,
            headers: { "Content-Type": "text/xml" },
            body: errorResponse
        };
    }
};
