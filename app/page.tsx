'use client'

import React, { useState } from 'react'
import { CSVUploader } from '@/components/CSVUploader'
import { ConfigPanel } from '@/components/ConfigPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Play, Download, CheckCircle, XCircle, AlertTriangle, Users, Building, Terminal } from 'lucide-react'
import { downloadCSV } from '@/lib/utils'

interface CustomerData {
  'Kinde ID': string
  'Email': string
  'Team name': string
}

interface ProcessResult {
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

export default function Home() {
  const [csvData, setCsvData] = useState<CustomerData[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ProcessResult[]>([])
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [config, setConfig] = useState({
    priceId: 'price_1R77HdDkAuZUHoK7l6ivkW2l',
    couponId: '8OrZ17Rm',
    startDate: '2025-06-15',
    currency: 'cad',
    region: 'ca', // Default to Canada
    includeTeamCreation: true // Default to both
  })

  const handleDataLoaded = (data: CustomerData[]) => {
    console.log(`📊 CSV data loaded: ${data.length} customers`)
    setCsvData(data)
    setResults([])
    setProgress(0)
    setProcessingError(null)
  }

  const handleStartProcessing = async () => {
    if (csvData.length === 0) return

    console.log(`🚀 Starting processing of ${csvData.length} customers`)
    console.log(`📋 Raw CSV data:`, csvData)
    console.log(`⚙️ Using config:`, config)
    
    // Transform the data to match the API interface
    const transformedData = csvData.map(row => ({
      kindeId: row['Kinde ID'],
      email: row['Email'],
      teamName: row['Team name']
    }))
    
    console.log(`🔄 Transformed data:`, transformedData)
    
    setIsProcessing(true)
    setProgress(0)
    setResults([])
    setProcessingError(null)

    try {
      console.log(`📡 Sending request to /api/process`)
      
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          customers: transformedData,
          config: config // Send full config including region
        }),
      })

