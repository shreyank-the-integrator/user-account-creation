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
import { createTeamWithRetry, setRegion } from '@/lib/team-api'

async function processCustomer(customer: CustomerData): Promise<ProcessResult> {
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
      const teamResult = await createTeamWithRetry(result.kindeId, result.teamName, 2)
      
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
        includeTeamCreation: boolean
      }
    } = body
    
    // Update configuration
    if (config) {
      console.log(`⚙️ Config: ${config.region} region, ${config.currency} currency, ${config.includeTeamCreation ? 'Stripe + Teams' : 'Stripe Only'}`)
      updateConfig(config.priceId, config.couponId, config.startDate, config.currency)
      
      if (config.region) {
        setRegion(config.region)
      }
    }
    
    if (!customers || !Array.isArray(customers)) {
      return NextResponse.json(
        { error: 'Invalid customers data' },
        { status: 400 }
      )
    }

    console.log(`📊 Processing ${customers.length} customers`)

    const results: ProcessResult[] = []
    const batchSize = 8  // Optimized batch size for Stripe operations
    const totalBatches = Math.ceil(customers.length / batchSize)
    
    console.log(`📊 Processing ${customers.length} customers in ${totalBatches} batches of ${batchSize}`)
    
    // Phase 1: Process Stripe operations in batches
    for (let i = 0; i < customers.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1
      const batch = customers.slice(i, i + batchSize)
      
      console.log(`\n📦 Stripe Batch ${batchNumber}/${totalBatches} (${batch.length} customers)`)
      
      const batchPromises = batch.map(customer => processCustomer(customer))
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
    
    // Phase 2: Process team creation for successful subscriptions (if enabled)
    let finalResults = results
    if (config?.includeTeamCreation) {
      finalResults = await processTeamCreation(results)
    } else {
      console.log(`\n⏭️ Skipping team creation (Stripe-only mode)`)
    }
    
    const totalSuccess = finalResults.filter(r => r.status === 'success').length
    const totalPartial = finalResults.filter(r => r.status === 'team_creation_failed').length
    const totalFailed = finalResults.filter(r => r.status !== 'success' && r.status !== 'team_creation_failed').length
    
    console.log(`\n🎉 Processing complete!`)
    console.log(`📊 Final: ${totalSuccess} success, ${totalPartial} partial, ${totalFailed} failed`)
    console.log(`🌍 Mode: ${config?.includeTeamCreation ? 'Stripe + Teams' : 'Stripe Only'} | Region: ${config?.region || 'ca (default)'}`)
    
    return NextResponse.json({ results: finalResults })
  } catch (error: any) {
    console.error(`💥 Fatal error:`, error.message)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}