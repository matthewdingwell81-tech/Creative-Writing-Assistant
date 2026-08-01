import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Editor, { type EditorHandle } from '@/components/Editor';
import SuggestionsSidebar from '@/components/SuggestionsSidebar';
import DocumentList from '@/components/DocumentList';
import GoogleDocsDialog from '@/components/GoogleDocsDialog';
import IdeasPanel from '@/components/IdeasPanel';
import { Sparkles, PanelLeftClose, PanelLeft, FilePlus, Download, Upload, Lightbulb, X, LogOut, User, Focus, Pencil, Plus, Check, Loader2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fetchDocuments, fetchDocument, createDocument, updateDocument, fetchChapters, createChapter, updateChapter as updateChapterApi, SessionExpiredError } from '@/lib/api';
import { useSuggestions } from '@/hooks/useSuggestions';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Document, Chapter } from '@/types/schema';

function normalizeNbsp(s: string): string {
  return s.replace(/\u00A0/g, ' ');
}

function replaceTextInHtml(html: string, originalText: string, newText: string): string | null {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  const searchLower = normalizeNbsp(originalText).toLowerCase();

  for (const textNode of textNodes) {
    const nodeText = textNode.textContent || '';
    const idx = normalizeNbsp(nodeText).toLowerCase().indexOf(searchLower);
    if (idx !== -1) {
      textNode.textContent = nodeText.slice(0, idx) + newText + nodeText.slice(idx + searchLower.length);
      return tempDiv.innerHTML;
    }
  }

  if (textNodes.length < 2) return null;
  let concatenated = '';
  const nodeRanges: { node: Text; start: number; end: number }[] = [];
  for (const tn of textNodes) {
    const text = tn.textContent || '';
    const start = concatenated.length;
    concatenated += text;
    nodeRanges.push({ node: tn, start, end: concatenated.length });
  }

  const idx = normalizeNbsp(concatenated).toLowerCase().indexOf(searchLower);
  if (idx === -1) return null;

  const matchEnd = idx + searchLower.length;
  const affectedNodes = nodeRanges.filter((nr) => nr.end > idx && nr.start < matchEnd);
  if (affectedNodes.length === 0) return null;

  const firstNode = affectedNodes[0];
  const localStart = idx - firstNode.start;
  const firstNodeText = firstNode.node.textContent || '';

  if (affectedNodes.length === 1) {
    const localEnd = matchEnd - firstNode.start;
    firstNode.node.textContent = firstNodeText.slice(0, localStart) + newText + firstNodeText.slice(localEnd);
  } else {
    firstNode.node.textContent = firstNodeText.slice(0, localStart) + newText;
    for (let i = 1; i < affectedNodes.length; i++) {
      const an = affectedNodes[i];
      if (i === affectedNodes.length - 1) {
        const localEnd = matchEnd - an.start;
        an.node.textContent = (an.node.textContent || '').slice(localEnd);
      } else {
        an.node.textContent = '';
      }
    }
  }

  return tempDiv.innerHTML;
}

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('fiction');
  const [showDocList, setShowDocList] = useState(false);
  const [showSuggestionsSheet, setShowSuggestionsSheet] = useState(false);
  const [gdocsMode, setGdocsMode] = useState<'import' | 'export'>('import');
  const [gdocsOpen, setGdocsOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [ideaAssistantPrompt, setIdeaAssistantPrompt] = useState<{ prompt: string; id: number } | null>(null);
  const [ideaAssistantLoading, setIdeaAssistantLoading] = useState(false);
  const ideaAssistantCounter = useRef(0);
  const editorHandle = useRef<EditorHandle>(null);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [docChapters, setDocChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [renamingChapterId, setRenamingChapterId] = useState<number | null>(null);
  const [chapterTitleInput, setChapterTitleInput] = useState('');

  const {
    suggestions, savedSuggestions, savedCount, changeHistory, loading: suggestionsLoading,
    requestSuggestions, cancelPending, dismissSuggestion, applySuggestionById, saveSuggestion, removeSaved, clearHistory
  } = useSuggestions();
  const { save, saving, lastSaved } = useAutoSave(activeDocId, activeChapterId, {
    onSaveError: () => {
      toast({
        title: "Could not save your changes",
        description: "Your last edits may not have been saved. Check your connection.",
        variant: "destructive",
      });
    },
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
    queryFn: fetchDocuments,
  });

  const loadChaptersForDoc = useCallback(async (docId: number, docContent: string) => {
    try {
      const chapterList: Chapter[] = await fetchChapters(docId);
      if (chapterList.length === 0) {
        const chapter = await createChapter(docId, { title: 'Chapter 1', content: docContent, position: 0 });
        setDocChapters([chapter]);
        setActiveChapterId(chapter.id);
        setContent(chapter.content);
      } else {
        setDocChapters(chapterList);
        setActiveChapterId(chapterList[0].id);
        setContent(chapterList[0].content);
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) return;
      toast({ title: "Could not load chapters", description: "Your document sections failed to load.", variant: "destructive" });
    }
  }, [toast]);

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: async (doc: Document) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setActiveDocId(doc.id);
      setTitle(doc.title);
      setDocumentType(doc.documentType);
      await loadChaptersForDoc(doc.id, doc.content);
    },
    onError: (err: unknown) => {
      if (err instanceof SessionExpiredError) return;
      toast({
        title: "Could not create document",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!activeDocId && documents.length > 0) {
      const doc = documents[0];
      setActiveDocId(doc.id);
      setTitle(doc.title);
      setDocumentType(doc.documentType);
      setSelectedText('');
      loadChaptersForDoc(doc.id, doc.content);
    }
  }, [documents, activeDocId]);

  const handleSelectDoc = useCallback(async (id: number) => {
    try {
      const doc = await fetchDocument(id);
      setActiveDocId(doc.id);
      setTitle(doc.title);
      setDocumentType(doc.documentType);
      setShowDocList(false);
      setSelectedText('');
      setRenamingChapterId(null);
      await loadChaptersForDoc(doc.id, doc.content);
    } catch {
      // ignore
    }
  }, [loadChaptersForDoc]);

  const handleSwitchChapter = useCallback(async (chapterId: number) => {
    if (chapterId === activeChapterId) return;
    if (activeChapterId) {
      try {
        await updateChapterApi(activeChapterId, { content });
        setDocChapters(prev => prev.map(c => c.id === activeChapterId ? { ...c, content } : c));
      } catch (err) {
        if (err instanceof SessionExpiredError) return;
        toast({ title: "Could not save chapter", description: "Your changes may not have been saved.", variant: "destructive" });
      }
    }
    const chapter = docChapters.find(c => c.id === chapterId);
    if (chapter) {
      setActiveChapterId(chapter.id);
      setContent(chapter.content);
      setRenamingChapterId(null);
    }
  }, [activeChapterId, content, docChapters, toast]);

  const handleAddChapter = useCallback(async () => {
    if (!activeDocId) return;
    if (activeChapterId) {
      try {
        await updateChapterApi(activeChapterId, { content });
        setDocChapters(prev => prev.map(c => c.id === activeChapterId ? { ...c, content } : c));
      } catch (err) {
        if (err instanceof SessionExpiredError) return;
        toast({ title: "Could not save chapter", description: "Your changes may not have been saved.", variant: "destructive" });
      }
    }
    try {
      const position = docChapters.length;
      const chapter = await createChapter(activeDocId, { title: `Chapter ${position + 1}`, content: '', position });
      setDocChapters(prev => [...prev, chapter]);
      setActiveChapterId(chapter.id);
      setContent('');
      setRenamingChapterId(null);
    } catch (err) {
      if (err instanceof SessionExpiredError) return;
      toast({ title: "Could not add chapter", description: "Please try again.", variant: "destructive" });
    }
  }, [activeDocId, activeChapterId, content, docChapters, toast]);

  const handleSaveChapterTitle = useCallback(async () => {
    if (!renamingChapterId || !chapterTitleInput.trim()) {
      setRenamingChapterId(null);
      return;
    }
    const trimmed = chapterTitleInput.trim();
    try {
      await updateChapterApi(renamingChapterId, { title: trimmed });
      setDocChapters(prev => prev.map(c => c.id === renamingChapterId ? { ...c, title: trimmed } : c));
    } catch (err) {
      if (err instanceof SessionExpiredError) return;
      toast({ title: "Could not rename chapter", description: "Please try again.", variant: "destructive" });
    }
    setRenamingChapterId(null);
  }, [renamingChapterId, chapterTitleInput, toast]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    save(newContent, title);
    if (!focusMode) {
      requestSuggestions(newContent, documentType);
    }
  }, [save, title, requestSuggestions, documentType, focusMode]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    if (activeDocId) {
      updateDocument(activeDocId, { title: newTitle }).catch((err) => {
        if (err instanceof SessionExpiredError) return;
        toast({ title: "Could not save title", description: "Your title change may not have been saved.", variant: "destructive" });
      });
    }
  }, [activeDocId, toast]);

  const applySuggestion = useCallback((suggestionId: string, originalText: string, newText: string) => {
    if (!content) return;

    const liveClean = editorHandle.current?.getCleanContent();
    const cleanContent = liveClean !== undefined && liveClean !== ''
      ? liveClean
      : content.replace(/<span[^>]*data-spell-highlight[^>]*>([\s\S]*?)<\/span>/gi, '$1');

    const updatedContent = replaceTextInHtml(cleanContent, originalText, newText);

    if (updatedContent === null) {
      toast({
        title: "Could not apply change",
        description: "The text may have already been modified. Try refreshing suggestions.",
        variant: "destructive",
      });
      return;
    }

    setContent(updatedContent);
    save(updatedContent, title);
    applySuggestionById(suggestionId, originalText, newText);
    setTimeout(() => requestSuggestions(updatedContent, documentType), 500);
  }, [content, save, title, requestSuggestions, documentType, applySuggestionById, toast]);

  const handleInlineCorrection = useCallback((_original: string, _replacement: string) => {
    setTimeout(() => {
      setContent(prev => {
        save(prev, title);
        requestSuggestions(prev, documentType);
        return prev;
      });
    }, 100);
  }, [save, title, requestSuggestions, documentType]);

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

  const handleAskAssistantForIdea = useCallback((ideaContent: string) => {
    const prompt = `I have the following idea in my scratchpad that I'd like help developing. Please review this idea in the context of my current document and provide exactly 3 specific, actionable suggestions for how I could implement or develop this thought in my writing:\n\nIdea: "${ideaContent}"`;
    ideaAssistantCounter.current += 1;
    setIdeaAssistantLoading(true);
    setIdeaAssistantPrompt({ prompt, id: ideaAssistantCounter.current });
  }, []);

  const grammarHighlights = suggestions
    .filter(s => s.original && s.alternatives.length > 0)
    .map(s => ({ original: s.original!, alternatives: s.alternatives, id: s.id }));

  const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;

  const saveStatusChip = (
    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" data-testid="save-status">
      {saving ? 'Saving...' : lastSaved ? 'Saved' : 'Ready'}
    </span>
  );

  // Chapter selector used in both desktop header and mobile overflow menu
  const chapterSelector = activeDocId && docChapters.length > 0 ? (
    renamingChapterId === activeChapterId ? (
      <div className="flex items-center gap-1">
        <input
          className="h-8 w-[130px] rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring [@media(pointer:coarse)]:min-h-[44px]"
          value={chapterTitleInput}
          autoFocus
          onChange={(e) => setChapterTitleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveChapterTitle();
            if (e.key === 'Escape') setRenamingChapterId(null);
          }}
          onBlur={handleSaveChapterTitle}
          data-testid="input-chapter-title"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
          onMouseDown={(e) => { e.preventDefault(); handleSaveChapterTitle(); }}
          data-testid="btn-save-chapter-title"
        >
          <Check className="w-3 h-3" />
        </Button>
      </div>
    ) : (
      <>
        <Select
          value={activeChapterId?.toString() ?? ''}
          onValueChange={(v) => {
            if (v === '__new__') {
              handleAddChapter();
            } else {
              handleSwitchChapter(parseInt(v));
            }
          }}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs [@media(pointer:coarse)]:min-h-[44px]" data-testid="select-chapter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {docChapters.map((ch) => (
              <SelectItem key={ch.id} value={ch.id.toString()}>{ch.title}</SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value="__new__" className="text-primary">
              <span className="flex items-center gap-1.5">
                <Plus className="w-3 h-3" />
                Add Chapter
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
          onClick={() => {
            const chapter = docChapters.find(c => c.id === activeChapterId);
            if (chapter) { setRenamingChapterId(chapter.id); setChapterTitleInput(chapter.title); }
          }}
          title="Rename chapter"
          data-testid="btn-rename-chapter"
        >
          <Pencil className="w-3 h-3" />
        </Button>
      </>
    )
  ) : null;

  const docTypeLabels: Record<string, string> = {
    fiction: 'Fiction',
    nonfiction: 'Non-Fiction',
    essay: 'Essay',
    blog: 'Blog Post',
    script: 'Script',
    general: 'General',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans overflow-x-hidden">
      <header className="h-14 border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10 flex items-center justify-between px-3 sm:px-6 gap-2">
        {/* Left: doc-list toggle + logo */}
        <div className="flex items-center gap-2 shrink-0">
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

        {/* Desktop center: doc type + chapter + save status */}
        {!isMobile && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Select value={documentType} onValueChange={(v) => { setDocumentType(v); if (activeDocId) updateDocument(activeDocId, { documentType: v }).catch((err) => { if (err instanceof SessionExpiredError) return; toast({ title: "Could not save document type", description: "Your change may not have been saved.", variant: "destructive" }); }); }}>
              <SelectTrigger className="w-[140px] h-8 text-xs [@media(pointer:coarse)]:min-h-[44px]" data-testid="select-doc-type">
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

            {activeDocId && docChapters.length > 0 && (
              <div className="flex items-center gap-1">
                {chapterSelector}
              </div>
            )}

            {saveStatusChip}
          </div>
        )}

        {/* Mobile save status chip (always visible) */}
        {isMobile && (
          <div className="flex-1 flex justify-center">
            {saveStatusChip}
          </div>
        )}

        {/* Desktop right: actions */}
        {!isMobile && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={focusMode ? "text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary" : "text-muted-foreground hover:text-foreground"}
              onClick={() => { if (!focusMode) cancelPending(); setFocusMode(!focusMode); }}
              title={focusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
              data-testid="btn-toggle-focus-mode"
            >
              <Focus className="w-4 h-4" />
            </Button>
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
              disabled={createMutation.isPending}
              data-testid="btn-new-doc"
            >
              {createMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FilePlus className="w-4 h-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-full px-6" data-testid="btn-export-menu">
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
                <DropdownMenuItem onClick={() => { setGdocsMode('export'); setGdocsOpen(true); }} data-testid="btn-export-gdocs">
                  <Upload className="w-4 h-4 mr-2" />
                  Export to Google Docs
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" data-testid="btn-user-menu" title={user?.username}>
                  <User className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-1">
                  Signed in as <span className="font-medium text-foreground" data-testid="text-username">{user?.username}</span>
                </div>
                <DropdownMenuItem onClick={() => logout()} data-testid="btn-logout" className="text-red-500 focus:text-red-500">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Mobile right: overflow menu + user */}
        {isMobile && (
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" data-testid="btn-mobile-overflow">
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {/* Doc type */}
                <DropdownMenuLabel className="text-xs text-muted-foreground pb-1">Document Type</DropdownMenuLabel>
                {['fiction', 'nonfiction', 'essay', 'blog', 'script', 'general'].map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => {
                      setDocumentType(type);
                      if (activeDocId) updateDocument(activeDocId, { documentType: type }).catch((err) => {
                        if (err instanceof SessionExpiredError) return;
                        toast({ title: "Could not save document type", variant: "destructive" });
                      });
                    }}
                    data-testid={`mobile-doc-type-${type}`}
                    className={documentType === type ? 'text-primary' : ''}
                  >
                    {documentType === type && <Check className="w-3.5 h-3.5 mr-2 shrink-0" />}
                    {documentType !== type && <span className="w-3.5 h-3.5 mr-2 inline-block shrink-0" />}
                    {docTypeLabels[type]}
                  </DropdownMenuItem>
                ))}

                {activeDocId && docChapters.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground pb-1">Chapter</DropdownMenuLabel>
                    {docChapters.map((ch) => (
                      <DropdownMenuItem
                        key={ch.id}
                        onClick={() => handleSwitchChapter(ch.id)}
                        className={activeChapterId === ch.id ? 'text-primary' : ''}
                        data-testid={`mobile-chapter-${ch.id}`}
                      >
                        {activeChapterId === ch.id && <Check className="w-3.5 h-3.5 mr-2 shrink-0" />}
                        {activeChapterId !== ch.id && <span className="w-3.5 h-3.5 mr-2 inline-block shrink-0" />}
                        {ch.title}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={handleAddChapter} data-testid="mobile-add-chapter">
                      <Plus className="w-3.5 h-3.5 mr-2" />
                      Add Chapter
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => { if (!focusMode) cancelPending(); setFocusMode(!focusMode); }}
                  data-testid="btn-toggle-focus-mode"
                >
                  <Focus className="w-4 h-4 mr-2" />
                  {focusMode ? 'Exit Focus Mode' : 'Focus Mode'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setGdocsMode('import'); setGdocsOpen(true); }}
                  data-testid="btn-import-gdocs"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Import from Google Docs
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleNewDocument}
                  disabled={createMutation.isPending}
                  data-testid="btn-new-doc"
                >
                  {createMutation.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <FilePlus className="w-4 h-4 mr-2" />}
                  New Document
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport} data-testid="btn-export-txt">
                  <Download className="w-4 h-4 mr-2" />
                  Download as .txt
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setGdocsMode('export'); setGdocsOpen(true); }} data-testid="btn-export-gdocs">
                  <Upload className="w-4 h-4 mr-2" />
                  Export to Google Docs
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" data-testid="btn-user-menu" title={user?.username}>
                  <User className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-1">
                  Signed in as <span className="font-medium text-foreground" data-testid="text-username">{user?.username}</span>
                </div>
                <DropdownMenuItem onClick={() => logout()} data-testid="btn-logout" className="text-red-500 focus:text-red-500">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Document list: sheet on mobile, aside on desktop */}
        {isMobile ? (
          <Sheet open={showDocList} onOpenChange={setShowDocList}>
            <SheetContent side="left" className="w-full max-w-sm p-0 flex flex-col">
              <SheetHeader className="px-4 py-3 border-b border-border/50 shrink-0">
                <SheetTitle className="text-sm">Documents</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <DocumentList
                  documents={documents}
                  activeId={activeDocId}
                  onSelect={(id) => { handleSelectDoc(id); setShowDocList(false); }}
                  onNew={handleNewDocument}
                  isCreating={createMutation.isPending}
                />
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          showDocList && (
            <aside className="w-[260px] border-r border-border/50 bg-card/30 overflow-y-auto">
              <DocumentList documents={documents} activeId={activeDocId} onSelect={handleSelectDoc} onNew={handleNewDocument} isCreating={createMutation.isPending} />
            </aside>
          )
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto relative">
            <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12">
              {activeDocId ? (
                <Editor
                  ref={editorHandle}
                  content={content}
                  setContent={handleContentChange}
                  title={title}
                  setTitle={handleTitleChange}
                  onSelectionChange={setSelectedText}
                  grammarHighlights={grammarHighlights}
                  onApplyCorrection={handleInlineCorrection}
                />
              ) : (
                <div className="text-center py-32">
                  <Sparkles className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                  <h2 className="text-xl font-medium text-muted-foreground mb-2">Welcome to Lumina</h2>
                  <p className="text-sm text-muted-foreground/70 mb-6">Create a new document to start writing</p>
                  <Button onClick={handleNewDocument} className="bg-primary text-primary-foreground" disabled={createMutation.isPending} data-testid="btn-create-first">
                    {createMutation.isPending
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <FilePlus className="w-4 h-4 mr-2" />}
                    New Document
                  </Button>
                </div>
              )}
            </div>
            {activeDocId && (
              <div
                className="fixed bottom-6 text-xs text-muted-foreground/60 font-medium tracking-wide pointer-events-none"
                style={{ left: '50%', transform: 'translateX(-50%)' }}
                data-testid="word-count"
              >
                {wordCount} words
              </div>
            )}
          </div>
        </div>

        {/* Suggestions sidebar: sheet FAB on mobile, aside on desktop */}
        {activeDocId && !focusMode && (
          isMobile ? (
            <>
              <button
                onClick={() => setShowSuggestionsSheet(true)}
                className="fixed bottom-16 right-4 z-30 bg-primary text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                data-testid="btn-open-suggestions-sheet"
                aria-label="Open Creative Assistant"
              >
                <Sparkles className="w-5 h-5" />
              </button>
              <Sheet open={showSuggestionsSheet} onOpenChange={setShowSuggestionsSheet}>
                <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                  <SuggestionsSidebar
                    suggestions={suggestions}
                    savedSuggestions={savedSuggestions}
                    savedCount={savedCount}
                    changeHistory={changeHistory}
                    loading={suggestionsLoading}
                    onApplySuggestion={applySuggestion}
                    onDismiss={dismissSuggestion}
                    onSave={saveSuggestion}
                    onRemoveSaved={removeSaved}
                    onClearHistory={clearHistory}
                    documentContent={content}
                    documentType={documentType}
                    selectedText={selectedText}
                    externalIdeaPrompt={ideaAssistantPrompt}
                    onExternalIdeaHandled={() => { setIdeaAssistantPrompt(null); setIdeaAssistantLoading(false); }}
                    onScrollToSuggestion={(text) => editorHandle.current?.scrollToSuggestion(text)}
                    onInsertText={(text) => {
                      const appended = (content ? content + '\n\n' : '') + text;
                      setContent(appended);
                      save(appended, title);
                    }}
                  />
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <aside className="w-[380px] border-l border-border/50 bg-card/30 backdrop-blur flex flex-col overflow-hidden">
              <SuggestionsSidebar
                suggestions={suggestions}
                savedSuggestions={savedSuggestions}
                savedCount={savedCount}
                changeHistory={changeHistory}
                loading={suggestionsLoading}
                onApplySuggestion={applySuggestion}
                onDismiss={dismissSuggestion}
                onSave={saveSuggestion}
                onRemoveSaved={removeSaved}
                onClearHistory={clearHistory}
                documentContent={content}
                documentType={documentType}
                selectedText={selectedText}
                externalIdeaPrompt={ideaAssistantPrompt}
                onExternalIdeaHandled={() => { setIdeaAssistantPrompt(null); setIdeaAssistantLoading(false); }}
                onScrollToSuggestion={(text) => editorHandle.current?.scrollToSuggestion(text)}
                onInsertText={(text) => {
                  const appended = (content ? content + '\n\n' : '') + text;
                  setContent(appended);
                  save(appended, title);
                }}
              />
            </aside>
          )
        )}

        {activeDocId && (
          <button
            onClick={() => setShowScratchpad(!showScratchpad)}
            className="fixed left-0 top-1/2 -translate-y-1/2 z-30 bg-card border border-border/50 border-l-0 rounded-r-lg px-1.5 py-3 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-card/90 shadow-md transition-all"
            data-testid="btn-toggle-scratchpad"
            title="Ideas Scratchpad"
          >
            <Lightbulb className="w-4 h-4" />
            <span className="text-[10px] font-medium" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Ideas</span>
          </button>
        )}

        {activeDocId && showScratchpad && (
          <>
            <div className="fixed inset-0 z-20 animate-in fade-in duration-150" onClick={() => setShowScratchpad(false)} data-testid="scratchpad-backdrop" />
            <div className="fixed left-0 top-14 bottom-0 z-20 w-[300px] bg-card/95 backdrop-blur-sm border-r border-border/50 shadow-xl flex flex-col animate-in slide-in-from-left duration-200" data-testid="scratchpad-drawer">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <span>Ideas Scratchpad</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setShowScratchpad(false)} data-testid="btn-close-scratchpad">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <IdeasPanel documentId={activeDocId} onAskAssistant={handleAskAssistantForIdea} assistantLoading={ideaAssistantLoading} drawerMode />
              </div>
            </div>
          </>
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
