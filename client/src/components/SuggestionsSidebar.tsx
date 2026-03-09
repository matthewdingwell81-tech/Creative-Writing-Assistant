import React, { useState } from 'react';
import {
  Sparkles, BookOpen, AlertCircle, TrendingUp, CheckCircle2,
  ChevronRight, MessageSquareDashed, Check, Loader2, RefreshCw, Type, TextSelect
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { streamIdeas } from '@/lib/api';
import type { Suggestion } from '@/hooks/useSuggestions';

interface SuggestionsSidebarProps {
  suggestions: Suggestion[];
  loading: boolean;
  onApplySuggestion?: (original: string, replacement: string) => void;
  documentContent: string;
  documentType: string;
  selectedText?: string;
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
  sug,
  index,
  appliedSuggestions,
  onApply,
}: {
  sug: Suggestion;
  index: number;
  appliedSuggestions: Set<string>;
  onApply: (id: string, original: string, replacement: string) => void;
}) {
  const config = severityConfig[sug.severity] || severityConfig.info;
  const Icon = config.icon;
  return (
    <Card className={`p-3 bg-card border-l-2 ${config.borderColor} shadow-sm border-t-0 border-r-0 border-b-0 rounded-r-lg rounded-l-sm`}>
      <div className="flex items-start gap-2 mb-2">
        <Icon className={`w-4 h-4 ${config.iconColor} mt-0.5 shrink-0`} />
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">{sug.title}</h4>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{typeLabels[sug.type] || sug.type}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{sug.description}</p>
        </div>
      </div>

      {sug.original && sug.alternatives.length > 0 && (
        <div className="pl-6 space-y-2 mt-3">
          {sug.alternatives.map((alt, j) => {
            const sugId = `sug-${index}-${j}`;
            const isApplied = appliedSuggestions.has(sugId);
            return (
              <button
                key={j}
                onClick={() => onApply(sugId, sug.original!, alt)}
                disabled={isApplied}
                className="w-full text-left text-xs p-2 bg-muted/50 rounded-md border border-border/50 hover:border-primary/40 transition-all flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`btn-apply-suggestion-${index}-${j}`}
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="line-through text-muted-foreground break-words">{sug.original}</span>
                  <span className="text-foreground font-medium flex items-start gap-1">
                    <Sparkles className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
                    <span className="break-words">{alt}</span>
                  </span>
                </div>
                {isApplied ? (
                  <Check className="w-4 h-4 text-primary shrink-0 ml-2" />
                ) : (
                  <span className="opacity-0 group-hover:opacity-100 text-primary text-[10px] font-medium transition-opacity shrink-0 ml-2">Apply</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function SuggestionsSidebar({
  suggestions, loading, onApplySuggestion, documentContent, documentType, selectedText
}: SuggestionsSidebarProps) {
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());
  const [ideaPrompt, setIdeaPrompt] = useState('');
  const [ideaResponse, setIdeaResponse] = useState('');
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('grammar');

  const handleApply = (id: string, original: string, replacement: string) => {
    if (onApplySuggestion) {
      onApplySuggestion(original, replacement);
      setAppliedSuggestions(prev => new Set(prev).add(id));
    }
  };

  const handleIdeaSubmit = async (prompt: string) => {
    if (!prompt.trim()) return;
    setIdeaLoading(true);
    setIdeaResponse('');
    try {
      await streamIdeas(
        documentContent,
        prompt,
        documentType,
        (chunk) => setIdeaResponse(prev => prev + chunk),
        () => setIdeaLoading(false)
      );
    } catch {
      setIdeaResponse('Failed to generate ideas. Please try again.');
      setIdeaLoading(false);
    }
  };

  const handleReviewSelection = () => {
    if (!selectedText) return;
    const prompt = `Please provide detailed feedback on this specific passage I've selected from my writing. Analyze it for clarity, impact, word choice, rhythm, and any improvements you'd suggest:\n\n"${selectedText}"`;
    setActiveTab('ideas');
    setIdeaPrompt('');
    handleIdeaSubmit(prompt);
  };

  const grammarSuggestions = suggestions.filter(s => s.type === 'grammar');
  const reviewSuggestions = suggestions.filter(s => ['vocabulary', 'style', 'tone'].includes(s.type));
  const storySuggestions = suggestions.filter(s => ['pacing', 'story'].includes(s.type));

  const truncatedSelection = selectedText && selectedText.length > 80
    ? selectedText.slice(0, 80) + '…'
    : selectedText;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="p-4 border-b border-border/50 bg-card/50">
        <h2 className="font-medium flex items-center gap-2 text-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          Creative Assistant
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {loading ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</span>
          ) : (
            `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} found`
          )}
        </p>
      </div>

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
            className="w-full mt-2 h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleReviewSelection}
            disabled={ideaLoading}
            data-testid="btn-review-selection"
          >
            {ideaLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            Review This Selection
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col w-full">
        <div className="px-4 pt-3 pb-0 border-b border-border/50">
          <TabsList className="w-full bg-muted/50 grid grid-cols-4 p-1 rounded-lg">
            <TabsTrigger value="grammar" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-grammar">
              Grammar {grammarSuggestions.length > 0 && `(${grammarSuggestions.length})`}
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-review">
              Review {reviewSuggestions.length > 0 && `(${reviewSuggestions.length})`}
            </TabsTrigger>
            <TabsTrigger value="story" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-story">
              Story {storySuggestions.length > 0 && `(${storySuggestions.length})`}
            </TabsTrigger>
            <TabsTrigger value="ideas" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-ideas">Ideas</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="grammar" className="p-4 space-y-4 m-0">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Checking grammar...</span>
              </div>
            )}
            {!loading && grammarSuggestions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground/60">
                <Type className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No grammar issues found. Nice work!</p>
              </div>
            )}
            {grammarSuggestions.map((sug, i) => (
              <SuggestionCard
                key={`grammar-${i}`}
                sug={sug}
                index={i}
                appliedSuggestions={appliedSuggestions}
                onApply={handleApply}
              />
            ))}
          </TabsContent>

          <TabsContent value="suggestions" className="p-4 space-y-4 m-0">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Analyzing your writing...</span>
              </div>
            )}
            {!loading && reviewSuggestions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground/60">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Looking good! Keep writing and suggestions will appear here.</p>
              </div>
            )}
            {reviewSuggestions.map((sug, i) => (
              <SuggestionCard
                key={`review-${i}`}
                sug={sug}
                index={i + grammarSuggestions.length}
                appliedSuggestions={appliedSuggestions}
                onApply={handleApply}
              />
            ))}
          </TabsContent>

          <TabsContent value="story" className="p-4 space-y-4 m-0">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Analyzing story structure...</span>
              </div>
            )}
            {!loading && storySuggestions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground/60">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Write more and story-level analysis will appear here.</p>
              </div>
            )}
            {storySuggestions.map((sug, i) => {
              const Icon = sug.type === 'pacing' ? TrendingUp : BookOpen;
              return (
                <Card key={`story-${i}`} className="p-3 bg-card shadow-sm border border-border/60">
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                    <Icon className="w-4 h-4 text-primary" />
                    {sug.title}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sug.description}</p>
                  {sug.alternatives.length > 0 && (
                    <div className="mt-3 bg-muted/50 p-3 rounded-md">
                      <p className="text-xs font-medium mb-2">Consider:</p>
                      <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                        {sug.alternatives.map((alt, j) => (
                          <li key={j}>{alt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              );
            })}
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIdeaSubmit(ideaPrompt); } }}
                  data-testid="textarea-idea-prompt"
                />
                <Button
                  size="icon"
                  className="absolute bottom-1 right-1 h-6 w-6 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => handleIdeaSubmit(ideaPrompt)}
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
                  onClick={() => { setIdeaPrompt(prompt); handleIdeaSubmit(prompt); }}
                  data-testid={`btn-quick-prompt-${i}`}
                >
                  <MessageSquareDashed className="w-3.5 h-3.5 mr-2 shrink-0 text-primary/70" />
                  {prompt}
                </Button>
              ))}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
