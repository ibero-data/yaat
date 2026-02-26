import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { fetchAPI } from '@/lib/api'
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
  ChevronsLeft,
  ChevronsRight,
  FileX2,
  Database,
  Table2,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  History,
  Columns3,
  Hash,
  Type,
  ToggleLeft,
  Calendar,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { usePanelRef } from 'react-resizable-panels'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
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
-- Press Cmd+Enter to run. Click table/column names to insert.

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

const TYPE_ICONS: Record<string, typeof Hash> = {
  INTEGER: Hash,
  REAL: Hash,
  TEXT: Type,
  BOOLEAN: ToggleLeft,
  DATETIME: Calendar,
  BLOB: Columns3,
}

function getTypeIcon(type: string) {
  const upper = type.toUpperCase()
  for (const [key, icon] of Object.entries(TYPE_ICONS)) {
    if (upper.includes(key)) return icon
  }
  return Columns3
}

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
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sidebarRef = usePanelRef()
  const editorRef = useRef<any>(null)
  const executeQueryRef = useRef<(() => void) | null>(null)
  const schemaRef = useRef<TableSchema | null>(null)

  // Load query history
  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUERY_HISTORY_KEY)
      if (saved) setQueryHistory(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        sidebarRef.current?.collapse()
      }
    }
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Fetch schema for autocomplete
  useEffect(() => {
    if (isAdmin) {
      fetchAPI<TableSchema>('/api/explorer/schema')
        .then(data => {
          setSchema(data)
          const tables = Object.keys(data)
          if (tables.length > 0) {
            setExpandedTables(new Set([tables[0]]))
          }
        })
        .catch(() => {})
    }
  }, [isAdmin])

  useEffect(() => {
    schemaRef.current = schema
  }, [schema])

  const addToHistory = useCallback((q: string) => {
    const saved = localStorage.getItem(QUERY_HISTORY_KEY)
    let history: string[] = []
    try {
      history = saved ? JSON.parse(saved) : []
    } catch { /* ignore */ }
    const filtered = history.filter(h => h !== q)
    const newHistory = [q, ...filtered].slice(0, MAX_HISTORY)
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(newHistory))
    setQueryHistory(newHistory)
  }, [])

  const executeQuery = useCallback(async () => {
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await fetchAPI<QueryResult>('/api/explorer/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })

      setResult(data)
      addToHistory(query.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setLoading(false)
    }
  }, [query, addToHistory])

  executeQueryRef.current = executeQuery

  const insertAtCursor = useCallback((text: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    editor.trigger('keyboard', 'type', { text })
  }, [])

  const handleEditorMount = useCallback((editor: any, monaco: Monaco) => {
    editorRef.current = editor

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeQueryRef.current?.()
    })

    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: () => {
        const suggestions: any[] = []

        SQL_KEYWORDS.forEach(keyword => {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            detail: 'SQL Keyword',
          })
        })

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

  const toggleTable = useCallback((tableName: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev)
      if (next.has(tableName)) {
        next.delete(tableName)
      } else {
        next.add(tableName)
      }
      return next
    })
  }, [])

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
          return <span className="text-muted-foreground/50 italic">NULL</span>
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

  useEffect(() => {
    table.setPageSize(pageSize)
  }, [pageSize, table])

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
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      {/* Schema Sidebar — collapsible resizable panel */}
      <ResizablePanel
        panelRef={sidebarRef}
        defaultSize={20}
        minSize={10}
        collapsible
        collapsedSize={0}
        onResize={(size) => setSidebarOpen(size.asPercentage > 0)}
      >
      <div className="h-full flex flex-col bg-muted/30 overflow-hidden">
        {/* Schema header */}
        <div className="px-3 py-2.5 border-b flex items-center gap-2 shrink-0">
          <Database className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold whitespace-nowrap">Schema</span>
          {schema && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full ml-auto shrink-0">
              {Object.keys(schema).length}
            </span>
          )}
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {schema ? (
            Object.entries(schema)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([tableName, cols]) => {
                const isExpanded = expandedTables.has(tableName)
                return (
                  <div key={tableName}>
                    <button
                      onClick={() => toggleTable(tableName)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-muted transition-colors group"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRightIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <Table2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-medium text-foreground truncate text-left">{tableName}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              insertAtCursor(tableName)
                            }}
                            className="ml-auto opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-primary transition-all px-1 shrink-0 cursor-pointer"
                          >
                            insert
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Insert into editor</TooltipContent>
                      </Tooltip>
                    </button>

                    {isExpanded && (
                      <div className="pb-1">
                        {cols.map(col => {
                          const TypeIcon = getTypeIcon(col.type)
                          return (
                            <button
                              key={col.name}
                              onClick={() => insertAtCursor(col.name)}
                              className="w-full flex items-center gap-1.5 pl-8 pr-3 py-[3px] text-xs hover:bg-muted transition-colors"
                              title={`${col.name} (${col.type}) — click to insert`}
                            >
                              <TypeIcon className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                              <span className="font-mono text-foreground/80 truncate text-left">{col.name}</span>
                              <span className="ml-auto text-muted-foreground/50 text-[10px] shrink-0 font-mono">{col.type}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
          ) : (
            <div className="px-3 py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Loading schema...</p>
            </div>
          )}
        </div>
      </div>
      </ResizablePanel>

      <ResizableHandle withHandle className="hover:bg-primary/10 transition-colors data-[resize-handle-active]:bg-primary/20" />

      {/* Main Content */}
      <ResizablePanel defaultSize={80} className="min-h-0 overflow-hidden">
      <div className="flex flex-col min-w-0 min-h-0 h-full">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b flex items-center gap-2 bg-background shrink-0">
          {/* Toggle sidebar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => {
                  if (sidebarRef.current?.isCollapsed()) {
                    sidebarRef.current.expand()
                  } else {
                    sidebarRef.current?.collapse()
                  }
                }}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarOpen ? 'Hide schema' : 'Show schema'}</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border" />

          <Button
            onClick={executeQuery}
            disabled={loading || !query.trim()}
            size="sm"
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </Button>

          <span className="text-xs text-muted-foreground hidden sm:inline">
            <kbd className="px-1 py-0.5 text-[10px] font-semibold bg-muted border rounded">⌘↵</kbd>
          </span>

          {/* Stats */}
          {result && !loading && (
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground ml-1">
              <span className="font-medium tabular-nums">
                {totalRows.toLocaleString()} rows{totalRows === 1000 && <span className="text-yellow-600 ml-1">(limit reached)</span>}
              </span>
              <span className="flex items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3" />
                {result.duration_ms}ms
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* History */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-8">
                <History className="h-3.5 w-3.5" />
                <span className="hidden md:inline">History</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-y-auto">
              <DropdownMenuLabel>Recent Queries</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {queryHistory.length > 0 ? (
                queryHistory.map((q, i) => (
                  <DropdownMenuItem
                    key={i}
                    onClick={() => setQuery(q)}
                    className="cursor-pointer"
                  >
                    <span className="font-mono text-xs truncate block w-full">
                      {q.replace(/\s+/g, ' ').slice(0, 80)}
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No query history yet
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          {result && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8">
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Export</span>
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
          )}
        </div>

        {/* Editor + Results — single vertical resizable split */}
        <ResizablePanelGroup orientation="vertical" className="flex-1 min-h-0">
          {/* Editor */}
          <ResizablePanel defaultSize={40} minSize={15}>
            <div className="h-full overflow-hidden">
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
                  renderLineHighlight: 'line',
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                }}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Results */}
          <ResizablePanel defaultSize={60} minSize={15} className="min-h-0">
            <div className="h-full flex flex-col overflow-hidden min-w-0">
              {/* Error */}
              {error && (
                <div className="m-3 p-3 rounded-lg border border-destructive/50 bg-destructive/5 flex items-start gap-3 shrink-0">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-destructive">Query Error</p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{error}</p>
                  </div>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Running query...</p>
                </div>
              )}

              {/* Empty */}
              {!loading && !error && !result && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <FileX2 className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Run a query to see results</p>
                </div>
              )}

              {/* Results table */}
              {!loading && !error && result && (
                <>
                  {/* Filter bar */}
                  <div className="px-3 py-1.5 border-b flex items-center gap-3 bg-muted/20 shrink-0">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Filter results..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pl-7 h-7 text-xs"
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="flex-1 overflow-auto min-h-0 min-w-0">
                    <table className="w-max min-w-full text-sm">
                      <thead className="bg-background sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium whitespace-nowrap border-b bg-background text-muted-foreground text-xs w-10 sticky left-0 z-20">#</th>
                          {table.getHeaderGroups().map(headerGroup => (
                            headerGroup.headers.map(header => (
                              <th
                                key={header.id}
                                className="px-3 py-2 text-left font-medium whitespace-nowrap border-b bg-background text-xs"
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
                            className={`hover:bg-primary/5 transition-colors ${i % 2 === 1 ? 'bg-muted/20' : ''}`}
                          >
                            <td className={`px-3 py-1.5 whitespace-nowrap border-b border-border/30 text-muted-foreground/50 tabular-nums sticky left-0 z-10 ${i % 2 === 1 ? 'bg-muted' : 'bg-background'}`}>
                              {currentPage * pageSize + i + 1}
                            </td>
                            {row.getVisibleCells().map(cell => (
                              <td
                                key={cell.id}
                                className="px-3 py-1.5 whitespace-nowrap border-b border-border/30 max-w-[400px] truncate"
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {table.getRowModel().rows.length === 0 && (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        {globalFilter ? 'No results match your filter' : 'Query returned no results'}
                      </div>
                    )}
                  </div>

                  {/* Pagination */}
                  <div className="px-3 py-1.5 border-t flex items-center justify-between bg-background shrink-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Rows:</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(value) => setPageSize(Number(value))}
                      >
                        <SelectTrigger className="h-7 w-[70px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="250">250</SelectItem>
                          <SelectItem value="500">500</SelectItem>
                          <SelectItem value="1000">1000</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <span className="text-xs text-muted-foreground tabular-nums">
                      Showing {Math.min(currentPage * pageSize + 1, totalRows)}-{Math.min((currentPage + 1) * pageSize, totalRows)} of {totalRows.toLocaleString()}
                    </span>

                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                      >
                        <ChevronsLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums px-1.5">
                        {currentPage + 1} / {pageCount || 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                      >
                        <ChevronsRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
