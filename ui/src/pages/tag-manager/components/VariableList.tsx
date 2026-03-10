import { useState } from 'react'
import { useVariables, useDeleteVariable } from '@/hooks/useTagManager'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { VariableEditor } from './VariableEditor'
import { VARIABLE_TYPE_LABELS } from './tag-templates'
import { Plus, Pencil, Trash2, Loader2, Variable } from 'lucide-react'
import type { TMVariable } from '@/lib/types'

interface VariableListProps {
  containerId: string
}

export function VariableList({ containerId }: VariableListProps) {
  const { data: variables, isLoading } = useVariables(containerId)
  const deleteVariable = useDeleteVariable(containerId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingVariable, setEditingVariable] = useState<TMVariable | undefined>()

  function handleAdd() {
    setEditingVariable(undefined)
    setEditorOpen(true)
  }

  function handleEdit(variable: TMVariable) {
    setEditingVariable(variable)
    setEditorOpen(true)
  }

  function handleDelete(variableId: string) {
    if (!confirm('Delete this variable?')) return
    deleteVariable.mutate(variableId)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Variables</CardTitle>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Variable
          </Button>
        </CardHeader>
        <CardContent>
          {!variables || variables.length === 0 ? (
            <div className="text-center py-8">
              <Variable className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No variables yet. Variables let you capture dynamic values.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {variables.map((variable) => (
                <div
                  key={variable.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{variable.name}</p>
                    <Badge variant="secondary" className="text-xs mt-1">
                      {VARIABLE_TYPE_LABELS[variable.variable_type] ?? variable.variable_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleEdit(variable)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDelete(variable.id)}
                      disabled={deleteVariable.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <VariableEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        containerId={containerId}
        variable={editingVariable}
      />
    </>
  )
}
