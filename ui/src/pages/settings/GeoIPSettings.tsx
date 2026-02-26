import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { fetchAPI } from '@/lib/api'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Loader2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsLayout } from './SettingsLayout'

interface GeoIPSettingsData {
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

export function GeoIPSettings() {
  const { isAdmin } = useAuth()
  const [geoipSettings, setGeoipSettings] = useState<GeoIPSettingsData | null>(null)
  const [geoipStatus, setGeoipStatus] = useState<GeoIPStatus | null>(null)
  const [editedGeoipSettings, setEditedGeoipSettings] = useState<Partial<GeoIPSettingsData>>({})
  const [savingGeoip, setSavingGeoip] = useState(false)
  const [downloadingGeoip, setDownloadingGeoip] = useState(false)
  const [geoipResult, setGeoipResult] = useState<string | null>(null)

  const hasGeoipChanges = useMemo(
    () => Object.keys(editedGeoipSettings).length > 0,
    [editedGeoipSettings]
  )

  const fetchGeoipSettings = useCallback(async () => {
    try {
      const [settings, status] = await Promise.all([
        fetchAPI<GeoIPSettingsData>('/api/settings/geoip'),
        fetchAPI<GeoIPStatus>('/api/settings/geoip/status'),
      ])
      setGeoipSettings(settings)
      setGeoipStatus(status)
    } catch (err) {
      toast.error('Failed to load GeoIP settings')
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchGeoipSettings()
    }
  }, [fetchGeoipSettings, isAdmin])

  if (!isAdmin) {
    return <Navigate to="/settings/domains" replace />
  }

  async function handleSaveGeoipSettings() {
    if (!hasGeoipChanges) return

    setSavingGeoip(true)
    setGeoipResult(null)

    try {
      await fetchAPI('/api/settings/geoip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedGeoipSettings),
      })

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
      if (hasGeoipChanges) {
        await fetchAPI('/api/settings/geoip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editedGeoipSettings),
        })
        setEditedGeoipSettings({})
      }

      await fetchAPI('/api/settings/geoip/download', { method: 'POST' })

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
    <SettingsLayout title="GeoIP" description="Configure MaxMind GeoIP for visitor location data">
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
    </SettingsLayout>
  )
}
