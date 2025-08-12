const VoiceManager = require('../shared/voiceManager');

const voiceManager = new VoiceManager();

module.exports = async function (context, req) {
    context.log("🎬 Enhanced TwiML with Azure Speech Services (Alloy Turbo)");

    try {
        // Check if this is a returning customer based on From parameter
        const callerNumber = req.query.From || req.body?.From;
        let isReturningCustomer = false;
        let customerName = null;

        // TODO: In future, we could check database for returning customer info
        // For now, always treat as new customer with professional greeting
        
        const greeting = "Hello! Thank you for calling Blue Caller HVAC. I'm Sarah, your AI assistant. How can I help you today?";
        
        const voiceResponse = await voiceManager.generateVoiceResponse(greeting, {
            emotion: 'friendly',
            urgencyLevel: 'normal',
            followUpPrompt: "I'm listening..."
        });

        context.log("✅ Generated enhanced greeting with Alloy Turbo voice");

        context.res = {
            headers: { "Content-Type": "text/xml" },
            body: voiceResponse
        };
        
    } catch (error) {
        context.log.error("❌ Error generating enhanced TwiML:", error);
        
        // Create error response using voice manager
        const errorResponse = voiceManager.createErrorResponse(
            "Thank you for calling Blue Caller HVAC. I'm having some technical difficulties right now. Please try calling back in just a moment."
        );
        
        context.res = {
            status: 200,
            headers: { "Content-Type": "text/xml" },
            body: errorResponse
        };
    }
};
