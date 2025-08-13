/**
 * Business Configuration API
 * Provides REST endpoints for managing business voice agent settings
 * Supports authentication via Firebase session cookies
 */

const FirebaseService = require('../shared/firebaseService');
const BusinessService = require('../shared/businessService');

const firebaseService = new FirebaseService();
const businessService = new BusinessService();

module.exports = async function (context, req) {
    context.log('🔧 Business Configuration API called');
    context.log('🔍 Method:', req.method);
    context.log('🔍 URL:', req.url);

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS request for CORS
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: ''
        };
        return;
    }

    try {
        // Authentication check for protected endpoints
        const authHeader = req.headers.authorization;
        let authenticatedUser = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const sessionCookie = authHeader.substring(7);
            try {
                authenticatedUser = await firebaseService.verifySessionCookie(sessionCookie);
                context.log(`✅ Authenticated user: ${authenticatedUser.email} (${authenticatedUser.businessId})`);
            } catch (error) {
                context.log('⚠️ Authentication failed:', error.message);
                context.res = {
                    status: 401,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Authentication failed',
                        message: 'Invalid session cookie'
                    })
                };
                return;
            }
        }

        // Route requests based on method and path
        switch (req.method) {
            case 'GET':
                await handleGetRequest(context, req, corsHeaders, authenticatedUser);
                break;
            
            case 'POST':
            case 'PUT':
                await handleUpdateRequest(context, req, corsHeaders, authenticatedUser);
                break;
                
            default:
                context.res = {
                    status: 405,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Method not allowed' })
                };
        }

    } catch (error) {
        context.log.error('❌ Business Config API error:', error.message);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

/**
 * Handle GET requests - retrieve business configuration
 */
async function handleGetRequest(context, req, corsHeaders, authenticatedUser) {
    const businessId = req.query.businessId || authenticatedUser?.businessId;
    const phoneNumber = req.query.phoneNumber;

    if (!businessId && !phoneNumber) {
        context.res = {
            status: 400,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Missing parameter',
                message: 'Either businessId or phoneNumber is required'
            })
        };
        return;
    }

    try {
        let businessContext;
        
        if (phoneNumber) {
            // Lookup business by phone number (public endpoint)
            businessContext = await businessService.getBusinessContext(null, phoneNumber);
            context.log(`📞 Phone lookup: ${phoneNumber} -> ${businessContext.companyName}`);
        } else {
            // Get business by ID (requires authentication)
            if (!authenticatedUser) {
                context.res = {
                    status: 401,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Authentication required',
                        message: 'Business ID lookup requires authentication'
                    })
                };
                return;
            }

            if (authenticatedUser.businessId !== businessId) {
                context.res = {
                    status: 403,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Access denied',
                        message: 'You can only access your own business configuration'
                    })
                };
                return;
            }

            businessContext = await businessService.getBusinessContext(businessId, null);
            context.log(`🏢 Business lookup: ${businessId} -> ${businessContext.companyName}`);
        }

        // Prepare response data
        const responseData = {
            businessId: businessContext.businessId,
            found: businessContext.found,
            isDefault: businessContext.isDefault || false,
            profile: {
                companyName: businessContext.companyName,
                industry: businessContext.industry,
                services: businessContext.services
            },
            aiAssistant: businessContext.aiConfig,
            industryTemplate: {
                emergencyKeywords: businessContext.emergencyKeywords,
                template: businessContext.industryTemplate?.template
            },
            schedule: businessContext.schedule
        };

        // Include sensitive data only for authenticated requests
        if (authenticatedUser && authenticatedUser.businessId === businessContext.businessId) {
            // Add full business data for owner access
            const fullBusinessData = await firebaseService.getBusinessData(businessContext.businessId);
            if (fullBusinessData) {
                responseData.fullProfile = fullBusinessData.profile;
                responseData.twilioNumbers = fullBusinessData.twilioNumbers;
                responseData.meta = fullBusinessData.meta;
            }
        }

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                data: responseData
            })
        };

    } catch (error) {
        context.log.error('❌ Error getting business config:', error.message);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Failed to retrieve business configuration',
                message: error.message
            })
        };
    }
}

/**
 * Handle POST/PUT requests - update business configuration
 */
async function handleUpdateRequest(context, req, corsHeaders, authenticatedUser) {
    // Authentication required for updates
    if (!authenticatedUser) {
        context.res = {
            status: 401,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Authentication required',
                message: 'You must be logged in to update business configuration'
            })
        };
        return;
    }

    const { businessId, aiConfig, testVoice } = req.body || {};
    const targetBusinessId = businessId || authenticatedUser.businessId;

    // Permission check
    if (authenticatedUser.businessId !== targetBusinessId) {
        context.res = {
            status: 403,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Access denied',
                message: 'You can only update your own business configuration'
            })
        };
        return;
    }

    try {
        if (testVoice) {
            // Test voice endpoint - generate sample audio
            const testText = testVoice.text || `Hello! This is a test of the ${testVoice.voiceName || 'default'} voice for your business.`;
            
            // Note: This would integrate with your voice manager
            // For now, return a mock response
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    message: 'Voice test functionality will be implemented',
                    testText: testText,
                    voiceName: testVoice.voiceName
                })
            };
            return;
        }

        if (aiConfig) {
            // Update AI assistant configuration
            const updateSuccess = await firebaseService.updateBusinessAIConfig(targetBusinessId, aiConfig);
            
            if (updateSuccess) {
                context.log(`✅ Updated AI config for business: ${targetBusinessId}`);
                
                // Get updated business context
                const updatedContext = await businessService.getBusinessContext(targetBusinessId, null);
                
                context.res = {
                    status: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        message: 'Business AI configuration updated successfully',
                        data: {
                            businessId: targetBusinessId,
                            aiAssistant: updatedContext.aiConfig,
                            companyName: updatedContext.companyName
                        }
                    })
                };
            } else {
                context.res = {
                    status: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Update failed',
                        message: 'Failed to update AI configuration'
                    })
                };
            }
        } else {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: 'Invalid request',
                    message: 'No valid update data provided (aiConfig or testVoice expected)'
                })
            };
        }

    } catch (error) {
        context.log.error('❌ Error updating business config:', error.message);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Failed to update business configuration',
                message: error.message
            })
        };
    }
}

/**
 * Validate AI configuration update
 */
function validateAIConfig(aiConfig) {
    const errors = [];
    
    if (aiConfig.greetingMessage && aiConfig.greetingMessage.length > 500) {
        errors.push('Greeting message too long (max 500 characters)');
    }
    
    if (aiConfig.voiceStyle && !['professional', 'friendly', 'casual', 'authoritative'].includes(aiConfig.voiceStyle)) {
        errors.push('Invalid voice style');
    }
    
    if (aiConfig.bufferTime && (aiConfig.bufferTime < 0 || aiConfig.bufferTime > 60)) {
        errors.push('Buffer time must be between 0 and 60 minutes');
    }
    
    return errors;
}

// Export helper functions for testing
module.exports.validateAIConfig = validateAIConfig;
