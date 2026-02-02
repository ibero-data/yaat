import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom'
import { LicenseProvider } from './hooks/useLicense'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { DomainProvider } from './contexts/DomainContext'
import { ThemeProvider, useTheme } from './components/theme/theme-provider'
import { Dashboard } from './components/Dashboard'
import { LicenseSettings } from './components/LicenseSettings'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { BotAnalysis } from './pages/BotAnalysis'
import { AdFraud } from './pages/AdFraud'
import { Users } from './pages/Users'
import { DomainPicker } from './components/DomainPicker'
import { FeatureBadge } from './components/FeatureGate'
import { BarChart3, Settings as SettingsIcon, Key, LogOut, Moon, Sun, Monitor, Bot, ShieldAlert, Users as UsersIcon, ChevronsUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from './components/ui/sidebar'
import './index.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, setupRequired } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (setupRequired) {
    return <Navigate to="/login?onboarding=true" replace />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, setupRequired } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (isAuthenticated && !setupRequired) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="sm"
          className="w-full"
          tooltip="Theme"
        >
          {theme === 'dark' ? (
            <Moon className="h-4 w-4" />
          ) : theme === 'light' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
          {!isCollapsed && <span className="capitalize">{theme}</span>}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-40">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const handleLogout = async () => {
    await logout()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="w-full"
          tooltip={user?.email}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          {!isCollapsed && (
            <>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-sm font-medium truncate w-full">
                  {user?.name || user?.email}
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {user?.role}
                </span>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </>
          )}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user?.name || user?.email}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppSidebar() {
  const location = useLocation()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'
  const [version, setVersion] = useState<string>('...')

  useEffect(() => {
    fetch('/api/version')
      .then(res => res.json())
      .then(data => setVersion(data.version))
      .catch(() => setVersion('dev'))
  }, [])

  const navigation = [
    { path: '/', name: 'Dashboard', icon: BarChart3 },
    { path: '/bots', name: 'Bot Analysis', icon: Bot },
    { path: '/fraud', name: 'Ad Fraud', icon: ShieldAlert, pro: 'ad_fraud' },
    { path: '/users', name: 'Users', icon: UsersIcon, pro: 'multi_user' },
    { path: '/settings', name: 'Settings', icon: SettingsIcon },
    { path: '/license', name: 'License', icon: Key },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <img src="/logo.png" alt="YAAT" className="h-8 w-8 shrink-0" />
                {!isCollapsed && (
                  <div className="flex flex-col items-start">
                    <span className="font-bold">YAAT </span>
                    <span className="text-xs text-muted-foreground">Analytics</span>
                  </div>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Domain picker - only show when expanded */}
      {!isCollapsed && (
        <div className="p-2 border-b border-sidebar-border">
          <DomainPicker />
        </div>
      )}

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.path}
                    tooltip={item.name}
                  >
                    <Link to={item.path}>
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.name}</span>
                      {item.pro && !isCollapsed && <FeatureBadge feature={item.pro} />}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeSelector />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
        {!isCollapsed && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {version}
          </p>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <span className="font-semibold">YAAT </span>
        </header>
        <main className="flex-1">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/bots" element={<BotAnalysis />} />
              <Route path="/fraud" element={<AdFraud />} />
              <Route path="/users" element={<Users />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/license" element={
                <div className="p-6">
                  <LicenseSettings />
                </div>
              } />
            </Routes>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="yaat-ui-theme">
      <BrowserRouter>
        <AuthProvider>
          <LicenseProvider>
            <DomainProvider>
              <Routes>
                <Route path="/login" element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                } />
                <Route path="/*" element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                } />
              </Routes>
            </DomainProvider>
          </LicenseProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
