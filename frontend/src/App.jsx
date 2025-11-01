import { useState, useEffect } from 'react'
import { Play, Database, AlertCircle, CheckCircle2, Loader2, Copy, Trash2, Users, Plus, Edit, X, Activity, Circle, Server } from 'lucide-react'
import { cn } from './lib/utils'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

function App() {
  // Initialize activeTab from URL hash, default to 'sql'
  const getInitialTab = () => {
    const hash = window.location.hash.slice(1) // Remove the '#'
    return ['sql', 'users', 'agents', 'databases'].includes(hash) ? hash : 'sql'
  }

  const [activeTab, setActiveTab] = useState(getInitialTab())
  const [query, setQuery] = useState('SELECT * FROM users;')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [selectedDatabaseId, setSelectedDatabaseId] = useState(null)

  // User Management State
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userForm, setUserForm] = useState({ username: '', email: '', teamname: '' })
  const [userError, setUserError] = useState(null)
  const [userSuccess, setUserSuccess] = useState(null)

  // Agent Management State
  const [agents, setAgents] = useState([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)
  const [agentForm, setAgentForm] = useState({ agent_id: '', name: '', description: '' })
  const [agentError, setAgentError] = useState(null)
  const [agentSuccess, setAgentSuccess] = useState(null)
  const [dockerCmdCopied, setDockerCmdCopied] = useState(false)

  // Database Management State
  const [databases, setDatabases] = useState([])
  const [loadingDatabases, setLoadingDatabases] = useState(false)
  const [showDatabaseModal, setShowDatabaseModal] = useState(false)
  const [editingDatabase, setEditingDatabase] = useState(null)
  const [databaseForm, setDatabaseForm] = useState({ database_name: '', type: 'mysql', agent_id: '', host: '', port: '3306', username: '', password: '', db_name: '', description: '' })
  const [databaseError, setDatabaseError] = useState(null)
  const [databaseSuccess, setDatabaseSuccess] = useState(null)

  // Listen to hash changes (for browser back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (['sql', 'users', 'agents', 'databases'].includes(hash)) {
        setActiveTab(hash)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers()
    } else if (activeTab === 'agents') {
      fetchAgents()
    } else if (activeTab === 'databases') {
      fetchDatabases()
      fetchAgents() // Need agents for the dropdown
    } else if (activeTab === 'sql') {
      fetchDatabases() // Need databases for SQL Console dropdown
    }
  }, [activeTab])

  // Function to change tabs and update URL hash
  const changeTab = (tab) => {
    setActiveTab(tab)
    window.location.hash = tab
  }

  const executeQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a SQL query')
      return
    }

    if (!selectedDatabaseId) {
      setError('Please select a database')
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/execute-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, database_id: selectedDatabaseId }),
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

  // Agent Management Functions
  const fetchAgents = async () => {
    setLoadingAgents(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/agents`)
      const data = await response.json()
      setAgents(data || [])
    } catch (err) {
      setAgentError('Failed to fetch agents')
    } finally {
      setLoadingAgents(false)
    }
  }

  const openAgentModal = (agent = null) => {
    if (agent) {
      setEditingAgent(agent)
      // Strip "agent-" prefix when editing to show only the user's input
      const agentIdWithoutPrefix = agent.agent_id.startsWith('agent-')
        ? agent.agent_id.substring(6)
        : agent.agent_id
      setAgentForm({ agent_id: agentIdWithoutPrefix, name: agent.name, description: agent.description })
    } else {
      setEditingAgent(null)
      setAgentForm({ agent_id: '', name: '', description: '' })
    }
    setShowAgentModal(true)
    setAgentError(null)
  }

  const closeAgentModal = () => {
    setShowAgentModal(false)
    setEditingAgent(null)
    setAgentForm({ agent_id: '', name: '', description: '' })
    setAgentError(null)
  }

  const handleAgentSubmit = async (e) => {
    e.preventDefault()
    setAgentError(null)

    if (!agentForm.agent_id || !agentForm.name) {
      setAgentError('Agent ID and name are required')
      return
    }

    // Prepend "agent-" to the user's input for the full agent_id
    const fullAgentId = `agent-${agentForm.agent_id}`

    try {
      const url = editingAgent
        ? `${API_BASE_URL}/api/agents/${editingAgent.id}`
        : `${API_BASE_URL}/api/agents`

      const method = editingAgent ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...agentForm,
          agent_id: fullAgentId
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setAgentError(data.error || 'Failed to save agent')
        return
      }

      setAgentSuccess(editingAgent ? 'Agent updated successfully' : 'Agent created successfully')
      setTimeout(() => setAgentSuccess(null), 3000)
      closeAgentModal()
      fetchAgents()
    } catch (err) {
      setAgentError('Failed to save agent: ' + err.message)
    }
  }

  const handleDeleteAgent = async (agentId) => {
    if (!confirm('Are you sure you want to delete this agent?')) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/agents/${agentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        setAgentError(data.error || 'Failed to delete agent')
        return
      }

      setAgentSuccess('Agent deleted successfully')
      setTimeout(() => setAgentSuccess(null), 3000)
      fetchAgents()
    } catch (err) {
      setAgentError('Failed to delete agent: ' + err.message)
    }
  }

  const copyDockerCommand = (command) => {
    navigator.clipboard.writeText(command)
    setDockerCmdCopied(true)
    setTimeout(() => setDockerCmdCopied(false), 2000)
  }

  const generateDockerCommands = (agentIdSuffix) => {
    if (!agentIdSuffix) return {}
    const token = 'test-token-123'
    // User only provides the suffix, so we use it directly in BIFROST_KEY
    // Gateway will add "agent-" prefix, resulting in "agent-{suffix}"
    const fullAgentId = `agent-${agentIdSuffix}`

    return {
      sameNetwork: `docker run -d \\
  --name ${fullAgentId} \\
  -e BIFROST_KEY=grpc://${agentIdSuffix}:${token}@gateway:8010 \\
  --network bifrostlink_default \\
  bifrostlink-agent`,

      sameHost: `docker run -d \\
  --name ${fullAgentId} \\
  -e BIFROST_KEY=grpc://${agentIdSuffix}:${token}@host.docker.internal:8010 \\
  bifrostlink-agent`,

      differentHost: `docker run -d \\
  --name ${fullAgentId} \\
  -e BIFROST_KEY=grpc://${agentIdSuffix}:${token}@YOUR_GATEWAY_IP:8010 \\
  bifrostlink-agent`
    }
  }

  // Database Management Functions
  const fetchDatabases = async () => {
    setLoadingDatabases(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/databases`)
      const data = await response.json()
      setDatabases(data || [])
      if (data && data.length > 0 && !selectedDatabaseId) {
        setSelectedDatabaseId(data[0].id)
      }
    } catch (err) {
      setDatabaseError('Failed to fetch databases')
    } finally {
      setLoadingDatabases(false)
    }
  }

  const openDatabaseModal = (database = null) => {
    if (database) {
      setEditingDatabase(database)
      setDatabaseForm({
        database_name: database.database_name,
        type: database.type || 'mysql',
        agent_id: database.agent_id,
        host: database.host,
        port: database.port,
        username: database.username,
        password: database.password,
        db_name: database.db_name,
        description: database.description
      })
    } else {
      setEditingDatabase(null)
      setDatabaseForm({ database_name: '', type: 'mysql', agent_id: '', host: '', port: '3306', username: '', password: '', db_name: '', description: '' })
    }
    setShowDatabaseModal(true)
    setDatabaseError(null)
  }

  const closeDatabaseModal = () => {
    setShowDatabaseModal(false)
    setEditingDatabase(null)
    setDatabaseForm({ database_name: '', type: 'mysql', agent_id: '', host: '', port: '3306', username: '', password: '', db_name: '', description: '' })
    setDatabaseError(null)
  }

  const handleDatabaseSubmit = async (e) => {
    e.preventDefault()
    setDatabaseError(null)

    if (!databaseForm.database_name || !databaseForm.type || !databaseForm.agent_id || !databaseForm.host || !databaseForm.port || !databaseForm.username || !databaseForm.db_name) {
      setDatabaseError('All required fields must be filled')
      return
    }

    try {
      const url = editingDatabase
        ? `${API_BASE_URL}/api/databases/${editingDatabase.id}`
        : `${API_BASE_URL}/api/databases`

      const method = editingDatabase ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(databaseForm),
      })

      const data = await response.json()

      if (!response.ok) {
        setDatabaseError(data.error || 'Failed to save database')
        return
      }

      setDatabaseSuccess(editingDatabase ? 'Database updated successfully' : 'Database created successfully')
      setTimeout(() => setDatabaseSuccess(null), 3000)
      closeDatabaseModal()
      fetchDatabases()
    } catch (err) {
      setDatabaseError('Failed to save database: ' + err.message)
    }
  }

  const handleDeleteDatabase = async (databaseId) => {
    if (!confirm('Are you sure you want to delete this database?')) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/databases/${databaseId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        setDatabaseError(data.error || 'Failed to delete database')
        return
      }

      setDatabaseSuccess('Database deleted successfully')
      setTimeout(() => setDatabaseSuccess(null), 3000)
      fetchDatabases()
    } catch (err) {
      setDatabaseError('Failed to delete database: ' + err.message)
    }
  }

  const { headers, rows } = results ? parseResults(results.results) : { headers: [], rows: [] }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6" />
            <h1 className="text-2xl font-bold tracking-tight">BifrostLink</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4 border-b border-gray-200">
            <button
              onClick={() => changeTab('sql')}
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
              onClick={() => changeTab('users')}
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
            <button
              onClick={() => changeTab('agents')}
              className={cn(
                "px-4 py-2 font-medium text-sm transition-colors border-b-2",
                activeTab === 'agents'
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Agent Management
              </div>
            </button>
            <button
              onClick={() => changeTab('databases')}
              className={cn(
                "px-4 py-2 font-medium text-sm transition-colors border-b-2",
                activeTab === 'databases'
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4" />
                Database Management
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
            {/* Database Selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Select Database</label>
              <select
                value={selectedDatabaseId || ''}
                onChange={(e) => setSelectedDatabaseId(Number(e.target.value))}
                className="w-full md:w-64 px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">Choose a database...</option>
                {databases.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.database_name} ({db.agent_id})
                  </option>
                ))}
              </select>
            </div>

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
                  disabled={loading}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    loading
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

        {/* Agent Management Tab */}
        {activeTab === 'agents' && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Agent Management</h2>
              <button
                onClick={() => openAgentModal()}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Register Agent
              </button>
            </div>

            {agentSuccess && (
              <div className="mb-4 p-3 border border-black rounded-md bg-black text-white text-sm">
                ✓ {agentSuccess}
              </div>
            )}

            {agentError && (
              <div className="mb-4 p-4 border border-black rounded-lg bg-white">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">{agentError}</p>
                </div>
              </div>
            )}

            {loadingAgents ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : agents.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
                <Activity className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No agents registered</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Register your first agent to start managing database connections
                </p>
                <button
                  onClick={() => openAgentModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Register Agent
                </button>
              </div>
            ) : (
              <div className="border border-black rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Agent ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {agents.map((agent) => (
                      <tr key={agent.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono">{agent.id}</td>
                        <td className="px-4 py-3 text-sm font-mono">{agent.agent_id}</td>
                        <td className="px-4 py-3 text-sm font-medium">{agent.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{agent.description || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Circle className={cn(
                              "w-2 h-2 fill-current",
                              agent.status === 'connected' ? "text-green-500" : "text-gray-400"
                            )} />
                            <span className={cn(
                              "font-medium",
                              agent.status === 'connected' ? "text-green-600" : "text-gray-500"
                            )}>
                              {agent.status === 'connected' ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(agent.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button
                            onClick={() => openAgentModal(agent)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-sm border border-black rounded hover:bg-black hover:text-white transition-colors mr-2"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAgent(agent.id)}
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

        {/* Database Management Tab */}
        {activeTab === 'databases' && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Database Management</h2>
              <button
                onClick={() => openDatabaseModal()}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Database
              </button>
            </div>

            {databaseSuccess && (
              <div className="mb-4 p-3 border border-black rounded-md bg-black text-white text-sm">
                ✓ {databaseSuccess}
              </div>
            )}

            {databaseError && (
              <div className="mb-4 p-4 border border-black rounded-lg bg-white">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">{databaseError}</p>
                </div>
              </div>
            )}

            {loadingDatabases ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : databases.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
                <Server className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No databases configured</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Add your first database to start querying
                </p>
                <button
                  onClick={() => openDatabaseModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Database
                </button>
              </div>
            ) : (
              <div className="border border-black rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Database Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Agent</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Host</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Port</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">DB Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {databases.map((database) => (
                      <tr key={database.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono">{database.id}</td>
                        <td className="px-4 py-3 text-sm font-medium">{database.database_name}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                            {database.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">{database.agent_id}</td>
                        <td className="px-4 py-3 text-sm">{database.host}</td>
                        <td className="px-4 py-3 text-sm">{database.port}</td>
                        <td className="px-4 py-3 text-sm">{database.db_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(database.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button
                            onClick={() => openDatabaseModal(database)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-sm border border-black rounded hover:bg-black hover:text-white transition-colors mr-2"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteDatabase(database.id)}
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

      {/* Agent Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black">
              <h3 className="text-lg font-bold">
                {editingAgent ? 'Edit Agent' : 'Register New Agent'}
              </h3>
              <button
                onClick={closeAgentModal}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAgentSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Agent ID</label>
                <div className="flex items-center border border-black rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-black">
                  <span className="px-3 py-2 bg-gray-100 text-gray-600 font-medium select-none">agent-</span>
                  <input
                    type="text"
                    value={agentForm.agent_id}
                    onChange={(e) => setAgentForm({ ...agentForm, agent_id: e.target.value })}
                    className="flex-1 px-3 py-2 focus:outline-none"
                    placeholder="test1"
                    required
                    disabled={editingAgent}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Only enter the unique part after "agent-"</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Primary Agent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={agentForm.description}
                  onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Main database agent for MySQL operations"
                  rows={3}
                />
              </div>

              {/* Docker Command Section */}
              {!editingAgent && agentForm.agent_id && (
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 space-y-4">
                  <label className="block text-sm font-medium">Docker Run Commands</label>

                  {/* Same Docker Network */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700">1. Same Docker Network</p>
                      <button
                        type="button"
                        onClick={() => copyDockerCommand(generateDockerCommands(agentForm.agent_id).sameNetwork)}
                        className="flex items-center gap-1 px-2 py-1 text-xs border border-black rounded hover:bg-black hover:text-white transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono bg-white border border-gray-300 rounded p-2 overflow-x-auto whitespace-pre">
                      {generateDockerCommands(agentForm.agent_id).sameNetwork}
                    </pre>
                    <p className="mt-1 text-xs text-gray-500">Use when agent runs on the same Docker network as gateway</p>
                  </div>

                  {/* Same Host, Different Network */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700">2. Same Host (Docker to Host)</p>
                      <button
                        type="button"
                        onClick={() => copyDockerCommand(generateDockerCommands(agentForm.agent_id).sameHost)}
                        className="flex items-center gap-1 px-2 py-1 text-xs border border-black rounded hover:bg-black hover:text-white transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono bg-white border border-gray-300 rounded p-2 overflow-x-auto whitespace-pre">
                      {generateDockerCommands(agentForm.agent_id).sameHost}
                    </pre>
                    <p className="mt-1 text-xs text-gray-500">Use when agent container needs to reach gateway on host machine (Mac/Windows)</p>
                  </div>

                  {/* Different Host */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-700">3. Different Host/Remote</p>
                      <button
                        type="button"
                        onClick={() => copyDockerCommand(generateDockerCommands(agentForm.agent_id).differentHost)}
                        className="flex items-center gap-1 px-2 py-1 text-xs border border-black rounded hover:bg-black hover:text-white transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono bg-white border border-gray-300 rounded p-2 overflow-x-auto whitespace-pre">
                      {generateDockerCommands(agentForm.agent_id).differentHost}
                    </pre>
                    <p className="mt-1 text-xs text-gray-500">Replace YOUR_GATEWAY_IP with the actual IP address of your gateway server</p>
                  </div>

                  {dockerCmdCopied && (
                    <div className="text-xs text-green-600 font-medium">✓ Copied to clipboard!</div>
                  )}
                </div>
              )}

              {agentError && (
                <div className="p-3 border border-red-500 rounded-md bg-red-50 text-red-700 text-sm">
                  {agentError}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  {editingAgent ? 'Update Agent' : 'Register Agent'}
                </button>
                <button
                  type="button"
                  onClick={closeAgentModal}
                  className="flex-1 px-4 py-2 border border-black rounded-md hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Database Modal */}
      {showDatabaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-black rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black sticky top-0 bg-white">
              <h3 className="text-lg font-bold">
                {editingDatabase ? 'Edit Database' : 'Add New Database'}
              </h3>
              <button
                onClick={closeDatabaseModal}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDatabaseSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Database Name *</label>
                <input
                  type="text"
                  value={databaseForm.database_name}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, database_name: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Production MySQL"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Database Type *</label>
                <select
                  value={databaseForm.type}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  required
                >
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                  <option value="mssql">Microsoft SQL Server</option>
                  <option value="mongodb">MongoDB</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Select the type of database you want to connect to</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Agent *</label>
                <select
                  value={databaseForm.agent_id}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, agent_id: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  required
                >
                  <option value="">Select an agent...</option>
                  {agents.map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agent.name} ({agent.agent_id})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Choose which agent will handle queries for this database</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Host *</label>
                <input
                  type="text"
                  value={databaseForm.host}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, host: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="mysql or 192.168.1.100"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">MySQL server hostname or IP address</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Port *</label>
                <input
                  type="text"
                  value={databaseForm.port}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, port: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="3306"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Username *</label>
                <input
                  type="text"
                  value={databaseForm.username}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="root"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={databaseForm.password}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="••••••••"
                />
                <p className="mt-1 text-xs text-gray-500">Leave blank if no password is required</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Database Name *</label>
                <input
                  type="text"
                  value={databaseForm.db_name}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, db_name: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="testdb"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">The specific database to connect to on the MySQL server</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={databaseForm.description}
                  onChange={(e) => setDatabaseForm({ ...databaseForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-black rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Production database for customer data"
                  rows={3}
                />
              </div>

              {databaseError && (
                <div className="p-3 border border-red-500 rounded-md bg-red-50 text-red-700 text-sm">
                  {databaseError}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  {editingDatabase ? 'Update Database' : 'Create Database'}
                </button>
                <button
                  type="button"
                  onClick={closeDatabaseModal}
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
