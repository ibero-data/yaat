import { useState } from 'react'
import { useTags, useTriggers, useDeleteTag } from '@/hooks/useTagManager'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TagEditor } from './TagEditor'
import { getTemplate } from './tag-templates'
import { Plus, Pencil, Trash2, Loader2, Code } from 'lucide-react'
import type { TMTag } from '@/lib/types'

interface TagListProps {
  containerId: string
}

export function TagList({ containerId }: TagListProps) {
  const { data: tags, isLoading } = useTags(containerId)
  const { data: triggers } = useTriggers(containerId)
  const deleteTag = useDeleteTag(containerId)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TMTag | undefined>()

  function handleAdd() {
    setEditingTag(undefined)
    setEditorOpen(true)
  }

  function handleEdit(tag: TMTag) {
    setEditingTag(tag)
    setEditorOpen(true)
  }

  function handleDelete(tagId: string) {
    if (!confirm('Delete this tag?')) return
    deleteTag.mutate(tagId)
  }

  function getTriggerCount(tag: TMTag): number {
    return tag.trigger_ids?.length ?? 0
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
          <CardTitle className="text-base">Tags</CardTitle>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Tag
          </Button>
        </CardHeader>
        <CardContent>
          {!tags || tags.length === 0 ? (
            <div className="text-center py-8">
              <Code className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No tags yet. Add your first tag to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => {
                const template = getTemplate(tag.tag_type)
                return (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Switch
                        checked={tag.is_enabled}
                        disabled
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{tag.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-xs">
                            {template?.name ?? tag.tag_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {tag.consent_category}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getTriggerCount(tag)} trigger{getTriggerCount(tag) !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleEdit(tag)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(tag.id)}
                        disabled={deleteTag.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TagEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        containerId={containerId}
        tag={editingTag}
        triggers={triggers ?? []}
      />
    </>
  )
}
