import { NextRequest, NextResponse } from 'next/server'
import { 
  findCustomerByEmail, 
  cancelActiveSubscriptions, 
  clearBillingObjects,
  createCADSubscriptionWithCoupon,
  getCustomerCurrency,
  updateConfig,
  type CustomerData,
  type ProcessResult
} from '@/lib/stripe-utils'
import { createTeam, setRegion, setTeamConfig, type TeamConfig } from '@/lib/team-api'

async function processCustomerStripe(customer: CustomerData): Promise<ProcessResult> {
  const { kindeId, email, teamName } = customer
  
  try {
    // Find customer by email
    const stripeCustomer = await findCustomerByEmail(email)
    if (!stripeCustomer) {
      return {
        kindeId,
        email,
        teamName,
        status: 'customer_not_found',
        error: 'Customer not found in Stripe'
      }
    }
    
    // Get old currency from the customer object (no extra API call)
    const oldCurrency = stripeCustomer.currency || null
    
    // Run cancellation and billing cleanup in parallel
    const [canceled, _] = await Promise.all([
      cancelActiveSubscriptions(stripeCustomer.id),
      clearBillingObjects(stripeCustomer.id)
    ])
    
    if (!canceled) {
      return {
        kindeId,
        email,
        teamName,
        customerId: stripeCustomer.id,
        oldCurrency: oldCurrency || undefined,
        status: 'cancel_failed',
        error: 'Failed to cancel existing subscriptions'
      }
    }
    
    // Short delay for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Create new subscription
    const subscription = await createCADSubscriptionWithCoupon(stripeCustomer.id)
    if (!subscription) {
      return {
        kindeId,
        email,
        teamName,
        customerId: stripeCustomer.id,
        oldCurrency: oldCurrency || undefined,
        status: 'subscription_failed',
        error: 'Failed to create subscription'
      }
    }
    
    // Get new currency from subscription (no extra API call)
    const newCurrency = subscription.currency
    
    return {
      kindeId,
      email,
      teamName,
      customerId: stripeCustomer.id,
      subscriptionId: subscription.id,
      oldCurrency: oldCurrency || undefined,
      newCurrency: newCurrency || undefined,
      subscriptionCurrency: subscription.currency,
      startDate: '2025-06-15',
      coupon: process.env.STRIPE_COUPON_ID,
      status: 'success'
    }
    
  } catch (error: any) {
    console.error(`💥 Error processing ${email}:`, error.message)
    return {
      kindeId,
      email,
      teamName,
      status: 'subscription_failed',
      error: `Processing failed: ${error.message}`
    }
  }
}

async function processCustomerTeamsOnly(customer: CustomerData): Promise<ProcessResult> {
  const { kindeId, email, teamName } = customer
  
  try {
    console.log(`🏢 Creating team for ${email}...`)
    
    const teamResult = await createTeam(kindeId, teamName)
    
    if (teamResult.success) {
      console.log(`✅ Team created: ${teamName}`)
      return {
        kindeId,
        email,
        teamName,
        teamId: teamResult.teamId,
        status: 'success'
      }
    } else {
      console.log(`❌ Team failed: ${teamName} - ${teamResult.error}`)
      return {
        kindeId,
        email,
        teamName,
        status: 'team_creation_failed',
        error: teamResult.error,
        teamError: teamResult.error,
        teamStatus: teamResult.status,
        teamResponseData: teamResult.responseData
      }
    }
  } catch (error: any) {
    console.error(`💥 Error creating team for ${email}:`, error.message)
    return {
      kindeId,
      email,
      teamName,
      status: 'team_creation_failed',
      error: `Team creation failed: ${error.message}`
    }
  }
}

