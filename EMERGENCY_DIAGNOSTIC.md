# 🚨 EMERGENCY DIAGNOSTIC GUIDE

## Current Status: Application Error Still Occurring

Despite deployment completing successfully, you're still getting "Application error has occurred" with no logs appearing. This indicates a critical runtime issue.

## IMMEDIATE STEPS TO DIAGNOSE

### 1. 🔍 CHECK FUNCTION APP STATUS
Visit these URLs in your browser:

- **Main Health Check**: `https://func-blucallerai.azurewebsites.net/`
- **Test Function**: `https://func-blucallerai.azurewebsites.net/api/voice-test`
- **Lead Dashboard**: `https://func-blucallerai.azurewebsites.net/api/lead-dashboard`

**Expected Results:**
- Main URL should show "Your function app is up and running"
- Test function should show detailed test results
- Lead dashboard should show the HVAC dashboard

### 2. 🔧 CHECK ENVIRONMENT VARIABLES

Go to Azure Portal → Function App → Configuration → Application Settings

**CRITICAL: Verify these are set correctly:**

```bash
# ✅ Required Environment Variables
OPENAI_ENDPOINT=https://your-openai-resource.openai.azure.com/
OPENAI_KEY=your-openai-key

# 🚨 MOST CRITICAL - Check this format
COSMOS_CONN=AccountEndpoint=https://cosmos-sql-blucallerai.documents.azure.com:443/;AccountKey=your-key;

# ✅ Also Required
SPEECH_KEY=your-speech-key
```

**⚠️ CRITICAL CHECK: COSMOS_CONN Format**

If your `COSMOS_CONN` looks like this (WRONG):
```
mongodb://cosmos-sql-blucallerai:key@cosmos-sql-blucallerai.mongo.cosmos.azure.com:10255/
```

It MUST be changed to SQL API format (CORRECT):
```
AccountEndpoint=https://cosmos-sql-blucallerai.documents.azure.com:443/;AccountKey=your-key;
```

### 3. 📋 CHECK AZURE FUNCTION LOGS

1. **Go to Azure Portal → Your Function App**
2. **Click "Monitor" → "Log stream"**
3. **Look for specific errors:**
   - Connection string format errors
   - OpenAI initialization failures
   - Module import errors
   - Cosmos DB connection timeouts

### 4. 🔄 CHECK DEPLOYMENT STATUS

Go to Azure Portal → Function App → Deployment Center
- Verify deployment shows as "Success"
- Check deployment logs for any warnings

### 5. 🧪 TEST INDIVIDUAL COMPONENTS

If you can access the test function (`/api/voice-test`), it will show you:
- ✅/❌ Environment Variables Status
- ✅/❌ Azure OpenAI Connection
- ✅/❌ Speech Service Config
- ✅/❌ Cosmos DB SQL API Connection

## MOST LIKELY CAUSES

Based on the symptoms (no logs + application error), here are the top suspects:

### 1. 🔥 **Connection String Format Issue (90% likely)**
- The COSMOS_CONN is still in MongoDB format
- Functions crash immediately when trying to parse it
- **Fix**: Update to SQL API format in Azure Function App settings

### 2. 🔥 **Missing Environment Variables (85% likely)**
- OpenAI keys not set properly
- Functions fail to initialize
- **Fix**: Verify all environment variables are set

### 3. 🔥 **Package Deployment Issue (70% likely)**
- Deployment succeeded but functions not recognized
- Missing function.json files
- **Fix**: Redeploy with correct package structure

### 4. 🔥 **Azure Function Runtime Issue (60% likely)**
- Runtime version conflicts
- **Fix**: Check runtime version in Portal

## IMMEDIATE RECOVERY STEPS

### Step 1: Fix Connection String (DO THIS FIRST)
1. Go to Azure Portal → func-blucallerai → Configuration
2. Find `COSMOS_CONN` setting
3. If it starts with `mongodb://`, replace with correct SQL API format:
   ```
   AccountEndpoint=https://cosmos-sql-blucallerai.documents.azure.com:443/;AccountKey=your-key-here;
   ```
4. **Save and restart the function app**

### Step 2: Verify Environment Variables
Make sure these are all set:
- `OPENAI_ENDPOINT`
- `OPENAI_KEY` 
- `COSMOS_CONN` (SQL API format)
- `SPEECH_KEY`

### Step 3: Force Restart
- Azure Portal → Function App → Overview → Restart

### Step 4: Check Function List
- Azure Portal → Function App → Functions
- You should see: voice-stream, voice-test, voice-twiml, lead-dashboard
- If no functions show, there's a deployment issue

## LOGS TO CHECK

If you can access logs, look for these specific error patterns:

```
# Connection string format errors:
"COSMOS_CONN appears to be MongoDB format"
"Failed to connect to Cosmos DB"

# OpenAI errors:
"Failed to initialize OpenAI client"
"Missing OpenAI configuration"

# Import errors:
"Module not found"
"Failed to import"

# Deployment errors:
"0 functions loaded"
"No HTTP triggers found"
```

## EMERGENCY CONTACT INFO

If the above doesn't resolve it:

1. **Check Azure Service Health**: `https://status.azure.com/`
2. **Check your specific region**: Ensure no outages in your region
3. **Try different browser/incognito**: Rule out caching issues

## SUCCESS INDICATORS

You'll know it's fixed when:
- ✅ Main function app URL shows default page
- ✅ `/api/voice-test` shows test results with all green checkmarks
- ✅ Twilio webhook calls work without "application error"
- ✅ Logs start appearing in Azure Monitor

**Most likely fix: Update COSMOS_CONN to SQL API format and restart function app.** 