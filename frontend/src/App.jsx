import { useState, useEffect } from 'react'
import { Play, Database, AlertCircle, CheckCircle2, Loader2, Copy, Trash2, Users, Plus, Edit, X } from 'lucide-react'
import { cn } from './lib/utils'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

function App() {
  const [activeTab, setActiveTab] = useState('sql')
  const [query, setQuery] = useState('SELECT * FROM users;')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [agentStatus, setAgentStatus] = useState({ connected: false, message: 'Checking...' })
  const [copied, setCopied] = useState(false)

  // User Management State
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userForm, setUserForm] = useState({ username: '', email: '', teamname: '' })
  const [userError, setUserError] = useState(null)
  const [userSuccess, setUserSuccess] = useState(null)

  useEffect(() => {
    checkAgentStatus()
    const interval = setInterval(checkAgentStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers()
    }
  }, [activeTab])

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

  // User Management Functions
  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`)
      const data = await response.json()
      setUsers(data || [])
    } catch (err) {
      setUserError('Failed to fetch users')
    } finally {
      setLoadingUsers(false)
    }
  }

  const openUserModal = (user = null) => {
    if (user) {
      setEditingUser(user)
      setUserForm({ username: user.username, email: user.email, teamname: user.teamname })
    } else {
      setEditingUser(null)
      setUserForm({ username: '', email: '', teamname: '' })
    }
    setShowUserModal(true)
    setUserError(null)
  }

  const closeUserModal = () => {
    setShowUserModal(false)
    setEditingUser(null)
    setUserForm({ username: '', email: '', teamname: '' })
    setUserError(null)
  }

  const handleUserSubmit = async (e) => {
    e.preventDefault()
    setUserError(null)

    if (!userForm.username || !userForm.email || !userForm.teamname) {
      setUserError('All fields are required')
      return
    }

    try {
      const url = editingUser
        ? `${API_BASE_URL}/api/users/${editingUser.id}`
        : `${API_BASE_URL}/api/users`

      const method = editingUser ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm),
      })

      const data = await response.json()

      if (!response.ok) {
        setUserError(data.error || 'Failed to save user')
        return
      }

      setUserSuccess(editingUser ? 'User updated successfully' : 'User created successfully')
      setTimeout(() => setUserSuccess(null), 3000)
      closeUserModal()
      fetchUsers()
    } catch (err) {
      setUserError('Failed to save user: ' + err.message)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        setUserError(data.error || 'Failed to delete user')
        return
      }

      setUserSuccess('User deleted successfully')
      setTimeout(() => setUserSuccess(null), 3000)
      fetchUsers()
    } catch (err) {
      setUserError('Failed to delete user: ' + err.message)
    }
  }

  const { headers, rows } = results ? parseResults(results.results) : { headers: [], rows: [] }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-6 h-6" />
              <h1 className="text-2xl font-bold tracking-tight">BifrostLink</h1>
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

          {/* Tabs */}
          <div className="flex gap-4 mt-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('sql')}
              className={cn(
                "px-4 py-2 font-medium text-sm transition-colors border-b-2",
                activeTab === 'sql'
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                SQL Console
              </div>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={cn(
                "px-4 py-2 font-medium text-sm transition-colors border-b-2",
                activeTab === 'users'
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                User Management
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* SQL Console Tab */}
        {activeTab === 'sql' && (
          <>
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
          </>
        )}

        {/* User Management Tab */}
        {activeTab === 'users' && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">User Management</h2>
              <button
                onClick={() => openUserModal()}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>

            {userSuccess && (
              <div className="mb-4 p-3 border border-black rounded-md bg-black text-white text-sm">
                ✓ {userSuccess}
              </div>
            )}

            {userError && (
              <div className="mb-4 p-4 border border-black rounded-lg bg-white">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">{userError}</p>
                </div>
              </div>
            )}

            {loadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No users yet</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Get started by creating your first user
                </p>
                <button
                  onClick={() => openUserModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add User
                </button>
              </div>
            ) : (
              <div className="border border-black rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Team</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono">{user.id}</td>
                        <td className="px-4 py-3 text-sm font-medium">{user.username}</td>
                        <td className="px-4 py-3 text-sm">{user.email}</td>
                        <td className="px-4 py-3 text-sm">{user.teamname}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button
                            onClick={() => openUserModal(user)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-sm border border-black rounded hover:bg-black hover:text-white transition-colors mr-2"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-sm border border-black rounded hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black">
              <h3 className="text-lg font-bold">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h3>
              <button
                onClick={closeUserModal}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUserSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  type="text"
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="john_doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="john@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Team Name</label>
                <input
                  type="text"
                  value={userForm.teamname}
                  onChange={(e) => setUserForm({ ...userForm, teamname: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Engineering"
                  required
                />
              </div>

              {userError && (
                <div className="p-3 border border-red-500 rounded-md bg-red-50 text-red-700 text-sm">
                  {userError}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={closeUserModal}
                  className="flex-1 px-4 py-2 border border-black rounded-md hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-black mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-gray-600">
            BifrostLink POC • Gateway → Agent → MySQL
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
