interface SettingsLayoutProps {
  title: string
  description: string
  children: React.ReactNode
}

export function SettingsLayout({ title, description, children }: SettingsLayoutProps) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-6">
        {children}
      </div>
    </div>
  )
}
