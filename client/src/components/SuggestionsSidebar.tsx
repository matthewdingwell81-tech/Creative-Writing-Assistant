import React from 'react';
import { Sparkles, BookOpen, AlertCircle, TrendingUp, CheckCircle2, ChevronRight, MessageSquareDashed } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SuggestionsSidebar() {
  return (
    <div className="flex flex-col h-full h-[calc(100vh-3.5rem)]">
      <div className="p-4 border-b border-border/50 bg-card/50">
        <h2 className="font-medium flex items-center gap-2 text-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          AI Co-Pilot
        </h2>
        <p className="text-xs text-muted-foreground mt-1">Real-time analysis active</p>
      </div>

      <Tabs defaultValue="suggestions" className="flex-1 flex flex-col w-full">
        <div className="px-4 pt-3 pb-0 border-b border-border/50">
          <TabsList className="w-full bg-muted/50 grid grid-cols-3 p-1 rounded-lg">
            <TabsTrigger value="suggestions" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Review</TabsTrigger>
            <TabsTrigger value="story" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Story</TabsTrigger>
            <TabsTrigger value="ideas" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Ideas</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="suggestions" className="p-4 space-y-4 m-0">
            {/* Grammar Suggestion */}
            <Card className="p-3 bg-card border-l-2 border-l-destructive/60 shadow-sm border-t-0 border-r-0 border-b-0 rounded-r-lg rounded-l-sm">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-destructive/80 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-foreground">Repetitive Phrasing</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    You used "exactly the same, yet entirely different" which is a bit cliché.
                  </p>
                </div>
              </div>
              <div className="pl-6 space-y-2 mt-3">
                <div className="text-xs p-2 bg-muted/50 rounded-md border border-border/50 hover:border-primary/40 cursor-pointer transition-colors">
                  <span className="line-through text-muted-foreground mr-2">exactly the same, yet entirely different</span>
                  <span className="text-foreground font-medium">familiar, yet subtly altered by time</span>
                </div>
                <div className="text-xs p-2 bg-muted/50 rounded-md border border-border/50 hover:border-primary/40 cursor-pointer transition-colors">
                  <span className="line-through text-muted-foreground mr-2">exactly the same, yet entirely different</span>
                  <span className="text-foreground font-medium">frozen in time, though she had changed</span>
                </div>
              </div>
            </Card>

            {/* Vocabulary Suggestion */}
            <Card className="p-3 bg-card border-l-2 border-l-primary/60 shadow-sm border-t-0 border-r-0 border-b-0 rounded-r-lg rounded-l-sm">
              <div className="flex items-start gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-foreground">Enhance Description</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Instead of "pressing against her chest", try something more evocative for the gothic tone.
                  </p>
                </div>
              </div>
              <div className="pl-6 mt-2 flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors text-primary border-primary/20">suffocating</Badge>
                <Badge variant="outline" className="text-xs bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors text-primary border-primary/20">constricting</Badge>
                <Badge variant="outline" className="text-xs bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors text-primary border-primary/20">like an iron band</Badge>
              </div>
            </Card>
            
            {/* Tone Match */}
            <Card className="p-3 bg-card border-l-2 border-l-accent-foreground/60 shadow-sm border-t-0 border-r-0 border-b-0 rounded-r-lg rounded-l-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-accent-foreground mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-foreground">Tone Analysis</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Great job maintaining the melancholic atmosphere in this paragraph. The imagery of "dust motes in pale moonlight" works perfectly.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="story" className="p-4 space-y-4 m-0">
             <Card className="p-3 bg-card shadow-sm border border-border/60">
              <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                Pacing Alert
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This chapter has been entirely introspective so far. You might want to introduce an action or dialogue soon to keep the pacing balanced.
              </p>
              <div className="mt-3 bg-muted/50 p-3 rounded-md">
                <p className="text-xs font-medium mb-2">Consider:</p>
                <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                  <li>A sudden noise from the floor above</li>
                  <li>The housekeeper entering the room</li>
                  <li>Discovering an out-of-place object on the table</li>
                </ul>
              </div>
            </Card>

            <Card className="p-3 bg-card shadow-sm border border-border/60">
              <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-primary" />
                Arc Tracking
              </h4>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">Elara's Acceptance</span>
                    <span className="text-muted-foreground">30%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[30%]"></div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  She is still showing strong resistance to returning home.
                </p>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="ideas" className="p-4 space-y-4 m-0">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-center text-primary/80 italic">
              "What if the teacup belonged to someone who shouldn't be dead?"
            </div>
            
            <div className="bg-muted/50 rounded-lg p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Prompt AI</h4>
              <div className="relative">
                <textarea 
                  className="w-full bg-background border border-border/60 rounded-md p-2 text-xs min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                  placeholder="Ask for ideas, character names, setting descriptions..."
                ></textarea>
                <Button size="icon" className="absolute bottom-1 right-1 h-6 w-6 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quick Prompts</h4>
              <Button variant="outline" className="w-full justify-start text-left text-xs h-auto py-2 font-normal whitespace-normal bg-card">
                <MessageSquareDashed className="w-3.5 h-3.5 mr-2 shrink-0 text-primary/70" />
                Describe the grandfather clock in more detail
              </Button>
              <Button variant="outline" className="w-full justify-start text-left text-xs h-auto py-2 font-normal whitespace-normal bg-card">
                <MessageSquareDashed className="w-3.5 h-3.5 mr-2 shrink-0 text-primary/70" />
                Suggest 3 reasons Elara left the manor
              </Button>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// Temporary badge component since I didn't see one in the list immediately 
// or it's faster to inline for this small thing
function Badge({ children, className, variant = "default" }: { children: React.ReactNode, className?: string, variant?: "default" | "outline" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variant === 'outline' ? 'border border-border' : 'border-transparent bg-primary text-primary-foreground'} ${className || ''}`}>
      {children}
    </span>
  )
}
