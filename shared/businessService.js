/**
 * Business Service Utilities
 * Handles business-specific logic, industry templates, and AI prompt generation
 */

const FirebaseService = require('./firebaseService');

class BusinessService {
    constructor() {
        this.firebaseService = new FirebaseService();
        this.industryTemplates = this.initializeIndustryTemplates();
    }

    /**
     * Initialize industry-specific templates
     * Based on your 24 normalized industries from the documentation
     */
    initializeIndustryTemplates() {
        return {
            hvac: {
                template: "hvac_base",
                services: ["heating", "cooling", "air conditioning", "ventilation", "ductwork", "heat pumps"],
                commonIssues: ["no heat", "no cooling", "strange noises", "high bills", "poor air flow"],
                emergencyKeywords: ["no heat", "no air", "no cooling", "furnace down", "ac down", "leak", "emergency"],
                systemPromptTemplate: `You are a friendly customer service agent for {companyName}. 
                                     Focus on heating, cooling, and ventilation services. 
                                     Prioritize emergency calls with no heat or AC.
                                     Understand seasonal needs - heating in winter, cooling in summer.`,
                greetingTemplate: "Thank you for calling {companyName}! How can we help with your heating and cooling needs today?",
                seasonalContext: {
                    summer: "Prioritize AC and cooling issues",
                    winter: "Focus on heating and furnace problems",
                    spring: "Mention maintenance and tune-ups",
                    fall: "Suggest heating system preparation"
                }
            },
            plumbing: {
                template: "plumbing_base",
                services: ["leak repair", "drain cleaning", "water heater", "pipe installation", "toilet repair", "faucet repair"],
                commonIssues: ["clogged drain", "water leak", "no hot water", "running toilet", "low water pressure"],
                emergencyKeywords: ["leak", "flood", "no water", "burst pipe", "overflow", "emergency", "water everywhere"],
                systemPromptTemplate: `You are a friendly customer service agent for {companyName}.
                                     Handle plumbing emergencies urgently, especially leaks and floods.
                                     Water damage can be costly - emphasize quick response times.`,
                greetingTemplate: "Thanks for calling {companyName}! What plumbing issue can we help you with?",
                urgencyLevels: {
                    emergency: ["leak", "flood", "burst pipe", "no water"],
                    urgent: ["clogged drain", "no hot water", "toilet issues"],
                    routine: ["maintenance", "installation", "upgrade"]
                }
            },
            electrical: {
                template: "electrical_base",
                services: ["wiring", "outlet installation", "panel upgrade", "lighting", "circuit repair", "safety inspection"],
                commonIssues: ["power outage", "flickering lights", "outlet not working", "tripped breaker"],
                emergencyKeywords: ["no power", "sparks", "burning smell", "shock", "electrical fire", "emergency"],
                systemPromptTemplate: `You are a professional electrical service representative for {companyName}.
                                     Prioritize safety - any mention of sparks, burning smells, or shocks is an emergency.
                                     Electrical issues can be dangerous - emphasize licensed professional service.`,
                greetingTemplate: "Hello! Thank you for calling {companyName}. How can we help with your electrical needs?",
                safetyKeywords: ["sparks", "burning", "shock", "fire", "smoke", "hot outlet"]
            },
            roofing: {
                template: "roofing_base",
                services: ["roof repair", "roof replacement", "leak repair", "gutter installation", "storm damage"],
                commonIssues: ["roof leak", "missing shingles", "storm damage", "gutter problems"],
                emergencyKeywords: ["leak", "storm damage", "collapsed", "emergency", "water coming in"],
                systemPromptTemplate: `You are a professional roofing service representative for {companyName}.
                                     Focus on protecting homes from weather damage.
                                     Roof leaks are urgent - water damage spreads quickly.`,
                greetingTemplate: "Thank you for calling {companyName}! How can we help protect your home?",
                weatherAware: true
            },
            "general-contractor": {
                template: "contractor_base",
                services: ["home renovation", "kitchen remodel", "bathroom remodel", "additions", "repairs"],
                commonIssues: ["renovation needs", "repair estimates", "project planning", "permits"],
                emergencyKeywords: ["structural damage", "water damage", "emergency repair"],
                systemPromptTemplate: `You are a professional general contractor representative for {companyName}.
                                     Help with home improvement projects and repairs.
                                     Focus on understanding project scope and scheduling consultations.`,
                greetingTemplate: "Thank you for calling {companyName}! What home improvement project can we help you with?"
            },
            // Add more industries as needed...
            general: {
                template: "general_base",
                services: ["various services"],
                commonIssues: ["general inquiries", "service requests"],
                emergencyKeywords: ["emergency", "urgent", "immediate"],
                systemPromptTemplate: `You are a friendly customer service agent for {companyName}.
                                     Provide helpful information about services and schedule appointments.`,
                greetingTemplate: "Thank you for calling {companyName}! How may we assist you today?"
            }
        };
    }

