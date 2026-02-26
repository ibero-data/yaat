import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { fetchAPI } from '@/lib/api'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsLayout } from './SettingsLayout'

interface EmailSettingsData {
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

export function EmailSettings() {
  const { isAdmin } = useAuth()
  const [emailSettings, setEmailSettings] = useState<EmailSettingsData | null>(null)
  const [editedEmailSettings, setEditedEmailSettings] = useState<Partial<EmailSettingsData>>({})
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailResult, setEmailResult] = useState<string | null>(null)
  const [testingEmail, setTestingEmail] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const hasEmailChanges = useMemo(
    () => Object.keys(editedEmailSettings).length > 0,
    [editedEmailSettings]
  )

  const fetchEmailSettings = useCallback(async () => {
    try {
      const data = await fetchAPI<EmailSettingsData>('/api/settings/email')
      setEmailSettings(data)
    } catch (err) {
      toast.error('Failed to load email settings')
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchEmailSettings()
    }
  }, [fetchEmailSettings, isAdmin])

  if (!isAdmin) {
    return <Navigate to="/settings/domains" replace />
  }

  async function handleSaveEmailSettings() {
    if (!hasEmailChanges) return

    setSavingEmail(true)
    setEmailResult(null)

    try {
      await fetchAPI('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedEmailSettings),
      })

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
      if (hasEmailChanges) {
        await fetchAPI('/api/settings/email', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editedEmailSettings),
        })
        setEditedEmailSettings({})
        fetchEmailSettings()
      }

      const result = await fetchAPI<{ success: boolean; message: string }>('/api/settings/email/test', {
        method: 'POST',
      })
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

  return (
    <SettingsLayout title="Email" description="Configure email provider for password reset functionality">
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
    </SettingsLayout>
  )
}
