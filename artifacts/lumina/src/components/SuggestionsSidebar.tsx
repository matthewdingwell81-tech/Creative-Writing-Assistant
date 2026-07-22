import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, BookOpen, AlertCircle, TrendingUp, CheckCircle2,
  ChevronRight, MessageSquareDashed, Check, Loader2, TextSelect,
  X, Bookmark, BookmarkCheck, History, Trash2, ArrowRight, Bot, RotateCcw,
  ClipboardCopy, Send, User
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { streamIdeas, streamCoach } from '@/lib/api';
import type { Suggestion, ChangeHistoryEntry } from '@/hooks/useSuggestions';

interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SuggestionsSidebarProps {
  suggestions: Suggestion[];
  savedSuggestions: Suggestion[];
  savedCount: number;
  changeHistory: ChangeHistoryEntry[];
  loading: boolean;
  onApplySuggestion?: (suggestionId: string, original: string, replacement: string) => void;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  onRemoveSaved: (id: string) => void;
  onClearHistory: () => void;
  documentContent: string;
  documentType: string;
  selectedText?: string;
  externalIdeaPrompt?: { prompt: string; id: number } | null;
  onExternalIdeaHandled?: () => void;
  onScrollToSuggestion?: (original: string) => void;
  onInsertText?: (text: string) => void;
}

const severityConfig = {
  error: { icon: AlertCircle, borderColor: 'border-l-destructive/60', iconColor: 'text-destructive/80' },
  warning: { icon: Sparkles, borderColor: 'border-l-amber-500/60', iconColor: 'text-amber-500' },
  info: { icon: CheckCircle2, borderColor: 'border-l-primary/60', iconColor: 'text-primary' },
};

const typeLabels: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  style: 'Style',
  pacing: 'Pacing',
  story: 'Story Arc',
  tone: 'Tone',
};

function SuggestionCard({
  sug, onApply, onDismiss, onSave, onScrollToSuggestion, isSaved,
}: {
  sug: Suggestion;
  onApply: (suggestionId: string, original: string, replacement: string) => void;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  onScrollToSuggestion?: (original: string) => void;
  isSaved?: boolean;
}) {
  const [selectedAltIndex, setSelectedAltIndex] = useState(0);
  const config = severityConfig[sug.severity] || severityConfig.info;
  const Icon = config.icon;
  const selectedAlt = sug.alternatives[selectedAltIndex] ?? sug.alternatives[0];

  return (
    <Card
      className={`p-3 bg-card border-l-2 ${config.borderColor} shadow-sm border-t-0 border-r-0 border-b-0 rounded-r-lg rounded-l-sm cursor-pointer`}
      onClick={() => sug.original && onScrollToSuggestion?.(sug.original)}
      data-testid={`card-suggestion-${sug.id}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <Icon className={`w-4 h-4 ${config.iconColor} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">{sug.title}</h4>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{typeLabels[sug.type] || sug.type}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{sug.description}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onSave(sug.id); }}
            className="p-1 rounded hover:bg-muted transition-colors flex items-center justify-center [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
            title={isSaved ? "Saved" : "Save for later"}
            data-testid={`btn-save-suggestion-${sug.id}`}
          >
            {isSaved ? <BookmarkCheck className="w-3.5 h-3.5 text-primary" /> : <Bookmark className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(sug.id); }}
            className="p-1 rounded hover:bg-muted transition-colors flex items-center justify-center [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
            title="Dismiss"
            data-testid={`btn-dismiss-suggestion-${sug.id}`}
          >
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>

      {sug.original && sug.alternatives.length > 0 && (
        <div className="pl-6 space-y-1.5 mt-3">
          {sug.alternatives.map((alt, j) => (
            <button
              key={j}
              onClick={(e) => { e.stopPropagation(); setSelectedAltIndex(j); }}
              className={`w-full text-left text-xs p-2 bg-muted/50 rounded-md border transition-all flex items-center justify-between group ${
                selectedAltIndex === j
                  ? 'border-primary/50 ring-1 ring-primary/25 bg-primary/5'
                  : 'border-border/50 hover:border-primary/30'
              }`}
              data-testid={`btn-select-alt-${sug.id}-${j}`}
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="line-through text-muted-foreground break-words">{sug.original}</span>
                <span className="text-foreground font-medium flex items-start gap-1">
                  <Sparkles className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
                  <span className="break-words">{alt}</span>
                </span>
              </div>
              {selectedAltIndex === j && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />}
            </button>
          ))}
          <Button
            size="sm"
            className="w-full h-7 text-xs mt-1 bg-primary hover:bg-primary/90 text-primary-foreground [@media(pointer:coarse)]:min-h-[44px]"
            onClick={(e) => { e.stopPropagation(); onApply(sug.id, sug.original!, selectedAlt); }}
            data-testid={`btn-apply-suggestion-${sug.id}`}
          >
            Apply Change
          </Button>
        </div>
      )}
    </Card>
  );
}

