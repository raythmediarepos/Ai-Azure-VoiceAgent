/**
 * Firebase Admin SDK Integration for Multi-Tenant Business Lookup
 * Handles business identification, AI configuration, and data retrieval
 */

const admin = require('firebase-admin');

class FirebaseService {
    constructor() {
        this.firestore = null;
        this.initialized = false;
        this.initializeFirebase();
    }

    initializeFirebase() {
        try {
            // Check if Firebase Admin is already initialized
            if (!admin.apps.length) {
                const serviceAccount = {
                    projectId: process.env.FB_PROJECT_ID,
                    clientEmail: process.env.FB_CLIENT_EMAIL,
                    privateKey: process.env.FB_PRIVATE_KEY ? process.env.FB_PRIVATE_KEY.replace(/\\n/g, '\n') : null
                };

                // Validate environment variables
                if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
                    console.error('❌ Firebase configuration missing. Required env vars: FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY');
                    this.initialized = false;
                    return;
                }

                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId: serviceAccount.projectId
                });

                console.log('✅ Firebase Admin SDK initialized successfully');
            }

            this.firestore = admin.firestore();
            this.initialized = true;

        } catch (error) {
            console.error('❌ Firebase initialization failed:', error.message);
            this.initialized = false;
        }
    }

    /**
     * Find business by Twilio phone number
     * @param {string} phoneNumber - E.164 format phone number (e.g., "+12792405162")
     * @returns {Object} Business data with businessId and profile
     */
    async findBusinessByPhone(phoneNumber) {
        if (!this.initialized) {
            console.warn('⚠️ Firebase not initialized, using default business config');
            return this.getDefaultBusinessConfig();
        }

        try {
            console.log(`🔍 Looking up business for phone: ${phoneNumber}`);

            // Query businesses collection for matching phone number
            const businessesQuery = await this.firestore.collection('businesses')
                .where('twilioNumbers', 'array-contains-any', [
                    { phoneNumber: phoneNumber }
                ])
                .limit(1)
                .get();

            if (!businessesQuery.empty) {
                const businessDoc = businessesQuery.docs[0];
                const businessData = businessDoc.data();
                
                console.log(`✅ Found business: ${businessData.profile?.companyName || 'Unknown'} (ID: ${businessDoc.id})`);
                
                return {
                    businessId: businessDoc.id,
                    data: businessData,
                    found: true
                };
            }

            // Alternative: Check for shared development numbers with business keys
            const sharedNumberPattern = `${phoneNumber}-`;
            const sharedQuery = await this.firestore.collection('businesses')
                .where('twilioNumbers', 'array-contains-any', [
                    { phoneNumber: phoneNumber, isMock: true }
                ])
                .limit(1)
                .get();

            if (!sharedQuery.empty) {
                const businessDoc = sharedQuery.docs[0];
                const businessData = businessDoc.data();
                
                console.log(`✅ Found shared number business: ${businessData.profile?.companyName || 'Unknown'}`);
                
                return {
                    businessId: businessDoc.id,
                    data: businessData,
                    found: true,
                    isSharedNumber: true
                };
            }

            console.log(`⚠️ No business found for phone ${phoneNumber}, using default config`);
            return this.getDefaultBusinessConfig();

        } catch (error) {
            console.error('❌ Error finding business by phone:', error.message);
            return this.getDefaultBusinessConfig();
        }
    }

    /**
     * Get business AI assistant configuration
     * @param {string} businessId - Business document ID
     * @returns {Object} AI configuration or default
     */
    async getBusinessAIConfig(businessId) {
        if (!this.initialized || businessId === 'default') {
            return this.getDefaultAIConfig();
        }

        try {
            const aiConfigDoc = await this.firestore.collection('aiAssistants')
                .doc(businessId)
                .get();

            if (aiConfigDoc.exists) {
                const config = aiConfigDoc.data();
                console.log(`✅ Retrieved AI config for business: ${businessId}`);
                return config;
            }

            console.log(`⚠️ No AI config found for business ${businessId}, using default`);
            return this.getDefaultAIConfig();

        } catch (error) {
            console.error('❌ Error getting AI config:', error.message);
            return this.getDefaultAIConfig();
        }
    }

    /**
     * Get full business data by businessId
     * @param {string} businessId - Business document ID
     * @returns {Object} Business data or null
     */
    async getBusinessData(businessId) {
        if (!this.initialized || businessId === 'default') {
            return null;
        }

        try {
            const businessDoc = await this.firestore.collection('businesses')
                .doc(businessId)
                .get();

            if (businessDoc.exists) {
                return businessDoc.data();
            }

            return null;
        } catch (error) {
            console.error('❌ Error getting business data:', error.message);
            return null;
        }
    }

    /**
     * Update business AI assistant configuration
     * @param {string} businessId - Business document ID
     * @param {Object} aiConfig - AI configuration updates
     */
    async updateBusinessAIConfig(businessId, aiConfig) {
        if (!this.initialized || businessId === 'default') {
            console.warn('⚠️ Cannot update default business config');
            return false;
        }

        try {
            await this.firestore.collection('aiAssistants')
                .doc(businessId)
                .set({
                    ...aiConfig,
                    businessId: businessId,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

            console.log(`✅ Updated AI config for business: ${businessId}`);
            return true;
        } catch (error) {
            console.error('❌ Error updating AI config:', error.message);
            return false;
        }
    }

    /**
     * Verify session cookie (for business-config API authentication)
     * @param {string} sessionCookie - Firebase session cookie
     * @returns {Object} Decoded user claims or null
     */
    async verifySessionCookie(sessionCookie) {
        if (!this.initialized) {
            throw new Error('Firebase not initialized');
        }

        try {
            const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
            return {
                uid: decodedClaims.uid,
                email: decodedClaims.email,
                businessId: decodedClaims.uid // Business owner's UID = business ID
            };
        } catch (error) {
            console.error('❌ Session cookie verification failed:', error.message);
            return null;
        }
    }

    /**
     * Default business configuration for backwards compatibility
     * @returns {Object} Default business config
     */
    getDefaultBusinessConfig() {
        return {
            businessId: 'default',
            data: {
                profile: {
                    companyName: 'Blue Caller HVAC',
                    industry: 'hvac',
                    businessType: 'hvac'
                },
                services: {
                    list: ['heating repair', 'cooling repair', 'maintenance', 'installation']
                },
                schedule: {
                    weekdayHours: { open: '08:00', close: '17:00' },
                    weekendHours: { open: '09:00', close: '15:00' }
                }
            },
            found: false,
            isDefault: true
        };
    }

    /**
     * Default AI configuration for backwards compatibility
     * @returns {Object} Default AI config
     */
    getDefaultAIConfig() {
        return {
            voiceStyle: 'friendly',
            gender: 'female',
            responseTone: 'professional',
            greetingMessage: 'Thank you for calling Blue Caller HVAC. How may I assist you today?',
            businessSlogan: '',
            bufferTime: 15,
            serviceRadius: 25,
            humanForwarding: {
                enabled: false,
                phoneNumber: '',
                transferThreshold: 3
            }
        };
    }

    /**
     * Get industry-specific emergency keywords
     * @param {string} industry - Normalized industry type
     * @returns {Array} Emergency keywords for the industry
     */
    getIndustryEmergencyKeywords(industry) {
        const emergencyKeywords = {
            hvac: ['no heat', 'no cooling', 'no air', 'furnace down', 'ac down', 'emergency'],
            plumbing: ['leak', 'flood', 'no water', 'burst pipe', 'overflow', 'emergency'],
            electrical: ['no power', 'sparks', 'burning smell', 'shock', 'outage', 'emergency'],
            roofing: ['leak', 'storm damage', 'collapsed', 'emergency'],
            general: ['emergency', 'urgent', 'immediate']
        };

        return emergencyKeywords[industry] || emergencyKeywords.general;
    }
}

module.exports = FirebaseService;
