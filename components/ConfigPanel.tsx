'use client'

import React, { useState, useEffect } from 'react'
import { Settings, Calendar, DollarSign, Tag, Globe, MapPin, Users, Building, Shield, CreditCard, UserPlus } from 'lucide-react'
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

interface TeamConfig {
  isStripeManaged: boolean
  chargeFutureMembers: boolean
  allowToAddTeamMembers: boolean
  subscribedPlan: 'FREE' | 'PRO' | 'PRO_PLUS' | 'ENTERPRISE'
}

interface ConfigPanelProps {
  onConfigChange: (config: {
    priceId: string
    couponId: string
    startDate: string
    currency: string
    region: string
    processingMode: 'stripe_only' | 'teams_only' | 'both'
    teamConfig: TeamConfig
  }) => void
  disabled?: boolean
}

const REGIONS = [
  { code: 'ca', name: 'Canada', url: 'https://ca.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/' },
  { code: 'us', name: 'United States', url: 'https://us.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/' },
  { code: 'au', name: 'Australia', url: 'https://au.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/' },
  { code: 'eu', name: 'Europe', url: 'https://eu.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/' },
  { code: 'uk', name: 'United Kingdom', url: 'https://uk.api.heidihealth.com/api/v2/ml-scribe/internal-admin/teams/' }
]