    /**
     * Get business context for AI prompts
     * @param {string} businessId - Business identifier
     * @param {string} phoneNumber - Twilio phone number
     * @returns {Object} Business context with industry-specific data
     */
    async getBusinessContext(businessId, phoneNumber) {
        try {
            let business;
            
            // If businessId is provided, get business directly
            if (businessId && businessId !== 'default') {
                const businessData = await this.firebaseService.getBusinessData(businessId);
                if (businessData) {
                    business = { businessId, data: businessData, found: true };
                }
            }
            
            // Otherwise, lookup by phone number
            if (!business) {
                business = await this.firebaseService.findBusinessByPhone(phoneNumber);
            }

            // Get AI configuration
            const aiConfig = await this.firebaseService.getBusinessAIConfig(business.businessId);

            // Get industry template
            const industry = business.data.profile?.industry || 'general';
            const industryTemplate = this.industryTemplates[industry] || this.industryTemplates.general;

            return {
                businessId: business.businessId,
                companyName: business.data.profile?.companyName || 'Your Business',
                industry: industry,
                services: business.data.services?.list || industryTemplate.services,
                schedule: business.data.schedule || {},
                aiConfig: aiConfig,
                industryTemplate: industryTemplate,
                emergencyKeywords: industryTemplate.emergencyKeywords,
                isDefault: business.isDefault || false,
                found: business.found || false
            };

        } catch (error) {
            console.error('❌ Error getting business context:', error.message);
            
            // Return default context for backwards compatibility
            return this.getDefaultBusinessContext();
        }
    }

    /**
     * Generate business-specific AI system prompt
     * @param {Object} businessContext - Business context data
     * @returns {string} Customized system prompt
     */
    generateSystemPrompt(businessContext) {
        const { companyName, industry, services, industryTemplate, emergencyKeywords } = businessContext;

        // Start with industry template
        let systemPrompt = industryTemplate.systemPromptTemplate.replace('{companyName}', companyName);

        // Add business-specific services
        if (services && services.length > 0) {
            systemPrompt += `\n\nOur main services include: ${services.slice(0, 5).join(', ')}.`;
        }

        // Add emergency detection
        if (emergencyKeywords && emergencyKeywords.length > 0) {
            systemPrompt += `\n\nEMERGENCY DETECTION: If the customer mentions any of these keywords, treat as urgent: ${emergencyKeywords.join(', ')}.`;
        }

        // Add seasonal context for HVAC
        if (industry === 'hvac') {
            const season = this.getCurrentSeason();
            const seasonalContext = industryTemplate.seasonalContext[season];
            if (seasonalContext) {
                systemPrompt += `\n\nSEASONAL FOCUS (${season}): ${seasonalContext}.`;
            }
        }

        // Add safety emphasis for electrical
        if (industry === 'electrical' && industryTemplate.safetyKeywords) {
            systemPrompt += `\n\nSAFETY PRIORITY: If customer mentions ${industryTemplate.safetyKeywords.join(', ')}, this is an emergency requiring immediate attention.`;
        }

        // Add general conversation guidelines
        systemPrompt += `\n\nCONVERSATION STYLE:
- Be warm, conversational, and relatable
- Listen carefully and respond to what they actually say
- Keep responses SHORT (1-2 sentences) but natural
- Ask helpful follow-up questions
- Get contact information naturally during conversation
- It's OK to have brief small talk that relates to their situation`;

        return systemPrompt;
    }

    /**
     * Generate business-specific greeting
     * @param {Object} businessContext - Business context data
     * @returns {string} Customized greeting message
     */
    generateGreeting(businessContext) {
        const { companyName, industryTemplate, aiConfig } = businessContext;

        // Use custom greeting from AI config if available
        if (aiConfig && aiConfig.greetingMessage && aiConfig.greetingMessage.trim() !== '') {
            return aiConfig.greetingMessage;
        }

        // Use industry template
        return industryTemplate.greetingTemplate.replace('{companyName}', companyName);
    }