function StoryCard({
  sug, onDismiss, onSave, isSaved,
}: {
  sug: Suggestion;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  isSaved?: boolean;
}) {
  const Icon = sug.type === 'pacing' ? TrendingUp : BookOpen;
  return (
    <Card className="p-3 bg-card shadow-sm border border-border/60">
      <div className="flex items-start gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <h4 className="text-sm font-medium flex-1">{sug.title}</h4>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onSave(sug.id)} className="p-1 rounded hover:bg-muted transition-colors flex items-center justify-center [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]" data-testid={`btn-save-suggestion-${sug.id}`}>
            {isSaved ? <BookmarkCheck className="w-3.5 h-3.5 text-primary" /> : <Bookmark className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />}
          </button>
          <button onClick={() => onDismiss(sug.id)} className="p-1 rounded hover:bg-muted transition-colors flex items-center justify-center [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]" data-testid={`btn-dismiss-suggestion-${sug.id}`}>
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{sug.description}</p>
      {sug.alternatives.length > 0 && (
        <div className="mt-3 bg-muted/50 p-3 rounded-md">
          <p className="text-xs font-medium mb-2">Consider:</p>
          <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
            {sug.alternatives.map((alt, j) => <li key={j}>{alt}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STARTER_PROMPTS = [
  "Help me develop my main character",
  "Here's my story idea — what am I missing?",
  "Give me feedback on this plot point",
  "Let's outline my next chapter",
];

export default function SuggestionsSidebar({
  suggestions, savedSuggestions, savedCount, changeHistory, loading, onApplySuggestion,
  onDismiss, onSave, onRemoveSaved, onClearHistory, documentContent, documentType, selectedText,
  externalIdeaPrompt, onExternalIdeaHandled, onScrollToSuggestion, onInsertText
}: SuggestionsSidebarProps) {
  const [ideaPrompt, setIdeaPrompt] = useState('');
  const [ideaResponse, setIdeaResponse] = useState('');
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('grammar');
  const [showSaved, setShowSaved] = useState(false);
  const externalPromptHandled = useRef<number | null>(null);

  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const coachScrollRef = useRef<HTMLDivElement>(null);
  const coachInputRef = useRef<HTMLTextAreaElement>(null);
  const coachAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (externalIdeaPrompt && externalIdeaPrompt.id !== externalPromptHandled.current) {
      externalPromptHandled.current = externalIdeaPrompt.id;
      setActiveTab('ideas');
      setIdeaPrompt('');
      handleIdeaSubmitExternal(externalIdeaPrompt.prompt);
    }
  }, [externalIdeaPrompt]);

  const handleApply = (suggestionId: string, original: string, replacement: string) => {
    if (onApplySuggestion) onApplySuggestion(suggestionId, original, replacement);
  };

  const handleIdeaSubmitDirect = async (prompt: string) => {
    if (!prompt.trim()) return;
    setIdeaLoading(true);
    setIdeaResponse('');
    try {
      await streamIdeas(documentContent, prompt, documentType,
        (chunk) => setIdeaResponse(prev => prev + chunk),
        () => setIdeaLoading(false)
      );
    } catch {
      setIdeaResponse('Failed to generate ideas. Please try again.');
      setIdeaLoading(false);
    }
  };

  const handleIdeaSubmitExternal = async (prompt: string) => {
    if (!prompt.trim()) return;
    setIdeaLoading(true);
    setIdeaResponse('');
    try {
      await streamIdeas(documentContent, prompt, documentType,
        (chunk) => setIdeaResponse(prev => prev + chunk),
        () => { setIdeaLoading(false); onExternalIdeaHandled?.(); }
      );
    } catch {
      setIdeaResponse('Failed to generate ideas. Please try again.');
      setIdeaLoading(false);
      onExternalIdeaHandled?.();
    }
  };

  const handleReviewSelection = () => {
    if (!selectedText) return;
    const prompt = `Please provide detailed feedback on this specific passage I've selected from my writing. Analyze it for clarity, impact, word choice, rhythm, and any improvements you'd suggest:\n\n"${selectedText}"`;
    setActiveTab('ideas');
    setIdeaPrompt('');
    handleIdeaSubmitDirect(prompt);
  };

  useEffect(() => {
    if (coachScrollRef.current) {
      coachScrollRef.current.scrollTop = coachScrollRef.current.scrollHeight;
    }
  }, [coachMessages]);

  const handleCoachSend = async (messageText?: string) => {
    const text = (messageText ?? coachInput).trim();
    if (!text || coachLoading) return;

    if (coachAbortRef.current) coachAbortRef.current.abort();
    const controller = new AbortController();
    coachAbortRef.current = controller;

    const userMessage: CoachMessage = { role: 'user', content: text };
    const nextMessages = [...coachMessages, userMessage];
    setCoachMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setCoachInput('');
    setCoachLoading(true);

    try {
      await streamCoach(
        nextMessages, documentContent, documentType,
        (chunk) => {
          if (controller.signal.aborted) return;
          setCoachMessages(prev => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: updated[updated.length - 1].content + chunk };
            return updated;
          });
        },
        () => { if (!controller.signal.aborted) setCoachLoading(false); },
        controller.signal
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setCoachMessages(prev => {
        if (prev.length === 0) return prev;
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' };
        return updated;
      });
    } finally {
      if (!controller.signal.aborted) setCoachLoading(false);
    }
  };

  const handleCoachReset = () => {
    if (coachAbortRef.current) { coachAbortRef.current.abort(); coachAbortRef.current = null; }
    setCoachMessages([]); setCoachInput(''); setCoachLoading(false);
  };

  const grammarSuggestions = suggestions.filter(s => s.type === 'grammar');
  const reviewSuggestions = suggestions.filter(s => ['vocabulary', 'style', 'tone'].includes(s.type));
  const storySuggestions = suggestions.filter(s => ['pacing', 'story'].includes(s.type));
  const savedIds = new Set(savedSuggestions.map(s => s.id));

  const truncatedSelection = selectedText && selectedText.length > 80
    ? selectedText.slice(0, 80) + '\u2026'
    : selectedText;

  const EmptyState = ({ message }: { message: string }) => (
    <div className="text-center py-8 text-muted-foreground">
      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
      <p className="text-xs">{message}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="p-4 border-b border-border/50 bg-card/50">
        <div className="flex items-center justify-between">
          <h2 className="font-medium flex items-center gap-2 text-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            Creative Assistant
          </h2>
          {savedCount > 0 && (
            <Button
              variant={showSaved ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5 [@media(pointer:coarse)]:min-h-[44px]"
              onClick={() => setShowSaved(!showSaved)}
              data-testid="btn-toggle-saved"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              Saved ({savedCount})
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {loading ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</span>
          ) : (
            `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} found`
          )}
        </p>
      </div>

      {showSaved && savedSuggestions.length > 0 && (
        <div className="border-b border-border/50 bg-primary/5">
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <BookmarkCheck className="w-3.5 h-3.5" />
              Saved Suggestions
            </h3>
          </div>
          <ScrollArea className="max-h-[300px]">
            <div className="px-4 pb-3 space-y-3">
              {savedSuggestions.map((sug) => {
                const isStoryType = ['pacing', 'story'].includes(sug.type);
                return isStoryType ? (
                  <StoryCard key={sug.id} sug={sug} onDismiss={onDismiss} onSave={onRemoveSaved} isSaved />
                ) : (
                  <SuggestionCard key={sug.id} sug={sug} onApply={handleApply} onDismiss={onDismiss} onSave={onRemoveSaved} onScrollToSuggestion={onScrollToSuggestion} isSaved />
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {selectedText && (
        <div className="px-4 py-3 border-b border-border/50 bg-primary/5">
          <div className="flex items-start gap-2">
            <TextSelect className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground mb-1">Text Selected</p>
              <p className="text-xs text-muted-foreground italic truncate" data-testid="text-selected-preview">"{truncatedSelection}"</p>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full mt-2 h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground [@media(pointer:coarse)]:min-h-[44px]"
            onClick={handleReviewSelection}
            disabled={ideaLoading}
            data-testid="btn-review-selection"
          >
            {ideaLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            Review This Selection
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col w-full min-h-0">
        <div className="px-4 pt-3 pb-0 border-b border-border/50">
          <TabsList className="w-full bg-muted/50 grid grid-cols-6 p-1 rounded-lg">
            <TabsTrigger value="grammar" className="text-[10px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-1 [@media(pointer:coarse)]:min-h-[44px]" data-testid="tab-grammar">
              Grammar {grammarSuggestions.length > 0 && `(${grammarSuggestions.length})`}
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="text-[10px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-1 [@media(pointer:coarse)]:min-h-[44px]" data-testid="tab-review">
              Review {reviewSuggestions.length > 0 && `(${reviewSuggestions.length})`}
            </TabsTrigger>
            <TabsTrigger value="story" className="text-[10px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-1 [@media(pointer:coarse)]:min-h-[44px]" data-testid="tab-story">
              Story {storySuggestions.length > 0 && `(${storySuggestions.length})`}
            </TabsTrigger>
            <TabsTrigger value="history" className="text-[10px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-1 [@media(pointer:coarse)]:min-h-[44px]" data-testid="tab-history">
              History {changeHistory.length > 0 && `(${changeHistory.length})`}
            </TabsTrigger>
            <TabsTrigger value="ideas" className="text-[10px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-1 [@media(pointer:coarse)]:min-h-[44px]" data-testid="tab-ideas">Ideas</TabsTrigger>
            <TabsTrigger value="coach" className="text-[10px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm px-1 gap-0.5 [@media(pointer:coarse)]:min-h-[44px]" data-testid="tab-coach">
              <Bot className="w-3 h-3 shrink-0" />Coach
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <TabsContent value="grammar" className="p-4 space-y-4 m-0">
            {loading && grammarSuggestions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin opacity-30" />
                <p className="text-xs">Analyzing your writing...</p>
              </div>
            )}
            {!loading && grammarSuggestions.length === 0 && (
              <EmptyState message="No grammar issues found. Keep writing!" />
            )}
            {grammarSuggestions.map(sug => (
              <SuggestionCard key={sug.id} sug={sug} onApply={handleApply} onDismiss={onDismiss} onSave={onSave} onScrollToSuggestion={onScrollToSuggestion} isSaved={savedIds.has(sug.id)} />
            ))}
          </TabsContent>

          <TabsContent value="suggestions" className="p-4 space-y-4 m-0">
            {reviewSuggestions.length === 0 ? (
              <EmptyState message="No style suggestions yet. Write more to get feedback!" />
            ) : (
              reviewSuggestions.map(sug => (
                <SuggestionCard key={sug.id} sug={sug} onApply={handleApply} onDismiss={onDismiss} onSave={onSave} onScrollToSuggestion={onScrollToSuggestion} isSaved={savedIds.has(sug.id)} />
              ))
            )}
          </TabsContent>

          <TabsContent value="story" className="p-4 space-y-4 m-0">
            {storySuggestions.length === 0 ? (
              <EmptyState message="No story suggestions yet. Write more to get story arc feedback!" />
            ) : (
              storySuggestions.map(sug => (
                <StoryCard key={sug.id} sug={sug} onDismiss={onDismiss} onSave={onSave} isSaved={savedIds.has(sug.id)} />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="p-4 space-y-3 m-0">
            {changeHistory.length === 0 ? (
              <EmptyState message="No changes applied yet." />
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    Applied Changes
                  </h3>
                  <button
                    onClick={onClearHistory}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 hover:bg-muted/50 px-1.5 py-0.5 rounded [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-3"
                    data-testid="btn-clear-history"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                </div>
                {changeHistory.map(entry => (
                  <Card key={entry.id} className="p-3 bg-card shadow-sm border border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs font-medium text-foreground truncate">{entry.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{typeLabels[entry.type] || entry.type}</span>
                        <span className="text-[10px] text-muted-foreground">{formatTimeAgo(entry.timestamp)}</span>
                      </div>
                    </div>
                    <div className="pl-5 flex items-center gap-2 text-xs">
                      <span className="line-through text-muted-foreground break-words">{entry.original}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-foreground font-medium break-words">{entry.replacement}</span>
                    </div>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="ideas" className="p-4 space-y-4 m-0">
            <div className="bg-muted/50 rounded-lg p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ask AI</h4>
              <div className="relative">
                <textarea
                  className="w-full bg-background border border-border/60 rounded-md p-2 text-xs min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                  placeholder="Ask for ideas, character names, setting descriptions..."
                  value={ideaPrompt}
                  onChange={(e) => setIdeaPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIdeaSubmitDirect(ideaPrompt); } }}
                  data-testid="textarea-idea-prompt"
                />
                <Button
                  size="icon"
                  className="absolute bottom-1 right-1 h-6 w-6 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => handleIdeaSubmitDirect(ideaPrompt)}
                  disabled={ideaLoading}
                  data-testid="btn-submit-idea"
                >
                  {ideaLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {ideaResponse && (
              <Card className="p-3 bg-card shadow-sm border border-border/60">
                <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="idea-response">
                  {ideaResponse}
                </div>
              </Card>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quick Prompts</h4>
              {[
                "Suggest 3 ways to increase tension in this scene",
                "Help me describe the setting in more vivid detail",
                "What plot twist could happen next?",
                "Suggest names for a mysterious character",
              ].map((prompt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="w-full justify-start text-left text-xs h-auto py-2 font-normal whitespace-normal bg-card"
                  onClick={() => { setIdeaPrompt(prompt); handleIdeaSubmitDirect(prompt); }}
                  data-testid={`btn-quick-prompt-${i}`}
                >
                  <MessageSquareDashed className="w-3.5 h-3.5 mr-2 shrink-0 text-primary/70" />
                  {prompt}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="coach" className="m-0 flex flex-col h-full">
            <div className="flex flex-col h-[calc(100vh-14rem)]">
              {coachMessages.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center p-4 space-y-3">
                  <div className="text-center mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Writing Coach</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Share your ideas and I'll ask questions, give feedback, and help you develop your story.
                    </p>
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Start with</p>
                  {STARTER_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleCoachSend(prompt)}
                      className="w-full text-left text-xs p-2.5 rounded-lg border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all [@media(pointer:coarse)]:min-h-[44px]"
                      data-testid={`btn-coach-starter-${i}`}
                    >
                      <span className="text-primary/70 mr-1.5">→</span>
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : (
                <div ref={coachScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="coach-message-list">
                  {coachMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`} data-testid={`coach-message-${i}`}>
                      <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${msg.role === 'user' ? 'bg-primary/20' : 'bg-muted'}`}>
                        {msg.role === 'user' ? <User className="w-3 h-3 text-primary" /> : <Bot className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                        <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words max-w-[90%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground self-end' : 'bg-muted text-foreground self-start'}`}>
                          {msg.content}
                          {msg.role === 'assistant' && coachLoading && i === coachMessages.length - 1 && msg.content === '' && (
                            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground inline" />
                          )}
                        </div>
                        {msg.role === 'assistant' && msg.content && !(coachLoading && i === coachMessages.length - 1) && onInsertText && (
                          <button
                            onClick={() => onInsertText(msg.content)}
                            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-primary/10 transition-colors [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-3"
                            data-testid={`btn-coach-insert-${i}`}
                          >
                            <ClipboardCopy className="w-2.5 h-2.5" />
                            Insert
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-border/50 p-3 space-y-2">
                {coachMessages.length > 0 && (
                  <button onClick={handleCoachReset} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-2" data-testid="btn-coach-reset">
                    <RotateCcw className="w-3 h-3" />
                    Start over
                  </button>
                )}
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={coachInputRef}
                    className="flex-1 bg-background border border-border/60 rounded-md p-2 text-xs min-h-[60px] max-h-[120px] focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                    placeholder="Share an idea, ask a question, or describe a scene..."
                    value={coachInput}
                    onChange={(e) => setCoachInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCoachSend(); } }}
                    disabled={coachLoading}
                    data-testid="textarea-coach-input"
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
                    onClick={() => handleCoachSend()}
                    disabled={coachLoading || !coachInput.trim()}
                    data-testid="btn-coach-send"
                  >
                    {coachLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/60">Enter to send · Shift+Enter for new line</p>
              </div>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