const SUBSCRIPTION_PLANS = [
  { value: 'FREE', label: 'Free' },
  { value: 'PRO', label: 'Pro' },
  { value: 'PRO_PLUS', label: 'Pro Plus' },
  { value: 'ENTERPRISE', label: 'Enterprise' }
] as const

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
  const [region, setRegion] = useState('ca') // Default to Canada
  const [processingMode, setProcessingMode] = useState<'stripe_only' | 'teams_only' | 'both'>('both')
  
  // Team configuration
  const [teamConfig, setTeamConfig] = useState<TeamConfig>({
    isStripeManaged: true,
    chargeFutureMembers: true,
    allowToAddTeamMembers: true,
    subscribedPlan: 'PRO'
  })

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
    if (isExpanded && !options && processingMode !== 'teams_only') {
      fetchOptions()
    }
  }, [isExpanded, options, processingMode])

  useEffect(() => {
    // Notify parent of current config
    onConfigChange({ 
      priceId, 
      couponId, 
      startDate, 
      currency, 
      region, 
      processingMode,
      teamConfig
    })
  }, [priceId, couponId, startDate, currency, region, processingMode, teamConfig, onConfigChange])

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
  const selectedRegion = REGIONS.find(r => r.code === region)
  
  // Show all available currencies, not just the selected price currency
  const availableCurrencies = options?.currencies || ['cad', 'usd', 'eur', 'gbp']

  // Add common currencies if they're not in the list
  const allCurrencies = [...new Set([
    ...availableCurrencies,
    'usd', 'cad', 'eur', 'gbp', 'aud', 'jpy', 'chf', 'sek', 'nok', 'dkk'
  ])].sort()

  const getProcessingModeLabel = () => {
    switch (processingMode) {
      case 'stripe_only':
        return `Stripe Only | Region: ${selectedRegion?.name} | Price: ${priceId} | Currency: ${currency.toUpperCase()}`
      case 'teams_only':
        return `Teams Only | Region: ${selectedRegion?.name} | Plan: ${teamConfig.subscribedPlan}`
      case 'both':
        return `Stripe + Teams | Region: ${selectedRegion?.name} | Price: ${priceId} | Currency: ${currency.toUpperCase()}`
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>Configuration</CardTitle>
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
            ? 'Customize processing settings' 
            : getProcessingModeLabel()
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
          
          <div className="space-y-6">
            {/* Processing Mode Selection */}
            <div className="space-y-4 p-4 border rounded-lg">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4" />
                Processing Mode
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/50">
                  <input
                    type="radio"
                    name="processingMode"
                    checked={processingMode === 'stripe_only'}
                    onChange={() => setProcessingMode('stripe_only')}
                    disabled={disabled}
                    className="text-primary"
                  />
                  <div>
                    <div className="font-medium">Stripe Only</div>
                    <div className="text-xs text-muted-foreground">Create subscriptions only</div>
                  </div>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/50">
                  <input
                    type="radio"
                    name="processingMode"
                    checked={processingMode === 'teams_only'}
                    onChange={() => setProcessingMode('teams_only')}
                    disabled={disabled}
                    className="text-primary"
                  />
                  <div>
                    <div className="font-medium">Teams Only</div>
                    <div className="text-xs text-muted-foreground">Create teams only</div>
                  </div>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/50">
                  <input
                    type="radio"
                    name="processingMode"
                    checked={processingMode === 'both'}
                    onChange={() => setProcessingMode('both')}
                    disabled={disabled}
                    className="text-primary"
                  />
                  <div>
                    <div className="font-medium">Stripe + Teams</div>
                    <div className="text-xs text-muted-foreground">Full processing</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Region Selection - show if teams involved */}
            {(processingMode === 'teams_only' || processingMode === 'both') && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4" />
                  Team API Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full p-2 border border-input bg-background rounded-md text-sm"
                  disabled={disabled}
                >
                  {REGIONS.map(regionOption => (
                    <option key={regionOption.code} value={regionOption.code}>
                      {regionOption.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  API: {selectedRegion?.url}
                </p>
              </div>
            )}

            {/* Team Configuration - show if teams involved */}
            {(processingMode === 'teams_only' || processingMode === 'both') && (
              <div className="space-y-4 p-4 border rounded-lg">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Building className="h-4 w-4" />
                  Team Configuration
                </label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Subscription Plan */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subscription Plan</label>
                    <select
                      value={teamConfig.subscribedPlan}
                      onChange={(e) => setTeamConfig({
                        ...teamConfig,
                        subscribedPlan: e.target.value as TeamConfig['subscribedPlan']
                      })}
                      className="w-full p-2 border border-input bg-background rounded-md text-sm"
                      disabled={disabled}
                    >
                      {SUBSCRIPTION_PLANS.map(plan => (
                        <option key={plan.value} value={plan.value}>
                          {plan.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Stripe Managed */}
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={teamConfig.isStripeManaged}
                      onChange={(e) => setTeamConfig({
                        ...teamConfig,
                        isStripeManaged: e.target.checked
                      })}
                      disabled={disabled}
                      className="text-primary"
                    />
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span className="text-sm font-medium">Deal managed in Stripe (not invoice)</span>
                    </div>
                  </label>

                  {/* Charge Future Members */}
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={teamConfig.chargeFutureMembers}
                      onChange={(e) => setTeamConfig({
                        ...teamConfig,
                        chargeFutureMembers: e.target.checked
                      })}
                      disabled={disabled}
                      className="text-primary"
                    />
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-sm font-medium">Auto-charge new invitees</span>
                    </div>
                  </label>

                  {/* Allow Add Team Members */}
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={teamConfig.allowToAddTeamMembers}
                      onChange={(e) => setTeamConfig({
                        ...teamConfig,
                        allowToAddTeamMembers: e.target.checked
                      })}
                      disabled={disabled}
                      className="text-primary"
                    />
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      <span className="text-sm font-medium">Allow admins to add team members</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Stripe Configuration - show if stripe involved */}
            {(processingMode === 'stripe_only' || processingMode === 'both') && (
              <div className="space-y-4 p-4 border rounded-lg">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4" />
                  Stripe Configuration
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        Available: {availableCurrencies.map(c => c.toUpperCase()).join(', ')}
                      </p>
                      {selectedPrice && selectedPrice.currency !== currency && (
                        <p className="text-yellow-600">
                          ⚠️ Warning: Subscription currency ({currency.toUpperCase()}) differs from selected price currency ({selectedPrice.currency.toUpperCase()})
                        </p>
                      )}
                    </div>
                  </div>
                </div>

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
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}