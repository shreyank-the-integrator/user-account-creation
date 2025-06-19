import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const PRICE_ID = process.env.STRIPE_PRICE_ID!
const COUPON_ID = process.env.STRIPE_COUPON_ID!
const SUBSCRIPTION_START_DATE = '2025-06-15'

export interface CustomerData {
  kindeId: string
  email: string
  teamName: string
}

export interface ProcessResult {
  kindeId: string
  email: string
  teamName: string
  customerId?: string
  subscriptionId?: string
  teamId?: string
  oldCurrency?: string
  newCurrency?: string
  subscriptionCurrency?: string
  startDate?: string
  coupon?: string
  status: 'success' | 'customer_not_found' | 'cancel_failed' | 'subscription_failed' | 'team_creation_failed'
  error?: string
  teamError?: string
  teamStatus?: number
  teamResponseData?: any
}

function getSubscriptionStartTimestamp(): number {
  const timestamp = Math.floor(new Date(SUBSCRIPTION_START_DATE + 'T00:00:00Z').getTime() / 1000)
  console.log(`🕐 Subscription start timestamp: ${timestamp} (${SUBSCRIPTION_START_DATE})`)
  return timestamp
}

export async function findCustomerByEmail(email: string): Promise<Stripe.Customer | null> {
  try {
    console.log(`🔍 Searching for customer with email: "${email}"`)
    
    // Log the exact search query being used
    const searchQuery = `email:'${email}'`
    console.log(`📝 Stripe search query: ${searchQuery}`)
    
    const customers = await stripe.customers.search({
      query: searchQuery,
      limit: 1
    })
    
    console.log(`📊 Search results: Found ${customers.data.length} customers`)
    
    if (customers.data.length > 0) {
      const customer = customers.data[0]
      console.log(`✅ Customer found:`)
      console.log(`   - ID: ${customer.id}`)
      console.log(`   - Email: ${customer.email}`)
      console.log(`   - Name: ${customer.name || 'N/A'}`)
      console.log(`   - Currency: ${customer.currency || 'none'}`)
      console.log(`   - Created: ${new Date(customer.created * 1000).toISOString()}`)
      return customer
    } else {
      console.log(`❌ No customer found with email: "${email}"`)
      
      // Let's try a broader search to see if there are similar emails
      try {
        console.log(`🔍 Attempting broader search...`)
        const broadSearch = await stripe.customers.list({
          email: email,
          limit: 5
        })
        console.log(`📊 Broad search results: Found ${broadSearch.data.length} customers with list method`)
        
        if (broadSearch.data.length > 0) {
          console.log(`📋 Similar customers found:`)
          broadSearch.data.forEach((c, index) => {
            console.log(`   ${index + 1}. ID: ${c.id}, Email: ${c.email}`)
          })
        }
      } catch (broadError) {
        console.log(`⚠️ Broad search failed:`, broadError)
      }
      
      return null
    }
  } catch (error: any) {
    console.error(`💥 Error searching for customer "${email}":`, error)
    console.error(`   Error type: ${error.constructor.name}`)
    console.error(`   Error message: ${error.message}`)
    if (error.code) console.error(`   Error code: ${error.code}`)
    if (error.type) console.error(`   Error type: ${error.type}`)
    return null
  }
}

export async function cancelActiveSubscriptions(customerId: string): Promise<boolean> {
  try {
    console.log(`🗂️ Fetching subscriptions for customer: ${customerId}`)
    
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all'
    })
    
    console.log(`📊 Found ${subscriptions.data.length} total subscriptions`)
    
    const activeSubscriptions = subscriptions.data.filter(sub => 
      sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due'
    )
    
    console.log(`📊 Active subscriptions to cancel: ${activeSubscriptions.length}`)
    
    if (activeSubscriptions.length === 0) {
      console.log(`✅ No active subscriptions to cancel`)
      return true
    }
    
    console.log(`🔄 Canceling ${activeSubscriptions.length} active subscription(s)...`)
    
    for (const subscription of activeSubscriptions) {
      console.log(`   🗑️ Canceling subscription ${subscription.id} (status: ${subscription.status}, currency: ${subscription.currency})`)
      await stripe.subscriptions.cancel(subscription.id, {
        prorate: false
      })
      console.log(`   ✅ Successfully canceled ${subscription.id}`)
    }
    
    console.log(`✅ All active subscriptions canceled successfully`)
    return true
  } catch (error: any) {
    console.error(`💥 Error canceling subscriptions for customer ${customerId}:`, error)
    console.error(`   Error details:`, error.message)
    return false
  }
}

