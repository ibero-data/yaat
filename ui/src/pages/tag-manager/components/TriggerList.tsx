import { useState } from 'react'
import { useTriggers, useDeleteTrigger } from '@/hooks/useTagManager'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TriggerEditor } from './TriggerEditor'
import { TRIGGER_TYPE_LABELS } from './tag-templates'
import { Plus, Pencil, Trash2, Loader2, Zap } from 'lucide-react'
import type { TMTrigger } from '@/lib/types'

interface TriggerListProps {
  containerId: string
}

export function TriggerList({ containerId }: TriggerListProps) {
  const { data: triggers, isLoading } = useTriggers(containerId)
  const deleteTrigger = useDeleteTrigger(containerId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTrigger, setEditingTrigger] = useState<TMTrigger | undefined>()

  function handleAdd() {
    setEditingTrigger(undefined)
    setEditorOpen(true)
  }

  function handleEdit(trigger: TMTrigger) {
    setEditingTrigger(trigger)
    setEditorOpen(true)
  }

  function handleDelete(triggerId: string) {
    if (!confirm('Delete this trigger?')) return
    deleteTrigger.mutate(triggerId)
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
          <CardTitle className="text-base">Triggers</CardTitle>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Trigger
          </Button>
        </CardHeader>
        <CardContent>
          {!triggers || triggers.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No triggers yet. Add a trigger to control when tags fire.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {triggers.map((trigger) => (
                <div
                  key={trigger.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{trigger.name}</p>
                    <Badge variant="secondary" className="text-xs mt-1">
                      {TRIGGER_TYPE_LABELS[trigger.trigger_type] ?? trigger.trigger_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleEdit(trigger)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDelete(trigger.id)}
                      disabled={deleteTrigger.isPending}
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

      <TriggerEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        containerId={containerId}
        trigger={editingTrigger}
      />
    </>
  )
}
