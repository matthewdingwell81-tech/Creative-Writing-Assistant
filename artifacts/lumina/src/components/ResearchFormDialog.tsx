import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useResearch } from '@/hooks/use-research';
import { uploadFile } from '@/lib/upload';
import type { Chapter } from '@/types/schema';
import type { ResearchItem } from '@/hooks/use-research';
import { Loader2 } from 'lucide-react';

interface ResearchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: number;
  chapters: Chapter[];
  defaultChapterId?: number | null;
  mode: 'create' | 'edit';
  initialData?: ResearchItem | null;
}

export function ResearchFormDialog({
  open,
  onOpenChange,
  documentId,
  chapters,
  defaultChapterId,
  mode,
  initialData,
}: ResearchFormDialogProps) {
  const [type, setType] = useState<'text' | 'link' | 'image'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isGlobal, setIsGlobal] = useState(true);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { create, update } = useResearch(documentId);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setType(initialData.type);
        setTitle(initialData.title || '');
        setContent(initialData.content || '');
        setUrl(initialData.url || '');
        setTagsInput((initialData.tags || []).join(', '));
        setIsGlobal(initialData.isGlobal);
        setSelectedChapters(initialData.chapterIds || []);
        setFile(null);
      } else {
        setType('text');
        setTitle('');
        setContent('');
        setUrl('');
        setTagsInput('');
        setIsGlobal(defaultChapterId ? false : true);
        setSelectedChapters(defaultChapterId ? [defaultChapterId] : []);
        setFile(null);
      }
      setError(null);
    }
  }, [open, mode, initialData, defaultChapterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    
    if (type === 'link') {
      try {
        new URL(url.trim());
      } catch {
        setError('A valid URL is required for link entries');
        return;
      }
    }

    if (type === 'image' && mode === 'create' && !file) {
      setError('An image file is required for image entries');
      return;
    }

    if (!isGlobal && selectedChapters.length === 0) {
      setError('Chapter-scoped items must be attached to at least one chapter');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    
    try {
      let objectPath = null;
      let size = null;
      let mimeType = null;
      
      if (type === 'image' && file) {
        const uploadResult = await uploadFile(file);
        objectPath = uploadResult.objectPath;
        size = uploadResult.size;
        mimeType = uploadResult.mimeType;
      }

      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      
      const payload: any = {
        title: title.trim(),
        tags,
        isGlobal,
        important: initialData?.important || false,
        favorite: initialData?.favorite || false,
      };

      if (type === 'text') payload.content = content.trim();
      if (type === 'link') payload.url = url.trim();
      if (type === 'image' && file) {
        payload.objectPath = objectPath;
        payload.size = size;
        payload.mimeType = mimeType;
      }
      
      if (mode === 'create') {
        payload.type = type;
        payload.chapterIds = isGlobal ? [] : selectedChapters;
        await create.mutateAsync(payload);
      } else if (initialData) {
        await update.mutateAsync({ 
          id: initialData.id, 
          data: payload,
          chapterIds: isGlobal ? [] : selectedChapters,
          originalChapterIds: initialData.isGlobal ? [] : (initialData.chapterIds || [])
        });
      }
      
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleChapter = (id: number) => {
    setSelectedChapters(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto" data-testid="research-form-dialog">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add to Library' : 'Edit Item'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Create a new reference note, link, or image.' : 'Update your reference item.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-5 py-4">
          {mode === 'create' && (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger data-testid="select-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text Note</SelectItem>
                  <SelectItem value="link">Web Link</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder={type === 'text' ? 'Character background...' : 'Reference name...'} 
              autoFocus
              data-testid="input-title"
            />
          </div>

          {type === 'text' && (
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea 
                value={content} 
                onChange={e => setContent(e.target.value)} 
                className="min-h-[120px]" 
                placeholder="Write your notes here..."
                data-testid="input-content"
              />
            </div>
          )}

          {type === 'link' && (
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input 
                value={url} 
                onChange={e => setUrl(e.target.value)} 
                placeholder="https://..." 
                type="url"
                data-testid="input-url"
              />
            </div>
          )}

          {type === 'image' && (
            <div className="space-y-1.5">
              <Label>Image File</Label>
              {mode === 'edit' && initialData?.objectPath && !file ? (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  Image already uploaded. Upload a new file to replace it.
                </div>
              ) : null}
              <Input 
                type="file" 
                accept="image/*" 
                onChange={e => setFile(e.target.files?.[0] || null)} 
                data-testid="input-file"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tags (comma separated)</Label>
            <Input 
              value={tagsInput} 
              onChange={e => setTagsInput(e.target.value)} 
              placeholder="worldbuilding, magic, characters" 
              data-testid="input-tags"
            />
          </div>

          <div className="space-y-3 pt-2">
            <Label>Scope</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={isGlobal} onChange={() => setIsGlobal(true)} className="accent-primary" data-testid="radio-global" />
                Global (All Chapters)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={!isGlobal} onChange={() => setIsGlobal(false)} className="accent-primary" data-testid="radio-chapter" />
                Specific Chapters
              </label>
            </div>

            {!isGlobal && chapters.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-2 bg-muted/30 p-3 rounded-md max-h-[160px] overflow-y-auto border">
                {chapters.map(ch => (
                  <label key={ch.id} className="flex items-start gap-2 text-sm">
                    <Checkbox 
                      checked={selectedChapters.includes(ch.id)} 
                      onCheckedChange={() => toggleChapter(ch.id)}
                      data-testid={`checkbox-chapter-${ch.id}`}
                    />
                    <span className="leading-none">{ch.title || 'Untitled Chapter'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <div className="text-sm text-destructive font-medium" data-testid="form-error">{error}</div>}
          
          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting} data-testid="btn-cancel-research">Cancel</Button>
            <Button type="submit" disabled={isSubmitting} data-testid="button-submit-research">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'create' ? 'Save to Library' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
