import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// Rate limit handling utility
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      // Check if it's a rate limit error
      if (error.type === 'StripeRateLimitError' && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff
        console.log(`⏳ Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // Re-throw if not rate limit error or max retries reached
      throw error
    }
  }
  
  throw new Error('Max retries reached')
}

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
    
    // Fetch prices with rate limit handling
    const pricesResponse = await withRetry(() => 
      stripe.prices.list({
        limit: 100,
        active: true,
        expand: ['data.product']
      })
    )
    
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
    
    // Fetch coupons with rate limit handling
    const couponsResponse = await withRetry(() => 
      stripe.coupons.list({ limit: 100 })
    )
    
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
    
    const currencies = [...new Set(prices.map(p => p.currency))]
    
    return {
      prices,
      coupons: coupons.filter(c => c.valid),
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
  return timestamp
}

export async function findCustomerByEmail(email: string): Promise<Stripe.Customer | null> {
  try {
    const customers = await withRetry(() => 
      stripe.customers.search({
        query: `email:'${email}'`,
        limit: 1
      })
    )
    
    if (customers.data.length > 0) {
      const customer = customers.data[0]
      console.log(`✅ Found customer: ${customer.id}`)
      return customer
    } else {
      console.log(`❌ No customer found with email: ${email}`)
      return null
    }
  } catch (error: any) {
    console.error(`💥 Error searching for customer ${email}:`, error.message)
    return null
  }
}

export async function cancelActiveSubscriptions(customerId: string): Promise<boolean> {
  try {
    const subscriptions = await withRetry(() => 
      stripe.subscriptions.list({
        customer: customerId,
        status: 'active', // Only get active ones
        limit: 10 // Limit to reduce response size
      })
    )
    
    if (subscriptions.data.length === 0) {
      return true
    }
    
    // Cancel all active subscriptions in parallel (they're different objects)
    const cancelPromises = subscriptions.data.map(subscription => 
      withRetry(() => 
        stripe.subscriptions.cancel(subscription.id, { prorate: false })
      ).then(() => {
        console.log(`✅ Canceled subscription: ${subscription.id}`)
        return true
      }).catch((error) => {
        console.log(`⚠️ Failed to cancel ${subscription.id}: ${error.message}`)
        return false
      })
    )
    
    const results = await Promise.all(cancelPromises)
    return results.every(r => r) // Return true only if all succeeded
  } catch (error: any) {
    console.error(`💥 Error canceling subscriptions for ${customerId}:`, error.message)
    return false
  }
}

export async function clearBillingObjects(customerId: string): Promise<boolean> {
  try {
    // Run invoice and invoice item cleanup in parallel (different endpoints)
    const [invoiceCleanup, invoiceItemCleanup] = await Promise.all([
      // Void open invoices
      withRetry(() => 
        stripe.invoices.list({
          customer: customerId,
          status: 'open',
          limit: 10
        })
      ).then(async (invoices) => {
        if (invoices.data.length === 0) return true
        
        const voidPromises = invoices.data.map(invoice =>
          withRetry(() => stripe.invoices.voidInvoice(invoice.id)).catch((error) => {
            console.log(`⚠️ Could not void invoice ${invoice.id}: ${error.message}`)
            return false
          })
        )
        
        await Promise.all(voidPromises)
        return true
      }),
      
      // Delete pending invoice items
      withRetry(() => 
        stripe.invoiceItems.list({
          customer: customerId,
          pending: true as any,
          limit: 10
        })
      ).then(async (invoiceItems) => {
        if (invoiceItems.data.length === 0) return true
        
        const deletePromises = invoiceItems.data.map(item =>
          withRetry(() => stripe.invoiceItems.del(item.id)).catch((error) => {
            console.log(`⚠️ Could not delete invoice item ${item.id}: ${error.message}`)
            return false
          })
        )
        
        await Promise.all(deletePromises)
        return true
      })
    ])
    
    return invoiceCleanup && invoiceItemCleanup
  } catch (error: any) {
    console.error(`💥 Error clearing billing objects for ${customerId}:`, error.message)
    return false
  }
}

export async function createCADSubscriptionWithCoupon(customerId: string): Promise<Stripe.Subscription | null> {
  try {
    const startTimestamp = getSubscriptionStartTimestamp()
    const nextYear = new Date(SUBSCRIPTION_START_DATE)
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    const nextYearTimestamp = Math.floor(nextYear.getTime() / 1000)
    
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
    
    const subscription = await withRetry(() => 
      stripe.subscriptions.create(subscriptionParams)
    )
    
    console.log(`✅ Created subscription: ${subscription.id}`)
    return subscription
  } catch (error: any) {
    console.error(`💥 Failed to create subscription for ${customerId}:`, error.message)
    return null
  }
}

export async function getCustomerCurrency(customerId: string): Promise<string | null> {
  try {
    const customer = await withRetry(() => stripe.customers.retrieve(customerId))
    const currency = (customer as Stripe.Customer).currency || null
    return currency
  } catch (error: any) {
    console.error(`💥 Error getting customer currency for ${customerId}:`, error.message)
    return null
  }
}