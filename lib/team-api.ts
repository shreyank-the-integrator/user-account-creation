import axios from 'axios'

const TEAM_API_URL = process.env.TEAM_API_URL!
const TEAM_API_TOKEN = process.env.TEAM_API_TOKEN!

export interface TeamCreationResult {
  success: boolean
  teamId?: string
  error?: string
  status?: number
  responseData?: any
}

export async function createTeam(kindeId: string, teamName: string): Promise<TeamCreationResult> {
  try {
    console.log(`🏢 Creating team via API...`)
    console.log(`   - Kinde ID: ${kindeId}`)
    console.log(`   - Team Name: ${teamName}`)
    console.log(`   - API URL: ${TEAM_API_URL}`)
    console.log(`   - Token starts with: ${TEAM_API_TOKEN.substring(0, 20)}...`)
    
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

    console.log(`📦 Team creation payload:`, JSON.stringify(payload, null, 2))

    const response = await axios.post(TEAM_API_URL, payload, {
      headers: {
        'Authorization': TEAM_API_TOKEN,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    })

    console.log(`✅ Team created successfully:`)
    console.log(`   - Status: ${response.status}`)
    console.log(`   - Team ID: ${response.data.id || 'N/A'}`)
    console.log(`   - Response data:`, JSON.stringify(response.data, null, 2))

    return {
      success: true,
      teamId: response.data.id,
      responseData: response.data
    }
  } catch (error: any) {
    console.error(`💥 Failed to create team:`)
    console.error(`   - Kinde ID: ${kindeId}`)
    console.error(`   - Team Name: ${teamName}`)
    console.error(`   - Error: ${error.message}`)
    
    if (error.response) {
      console.error(`   - HTTP Status: ${error.response.status}`)
      console.error(`   - Response Headers:`, error.response.headers)
      console.error(`   - Response Data:`, JSON.stringify(error.response.data, null, 2))
    } else if (error.request) {
      console.error(`   - No response received`)
      console.error(`   - Request:`, error.request)
    } else {
      console.error(`   - Error setting up request:`, error.message)
    }
    
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      responseData: error.response?.data
    }
  }
}