      console.log(`📡 Response status: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ API Error: ${response.status} - ${errorText}`)
        throw new Error(`Processing failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log(`✅ Processing completed successfully`)
      console.log(`📊 Results received: ${data.results?.length || 0} items`)
      
      setResults(data.results)
      setProgress(100)
      
      // Auto-download report
      console.log(`📥 Auto-downloading report...`)
      setTimeout(() => {
        handleDownloadReport(data.results)
      }, 1000)
      
    } catch (error: any) {
      console.error(`💥 Processing error:`, error)
      setProcessingError(error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDownloadReport = (resultsToDownload?: ProcessResult[]) => {
    const dataToDownload = resultsToDownload || results
    
    if (dataToDownload.length === 0) {
      console.log(`⚠️ No results to download`)
      return
    }

    console.log(`📥 Downloading report with ${dataToDownload.length} results`)

    const reportData = dataToDownload.map(r => ({
      'Kinde ID': r.kindeId,
      'Team Name': r.teamName,
      'Email': r.email,
      'Status': r.status,
      'Customer ID': r.customerId || '',
      'Subscription ID': r.subscriptionId || '',
      'Team ID': r.teamId || '',
      'Old Currency': r.oldCurrency || '',
      'New Currency': r.newCurrency || '',
      'Subscription Currency': r.subscriptionCurrency || '',
      'Start Date': r.startDate || '',
      'Coupon': r.coupon || '',
      'Error': r.error || '',
      'Team Error': r.teamError || '',
      'Team Status': r.teamStatus || '',
      'Team Response Data': r.teamResponseData ? JSON.stringify(r.teamResponseData) : ''
    }))

    const date = new Date().toISOString().split('T')[0]
    const time = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-')
    downloadCSV(reportData, `subscription_team_creation_${config.region}_${date}_${time}.csv`)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'team_creation_failed':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      default:
        return <XCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'success':
        return 'Success'
      case 'customer_not_found':
        return 'Customer Not Found'
      case 'cancel_failed':
        return 'Cancel Failed'
      case 'subscription_failed':
        return 'Subscription Failed'
      case 'team_creation_failed':
        return 'Team Creation Failed'
      default:
        return 'Unknown'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600'
      case 'team_creation_failed':
        return 'text-yellow-600'
      default:
        return 'text-red-600'
    }
  }

  const successCount = results.filter(r => r.status === 'success').length
  const partialSuccessCount = results.filter(r => r.status === 'team_creation_failed').length
  const failedCount = results.filter(r => r.status !== 'success' && r.status !== 'team_creation_failed').length

  // Get region display name
  const regionNames = {
    ca: 'Canada',
    us: 'United States', 
    au: 'Australia',
    eu: 'Europe',
    uk: 'United Kingdom'
  }
  const currentRegionName = regionNames[config.region as keyof typeof regionNames] || config.region

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">User Account Creation</h1>
          <p className="text-muted-foreground text-lg">
            Create stripe customer accounts and teams for your users in bulk
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              <span>Check browser console for detailed logs</span>
            </div>
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              <span>Region: {currentRegionName}</span>
            </div>
          </div>
        </div>

        {/* Configuration Panel */}
        <ConfigPanel 
          onConfigChange={setConfig}
          disabled={isProcessing}
        />

        {/* File Upload */}
        <div className="mb-8">
          <CSVUploader 
            onDataLoaded={handleDataLoaded} 
            disabled={isProcessing}
          />
        </div>

        {/* Data Summary */}
        {csvData.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Data Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">{csvData.length} customers loaded</p>
                  <p className="text-sm text-muted-foreground">
                    Ready to process {config.includeTeamCreation ? 'subscriptions and create teams' : 'subscriptions only'} in {currentRegionName}
                  </p>
                </div>
                <Button
                  onClick={handleStartProcessing}
                  disabled={isProcessing || csvData.length === 0}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {isProcessing ? 'Processing...' : 'Start Processing'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processing Error */}
        {processingError && (
          <Card className="mb-8 border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                Processing Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-destructive">{processingError}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Check the browser console for detailed error logs.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {isProcessing && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Processing Progress</CardTitle>
              <CardDescription>
                Processing customers in batches of 8 for {config.includeTeamCreation ? 'Stripe + Teams' : 'Stripe only'} in {currentRegionName}... Check console for detailed progress.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  {progress === 0 ? 'Starting...' : progress === 100 ? 'Complete!' : 'Processing...'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Summary */}
        {results.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Processing Results ({config.includeTeamCreation ? `Stripe + Teams - ${currentRegionName}` : 'Stripe Only'})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="text-center p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="text-2xl font-bold text-green-600">{successCount}</div>
                  <div className="text-sm text-green-600">{config.includeTeamCreation ? 'Fully Successful' : 'Subscriptions Created'}</div>
                </div>
                {config.includeTeamCreation && (
                  <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <div className="text-2xl font-bold text-yellow-600">{partialSuccessCount}</div>
                    <div className="text-sm text-yellow-600">Stripe Created, Team Failed</div>
                  </div>
                )}
                <div className="text-center p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="text-2xl font-bold text-red-600">{failedCount}</div>
                  <div className="text-sm text-red-600">Failed</div>
                </div>
              </div>
              
              <div className="flex justify-center">
                <Button onClick={() => handleDownloadReport()} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Report
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed Results */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Detailed Results</CardTitle>
              <CardDescription>
                Individual processing results for each customer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {getStatusIcon(result.status)}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{result.teamName}</p>
                        <p className="text-sm text-muted-foreground truncate">{result.email}</p>
                        {result.customerId && (
                          <p className="text-xs text-muted-foreground">Customer: {result.customerId}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:items-end mt-2 sm:mt-0">
                      <span className={`text-sm font-medium ${getStatusColor(result.status)}`}>
                        {getStatusLabel(result.status)}
                      </span>
                      {result.subscriptionId && (
                        <span className="text-xs text-muted-foreground mt-1">
                          Sub: {result.subscriptionId}
                        </span>
                      )}
                      {result.teamId && (
                        <span className="text-xs text-muted-foreground">
                          Team: {result.teamId}
                        </span>
                      )}
                      {result.error && (
                        <span className="text-xs text-red-600 mt-1 max-w-xs truncate" title={result.error}>
                          {result.error}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}