async function processTeamCreation(results: ProcessResult[]): Promise<ProcessResult[]> {
  console.log(`\n🏢 Creating teams for successful subscriptions...`)
  
  const successfulSubscriptions = results.filter(r => r.status === 'success')
  
  if (successfulSubscriptions.length === 0) {
    return results
  }
  
  console.log(`⏳ Waiting 10s for Stripe → Kinde sync...`)
  await new Promise(resolve => setTimeout(resolve, 10000))
  
  // Process team creation in smaller batches
  const teamBatchSize = 3
  const updatedResults = [...results]
  
  for (let i = 0; i < successfulSubscriptions.length; i += teamBatchSize) {
    const batch = successfulSubscriptions.slice(i, i + teamBatchSize)
    
    console.log(`🏢 Creating teams for batch ${Math.floor(i/teamBatchSize) + 1} (${batch.length} teams)`)
    
    const teamPromises = batch.map(async (result) => {
      const teamResult = await createTeam(result.kindeId, result.teamName)
      
      if (teamResult.success) {
        console.log(`✅ Team created: ${result.teamName}`)
        return { ...result, teamId: teamResult.teamId, status: 'success' as const }
      } else {
        console.log(`❌ Team failed: ${result.teamName} - ${teamResult.error}`)
        return {
          ...result,
          status: 'team_creation_failed' as const,
          error: teamResult.error,
          teamError: teamResult.error,
          teamStatus: teamResult.status,
          teamResponseData: teamResult.responseData
        }
      }
    })
    
    const batchResults = await Promise.all(teamPromises)
    
    // Update the main results array
    batchResults.forEach(updatedResult => {
      const index = updatedResults.findIndex(r => r.kindeId === updatedResult.kindeId)
      if (index !== -1) {
        updatedResults[index] = updatedResult
      }
    })
    
    // Short delay between team batches
    if (i + teamBatchSize < successfulSubscriptions.length) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  
  return updatedResults
}

export async function POST(request: NextRequest) {
  try {
    console.log(`🚀 Starting batch processing...`)
    
    const body = await request.json()
    const { customers, config }: { 
      customers: CustomerData[], 
      config?: {
        priceId: string
        couponId: string  
        startDate: string
        currency: string
        region: string
        processingMode: 'stripe_only' | 'teams_only' | 'both'
        teamConfig: TeamConfig
      }
    } = body
    
    // Update configuration
    if (config) {
      console.log(`⚙️ Config: ${config.region} region, ${config.currency} currency, ${config.processingMode} mode`)
      
      // Set region and team config
      if (config.region) {
        setRegion(config.region)
      }
      
      if (config.teamConfig) {
        setTeamConfig(config.teamConfig)
      }
      
      // Only update Stripe config if Stripe processing is involved
      if (config.processingMode === 'stripe_only' || config.processingMode === 'both') {
        updateConfig(config.priceId, config.couponId, config.startDate, config.currency)
      }
    }
    
    if (!customers || !Array.isArray(customers)) {
      return NextResponse.json(
        { error: 'Invalid customers data' },
        { status: 400 }
      )
    }

    console.log(`📊 Processing ${customers.length} customers in ${config?.processingMode || 'both'} mode`)

    const results: ProcessResult[] = []
    const batchSize = config?.processingMode === 'teams_only' ? 3 : 8  // Smaller batches for teams-only
    const totalBatches = Math.ceil(customers.length / batchSize)
    
    console.log(`📊 Processing ${customers.length} customers in ${totalBatches} batches of ${batchSize}`)
    
    // Choose processing function based on mode
    const processingMode = config?.processingMode || 'both'
    
    if (processingMode === 'teams_only') {
      // Teams-only processing
      console.log(`\n🏢 Teams-only mode: Creating teams directly`)
      
      for (let i = 0; i < customers.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1
        const batch = customers.slice(i, i + batchSize)
        
        console.log(`\n📦 Teams Batch ${batchNumber}/${totalBatches} (${batch.length} customers)`)
        
        const batchPromises = batch.map(customer => processCustomerTeamsOnly(customer))
        const batchResults = await Promise.all(batchPromises)
        
        results.push(...batchResults)
        
        const batchSuccess = batchResults.filter(r => r.status === 'success').length
        const batchFailed = batchResults.filter(r => r.status !== 'success').length
        
        console.log(`📊 Teams batch results: ${batchSuccess} success, ${batchFailed} failed`)
        
        // Short wait between team batches
        if (i + batchSize < customers.length) {
          console.log(`⏳ Waiting 2s before next teams batch...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
      
    } else if (processingMode === 'stripe_only') {
      // Stripe-only processing
      console.log(`\n💳 Stripe-only mode: Creating subscriptions only`)
      
      for (let i = 0; i < customers.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1
        const batch = customers.slice(i, i + batchSize)
        
        console.log(`\n📦 Stripe Batch ${batchNumber}/${totalBatches} (${batch.length} customers)`)
        
        const batchPromises = batch.map(customer => processCustomerStripe(customer))
        const batchResults = await Promise.all(batchPromises)
        
        results.push(...batchResults)
        
        const batchSuccess = batchResults.filter(r => r.status === 'success').length
        const batchFailed = batchResults.filter(r => r.status !== 'success').length
        
        console.log(`📊 Stripe batch results: ${batchSuccess} success, ${batchFailed} failed`)
        
        // Short wait between Stripe batches
        if (i + batchSize < customers.length) {
          console.log(`⏳ Waiting 1s before next Stripe batch...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      
    } else {
      // Both Stripe and Teams processing (original flow)
      console.log(`\n💳🏢 Both mode: Creating subscriptions then teams`)
      
      // Phase 1: Process Stripe operations in batches
      for (let i = 0; i < customers.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1
        const batch = customers.slice(i, i + batchSize)
        
        console.log(`\n📦 Stripe Batch ${batchNumber}/${totalBatches} (${batch.length} customers)`)
        
        const batchPromises = batch.map(customer => processCustomerStripe(customer))
        const batchResults = await Promise.all(batchPromises)
        
        results.push(...batchResults)
        
        const batchSuccess = batchResults.filter(r => r.status === 'success').length
        const batchFailed = batchResults.filter(r => r.status !== 'success').length
        
        console.log(`📊 Stripe batch results: ${batchSuccess} success, ${batchFailed} failed`)
        
        // Short wait between Stripe batches
        if (i + batchSize < customers.length) {
          console.log(`⏳ Waiting 1s before next Stripe batch...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      
      // Phase 2: Process team creation for successful subscriptions
      results.splice(0, results.length, ...await processTeamCreation(results))
    }
    
    const totalSuccess = results.filter(r => r.status === 'success').length
    const totalPartial = results.filter(r => r.status === 'team_creation_failed').length
    const totalFailed = results.filter(r => r.status !== 'success' && r.status !== 'team_creation_failed').length
    
    console.log(`\n🎉 Processing complete!`)
    console.log(`📊 Final: ${totalSuccess} success, ${totalPartial} partial, ${totalFailed} failed`)
    console.log(`🌍 Mode: ${processingMode} | Region: ${config?.region || 'ca (default)'}`)
    
    return NextResponse.json({ results })
  } catch (error: any) {
    console.error(`💥 Fatal error:`, error.message)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}