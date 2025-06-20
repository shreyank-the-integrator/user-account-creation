import axios from 'axios'

const TEAM_API_TOKEN = process.env.TEAM_API_TOKEN!

// Region mapping
const REGION_URLS = {
  ca: 'https://ca.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/',
  us: 'https://us.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/',
  au: 'https://au.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/',
  eu: 'https://eu.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/',
  uk: 'https://uk.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/'
}

export interface TeamCreationResult {
  success: boolean
  teamId?: string
  error?: string
  status?: number
  responseData?: any
}

// Dynamic region configuration
let currentRegion = 'ca' // Default to Canada

export function setRegion(region: string) {
  if (region in REGION_URLS) {
    currentRegion = region
    console.log(`🌍 Region set to: ${region}`)
  } else {
    console.error(`❌ Invalid region: ${region}. Valid regions: ${Object.keys(REGION_URLS).join(', ')}`)
  }
}

export function getCurrentRegionUrl(): string {
  return REGION_URLS[currentRegion as keyof typeof REGION_URLS]
}

function getAuthHeader(): string {
  if (TEAM_API_TOKEN.startsWith('Bearer ')) {
    return TEAM_API_TOKEN
  } else {
    return `Bearer ${TEAM_API_TOKEN}`
  }
}

export async function createTeam(kindeId: string, teamName: string): Promise<TeamCreationResult> {
  try {
    const currentUrl = getCurrentRegionUrl()
    const authHeader = getAuthHeader()
    
    const payload = {
      owner_kinde_id: kindeId,
      team_name: teamName,
      admin_session_review_toggle: false,
      allow_to_add_team_members: true,
      charge_future_members: true,
      is_pilot: false,
      is_stripe_managed: true,
      subscribed_plan: "PRO"
    }

    console.log(`🏢 Creating team "${teamName}" for user ${kindeId} in region ${currentRegion}`)
    
    const response = await axios.post(currentUrl, payload, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: () => true
    })

    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ Team created successfully: ${response.data.id}`)
      return {
        success: true,
        teamId: response.data.id,
        responseData: response.data
      }
    } else {
      // Better error handling
      let errorMessage = `HTTP ${response.status}`
      
      if (response.data?.detail?.msg) {
        errorMessage = response.data.detail.msg
      } else if (response.data?.detail) {
        if (typeof response.data.detail === 'string') {
          errorMessage = response.data.detail
        } else {
          errorMessage = JSON.stringify(response.data.detail)
        }
      } else if (response.data?.message) {
        errorMessage = response.data.message
      }
      
      console.log(`❌ Team creation failed: ${response.status} - ${errorMessage}`)
      console.log(`📊 Full response data:`, JSON.stringify(response.data, null, 2))
      
      return {
        success: false,
        error: errorMessage,
        status: response.status,
        responseData: response.data
      }
    }

  } catch (error: any) {
    console.log(`💥 Team creation error: ${error.message}`)
    
    if (error.response) {
      let errorMessage = `HTTP ${error.response.status}`
      
      if (error.response.data?.detail?.msg) {
        errorMessage = error.response.data.detail.msg
      } else if (error.response.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail
        } else {
          errorMessage = JSON.stringify(error.response.data.detail)
        }
      } else if (error.response.data?.message) {
        errorMessage = error.response.data.message
      }
      
      console.log(`📊 Error response data:`, JSON.stringify(error.response.data, null, 2))
      
      return {
        success: false,
        error: errorMessage,
        status: error.response.status,
        responseData: error.response.data
      }
    } else {
      return {
        success: false,
        error: error.message,
        status: 0
      }
    }
  }
}

// Simple retry wrapper (optional)
export async function createTeamWithRetry(kindeId: string, teamName: string, maxRetries: number = 2): Promise<TeamCreationResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await createTeam(kindeId, teamName)
    
    if (result.success) {
      return result
    }
    
    // Don't retry on auth errors or user not found
    if (result.status === 401 || result.status === 404) {
      return result
    }
    
    // Wait before retry (except on last attempt)
    if (attempt < maxRetries) {
      console.log(`⏳ Retrying in 3 seconds... (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }
  
  // Return the last attempt result
  return await createTeam(kindeId, teamName)
}