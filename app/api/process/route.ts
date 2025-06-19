import { NextRequest, NextResponse } from 'next/server'
import { 
  findCustomerByEmail, 
  cancelActiveSubscriptions, 
  clearBillingObjects,
  createCADSubscriptionWithCoupon,
  getCustomerCurrency,
  type CustomerData,
  type ProcessResult
} from '@/lib/stripe-utils'
import { createTeam } from '@/lib/team-api'

async function processCustomer(customer: CustomerData): Promise<ProcessResult> {
  const { kindeId, email, teamName } = customer
  
  console.log(`\n🔄 ===== PROCESSING CUSTOMER =====`)
  console.log(`📧 Email: ${email}`)
  console.log(`🆔 Kinde ID: ${kindeId}`)
  console.log(`🏢 Team Name: ${teamName}`)
  console.log(`🔍 Raw customer object:`, JSON.stringify(customer, null, 2))
  console.log(`=====================================`)
  
  // Find customer by email
  console.log(`\n1️⃣ STEP 1: Finding customer by email...`)
  const stripeCustomer = await findCustomerByEmail(email)
  if (!stripeCustomer) {
    console.log(`❌ RESULT: Customer not found in Stripe`)
    return {
      kindeId,
      email,
      teamName,
      status: 'customer_not_found',
      error: 'Customer not found in Stripe'
    }
  }
  
  console.log(`✅ RESULT: Customer found - ${stripeCustomer.id}`)
  
  // Get old currency
  console.log(`\n2️⃣ STEP 2: Getting current customer currency...`)
  const oldCurrency = await getCustomerCurrency(stripeCustomer.id)
  
  // Cancel active subscriptions
  console.log(`\n3️⃣ STEP 3: Canceling active subscriptions...`)
  const canceled = await cancelActiveSubscriptions(stripeCustomer.id)
  if (!canceled) {
    console.log(`❌ RESULT: Failed to cancel subscriptions`)
    return {
      kindeId,
      email,
      teamName,
      customerId: stripeCustomer.id,
      status: 'cancel_failed',
      error: 'Failed to cancel existing subscriptions'
    }
  }
  console.log(`✅ RESULT: Subscriptions canceled successfully`)
  
  // Clear billing objects
  console.log(`\n4️⃣ STEP 4: Clearing billing objects...`)
  await clearBillingObjects(stripeCustomer.id)
  
  // Small delay
  console.log(`\n⏳ Waiting 250ms for cancellations to process...`)
  await new Promise(resolve => setTimeout(resolve, 250))
  
  // Create new CAD subscription
  console.log(`\n5️⃣ STEP 5: Creating new CAD subscription...`)
  const subscription = await createCADSubscriptionWithCoupon(stripeCustomer.id)
  if (!subscription) {
    console.log(`❌ RESULT: Failed to create CAD subscription`)
    return {
      kindeId,
      email,
      teamName,
      customerId: stripeCustomer.id,
      status: 'subscription_failed',
      error: 'Failed to create CAD subscription'
    }
  }
  console.log(`✅ RESULT: CAD subscription created - ${subscription.id}`)
  
  // Get new currency
  console.log(`\n6️⃣ STEP 6: Verifying new customer currency...`)
  const newCurrency = await getCustomerCurrency(stripeCustomer.id)
  
  // Wait for subscription to propagate
  console.log(`\n⏳ Waiting 500ms for subscription to propagate...`)
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Create team
  console.log(`\n7️⃣ STEP 7: Creating team...`)
  const teamResult = await createTeam(kindeId, teamName)
  
  if (!teamResult.success) {
    console.log(`❌ RESULT: Team creation failed`)
    console.log(`📝 Final status: Stripe subscription created but team creation failed`)
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
      status: 'team_creation_failed',
      error: `Stripe subscription created but team creation failed: ${teamResult.error}`,
      teamError: teamResult.error,
      teamStatus: teamResult.status,
      teamResponseData: teamResult.responseData
    }
  }
  
  console.log(`✅ RESULT: Team created successfully - ${teamResult.teamId}`)
  console.log(`🎉 FINAL STATUS: Complete success!`)
  
  return {
    kindeId,
    email,
    teamName,
    customerId: stripeCustomer.id,
    subscriptionId: subscription.id,
    teamId: teamResult.teamId,
    oldCurrency: oldCurrency || undefined,
    newCurrency: newCurrency || undefined,
    subscriptionCurrency: subscription.currency,
    startDate: '2025-06-15',
    coupon: process.env.STRIPE_COUPON_ID,
    status: 'success'
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log(`🚀 ===== STARTING BATCH PROCESSING =====`)
    
    const body = await request.json()
    console.log(`📦 Raw request body:`, JSON.stringify(body, null, 2))
    
    const { customers }: { customers: CustomerData[] } = body
    
    console.log(`📊 Request received with ${customers?.length || 0} customers`)
    console.log(`📋 First customer (if exists):`, customers?.[0] ? JSON.stringify(customers[0], null, 2) : 'N/A')
    
    if (!customers || !Array.isArray(customers)) {
      console.log(`❌ Invalid request: customers data is not an array`)
      console.log(`❌ Received type: ${typeof customers}`)
      console.log(`❌ Received value:`, customers)
      return NextResponse.json(
        { error: 'Invalid customers data' },
        { status: 400 }
      )
    }

    // Check each customer object structure
    customers.forEach((customer, index) => {
      console.log(`👤 Customer ${index + 1}:`)
      console.log(`   - Object keys: ${Object.keys(customer)}`)
      console.log(`   - Kinde ID: "${customer.kindeId}" (type: ${typeof customer.kindeId})`)
      console.log(`   - Email: "${customer.email}" (type: ${typeof customer.email})`)
      console.log(`   - Team Name: "${customer.teamName}" (type: ${typeof customer.teamName})`)
      console.log(`   - Full object:`, JSON.stringify(customer, null, 2))
    })

    console.log(`📋 Environment check:`)
    console.log(`   - STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? 'Set (starts with ' + process.env.STRIPE_SECRET_KEY.substring(0, 10) + '...)' : 'NOT SET'}`)
    console.log(`   - STRIPE_PRICE_ID: ${process.env.STRIPE_PRICE_ID || 'NOT SET'}`)
    console.log(`   - STRIPE_COUPON_ID: ${process.env.STRIPE_COUPON_ID || 'NOT SET'}`)
    console.log(`   - TEAM_API_URL: ${process.env.TEAM_API_URL || 'NOT SET'}`)
    console.log(`   - TEAM_API_TOKEN: ${process.env.TEAM_API_TOKEN ? 'Set (starts with ' + process.env.TEAM_API_TOKEN.substring(0, 20) + '...)' : 'NOT SET'}`)

    const results: ProcessResult[] = []
    const batchSize = 10
    const totalBatches = Math.ceil(customers.length / batchSize)
    
    console.log(`📦 Processing ${customers.length} customers in ${totalBatches} batches of ${batchSize}`)
    
    // Process in batches
    for (let i = 0; i < customers.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1
      const batch = customers.slice(i, i + batchSize)
      
      console.log(`\n📦 ===== BATCH ${batchNumber}/${totalBatches} =====`)
      console.log(`📊 Processing customers ${i + 1}-${Math.min(i + batchSize, customers.length)} of ${customers.length}`)
      console.log(`👥 Customers in this batch:`)
      batch.forEach((customer, index) => {
        console.log(`   ${i + index + 1}. ${customer.teamName} (${customer.email})`)
      })
      
      const batchPromises = batch.map(customer => processCustomer(customer))
      const batchResults = await Promise.all(batchPromises)
      
      results.push(...batchResults)
      
      console.log(`\n📊 Batch ${batchNumber} Results:`)
      const batchSuccess = batchResults.filter(r => r.status === 'success').length
      const batchPartial = batchResults.filter(r => r.status === 'team_creation_failed').length
      const batchFailed = batchResults.filter(r => r.status !== 'success' && r.status !== 'team_creation_failed').length
      
      console.log(`   ✅ Success: ${batchSuccess}`)
      console.log(`   ⚠️  Partial: ${batchPartial}`)
      console.log(`   ❌ Failed: ${batchFailed}`)
      
      // Shorter wait between batches
      if (i + batchSize < customers.length) {
        console.log(`⏳ Waiting 500ms before next batch...`)
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    console.log(`\n🎉 ===== PROCESSING COMPLETE =====`)
    const totalSuccess = results.filter(r => r.status === 'success').length
    const totalPartial = results.filter(r => r.status === 'team_creation_failed').length
    const totalFailed = results.filter(r => r.status !== 'success' && r.status !== 'team_creation_failed').length
    
    console.log(`📊 Final Results:`)
    console.log(`   ✅ Total Success: ${totalSuccess}`)
    console.log(`   ⚠️  Total Partial: ${totalPartial}`)
    console.log(`   ❌ Total Failed: ${totalFailed}`)
    console.log(`   📋 Total Processed: ${results.length}`)
    
    console.log(`\n📋 Detailed Results Summary:`)
    results.forEach((result, index) => {
      const status = result.status === 'success' ? '✅' : result.status === 'team_creation_failed' ? '⚠️' : '❌'
      console.log(`   ${index + 1}. ${status} ${result.teamName} (${result.email}) - ${result.status}`)
      if (result.error) {
        console.log(`      Error: ${result.error}`)
      }
    })
    
    return NextResponse.json({ results })
  } catch (error: any) {
    console.error(`💥 ===== FATAL ERROR IN PROCESSING =====`)
    console.error(`Error type: ${error.constructor.name}`)
    console.error(`Error message: ${error.message}`)
    console.error(`Error stack:`, error.stack)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}