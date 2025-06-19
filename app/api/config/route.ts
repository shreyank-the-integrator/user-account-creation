import { NextResponse } from 'next/server'
import { getConfigOptions } from '@/lib/stripe-utils'

export async function GET() {
  try {
    console.log(`🔧 Config API: Fetching configuration options...`)
    
    const options = await getConfigOptions()
    
    console.log(`✅ Config API: Successfully fetched options`)
    console.log(`   - Prices: ${options.prices.length}`)
    console.log(`   - Coupons: ${options.coupons.length}`)
    console.log(`   - Currencies: ${options.currencies.length}`)
    
    return NextResponse.json(options)
  } catch (error: any) {
    console.error(`💥 Config API Error:`, error)
    return NextResponse.json(
      { error: 'Failed to fetch configuration options' },
      { status: 500 }
    )
  }
}