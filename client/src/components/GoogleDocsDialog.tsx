import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Download, Upload, Loader2, ExternalLink, Check } from 'lucide-react';

interface GoogleDocsFile {
  id: string;
  name: string;
  modifiedTime: string;
}

interface GoogleDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'import' | 'export';
  activeDocId: number | null;
  activeDocTitle: string;
  onImported: (doc: any) => void;
}

export default function GoogleDocsDialog({
  open, onOpenChange, mode, activeDocId, activeDocTitle, onImported
}: GoogleDocsDialogProps) {
  const [importing, setImporting] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string } | null>(null);

  const { data, isLoading, error } = useQuery<{ files: GoogleDocsFile[] }>({
    queryKey: ['/api/gdocs/list'],
    queryFn: async () => {
      const res = await fetch('/api/gdocs/list');
      if (!res.ok) throw new Error('Failed to load Google Docs');
      return res.json();
    },
    enabled: open && mode === 'import',
  });

  const handleImport = async (fileId: string) => {
    setImporting(fileId);
    try {
      const res = await fetch('/api/gdocs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: fileId }),
      });
      if (!res.ok) throw new Error('Import failed');
      const doc = await res.json();
      onImported(doc);
      onOpenChange(false);
    } catch (e) {
      console.error('Import failed:', e);
    } finally {
      setImporting(null);
    }
  };

  const handleExport = async () => {
    if (!activeDocId) return;
    setExporting(true);
    setExportResult(null);
    try {
      const res = await fetch('/api/gdocs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: activeDocId, googleDocTitle: activeDocTitle }),
      });
      if (!res.ok) throw new Error('Export failed');
      const result = await res.json();
      setExportResult(result);
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'import' ? (
              <><Download className="w-5 h-5 text-primary" /> Import from Google Docs</>
            ) : (
              <><Upload className="w-5 h-5 text-primary" /> Export to Google Docs</>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === 'import'
              ? 'Select a Google Doc to import into Lumina.'
              : `Export "${activeDocTitle}" as a new Google Doc.`}
          </DialogDescription>
        </DialogHeader>

        {mode === 'import' ? (
          <div>
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading your Google Docs...
              </div>
            )}

            {error && (
              <div className="text-center py-6 text-sm text-destructive">
                Failed to load Google Docs. Please check your connection.
              </div>
            )}

            {data && data.files.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No Google Docs found in your account.
              </div>
            )}

            {data && data.files.length > 0 && (
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-1">
                  {data.files.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => handleImport(file.id)}
                      disabled={importing !== null}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                      data-testid={`gdoc-import-${file.id}`}
                    >
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(file.modifiedTime).toLocaleDateString()}
                        </p>
                      </div>
                      {importing === file.id && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {!exportResult ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  This will create a new Google Doc with your current document content.
                </p>
                <Button
                  onClick={handleExport}
                  disabled={exporting || !activeDocId}
                  className="bg-primary text-primary-foreground"
                  data-testid="btn-confirm-export-gdoc"
                >
                  {exporting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Export Now</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">Exported successfully!</span>
                </div>
                <a
                  href={exportResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid="link-exported-gdoc"
                >
                  Open in Google Docs <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