    /**
     * Check if customer input contains emergency keywords
     * @param {string} customerInput - Customer's message
     * @param {Object} businessContext - Business context data
     * @returns {Object} Emergency analysis
     */
    analyzeEmergency(customerInput, businessContext) {
        const { emergencyKeywords, industry } = businessContext;
        const input = customerInput.toLowerCase();

        const detectedKeywords = emergencyKeywords.filter(keyword => 
            input.includes(keyword.toLowerCase())
        );

        const isEmergency = detectedKeywords.length > 0;
        
        let urgencyLevel = 'normal';
        if (isEmergency) {
            // Industry-specific urgency levels
            if (industry === 'electrical' && 
                ['sparks', 'burning', 'shock', 'fire'].some(word => input.includes(word))) {
                urgencyLevel = 'critical';
            } else if (industry === 'plumbing' && 
                      ['flood', 'burst pipe', 'water everywhere'].some(word => input.includes(word))) {
                urgencyLevel = 'critical';
            } else if (industry === 'hvac' && 
                      ['no heat', 'no cooling'].some(word => input.includes(word))) {
                urgencyLevel = 'high';
            } else {
                urgencyLevel = 'high';
            }
        }

        return {
            isEmergency,
            urgencyLevel,
            detectedKeywords,
            recommendedAction: isEmergency ? 'prioritize_scheduling' : 'normal_flow'
        };
    }

    /**
     * Get current season for seasonal business logic
     * @returns {string} Current season
     */
    getCurrentSeason() {
        const month = new Date().getMonth() + 1; // 1-12
        
        if (month >= 12 || month <= 2) return 'winter';
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        return 'fall'; // 9-11
    }

    /**
     * Get default business context for backwards compatibility
     * @returns {Object} Default business context
     */
    getDefaultBusinessContext() {
        const defaultTemplate = this.industryTemplates.hvac; // Use HVAC as default

        return {
            businessId: 'default',
            companyName: 'Blue Caller HVAC',
            industry: 'hvac',
            services: defaultTemplate.services,
            schedule: {
                weekdayHours: { open: '08:00', close: '17:00' },
                weekendHours: { open: '09:00', close: '15:00' }
            },
            aiConfig: this.firebaseService.getDefaultAIConfig(),
            industryTemplate: defaultTemplate,
            emergencyKeywords: defaultTemplate.emergencyKeywords,
            isDefault: true,
            found: false
        };
    }

    /**
     * Validate business hours and suggest after-hours handling
     * @param {Object} businessContext - Business context data
     * @returns {Object} Hours analysis
     */
    analyzeBusinessHours(businessContext) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
        
        const { schedule } = businessContext;
        
        if (!schedule || !schedule.weekdayHours) {
            return { isOpen: true, message: null }; // Assume open if no schedule
        }

        const isWeekend = currentDay === 0 || currentDay === 6;
        const hours = isWeekend ? schedule.weekendHours : schedule.weekdayHours;

        if (!hours) {
            return { 
                isOpen: false, 
                message: isWeekend ? "We're closed on weekends" : "We're currently closed"
            };
        }

        const openHour = parseInt(hours.open.split(':')[0]);
        const closeHour = parseInt(hours.close.split(':')[0]);

        const isOpen = currentHour >= openHour && currentHour < closeHour;

        if (!isOpen) {
            const nextOpenTime = isWeekend && schedule.weekdayHours ? 
                `Monday at ${schedule.weekdayHours.open}` : 
                `tomorrow at ${hours.open}`;
                
            return {
                isOpen: false,
                message: `We're currently closed. Our next available time is ${nextOpenTime}. For emergencies, please let me know!`
            };
        }

        return { isOpen: true, message: null };
    }

    /**
     * Generate follow-up questions based on industry
     * @param {Object} businessContext - Business context data
     * @param {string} customerInput - Customer's message
     * @returns {Array} Relevant follow-up questions
     */
    generateFollowUpQuestions(businessContext, customerInput) {
        const { industry, industryTemplate } = businessContext;
        const input = customerInput.toLowerCase();

        const followUps = {
            hvac: [
                "Is this for heating or cooling?",
                "When did you first notice the issue?",
                "What type of system do you have?",
                "Is this affecting your whole home or just one area?"
            ],
            plumbing: [
                "Where exactly is the issue located?",
                "Is there any water damage?",
                "How long has this been happening?",
                "Can you turn off the water if needed?"
            ],
            electrical: [
                "Is this a safety concern with sparks or burning smells?",
                "Which room or area is affected?",
                "Have you checked your circuit breaker?",
                "When did this start happening?"
            ]
        };

        const industryQuestions = followUps[industry] || [
            "Can you tell me more about what's happening?",
            "When would be a good time to schedule service?",
            "Is this urgent or can it wait a few days?"
        ];

        // Return 1-2 relevant questions based on context
        return industryQuestions.slice(0, 2);
    }
}

module.exports = BusinessService;
