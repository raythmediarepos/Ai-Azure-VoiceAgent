/**
 * Multi-Tenant Cosmos DB Operations
 * Handles business-scoped data isolation and conversation management
 */

class MultiTenantCosmosDB {
    constructor(cosmosClient) {
        this.client = cosmosClient;
        this.database = null;
        this.conversationsContainer = null;
        this.leadsContainer = null;
        this.initialize();
    }

    initialize() {
        try {
            this.database = this.client.database('VoiceAgentDB');
            this.conversationsContainer = this.database.container('conversations');
            this.leadsContainer = this.database.container('leads');
            console.log('✅ Multi-tenant Cosmos DB initialized');
        } catch (error) {
            console.error('❌ Failed to initialize multi-tenant Cosmos DB:', error.message);
        }
    }

    /**
     * Create business-scoped conversation session
     * @param {string} businessId - Business identifier
     * @param {string} callSid - Twilio call SID
     * @param {string} customerPhone - Customer phone number
     * @param {Object} businessData - Business profile data
     * @returns {Object} Created session
     */
    async createSession(businessId, callSid, customerPhone, businessData = {}) {
        try {
            const sessionId = `${businessId}_${callSid}`;
            
            const session = {
                id: sessionId,
                businessId: businessId,                    // 🔥 NEW: Business partitioning
                callSid: callSid,
                customerPhone: customerPhone,
                messages: [],
                leadInfo: { 
                    contactInfo: {}, 
                    score: 0,
                    businessId: businessId                 // 🔥 NEW: Business-scoped lead
                },
                businessContext: {                         // 🔥 NEW: Business context
                    companyName: businessData.profile?.companyName || 'Unknown',
                    industry: businessData.profile?.industry || 'general',
                    services: businessData.services?.list || []
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                businessScoped: true,                      // 🔥 NEW: Multi-tenant flag
                version: '2.0'                             // Version for migration tracking
            };

            const { resource } = await this.conversationsContainer.items.create(session);
            
            console.log(`✅ Created business-scoped session: ${sessionId} for ${businessData.profile?.companyName || businessId}`);
            return resource;

        } catch (error) {
            console.error('❌ Error creating business-scoped session:', error.message);
            
            // Fallback to legacy session creation for backwards compatibility
            return await this.createLegacySession(callSid, customerPhone);
        }
    }

    /**
     * Get business-scoped conversation session
     * @param {string} businessId - Business identifier
     * @param {string} callSid - Twilio call SID
     * @returns {Object} Session data or null
     */
    async getSession(businessId, callSid) {
        try {
            const sessionId = `${businessId}_${callSid}`;
            
            const { resource } = await this.conversationsContainer.item(sessionId).read();
            
            if (resource) {
                console.log(`✅ Retrieved business-scoped session: ${sessionId}`);
                return resource;
            }

        } catch (error) {
            if (error.code === 404) {
                console.log(`⚠️ Business-scoped session not found: ${businessId}_${callSid}, trying legacy lookup`);
                
                // Fallback to legacy session lookup for backwards compatibility
                return await this.getLegacySession(callSid);
            }
            
            console.error('❌ Error getting business-scoped session:', error.message);
        }

        return null;
    }

    /**
     * Update business-scoped conversation session
     * @param {string} businessId - Business identifier
     * @param {string} callSid - Twilio call SID
     * @param {Object} updates - Data to update
     * @returns {Object} Updated session
     */
    async updateSession(businessId, callSid, updates) {
        try {
            const sessionId = `${businessId}_${callSid}`;
            
            const updatedSession = {
                ...updates,
                businessId: businessId,              // Ensure business ID is preserved
                updatedAt: new Date().toISOString()
            };

            const { resource } = await this.conversationsContainer.item(sessionId).replace(updatedSession);
            
            console.log(`✅ Updated business-scoped session: ${sessionId}`);
            return resource;

        } catch (error) {
            console.error('❌ Error updating business-scoped session:', error.message);
            
            // Fallback to legacy update for backwards compatibility
            return await this.updateLegacySession(callSid, updates);
        }
    }

    /**
     * Save business-scoped lead information
     * @param {string} businessId - Business identifier
     * @param {Object} leadData - Lead information
     * @returns {Object} Created lead
     */
    async saveLead(businessId, leadData) {
        try {
            const leadId = `${businessId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const lead = {
                id: leadId,
                businessId: businessId,                    // 🔥 NEW: Business partitioning
                ...leadData,
                createdAt: new Date().toISOString(),
                businessScoped: true                       // 🔥 NEW: Multi-tenant flag
            };

            const { resource } = await this.leadsContainer.items.create(lead);
            
            console.log(`✅ Saved business-scoped lead: ${leadId} for business ${businessId}`);
            return resource;

        } catch (error) {
            console.error('❌ Error saving business-scoped lead:', error.message);
            return null;
        }
    }

    /**
     * Get business-specific leads
     * @param {string} businessId - Business identifier
     * @param {number} limit - Maximum number of leads to return
     * @returns {Array} Array of leads for the business
     */
    async getBusinessLeads(businessId, limit = 100) {
        try {
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.businessId = @businessId ORDER BY c.createdAt DESC',
                parameters: [
                    { name: '@businessId', value: businessId }
                ]
            };

            const { resources } = await this.leadsContainer.items.query(querySpec, { maxItemCount: limit }).fetchAll();
            
            console.log(`✅ Retrieved ${resources.length} leads for business ${businessId}`);
            return resources;

        } catch (error) {
            console.error('❌ Error getting business leads:', error.message);
            return [];
        }
    }

    /**
     * Get business-specific conversations
     * @param {string} businessId - Business identifier
     * @param {number} limit - Maximum number of conversations to return
     * @returns {Array} Array of conversations for the business
     */
    async getBusinessConversations(businessId, limit = 50) {
        try {
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.businessId = @businessId ORDER BY c.createdAt DESC',
                parameters: [
                    { name: '@businessId', value: businessId }
                ]
            };

            const { resources } = await this.conversationsContainer.items.query(querySpec, { maxItemCount: limit }).fetchAll();
            
            console.log(`✅ Retrieved ${resources.length} conversations for business ${businessId}`);
            return resources;

        } catch (error) {
            console.error('❌ Error getting business conversations:', error.message);
            return [];
        }
    }

    // ===============================
    // LEGACY COMPATIBILITY METHODS
    // ===============================

    /**
     * Create legacy session (backwards compatibility)
     * @param {string} callSid - Twilio call SID
     * @param {string} customerPhone - Customer phone number
     * @returns {Object} Created session
     */
    async createLegacySession(callSid, customerPhone) {
        try {
            const session = {
                id: callSid,
                callSid: callSid,
                customerPhone: customerPhone,
                messages: [],
                leadInfo: { contactInfo: {}, score: 0 },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                businessScoped: false,     // Legacy session marker
                version: '1.0'
            };

            const { resource } = await this.conversationsContainer.items.create(session);
            console.log(`✅ Created legacy session: ${callSid}`);
            return resource;

        } catch (error) {
            console.error('❌ Error creating legacy session:', error.message);
            throw error;
        }
    }

    /**
     * Get legacy session (backwards compatibility)
     * @param {string} callSid - Twilio call SID
     * @returns {Object} Session data or null
     */
    async getLegacySession(callSid) {
        try {
            const { resource } = await this.conversationsContainer.item(callSid).read();
            
            if (resource) {
                console.log(`✅ Retrieved legacy session: ${callSid}`);
                return resource;
            }

        } catch (error) {
            if (error.code === 404) {
                console.log(`⚠️ Legacy session not found: ${callSid}`);
                return null;
            }
            console.error('❌ Error getting legacy session:', error.message);
        }

        return null;
    }

    /**
     * Update legacy session (backwards compatibility)
     * @param {string} callSid - Twilio call SID
     * @param {Object} updates - Data to update
     * @returns {Object} Updated session
     */
    async updateLegacySession(callSid, updates) {
        try {
            const updatedSession = {
                ...updates,
                updatedAt: new Date().toISOString()
            };

            const { resource } = await this.conversationsContainer.item(callSid).replace(updatedSession);
            console.log(`✅ Updated legacy session: ${callSid}`);
            return resource;

        } catch (error) {
            console.error('❌ Error updating legacy session:', error.message);
            throw error;
        }
    }

    /**
     * Check if this is a multi-tenant session
     * @param {Object} session - Session object
     * @returns {boolean} True if multi-tenant session
     */
    isMultiTenantSession(session) {
        return session && session.businessScoped === true && session.businessId;
    }

    /**
     * Get session statistics for a business
     * @param {string} businessId - Business identifier
     * @returns {Object} Session statistics
     */
    async getBusinessStats(businessId) {
        try {
            const querySpec = {
                query: `
                    SELECT 
                        COUNT(1) as totalCalls,
                        AVG(ARRAY_LENGTH(c.messages)) as avgMessages,
                        SUM(c.leadInfo.score) as totalLeadScore
                    FROM c 
                    WHERE c.businessId = @businessId
                `,
                parameters: [
                    { name: '@businessId', value: businessId }
                ]
            };

            const { resources } = await this.conversationsContainer.items.query(querySpec).fetchAll();
            
            const stats = resources[0] || {
                totalCalls: 0,
                avgMessages: 0,
                totalLeadScore: 0
            };

            console.log(`✅ Retrieved stats for business ${businessId}: ${stats.totalCalls} calls`);
            return stats;

        } catch (error) {
            console.error('❌ Error getting business stats:', error.message);
            return { totalCalls: 0, avgMessages: 0, totalLeadScore: 0 };
        }
    }
}

module.exports = MultiTenantCosmosDB;
