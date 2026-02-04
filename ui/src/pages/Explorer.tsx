import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Play,
  Loader2,
  AlertCircle,
  Clock,
  Download,
  Search,
  FileJson,
  FileSpreadsheet,
  Copy,
  ChevronLeft,
  ChevronRight,
  FileX2,
  HelpCircle,
  Database,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import Editor, { type Monaco } from '@monaco-editor/react'
import { useTheme } from '@/components/theme/theme-provider'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'

interface QueryResult {
  columns: string[]
  rows: (string | number | boolean | null)[][]
  row_count: number
  duration_ms: number
}

interface TableSchema {
  [tableName: string]: { name: string; type: string }[]
}

const DEFAULT_QUERY = `-- Welcome to the Data Explorer!
-- Write SQL queries to analyze your analytics data.
-- Only SELECT queries are allowed (read-only).

SELECT
  domain,
  path,
  COUNT(*) as pageviews,
  COUNT(DISTINCT session_id) as sessions
FROM events
WHERE event_type = 'pageview'
  AND timestamp > strftime('%s', 'now', '-7 days') * 1000
GROUP BY domain, path
ORDER BY pageviews DESC
LIMIT 100`

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'IS', 'NULL', 'AS', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
  'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'HAVING',
  'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'UNION', 'ALL', 'EXISTS', 'COALESCE', 'CAST', 'WITH',
]

const QUERY_HISTORY_KEY = 'yaat-explorer-history'
const MAX_HISTORY = 10

