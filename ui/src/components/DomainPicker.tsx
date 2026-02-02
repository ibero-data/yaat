import { ChevronsUpDown, Globe, Check, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDomain } from '@/contexts/DomainContext'

export function DomainPicker() {
  const { domains, selectedDomain, setSelectedDomain, loading } = useDomain()

  if (loading) {
    return (
      <Button variant="outline" className="w-full justify-start" disabled>
        <Globe className="mr-2 h-4 w-4" />
        Loading...
      </Button>
    )
  }

  if (domains.length === 0) {
    return (
      <Button variant="outline" className="w-full justify-start" asChild>
        <Link to="/settings">
          <Plus className="mr-2 h-4 w-4" />
          Add Domain
        </Link>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2 truncate">
            <Globe className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {selectedDomain ? selectedDomain.name : 'All Domains'}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuItem onClick={() => setSelectedDomain(null)}>
          <Globe className="mr-2 h-4 w-4" />
          <span>All Domains</span>
          {!selectedDomain && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {domains.map((domain) => (
          <DropdownMenuItem
            key={domain.id}
            onClick={() => setSelectedDomain(domain)}
          >
            <Globe className="mr-2 h-4 w-4" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="truncate">{domain.name}</span>
              <span className="text-xs text-muted-foreground truncate">
                {domain.domain}
              </span>
            </div>
            {selectedDomain?.id === domain.id && (
              <Check className="ml-2 h-4 w-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            <span>Manage Domains</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
