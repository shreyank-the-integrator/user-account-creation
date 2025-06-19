'use client'

import React, { useState, useCallback } from 'react'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Papa from 'papaparse'

interface CSVUploaderProps {
  onDataLoaded: (data: any[]) => void
  disabled?: boolean
}

export function CSVUploader({ onDataLoaded, disabled }: CSVUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const validateCSVData = (rawData: any[], headers: string[]): any[] => {
    console.log(`📊 Validating CSV data with ${rawData.length} rows`)
    console.log(`📋 Available headers:`, headers)
    
    if (rawData.length === 0) {
      console.log(`❌ CSV validation failed: No data rows found`)
      setError('CSV file contains no data rows. Please check your file format.')
      return []
    }

    // More flexible header matching
    const findColumn = (possibleNames: string[]) => {
      for (const name of possibleNames) {
        const found = headers.find(h => 
          h.toLowerCase().trim() === name.toLowerCase().trim()
        )
        if (found) return found
      }
      return null
    }

    const kindeIdColumn = findColumn(['Kinde ID', 'kinde_id', 'kinde id', 'kindeid', 'id'])
    const emailColumn = findColumn(['Email', 'email', 'email_address', 'emailaddress'])
    const teamNameColumn = findColumn(['Team name', 'team_name', 'team name', 'teamname', 'name'])

    console.log(`🔍 Column mapping:`)
    console.log(`   - Kinde ID: "${kindeIdColumn}"`)
    console.log(`   - Email: "${emailColumn}"`)
    console.log(`   - Team Name: "${teamNameColumn}"`)

    const missingColumns = []
    if (!kindeIdColumn) missingColumns.push('Kinde ID')
    if (!emailColumn) missingColumns.push('Email')
    if (!teamNameColumn) missingColumns.push('Team name')
    
    if (missingColumns.length > 0) {
      console.log(`❌ CSV validation failed: Missing required columns:`, missingColumns)
      setError(`CSV format is incorrect. Could not find columns for: ${missingColumns.join(', ')}. 

Expected column names (case-insensitive):
- Kinde ID (or: kinde_id, kindeid, id)
- Email (or: email_address, emailaddress)  
- Team name (or: team_name, teamname, name)

Your CSV has columns: ${headers.join(', ')}

Example format:
Kinde ID,Email,Team name
kp_123abc,user@example.com,Team Alpha
kp_456def,user2@example.com,Team Beta`)
      return []
    }

    // Map the data using the found column names
    const mappedData = rawData.map((row, index) => {
      const mapped = {
        'Kinde ID': row[kindeIdColumn!]?.toString().trim() || '',
        'Email': row[emailColumn!]?.toString().trim() || '',
        'Team name': row[teamNameColumn!]?.toString().trim() || ''
      }
      
      console.log(`📝 Row ${index + 1}:`, mapped)
      return mapped
    })

    const validRows = mappedData.filter(row => 
      row['Kinde ID'] && 
      row['Email'] && 
      row['Team name']
    )

    console.log(`📊 Valid rows: ${validRows.length} out of ${rawData.length}`)
    console.log(`✅ Sample valid row:`, validRows[0])

    if (validRows.length === 0) {
      console.log(`❌ CSV validation failed: No valid rows with all required fields filled`)
      
      // Show which rows have missing data
      const emptyRows = mappedData.map((row, index) => ({
        row: index + 1,
        missing: [
          !row['Kinde ID'] ? 'Kinde ID' : null,
          !row['Email'] ? 'Email' : null,
          !row['Team name'] ? 'Team name' : null
        ].filter(Boolean)
      })).filter(r => r.missing.length > 0)

      let errorMsg = `No valid data rows found. All rows are missing required fields:\n\n`
      emptyRows.slice(0, 5).forEach(r => {
        errorMsg += `Row ${r.row}: Missing ${r.missing.join(', ')}\n`
      })
      if (emptyRows.length > 5) {
        errorMsg += `... and ${emptyRows.length - 5} more rows with issues\n`
      }
      errorMsg += `\nPlease ensure all rows have values for Kinde ID, Email, and Team name.`
      
      setError(errorMsg)
      return []
    }

    console.log(`✅ CSV validation passed: ${validRows.length} valid rows found`)
    return validRows
  }

  const handleFile = useCallback((file: File) => {
    console.log(`📁 Processing file: ${file.name} (${file.size} bytes)`)
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
      console.log(`❌ File validation failed: Not a CSV file`)
      setError('Please upload a CSV file (.csv extension required)')
      return
    }

    setError(null)
    setFileName(file.name)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Keep everything as strings initially
      complete: (results) => {
        console.log(`📊 Papa Parse results:`)
        console.log(`   - Data rows: ${results.data.length}`)
        console.log(`   - Errors: ${results.errors.length}`)
        console.log(`   - Fields:`, results.meta.fields)
        
        if (results.errors.length > 0) {
          console.log(`❌ Parse errors:`, results.errors)
          setError(`Error parsing CSV file: ${results.errors[0].message}. Please check your file format.`)
          return
        }

        if (!results.meta.fields || results.meta.fields.length === 0) {
          console.log(`❌ No headers found in CSV`)
          setError('No column headers found in CSV file. Please ensure your CSV has headers in the first row.')
          return
        }

        console.log(`📝 Raw first row:`, results.data[0])

        const validData = validateCSVData(results.data, results.meta.fields)
        
        if (validData.length > 0) {
          console.log(`✅ CSV data loaded successfully: ${validData.length} customers`)
          onDataLoaded(validData)
        }
      },
      error: (error) => {
        console.error(`💥 Papa Parse error:`, error)
        setError(`Failed to parse CSV file: ${error.message}. Please ensure your file is properly formatted.`)
      }
    })
  }, [onDataLoaded])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files)
    console.log(`📁 Files dropped: ${files.length}`)
    
    if (files.length > 0) {
      handleFile(files[0])
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }, [handleFile])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Upload CSV File
        </CardTitle>
        <CardDescription>
          Upload a CSV file with columns: Kinde ID, Email, Team name (flexible column naming supported)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Drag and drop your CSV file here, or
            </p>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => document.getElementById('csv-upload')?.click()}
            >
              Browse Files
            </Button>
          </div>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileInput}
            disabled={disabled}
          />
        </div>
        
        {fileName && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-sm">
              <strong>File loaded:</strong> {fileName}
            </p>
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm whitespace-pre-line">{error}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}