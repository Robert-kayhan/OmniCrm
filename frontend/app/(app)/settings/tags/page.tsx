'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Tags, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/shell/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { TagChip } from '@/components/ui/tag-chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { api, ApiError } from '@/lib/api';
import { PERMISSIONS, useAuth } from '@/lib/auth';
import { useTags } from '@/lib/hooks';
import { queryKeys } from '@/lib/query-keys';

const PRESET_COLORS = [
  '#2563eb',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#7c3aed',
  '#db2777',
  '#64748b',
];

export default function TagsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: tags, isLoading } = useTags();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0] as string);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.TAG_MANAGE);

  const create = useMutation({
    mutationFn: () => api.tags.create({ name: name.trim(), color }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      setOpen(false);
      setName('');
      setError(null);
      toast.success('Tag created');
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the tag');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.tags.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags });
      toast.success('Tag deleted');
    },
    onError: () => toast.error('Could not delete the tag'),
  });

  return (
    <>
      <Topbar
        title="Tags"
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-3.5" />
              New tag
            </Button>
          ) : null
        }
      />

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Tags are shared across the workspace and can be applied to both customers and
            conversations. Names are normalised to upper snake case, so{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">hot lead</code> and{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">Hot Lead</code> collapse into
            one tag.
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14" />
              ))}
            </div>
          ) : !tags || tags.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No tags yet"
              description="Create tags to categorise conversations and filter the inbox."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {tags.map((tag) => (
                <li key={tag.id} className="flex items-center gap-3 p-3">
                  <TagChip tag={tag} />
                  <div className="min-w-0 flex-1">
                    {tag.description ? (
                      <p className="truncate text-sm">{tag.description}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {tag.conversationCount} conversations · {tag.customerCount} customers
                    </p>
                  </div>

                  {canManage ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Delete tag ${tag.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {tag.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            It will be removed from {tag.conversationCount} conversations and{' '}
                            {tag.customerCount} customers. Nothing else is deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(tag.id)}>
                            Delete tag
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
            <DialogDescription>
              Pick a name and a colour. The colour is used everywhere the tag appears.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Hot lead"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    aria-label={`Use colour ${preset}`}
                    aria-pressed={color === preset}
                    className="size-7 rounded-full ring-offset-2 ring-offset-background transition-all data-[selected=true]:ring-2"
                    data-selected={color === preset}
                    style={{ backgroundColor: preset, boxShadow: color === preset ? `0 0 0 2px ${preset}` : undefined }}
                  />
                ))}
              </div>
            </div>

            {name.trim() ? (
              <div className="rounded-lg border border-dashed p-3">
                <p className="mb-1.5 text-xs text-muted-foreground">Preview</p>
                <TagChip tag={{ id: 'preview', name: name.trim().toUpperCase().replace(/\s+/g, '_'), color }} />
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              {create.isPending ? <Spinner /> : null}
              Create tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
