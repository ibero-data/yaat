import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useDomain } from '../contexts/DomainContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Globe, Copy, Trash2, Plus, Check, Mail, Loader2, MapPin, Download } from 'lucide-react'

interface Domain {
  id: string
  name: string
  domain: string
  site_id: string
  is_active: boolean
  created_at: number
}

interface EmailSettings {
  email_provider: 'disabled' | 'smtp' | 'resend'
  email_from_address: string
  email_base_url: string
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password: string
  smtp_use_tls: boolean
  resend_api_key: string
}

interface GeoIPSettings {
  account_id: string
  license_key: string
  geoip_path: string
  auto_update: boolean
  last_updated: string
}

interface GeoIPStatus {
  exists: boolean
  path: string
  file_size: number
  last_modified: string
  configured: boolean
}

export function Settings() {
  const { user, isAdmin } = useAuth()
  const { refreshDomains } = useDomain()
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState({ name: '', domain: '' })
  const [addingDomain, setAddingDomain] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Email settings state
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null)
  const [editedEmailSettings, setEditedEmailSettings] = useState<Partial<EmailSettings>>({})
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailResult, setEmailResult] = useState<string | null>(null)
  const [testingEmail, setTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // GeoIP settings state
  const [geoipSettings, setGeoipSettings] = useState<GeoIPSettings | null>(null)
  const [geoipStatus, setGeoipStatus] = useState<GeoIPStatus | null>(null)
  const [editedGeoipSettings, setEditedGeoipSettings] = useState<Partial<GeoIPSettings>>({})
  const [savingGeoip, setSavingGeoip] = useState(false)
  const [downloadingGeoip, setDownloadingGeoip] = useState(false)
  const [geoipResult, setGeoipResult] = useState<string | null>(null)

  const hasEmailChanges = useMemo(
    () => Object.keys(editedEmailSettings).length > 0,
    [editedEmailSettings]
  )

  const fetchDomains = useCallback(async () => {
    try {
      const response = await fetch('/api/domains', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setDomains(data)
      }
    } catch (err) {
      console.error('Failed to fetch domains:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEmailSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/email', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setEmailSettings(data)
      }
    } catch (err) {
      console.error('Failed to fetch email settings:', err)
    }
  }, [])

  const fetchGeoipSettings = useCallback(async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch('/api/settings/geoip', { credentials: 'include' }),
        fetch('/api/settings/geoip/status', { credentials: 'include' })
      ])
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setGeoipSettings(data)
      }
      if (statusRes.ok) {
        const data = await statusRes.json()
        setGeoipStatus(data)
      }
    } catch (err) {
      console.error('Failed to fetch GeoIP settings:', err)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
    if (isAdmin) {
      fetchEmailSettings()
      fetchGeoipSettings()
    }
  }, [fetchDomains, fetchEmailSettings, fetchGeoipSettings, isAdmin])

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault()
    if (!newDomain.name || !newDomain.domain) return

    setAddingDomain(true)
    try {
      const response = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newDomain)
      })

      if (response.ok) {
        setNewDomain({ name: '', domain: '' })
        fetchDomains()
        refreshDomains()
      }
    } catch (err) {
      console.error('Failed to add domain:', err)
    } finally {
      setAddingDomain(false)
    }
  }

  async function handleDeleteDomain(id: string) {
    if (!confirm('Are you sure you want to delete this domain?')) return

    try {
      await fetch(`/api/domains/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      fetchDomains()
      refreshDomains()
    } catch (err) {
      console.error('Failed to delete domain:', err)
    }
  }

  async function copySnippet(id: string) {
    try {
      const response = await fetch(`/api/domains/${id}/snippet`, { credentials: 'include' })
      const data = await response.json()
      await navigator.clipboard.writeText(data.snippet)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy snippet:', err)
    }
  }

  async function handleSaveEmailSettings() {
    if (!hasEmailChanges) return

    setSavingEmail(true)
    setEmailResult(null)

    try {
      const response = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editedEmailSettings)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save settings')
      }

      setEditedEmailSettings({})
      setEmailResult('Settings saved successfully')
      fetchEmailSettings()
    } catch (err) {
      setEmailResult(`Error: ${err instanceof Error ? err.message : 'Failed to save settings'}`)
    } finally {
      setSavingEmail(false)
    }
  }

  async function handleTestEmail() {
    setTestingEmail(true)
    setEmailTestResult(null)

    try {
      // Save any pending changes first
      if (hasEmailChanges) {
        await fetch('/api/settings/email', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(editedEmailSettings)
        })
        setEditedEmailSettings({})
        fetchEmailSettings()
      }

      const response = await fetch('/api/settings/email/test', {
        method: 'POST',
        credentials: 'include'
      })

      const result = await response.json()
      setEmailTestResult(result)
    } catch (err) {
      setEmailTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed'
      })
    } finally {
      setTestingEmail(false)
    }
  }

  const selectedProvider = editedEmailSettings.email_provider ?? emailSettings?.email_provider ?? 'disabled'

  const hasGeoipChanges = useMemo(
    () => Object.keys(editedGeoipSettings).length > 0,
    [editedGeoipSettings]
  )

  async function handleSaveGeoipSettings() {
    if (!hasGeoipChanges) return

    setSavingGeoip(true)
    setGeoipResult(null)

    try {
      const response = await fetch('/api/settings/geoip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editedGeoipSettings)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save settings')
      }

      setEditedGeoipSettings({})
      setGeoipResult('Settings saved successfully')
      fetchGeoipSettings()
    } catch (err) {
      setGeoipResult(`Error: ${err instanceof Error ? err.message : 'Failed to save settings'}`)
    } finally {
      setSavingGeoip(false)
    }
  }

  async function handleDownloadGeoip() {
    setDownloadingGeoip(true)
    setGeoipResult(null)

    try {
      // Save any pending changes first
      if (hasGeoipChanges) {
        await fetch('/api/settings/geoip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(editedGeoipSettings)
        })
        setEditedGeoipSettings({})
      }

      const response = await fetch('/api/settings/geoip/download', {
        method: 'POST',
        credentials: 'include'
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Download failed')
      }

      setGeoipResult('GeoIP database downloaded successfully!')
      fetchGeoipSettings()
    } catch (err) {
      setGeoipResult(`Error: ${err instanceof Error ? err.message : 'Download failed'}`)
    } finally {
      setDownloadingGeoip(false)
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your analytics configuration</p>
      </div>

      <Tabs defaultValue="domains" className="space-y-6">
        <TabsList>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          {isAdmin && <TabsTrigger value="email">Email</TabsTrigger>}
          {isAdmin && <TabsTrigger value="geoip">GeoIP</TabsTrigger>}
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="domains" className="space-y-6">
          {/* Add Domain Form */}
          <Card>
            <CardHeader>
              <CardTitle>Add Domain</CardTitle>
              <CardDescription>
                Register a domain to start tracking analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddDomain} className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Site name (e.g., My Blog)"
                    value={newDomain.name}
                    onChange={(e) => setNewDomain({ ...newDomain, name: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Domain (e.g., blog.example.com)"
                    value={newDomain.domain}
                    onChange={(e) => setNewDomain({ ...newDomain, domain: e.target.value })}
                  />
                </div>
                <Button type="submit" disabled={addingDomain}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Domain List */}
          <Card>
            <CardHeader>
              <CardTitle>Registered Domains</CardTitle>
              <CardDescription>
                Click the copy button to get the tracking snippet for each domain
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : domains.length === 0 ? (
                <p className="text-muted-foreground">No domains registered yet.</p>
              ) : (
                <div className="space-y-3">
                  {domains.map((domain) => (
                    <div
                      key={domain.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{domain.name}</p>
                          <p className="text-sm text-muted-foreground">{domain.domain}</p>
                          <p className="text-xs text-muted-foreground font-mono">{domain.site_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copySnippet(domain.id)}
                        >
                          {copiedId === domain.id ? (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-1" />
                              Copy Snippet
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteDomain(domain.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tracking Snippet Example */}
          <Card>
            <CardHeader>
              <CardTitle>Tracking Snippet</CardTitle>
              <CardDescription>
                Add this script to your website. Each domain has a unique <code className="text-xs bg-muted px-1 rounded">data-site</code> ID that ensures only your registered domains can send analytics data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm overflow-x-auto">
                <code>{`<!-- YAAT  Analytics -->
<script defer data-site="YOUR_SITE_ID" src="${window.location.origin}/s.js"></script>`}</code>
              </pre>
              <p className="text-xs text-muted-foreground mt-3">
                Click "Copy Snippet" on a domain above to get the snippet with the correct site ID.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="email" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Settings
                </CardTitle>
                <CardDescription>
                  Configure email provider for password reset functionality
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {emailResult && (
                  <div
                    className={`p-3 rounded text-sm ${
                      emailResult.startsWith('Error')
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-green-500/10 text-green-600'
                    }`}
                  >
                    {emailResult}
                  </div>
                )}

                {emailTestResult && (
                  <div
                    className={`p-3 rounded text-sm ${
                      emailTestResult.success
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {emailTestResult.message}
                  </div>
                )}

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="email_provider">Email Provider</Label>
                    <select
                      id="email_provider"
                      value={selectedProvider}
                      onChange={(e) => {
                        setEditedEmailSettings((prev) => ({
                          ...prev,
                          email_provider: e.target.value as 'disabled' | 'smtp' | 'resend',
                        }))
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="disabled">Disabled</option>
                      <option value="smtp">SMTP</option>
                      <option value="resend">Resend</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Select the email provider to use for sending emails
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email_from_address">From Address</Label>
                    <Input
                      id="email_from_address"
                      type="email"
                      placeholder="noreply@example.com"
                      value={editedEmailSettings.email_from_address ?? emailSettings?.email_from_address ?? ''}
                      onChange={(e) => {
                        setEditedEmailSettings((prev) => ({
                          ...prev,
                          email_from_address: e.target.value,
                        }))
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Email address used as the sender
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email_base_url">Base URL</Label>
                    <Input
                      id="email_base_url"
                      type="text"
                      placeholder="https://analytics.example.com"
                      value={editedEmailSettings.email_base_url ?? emailSettings?.email_base_url ?? ''}
                      onChange={(e) => {
                        setEditedEmailSettings((prev) => ({
                          ...prev,
                          email_base_url: e.target.value,
                        }))
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Base URL for password reset links
                    </p>
                  </div>
                </div>

                {selectedProvider === 'smtp' && (
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">SMTP Configuration</h4>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="smtp_host">Host</Label>
                        <Input
                          id="smtp_host"
                          type="text"
                          placeholder="smtp.example.com"
                          value={editedEmailSettings.smtp_host ?? emailSettings?.smtp_host ?? ''}
                          onChange={(e) => {
                            setEditedEmailSettings((prev) => ({
                              ...prev,
                              smtp_host: e.target.value,
                            }))
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smtp_port">Port</Label>
                        <Input
                          id="smtp_port"
                          type="number"
                          min={1}
                          max={65535}
                          placeholder="587"
                          value={editedEmailSettings.smtp_port ?? emailSettings?.smtp_port ?? 587}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10)
                            if (!isNaN(val)) {
                              setEditedEmailSettings((prev) => ({
                                ...prev,
                                smtp_port: val,
                              }))
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smtp_username">Username</Label>
                        <Input
                          id="smtp_username"
                          type="text"
                          placeholder="username"
                          value={editedEmailSettings.smtp_username ?? emailSettings?.smtp_username ?? ''}
                          onChange={(e) => {
                            setEditedEmailSettings((prev) => ({
                              ...prev,
                              smtp_username: e.target.value,
                            }))
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smtp_password">Password</Label>
                        <Input
                          id="smtp_password"
                          type="password"
                          placeholder={emailSettings?.smtp_password ? '••••••••' : 'Enter password'}
                          value={editedEmailSettings.smtp_password ?? ''}
                          onChange={(e) => {
                            setEditedEmailSettings((prev) => ({
                              ...prev,
                              smtp_password: e.target.value,
                            }))
                          }}
                        />
                        {emailSettings?.smtp_password && (
                          <p className="text-xs text-muted-foreground">
                            Password is set. Enter a new value to replace it.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="smtp_use_tls">Use TLS</Label>
                        <div className="flex items-center space-x-2 h-10">
                          <Switch
                            id="smtp_use_tls"
                            checked={editedEmailSettings.smtp_use_tls ?? emailSettings?.smtp_use_tls ?? true}
                            onCheckedChange={(checked) => {
                              setEditedEmailSettings((prev) => ({
                                ...prev,
                                smtp_use_tls: checked,
                              }))
                            }}
                          />
                          <span className="text-sm text-muted-foreground">Enable STARTTLS</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedProvider === 'resend' && (
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">Resend Configuration</h4>
                    <div className="space-y-2 max-w-md">
                      <Label htmlFor="resend_api_key">API Key</Label>
                      <Input
                        id="resend_api_key"
                        type="password"
                        placeholder={emailSettings?.resend_api_key ? '••••••••' : 're_••••••••'}
                        value={editedEmailSettings.resend_api_key ?? ''}
                        onChange={(e) => {
                          setEditedEmailSettings((prev) => ({
                            ...prev,
                            resend_api_key: e.target.value,
                          }))
                        }}
                      />
                      {emailSettings?.resend_api_key ? (
                        <p className="text-xs text-muted-foreground">
                          API key is set. Enter a new key to replace it.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Your Resend API key from the dashboard
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      onClick={handleTestEmail}
                      disabled={testingEmail || selectedProvider === 'disabled'}
                    >
                      {testingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send Test Email
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Sends a test email to your account.
                    </span>
                  </div>
                  <Button onClick={handleSaveEmailSettings} disabled={savingEmail || !hasEmailChanges}>
                    {savingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="geoip" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  GeoIP Database
                </CardTitle>
                <CardDescription>
                  Configure MaxMind GeoIP for visitor location data.
                  <a
                    href="https://www.maxmind.com/en/geolite2/signup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-primary hover:underline"
                  >
                    Get free credentials
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {geoipResult && (
                  <div
                    className={`p-3 rounded text-sm ${
                      geoipResult.startsWith('Error')
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-green-500/10 text-green-600'
                    }`}
                  >
                    {geoipResult}
                  </div>
                )}

                {/* Database Status */}
                <div className="p-4 rounded-lg border border-border bg-muted/50">
                  <h4 className="text-sm font-medium mb-3">Database Status</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <span className={geoipStatus?.exists ? 'text-green-600' : 'text-yellow-600'}>
                        {geoipStatus?.exists ? 'Installed' : 'Not installed'}
                      </span>
                    </div>
                    {geoipStatus?.exists && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">File size:</span>
                          <span>{formatFileSize(geoipStatus.file_size)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last modified:</span>
                          <span>{new Date(geoipStatus.last_modified).toLocaleDateString()}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credentials:</span>
                      <span className={geoipStatus?.configured ? 'text-green-600' : 'text-yellow-600'}>
                        {geoipStatus?.configured ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Credentials */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">MaxMind Credentials</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="maxmind_account_id">Account ID</Label>
                      <Input
                        id="maxmind_account_id"
                        type="text"
                        placeholder={geoipSettings?.account_id || 'Enter Account ID'}
                        value={editedGeoipSettings.account_id ?? ''}
                        onChange={(e) => {
                          setEditedGeoipSettings((prev) => ({
                            ...prev,
                            account_id: e.target.value,
                          }))
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxmind_license_key">License Key</Label>
                      <Input
                        id="maxmind_license_key"
                        type="password"
                        placeholder={geoipSettings?.license_key ? '••••••••' : 'Enter License Key'}
                        value={editedGeoipSettings.license_key ?? ''}
                        onChange={(e) => {
                          setEditedGeoipSettings((prev) => ({
                            ...prev,
                            license_key: e.target.value,
                          }))
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Auto Update */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-update database</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically download updates weekly
                    </p>
                  </div>
                  <Switch
                    checked={editedGeoipSettings.auto_update ?? geoipSettings?.auto_update ?? false}
                    onCheckedChange={(checked) => {
                      setEditedGeoipSettings((prev) => ({
                        ...prev,
                        auto_update: checked,
                      }))
                    }}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={handleDownloadGeoip}
                    disabled={downloadingGeoip || !geoipStatus?.configured}
                  >
                    {downloadingGeoip ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download Database
                  </Button>
                  <Button onClick={handleSaveGeoipSettings} disabled={savingGeoip || !hasGeoipChanges}>
                    {savingGeoip && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Name</label>
                <p className="text-muted-foreground">{user?.name || 'Not set'}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <p className="text-muted-foreground capitalize">{user?.role}</p>
              </div>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
              </CardHeader>
              <CardContent>
                <ChangePasswordForm />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to change password')
      }

      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-md">
          Password changed successfully
        </div>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium">Current Password</label>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">New Password</label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Confirm New Password</label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? 'Changing...' : 'Change Password'}
      </Button>
    </form>
  )
}