export async function clearBillingObjects(customerId: string): Promise<boolean> {
  try {
    console.log(`🧹 Clearing billing objects for customer: ${customerId}`)
    
    // Void open invoices
    console.log(`📄 Fetching open invoices...`)
    const invoices = await stripe.invoices.list({
      customer: customerId,
      status: 'open'
    })
    
    console.log(`📊 Found ${invoices.data.length} open invoices`)
    
    for (const invoice of invoices.data) {
      try {
        console.log(`   🗑️ Voiding invoice ${invoice.id}`)
        await stripe.invoices.voidInvoice(invoice.id)
        console.log(`   ✅ Voided invoice ${invoice.id}`)
      } catch (error: any) {
        console.log(`   ⚠️ Could not void invoice ${invoice.id}: ${error.message}`)
      }
    }
    
    // Delete pending invoice items
    console.log(`📝 Fetching pending invoice items...`)
    const invoiceItems = await stripe.invoiceItems.list({
      customer: customerId,
      pending: true as any
    })
    
    console.log(`📊 Found ${invoiceItems.data.length} pending invoice items`)
    
    for (const item of invoiceItems.data) {
      try {
        console.log(`   🗑️ Deleting invoice item ${item.id}`)
        await stripe.invoiceItems.del(item.id)
        console.log(`   ✅ Deleted invoice item ${item.id}`)
      } catch (error: any) {
        console.log(`   ⚠️ Could not delete invoice item ${item.id}: ${error.message}`)
      }
    }
    
    console.log(`✅ Billing objects cleared successfully`)
    return true
  } catch (error: any) {
    console.error(`💥 Error clearing billing objects for customer ${customerId}:`, error)
    console.error(`   Error details:`, error.message)
    return false
  }
}

export async function createCADSubscriptionWithCoupon(customerId: string): Promise<Stripe.Subscription | null> {
  try {
    console.log(`💳 Creating CAD subscription for customer: ${customerId}`)
    
    const startTimestamp = getSubscriptionStartTimestamp()
    const nextJune15 = new Date('2026-06-15T00:00:00Z')
    const nextJune15Timestamp = Math.floor(nextJune15.getTime() / 1000)
    
    console.log(`📅 Billing cycle anchor: ${nextJune15Timestamp} (June 15, 2026)`)
    console.log(`🎫 Using coupon: ${COUPON_ID}`)
    console.log(`💰 Currency: CAD`)
    console.log(`📦 Price ID: ${PRICE_ID}`)
    
    const subscriptionParams = {
      customer: customerId,
      items: [{
        price: PRICE_ID,
        quantity: 1
      }],
      currency: 'cad',
      discounts: [{
        coupon: COUPON_ID
      }],
      backdate_start_date: startTimestamp,
      billing_cycle_anchor: nextJune15Timestamp,
      proration_behavior: 'none' as const,
      collection_method: 'charge_automatically' as const,
      automatic_tax: {
        enabled: false
      }
    }
    
    console.log(`🔄 Creating subscription with params:`, JSON.stringify(subscriptionParams, null, 2))
    
    const subscription = await stripe.subscriptions.create(subscriptionParams)
    
    console.log(`✅ Subscription created successfully:`)
    console.log(`   - ID: ${subscription.id}`)
    console.log(`   - Status: ${subscription.status}`)
    console.log(`   - Currency: ${subscription.currency}`)
    console.log(`   - Current period start: ${new Date(subscription.current_period_start * 1000).toISOString()}`)
    console.log(`   - Current period end: ${new Date(subscription.current_period_end * 1000).toISOString()}`)
    console.log(`   - Items count: ${subscription.items.data.length}`)
    
    return subscription
  } catch (error: any) {
    console.error(`💥 Failed to create CAD subscription for customer ${customerId}:`, error)
    console.error(`   Error type: ${error.constructor.name}`)
    console.error(`   Error message: ${error.message}`)
    if (error.code) console.error(`   Error code: ${error.code}`)
    if (error.type) console.error(`   Stripe error type: ${error.type}`)
    if (error.param) console.error(`   Error param: ${error.param}`)
    return null
  }
}

export async function getCustomerCurrency(customerId: string): Promise<string | null> {
  try {
    console.log(`💱 Getting currency for customer: ${customerId}`)
    const customer = await stripe.customers.retrieve(customerId)
    const currency = (customer as Stripe.Customer).currency || null
    console.log(`💱 Customer currency: ${currency || 'none'}`)
    return currency
  } catch (error: any) {
    console.error(`💥 Error getting customer currency for ${customerId}:`, error)
    return null
  }
}