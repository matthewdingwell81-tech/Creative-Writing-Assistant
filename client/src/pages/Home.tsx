import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Editor from '@/components/Editor';
import SuggestionsSidebar from '@/components/SuggestionsSidebar';
import DocumentList from '@/components/DocumentList';
import GoogleDocsDialog from '@/components/GoogleDocsDialog';
import { Sparkles, BookOpen, Settings, PanelLeftClose, PanelLeft, FilePlus, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { fetchDocuments, fetchDocument, createDocument, updateDocument } from '@/lib/api';
import { useSuggestions, type Suggestion } from '@/hooks/useSuggestions';
import { useAutoSave } from '@/hooks/useAutoSave';
import type { Document } from '@shared/schema';

export default function Home() {
  const queryClient = useQueryClient();
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('fiction');
  const [showDocList, setShowDocList] = useState(false);
  const [gdocsMode, setGdocsMode] = useState<'import' | 'export'>('import');
  const [gdocsOpen, setGdocsOpen] = useState(false);

  const { suggestions, loading: suggestionsLoading, requestSuggestions } = useSuggestions();
  const { save, saving, lastSaved } = useAutoSave(activeDocId);

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
    queryFn: fetchDocuments,
  });

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: (doc: Document) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setActiveDocId(doc.id);
      setContent(doc.content);
      setTitle(doc.title);
      setDocumentType(doc.documentType);
    },
  });

  // Load the most recent document on first visit
  useEffect(() => {
    if (!activeDocId && documents.length > 0) {
      const doc = documents[0];
      setActiveDocId(doc.id);
      setContent(doc.content);
      setTitle(doc.title);
      setDocumentType(doc.documentType);
    }
  }, [documents, activeDocId]);

  const handleSelectDoc = useCallback(async (id: number) => {
    try {
      const doc = await fetchDocument(id);
      setActiveDocId(doc.id);
      setContent(doc.content);
      setTitle(doc.title);
      setDocumentType(doc.documentType);
      setShowDocList(false);
    } catch (e) {
      console.error("Failed to load document:", e);
    }
  }, []);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    save(newContent, title);
    requestSuggestions(newContent, documentType);
  }, [save, title, requestSuggestions, documentType]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    if (activeDocId) {
      updateDocument(activeDocId, { title: newTitle });
    }
  }, [activeDocId]);

  const applySuggestion = useCallback((originalText: string, newText: string) => {
    if (!content) return;
    const updatedContent = content.replace(originalText, newText);
    setContent(updatedContent);
    save(updatedContent, title);
    // Re-trigger suggestions after applying
    setTimeout(() => requestSuggestions(updatedContent, documentType), 500);
  }, [content, save, title, requestSuggestions, documentType]);

  const handleNewDocument = useCallback(() => {
    createMutation.mutate({ title: 'Untitled', content: '', documentType: 'fiction' });
  }, [createMutation]);

  const handleExport = useCallback(() => {
    const plainText = content.replace(/<[^>]*>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'document'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, title]);

  const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="h-14 border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setShowDocList(!showDocList)}
            data-testid="toggle-doc-list"
          >
            {showDocList ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="w-5 h-5" />
            <span className="font-semibold tracking-tight text-lg">Lumina</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Select value={documentType} onValueChange={(v) => { setDocumentType(v); if (activeDocId) updateDocument(activeDocId, { documentType: v }); }}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-doc-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fiction">Fiction</SelectItem>
              <SelectItem value="nonfiction">Non-Fiction</SelectItem>
              <SelectItem value="essay">Essay</SelectItem>
              <SelectItem value="blog">Blog Post</SelectItem>
              <SelectItem value="script">Script</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium" data-testid="save-status">
            {saving ? 'Saving...' : lastSaved ? 'Saved' : 'Ready'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => { setGdocsMode('import'); setGdocsOpen(true); }}
            title="Import from Google Docs"
            data-testid="btn-import-gdocs"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleNewDocument}
            data-testid="btn-new-doc"
          >
            <FilePlus className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-full px-6"
                data-testid="btn-export-menu"
              >
                <Upload className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport} data-testid="btn-export-txt">
                <Download className="w-4 h-4 mr-2" />
                Download as .txt
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { setGdocsMode('export'); setGdocsOpen(true); }}
                data-testid="btn-export-gdocs"
              >
                <Upload className="w-4 h-4 mr-2" />
                Export to Google Docs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {showDocList && (
          <aside className="w-[260px] border-r border-border/50 bg-card/30 overflow-y-auto">
            <DocumentList
              documents={documents}
              activeId={activeDocId}
              onSelect={handleSelectDoc}
              onNew={handleNewDocument}
            />
          </aside>
        )}

        <div className="flex-1 overflow-y-auto relative">
          <div className="max-w-3xl mx-auto px-8 py-12">
            {activeDocId ? (
              <Editor
                content={content}
                setContent={handleContentChange}
                title={title}
                setTitle={handleTitleChange}
              />
            ) : (
              <div className="text-center py-32">
                <Sparkles className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                <h2 className="text-xl font-medium text-muted-foreground mb-2">Welcome to Lumina</h2>
                <p className="text-sm text-muted-foreground/70 mb-6">Create a new document to start writing</p>
                <Button onClick={handleNewDocument} className="bg-primary text-primary-foreground" data-testid="btn-create-first">
                  <FilePlus className="w-4 h-4 mr-2" /> New Document
                </Button>
              </div>
            )}
          </div>
          {activeDocId && (
            <div className="fixed bottom-6 left-1/2 -translate-x-[calc(50%+190px)] text-xs text-muted-foreground/60 font-medium tracking-wide" data-testid="word-count">
              {wordCount} words
            </div>
          )}
        </div>

        {activeDocId && (
          <aside className="w-[380px] border-l border-border/50 bg-card/30 backdrop-blur flex flex-col">
            <SuggestionsSidebar
              suggestions={suggestions}
              loading={suggestionsLoading}
              onApplySuggestion={applySuggestion}
              documentContent={content}
              documentType={documentType}
            />
          </aside>
        )}
      </main>

      <GoogleDocsDialog
        open={gdocsOpen}
        onOpenChange={setGdocsOpen}
        mode={gdocsMode}
        activeDocId={activeDocId}
        activeDocTitle={title}
        onImported={(doc) => {
          queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
          setActiveDocId(doc.id);
          setContent(doc.content);
          setTitle(doc.title);
          setDocumentType(doc.documentType);
        }}
      />
    </div>
  );
}
