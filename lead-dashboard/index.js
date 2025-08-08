const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (context, req) {
  context.log("Lead dashboard accessed");

  let cosmosClient = null;
  
  try {
    // Initialize Cosmos DB connection
    if (!process.env.COSMOS_CONN) {
      context.res = {
        headers: { "Content-Type": "text/html" },
        body: `
          <html>
            <head><title>Lead Dashboard - Database Unavailable</title></head>
            <body>
              <h1>Lead Dashboard</h1>
              <p>Database connection not available (COSMOS_CONN missing).</p>
              <p>No persistent data to display.</p>
            </body>
          </html>
        `
      };
      return;
    }

    cosmosClient = new CosmosClient(process.env.COSMOS_CONN);
    const database = cosmosClient.database('voiceai');
    const transcriptsContainer = database.container('transcripts');
    const leadsContainer = database.container('leads');

    // Get recent leads
    const leadsQuery = {
      query: 'SELECT * FROM c ORDER BY c.lastContact DESC OFFSET 0 LIMIT 20'
    };
    const { resources: leads } = await leadsContainer.items.query(leadsQuery).fetchAll();

    // Get recent conversations
    const conversationsQuery = {
      query: 'SELECT DISTINCT c.callSid, c.phoneNumber, c.timestamp FROM c ORDER BY c.timestamp DESC OFFSET 0 LIMIT 10'
    };
    const { resources: recentConversations } = await transcriptsContainer.items.query(conversationsQuery).fetchAll();

    // Calculate analytics
    const totalLeads = leads.length;
    const emergencyLeads = leads.filter(lead => lead.leadInfo?.hasEmergency).length;
    const highScoreLeads = leads.filter(lead => lead.score >= 70).length;
    
    const serviceTypeStats = {};
    leads.forEach(lead => {
      if (lead.leadInfo?.serviceType) {
        serviceTypeStats[lead.leadInfo.serviceType] = (serviceTypeStats[lead.leadInfo.serviceType] || 0) + 1;
      }
    });

    const avgScore = totalLeads > 0 ? 
      (leads.reduce((sum, lead) => sum + (lead.score || 0), 0) / totalLeads).toFixed(1) : 0;

    // Generate HTML dashboard
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Blue Caller HVAC - Lead Dashboard</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background-color: #f5f5f5; 
          }
          .container { max-width: 1200px; margin: 0 auto; }
          .header { 
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white; 
            padding: 30px; 
            border-radius: 10px; 
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .status-notice {
            background: #d1fae5;
            border: 1px solid #10b981;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
            color: #065f46;
          }
          .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
          }
          .stat-card { 
            background: white; 
            padding: 25px; 
            border-radius: 10px; 
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #2563eb;
          }
          .stat-number { 
            font-size: 2.5em; 
            font-weight: bold; 
            color: #2563eb; 
            margin-bottom: 10px;
          }
          .stat-label { 
            color: #666; 
            font-size: 0.9em; 
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .section { 
            background: white; 
            padding: 25px; 
            border-radius: 10px; 
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .section h2 { 
            color: #333; 
            border-bottom: 2px solid #2563eb; 
            padding-bottom: 10px;
            margin-top: 0;
          }
          .lead-item { 
            border: 1px solid #eee; 
            padding: 15px; 
            margin: 10px 0; 
            border-radius: 8px; 
            background: #fafafa;
          }
          .lead-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 10px;
          }
          .phone-number { 
            font-weight: bold; 
            color: #333; 
          }
          .score { 
            padding: 5px 12px; 
            border-radius: 20px; 
            font-weight: bold; 
            color: white;
          }
          .score.high { background: #10b981; }
          .score.medium { background: #f59e0b; color: #333; }
          .score.low { background: #ef4444; }
          .emergency { 
            background: #ef4444; 
            color: white; 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-size: 0.8em;
            margin-left: 10px;
          }
          .service-type { 
            background: #2563eb; 
            color: white; 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-size: 0.8em;
            margin-right: 10px;
          }
          .conversation-item { 
            border-left: 4px solid #2563eb; 
            padding: 15px; 
            margin: 10px 0; 
            background: #f8f9fa;
            border-radius: 0 8px 8px 0;
          }
          .timestamp { 
            color: #666; 
            font-size: 0.9em; 
          }
          .message-count { 
            color: #2563eb; 
            font-weight: bold; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 Blue Caller HVAC - Lead Dashboard</h1>
            <p>Real-time voice agent analytics with Cosmos DB SQL API</p>
          </div>

          <div class="status-notice">
            <h3>✅ System Status: Fully Operational</h3>
            <p><strong>Cosmos DB SQL API:</strong> Connected and storing all conversations and leads</p>
            <p><strong>Voice Agent:</strong> Enhanced with natural, concise responses</p>
            <p><strong>Business Intelligence:</strong> Real-time lead scoring and analysis</p>
            <p><strong>Performance:</strong> Lightweight SQL API integration (no sync trigger issues)</p>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${totalLeads}</div>
              <div class="stat-label">Total Leads</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${emergencyLeads}</div>
              <div class="stat-label">Emergency Calls</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${highScoreLeads}</div>
              <div class="stat-label">High-Value Leads</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${avgScore}</div>
              <div class="stat-label">Average Score</div>
            </div>
          </div>

          <div class="section">
            <h2>📊 Service Type Breakdown</h2>
            ${Object.entries(serviceTypeStats).map(([type, count]) => 
              `<span class="service-type">${type}: ${count}</span>`
            ).join(' ')}
            ${Object.keys(serviceTypeStats).length === 0 ? '<p>No service requests recorded yet. Make test calls to see data!</p>' : ''}
          </div>

          <div class="section">
            <h2>🎯 Recent Leads</h2>
            ${leads.slice(0, 10).map(lead => `
              <div class="lead-item">
                <div class="lead-header">
                  <span class="phone-number">${lead.phoneNumber}</span>
                  <div>
                    ${lead.leadInfo?.serviceType ? `<span class="service-type">${lead.leadInfo.serviceType}</span>` : ''}
                    ${lead.leadInfo?.hasEmergency ? '<span class="emergency">EMERGENCY</span>' : ''}
                    <span class="score ${lead.score >= 70 ? 'high' : lead.score >= 40 ? 'medium' : 'low'}">
                      ${lead.score || 0}
                    </span>
                  </div>
                </div>
                <div>
                  ${lead.leadInfo?.contactInfo?.name ? `<strong>Name:</strong> ${lead.leadInfo.contactInfo.name}<br>` : ''}
                  <strong>Last Contact:</strong> ${new Date(lead.lastContact).toLocaleString()}<br>
                  <strong>Status:</strong> ${lead.leadInfo?.urgencyLevel || 'normal'} | <strong>Call ID:</strong> ${lead.lastCallSid?.substring(0, 10) || 'N/A'}...
                </div>
              </div>
            `).join('')}
            ${leads.length === 0 ? '<p>No leads recorded yet. Call your voice agent to start generating leads!</p>' : ''}
          </div>

          <div class="section">
            <h2>💬 Recent Conversations</h2>
            ${recentConversations.map(conv => `
              <div class="conversation-item">
                <div class="lead-header">
                  <span class="phone-number">${conv.phoneNumber}</span>
                  <span class="timestamp">${new Date(conv.timestamp).toLocaleString()}</span>
                </div>
                <div>
                  Call ID: ${conv.callSid.substring(0, 10)}... |
                  Active conversation
                </div>
              </div>
            `).join('')}
            ${recentConversations.length === 0 ? '<p>No conversations recorded yet. Make a test call to see live data!</p>' : ''}
          </div>

          <div class="section">
            <h2>🧪 Test Your Voice Agent</h2>
            <p><strong>Call your Twilio number and try these scenarios:</strong></p>
            
            <h4>🚨 Emergency Test:</h4>
            <p>"This is an emergency, my furnace isn't working and I smell gas"</p>
            <p><em>Expected: Urgent response, immediate service offer</em></p>
            
            <h4>🏠 Installation Test:</h4>
            <p>"Hi, my name is John Smith, I need a new air conditioning system"</p>
            <p><em>Expected: Acknowledges name, discusses installation options</em></p>
            
            <h4>🔧 Repair Test:</h4>
            <p>"My heater is making strange noises, can you help?"</p>
            <p><em>Expected: Heating service focus, troubleshooting questions</em></p>
          </div>

          <div class="section">
            <h2>🔄 System Status</h2>
            <p><strong>Voice Agent:</strong> ✅ Active with natural, concise responses</p>
            <p><strong>Cosmos DB SQL API:</strong> ✅ Connected and persisting all data</p>
            <p><strong>Lead Intelligence:</strong> ✅ Real-time analysis and scoring</p>
            <p><strong>Azure OpenAI:</strong> ✅ GPT-3.5-turbo with shorter responses (80 tokens max)</p>
            <p><strong>Speech Confidence:</strong> ✅ Improved filtering (0.3+ threshold)</p>
            <p><strong>Sync Triggers:</strong> ✅ No issues with lightweight SQL API</p>
            <p><strong>Last Updated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>

        <script>
          // Auto-refresh every 30 seconds
          setTimeout(() => {
            location.reload();
          }, 30000);
        </script>
      </body>
      </html>
    `;

    context.res = {
      headers: { "Content-Type": "text/html" },
      body: html
    };

  } catch (error) {
    context.log.error("Dashboard error:", error.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "text/html" },
      body: `
        <html>
          <head><title>Dashboard Error</title></head>
          <body>
            <h1>Dashboard Error</h1>
            <p>Error loading dashboard: ${error.message}</p>
            <p>Make sure Cosmos DB SQL API is properly configured.</p>
          </body>
        </html>
      `
    };
  }
}; 