export function Explorer() {
  const { isAdmin } = useAuth()
  const { theme } = useTheme()
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [schema, setSchema] = useState<TableSchema | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [schemaOpen, setSchemaOpen] = useState(false)
  const editorRef = useRef<any>(null)
  const executeQueryRef = useRef<(() => void) | null>(null)
  const schemaRef = useRef<TableSchema | null>(null)

  // Fetch schema for autocomplete
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/explorer/schema', { credentials: 'include' })
        .then(res => res.json())
        .then(data => setSchema(data))
        .catch(() => {})
    }
  }, [isAdmin])

  // Keep schema ref in sync for Monaco autocomplete
  useEffect(() => {
    schemaRef.current = schema
  }, [schema])

  const addToHistory = useCallback((q: string) => {
    const saved = localStorage.getItem(QUERY_HISTORY_KEY)
    let history: string[] = []
    try {
      history = saved ? JSON.parse(saved) : []
    } catch {
      // ignore
    }
    const filtered = history.filter(h => h !== q)
    const newHistory = [q, ...filtered].slice(0, MAX_HISTORY)
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(newHistory))
  }, [])

  const executeQuery = useCallback(async () => {
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/explorer/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: query.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Query failed')
      }

      setResult(data)
      addToHistory(query.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setLoading(false)
    }
  }, [query, addToHistory])

  // Store in ref for Monaco callback
  executeQueryRef.current = executeQuery

  const handleEditorMount = useCallback((editor: any, monaco: Monaco) => {
    editorRef.current = editor

    // Add Cmd+Enter shortcut to execute query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeQueryRef.current?.()
    })

    // Register SQL completions - reads from ref so it always has current schema
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: () => {
        const suggestions: any[] = []

        // Add SQL keywords
        SQL_KEYWORDS.forEach(keyword => {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            detail: 'SQL Keyword',
          })
        })

        // Add table and column names from schema
        const currentSchema = schemaRef.current
        if (currentSchema) {
          Object.keys(currentSchema).forEach(table => {
            suggestions.push({
              label: table,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: table,
              detail: 'Table',
            })

            currentSchema[table].forEach(col => {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${col.type} (${table})`,
              })
            })
          })
        }

        return { suggestions }
      },
    })
  }, [])

  // Convert result to table data
  const tableData = useMemo(() => {
    if (!result) return []
    return result.rows.map(row => {
      const obj: Record<string, any> = {}
      result.columns.forEach((col, i) => {
        obj[col] = row[i]
      })
      return obj
    })
  }, [result])

  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    if (!result) return []
    return result.columns.map(col => ({
      accessorKey: col,
      header: col,
      cell: ({ getValue }) => {
        const value = getValue()
        if (value === null) {
          return <span className="text-muted-foreground italic">NULL</span>
        }
        if (typeof value === 'boolean') {
          return <span className={value ? 'text-green-600' : 'text-red-600'}>{String(value)}</span>
        }
        return String(value)
      },
    }))
  }, [result])

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      globalFilter,
      pagination: {
        pageIndex: 0,
        pageSize,
      },
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
  })

  // Reset pagination when pageSize changes
  useEffect(() => {
    table.setPageSize(pageSize)
  }, [pageSize, table])

  // Export functions
  const downloadFile = (content: string, type: string, filename: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportToCSV = () => {
    if (!result) return
    const headers = result.columns.join(',')
    const rows = result.rows.map(row =>
      row.map(v => {
        if (v === null) return ''
        const str = String(v)
        return /[,"\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
    ).join('\n')
    downloadFile(`${headers}\n${rows}`, 'text/csv', `yaat-export-${new Date().toISOString().slice(0, 19)}.csv`)
  }

  const exportToJSON = () => {
    if (!result) return
    const data = result.rows.map(row =>
      Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
    )
    downloadFile(JSON.stringify(data, null, 2), 'application/json', `yaat-export-${new Date().toISOString().slice(0, 19)}.json`)
  }

  const copyToClipboard = async () => {
    if (!result) return
    const data = result.rows.map(row =>
      Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
    )
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  const editorTheme = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'vs-dark'
    : 'light'

  const totalRows = result?.row_count ?? 0
  const pageCount = table.getPageCount()
  const currentPage = table.getState().pagination.pageIndex

  return (
    <div className="h-full w-full flex flex-col min-w-0">
      {/* Header */}
      <div className="px-6 py-4 border-b shrink-0 bg-background">
        <h1 className="text-2xl font-bold">Data Explorer</h1>
        <p className="text-muted-foreground text-sm">Query your analytics data with SQL</p>
      </div>

      {/* Main content */}
      <ResizablePanelGroup orientation="vertical" className="flex-1">
        {/* Editor Panel */}
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="h-full flex flex-col">
            {/* Editor header */}
            <div className="px-4 py-2 border-b flex items-center justify-between bg-background shrink-0">
              <span className="text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted border rounded">Cmd+Enter</kbd> to run
              </span>
              <div className="flex items-center gap-2">
                <Sheet open={schemaOpen} onOpenChange={setSchemaOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <HelpCircle className="h-4 w-4" />
                      Schema
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto px-2">
                    <SheetHeader>
                      <SheetTitle>Database Schema</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4 space-y-6">
                      {schema && Object.entries(schema).sort(([a], [b]) => a.localeCompare(b)).map(([tableName, columns]) => (
                        <div key={tableName}>
                          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                            <Database className="h-4 w-4 text-primary" />
                            {tableName}
                          </h3>
                          <div className="bg-muted rounded-md p-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left pb-2">Column</th>
                                  <th className="text-left pb-2">Type</th>
                                </tr>
                              </thead>
                              <tbody className="font-mono">
                                {columns.map(col => (
                                  <tr key={col.name}>
                                    <td className="py-0.5">{col.name}</td>
                                    <td className="py-0.5 text-muted-foreground">{col.type}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
                <Button
                  onClick={executeQuery}
                  disabled={loading || !query.trim()}
                  size="sm"
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Run Query
                </Button>
              </div>
            </div>
            {/* Monaco Editor - overflow-hidden for proper resize */}
            <div className="flex-1 overflow-hidden">
              <Editor
                height="100%"
                language="sql"
                theme={editorTheme}
                value={query}
                onChange={(value) => setQuery(value || '')}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Results Panel */}
        <ResizablePanel defaultSize={60} minSize={20}>
          <div className="h-full flex flex-col overflow-hidden">
            {/* Error State */}
            {error && (
              <div className="m-4 p-4 rounded-lg border border-destructive/50 bg-destructive/5 flex items-start gap-3 shrink-0">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Query Error</p>
                  <p className="text-sm text-muted-foreground mt-1 font-mono">{error}</p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Running query...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && !result && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <FileX2 className="h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Run a query to see results</p>
              </div>
            )}

            {/* Results */}
            {!loading && !error && result && (
              <>
                {/* Toolbar */}
                <div className="px-4 py-2 border-b flex items-center gap-4 bg-background shrink-0">
                  {/* Search */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search results..."
                      value={globalFilter}
                      onChange={(e) => setGlobalFilter(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-medium">{totalRows.toLocaleString()} rows</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {result.duration_ms}ms
                    </span>
                  </div>

                  {/* Export */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={exportToCSV}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Download CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportToJSON}>
                        <FileJson className="h-4 w-4 mr-2" />
                        Download JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={copyToClipboard}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy to Clipboard
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-background sticky top-0 z-10">
                      <tr>
                        {table.getHeaderGroups().map(headerGroup => (
                          headerGroup.headers.map(header => (
                            <th
                              key={header.id}
                              className="px-4 py-2 text-left font-medium whitespace-nowrap border-b bg-background"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </th>
                          ))
                        ))}
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs">
                      {table.getRowModel().rows.map((row, i) => (
                        <tr
                          key={row.id}
                          className={`hover:bg-muted/30 ${i % 2 === 1 ? 'bg-muted/10' : ''}`}
                        >
                          {row.getVisibleCells().map(cell => (
                            <td
                              key={cell.id}
                              className="px-4 py-2 whitespace-nowrap border-b border-border/50"
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {table.getRowModel().rows.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      {globalFilter ? 'No results match your search' : 'Query returned no results'}
                    </div>
                  )}
                </div>

                {/* Pagination */}
                <div className="px-4 py-2 border-t flex items-center justify-between bg-background shrink-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Rows per page:</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(value) => setPageSize(Number(value))}
                    >
                      <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage + 1} of {pageCount || 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
