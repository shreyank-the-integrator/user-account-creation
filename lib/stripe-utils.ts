import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// Configuration types and functions
export interface PriceOption {
  id: string
  nickname: string | null
  currency: string
  unit_amount: number | null
  recurring: {
    interval: string
    interval_count: number
  } | null
  product: {
    id: string
    name: string
  }
}

export interface CouponOption {
  id: string
  name: string | null
  percent_off: number | null
  amount_off: number | null
  currency: string | null
  duration: string
  duration_in_months: number | null
  max_redemptions: number | null
  times_redeemed: number
  valid: boolean
}

export interface ConfigOptions {
  prices: PriceOption[]
  coupons: CouponOption[]
  currencies: string[]
}

export async function getConfigOptions(): Promise<ConfigOptions> {
  try {
    console.log(`📋 Fetching Stripe configuration options...`)
    
    // Fetch prices
    console.log(`💰 Fetching prices...`)
    const pricesResponse = await stripe.prices.list({
      limit: 100,
      active: true,
      expand: ['data.product']
    })
    
    const prices: PriceOption[] = pricesResponse.data.map(price => ({
      id: price.id,
      nickname: price.nickname,
      currency: price.currency,
      unit_amount: price.unit_amount,
      recurring: price.recurring ? {
        interval: price.recurring.interval,
        interval_count: price.recurring.interval_count
      } : null,
      product: {
        id: (price.product as Stripe.Product).id,
        name: (price.product as Stripe.Product).name
      }
    }))
    
    console.log(`💰 Found ${prices.length} active prices`)
    
    // Fetch coupons
    console.log(`🎫 Fetching coupons...`)
    const couponsResponse = await stripe.coupons.list({
      limit: 100
    })
    
    const coupons: CouponOption[] = couponsResponse.data.map(coupon => ({
      id: coupon.id,
      name: coupon.name,
      percent_off: coupon.percent_off,
      amount_off: coupon.amount_off,
      currency: coupon.currency,
      duration: coupon.duration,
      duration_in_months: coupon.duration_in_months,
      max_redemptions: coupon.max_redemptions,
      times_redeemed: coupon.times_redeemed,
      valid: coupon.valid
    }))
    
    console.log(`🎫 Found ${coupons.length} coupons`)
    
    // Get unique currencies from prices
    const currencies = [...new Set(prices.map(p => p.currency))]
    console.log(`💱 Available currencies from prices: ${currencies.join(', ')}`)
    
    // Log each price and its currency for debugging
    prices.forEach(price => {
      console.log(`   Price ${price.id}: ${price.currency.toUpperCase()} - ${price.product.name}`)
    })
    
    return {
      prices,
      coupons: coupons.filter(c => c.valid), // Only return valid coupons
      currencies
    }
  } catch (error: any) {
    console.error(`💥 Error fetching config options:`, error)
    throw error
  }
}

// Configuration variables
let PRICE_ID = process.env.STRIPE_PRICE_ID!
let COUPON_ID = process.env.STRIPE_COUPON_ID!
let SUBSCRIPTION_START_DATE = '2025-06-15'
let SUBSCRIPTION_CURRENCY = 'cad'

export function updateConfig(priceId: string, couponId: string, startDate: string, currency: string) {
  PRICE_ID = priceId
  COUPON_ID = couponId
  SUBSCRIPTION_START_DATE = startDate
  SUBSCRIPTION_CURRENCY = currency
  console.log(`⚙️ Config updated: Price=${priceId}, Coupon=${couponId}, Date=${startDate}, Currency=${currency}`)
}

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
    console.log(`💳 Creating subscription for customer: ${customerId}`)
    
    const startTimestamp = getSubscriptionStartTimestamp()
    const nextYear = new Date(SUBSCRIPTION_START_DATE)
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    const nextYearTimestamp = Math.floor(nextYear.getTime() / 1000)
    
    console.log(`📅 Billing cycle anchor: ${nextYearTimestamp} (${nextYear.toISOString().split('T')[0]})`)
    console.log(`🎫 Using coupon: ${COUPON_ID}`)
    console.log(`💰 Currency: ${SUBSCRIPTION_CURRENCY.toUpperCase()}`)
    console.log(`📦 Price ID: ${PRICE_ID}`)
    
    const subscriptionParams = {
      customer: customerId,
      items: [{
        price: PRICE_ID,
        quantity: 1
      }],
      currency: SUBSCRIPTION_CURRENCY,
      discounts: [{
        coupon: COUPON_ID
      }],
      backdate_start_date: startTimestamp,
      billing_cycle_anchor: nextYearTimestamp,
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
    console.error(`💥 Failed to create subscription for customer ${customerId}:`, error)
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