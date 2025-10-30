import { useState, useEffect } from 'react'
import { Play, Database, AlertCircle, CheckCircle2, Loader2, Copy, Trash2 } from 'lucide-react'
import { cn } from './lib/utils'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

function App() {
  const [query, setQuery] = useState('SELECT * FROM users;')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [agentStatus, setAgentStatus] = useState({ connected: false, message: 'Checking...' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    checkAgentStatus()
    const interval = setInterval(checkAgentStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const checkAgentStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent-status`)
      const data = await response.json()
      setAgentStatus(data)
    } catch (err) {
      setAgentStatus({ connected: false, message: 'API unreachable' })
    }
  }

  const executeQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a SQL query')
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/execute-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      const data = await response.json()

      if (data.exitCode === 0) {
        setResults(data)
      } else {
        setError(data.error || 'Query execution failed')
      }
    } catch (err) {
      setError(`Failed to execute query: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      executeQuery()
    }
  }

  const copyQuery = () => {
    navigator.clipboard.writeText(query)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const clearQuery = () => {
    setQuery('')
    setResults(null)
    setError(null)
  }

  const parseResults = (resultsString) => {
    if (!resultsString) return { headers: [], rows: [] }
    const lines = resultsString.split('\n').filter(line => line.trim())
    const dataLines = lines.filter(line => !line.includes('Deprecated'))
    if (dataLines.length === 0) return { headers: [], rows: [] }
    const headers = dataLines[0].split('\t')
    const rows = dataLines.slice(1).map(line => line.split('\t'))
    return { headers, rows }
  }

  const { headers, rows } = results ? parseResults(results.results) : { headers: [], rows: [] }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-6 h-6" />
              <h1 className="text-2xl font-bold tracking-tight">SQL Console</h1>
            </div>

            {/* Agent Status */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm font-medium",
              agentStatus.connected
                ? "border-black bg-black text-white"
                : "border-black bg-white text-black"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full",
                agentStatus.connected ? "bg-white" : "bg-black"
              )} />
              <span>{agentStatus.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Query Editor */}
        <div className="border border-black rounded-lg overflow-hidden mb-6">
          <div className="bg-black text-white px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">Query Editor</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Ctrl+Enter to execute</span>
              <button
                onClick={copyQuery}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Copy query"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={clearQuery}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Clear query"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            className="w-full px-4 py-3 font-mono text-sm focus:outline-none resize-none"
            rows={6}
            placeholder="Enter your SQL query here..."
          />

          <div className="border-t border-black px-4 py-3 flex items-center justify-between bg-gray-50">
            <div className="text-xs text-gray-600">
              {query.length} characters
            </div>
            <button
              onClick={executeQuery}
              disabled={loading || !agentStatus.connected}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                loading || !agentStatus.connected
                  ? "bg-gray-200 text-gray-500"
                  : "bg-black text-white hover:bg-gray-800"
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Executing</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Execute</span>
                </>
              )}
            </button>
          </div>
        </div>

        {copied && (
          <div className="mb-4 p-3 border border-black rounded-md bg-black text-white text-sm">
            ✓ Query copied to clipboard
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 border border-black rounded-lg bg-white">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Error</h3>
                <p className="text-sm text-gray-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && results.exitCode === 0 && (
          <div className="border border-black rounded-lg overflow-hidden">
            <div className="bg-black text-white px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Results</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{rows.length} rows</span>
                <span>•</span>
                <span>{results.duration}</span>
              </div>
            </div>

            {headers.length > 0 && rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-black">
                    <tr>
                      {headers.map((header, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-3 text-sm font-mono">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                No data returned
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!results && !error && !loading && (
          <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
            <Database className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">Ready to execute</h3>
            <p className="text-sm text-gray-600">
              Write your SQL query above and click Execute or press Ctrl+Enter
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-black mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-gray-600">
            Hoop Agent POC • Gateway → Agent → MySQL
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
