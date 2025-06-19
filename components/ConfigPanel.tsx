'use client'

import React, { useState, useEffect } from 'react'
import { Settings, Calendar, DollarSign, Tag, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PriceOption {
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

interface CouponOption {
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

interface ConfigOptions {
  prices: PriceOption[]
  coupons: CouponOption[]
  currencies: string[]
}

interface ConfigPanelProps {
  onConfigChange: (config: {
    priceId: string
    couponId: string
    startDate: string
    currency: string
  }) => void
  disabled?: boolean
}

export function ConfigPanel({ onConfigChange, disabled }: ConfigPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<ConfigOptions | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Default values
  const [priceId, setPriceId] = useState('price_1R77HdDkAuZUHoK7l6ivkW2l')
  const [couponId, setCouponId] = useState('8OrZ17Rm')
  const [startDate, setStartDate] = useState('2025-06-15')
  const [currency, setCurrency] = useState('cad')

  const fetchOptions = async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log(`🔧 Fetching configuration options...`)
      const response = await fetch('/api/config')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch options: ${response.status}`)
      }
      
      const data = await response.json()
      console.log(`✅ Configuration options loaded:`, data)
      setOptions(data)
    } catch (err: any) {
      console.error(`💥 Error fetching config:`, err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isExpanded && !options) {
      fetchOptions()
    }
  }, [isExpanded, options])

  useEffect(() => {
    // Notify parent of current config
    onConfigChange({ priceId, couponId, startDate, currency })
  }, [priceId, couponId, startDate, currency, onConfigChange])

  const formatPrice = (price: PriceOption) => {
    const amount = price.unit_amount ? (price.unit_amount / 100).toFixed(2) : 'Free'
    const interval = price.recurring ? `/${price.recurring.interval}` : ''
    const nickname = price.nickname ? ` (${price.nickname})` : ''
    return `${price.product.name}${nickname} - ${amount} ${price.currency.toUpperCase()}${interval}`
  }

  const formatCoupon = (coupon: CouponOption) => {
    let discount = ''
    if (coupon.percent_off) {
      discount = `${coupon.percent_off}% off`
    } else if (coupon.amount_off) {
      discount = `${(coupon.amount_off / 100).toFixed(2)} ${coupon.currency?.toUpperCase()} off`
    }
    
    const name = coupon.name ? ` (${coupon.name})` : ''
    const usage = coupon.max_redemptions ? ` - ${coupon.times_redeemed}/${coupon.max_redemptions} used` : ''
    
    return `${coupon.id}${name} - ${discount} ${coupon.duration}${usage}`
  }

  const selectedPrice = options?.prices.find(p => p.id === priceId)
  
  // Show all available currencies, not just the selected price currency
  const availableCurrencies = options?.currencies || ['cad', 'usd', 'eur', 'gbp']

  // Add common currencies if they're not in the list
  const allCurrencies = [...new Set([
    ...availableCurrencies,
    'usd', 'cad', 'eur', 'gbp', 'aud', 'jpy', 'chf', 'sek', 'nok', 'dkk'
  ])].sort()

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>Stripe Configuration</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={disabled}
          >
            {isExpanded ? 'Hide' : 'Configure'}
          </Button>
        </div>
        <CardDescription>
          {isExpanded 
            ? 'Customize subscription settings' 
            : `Price: ${priceId} | Coupon: ${couponId} | Date: ${startDate} | Currency: ${currency.toUpperCase()}`
          }
        </CardDescription>
      </CardHeader>
      
      {isExpanded && (
        <CardContent>
          {loading && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Loading configuration options...</p>
            </div>
          )}
          
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg mb-4">
              <p className="text-sm text-destructive">Error: {error}</p>
              <Button variant="outline" size="sm" onClick={fetchOptions} className="mt-2">
                Retry
              </Button>
            </div>
          )}
          
          {options && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Price Selection */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4" />
                  Price
                </label>
                <select
                  value={priceId}
                  onChange={(e) => setPriceId(e.target.value)}
                  className="w-full p-2 border border-input bg-background rounded-md text-sm"
                  disabled={disabled}
                >
                  {options.prices.map(price => (
                    <option key={price.id} value={price.id}>
                      {formatPrice(price)}
                    </option>
                  ))}
                </select>
                {selectedPrice && (
                  <p className="text-xs text-muted-foreground">
                    Price currency: {selectedPrice.currency.toUpperCase()}
                  </p>
                )}
              </div>

              {/* Coupon Selection */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4" />
                  Coupon
                </label>
                <select
                  value={couponId}
                  onChange={(e) => setCouponId(e.target.value)}
                  className="w-full p-2 border border-input bg-background rounded-md text-sm"
                  disabled={disabled}
                >
                  {options.coupons.map(coupon => (
                    <option key={coupon.id} value={coupon.id}>
                      {formatCoupon(coupon)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-2 border border-input bg-background rounded-md text-sm"
                  disabled={disabled}
                />
              </div>

              {/* Currency Selection */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4" />
                  Subscription Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full p-2 border border-input bg-background rounded-md text-sm"
                  disabled={disabled}
                >
                  {allCurrencies.map(curr => (
                    <option key={curr} value={curr}>
                      {curr.toUpperCase()}
                    </option>
                  ))}
                </select>
                <div className="text-xs space-y-1">
                  <p className="text-muted-foreground">
                    Available from your prices: {availableCurrencies.map(c => c.toUpperCase()).join(', ')}
                  </p>
                  {selectedPrice && selectedPrice.currency !== currency && (
                    <p className="text-yellow-600">
                      ⚠️ Warning: Subscription currency ({currency.toUpperCase()}) differs from selected price currency ({selectedPrice.currency.toUpperCase()})
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}