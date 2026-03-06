import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Upload, Loader2, ExternalLink, Check, Link } from 'lucide-react';

interface GoogleDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'import' | 'export';
  activeDocId: number | null;
  activeDocTitle: string;
  onImported: (doc: any) => void;
}

function extractDocId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

export default function GoogleDocsDialog({
  open, onOpenChange, mode, activeDocId, activeDocTitle, onImported
}: GoogleDocsDialogProps) {
  const [docInput, setDocInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleImport = async () => {
    const docId = extractDocId(docInput);
    if (!docId) {
      setImportError('Please enter a valid Google Docs URL or document ID.');
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch('/api/gdocs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Import failed');
      }
      const doc = await res.json();
      onImported(doc);
      setDocInput('');
      onOpenChange(false);
    } catch (e: any) {
      setImportError(e.message || 'Import failed. Please check the URL and try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    if (!activeDocId) return;
    setExporting(true);
    setExportResult(null);
    setExportError(null);
    try {
      const res = await fetch('/api/gdocs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: activeDocId, googleDocTitle: activeDocTitle }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const result = await res.json();
      setExportResult(result);
    } catch (e: any) {
      setExportError(e.message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setDocInput('');
      setImportError(null);
      setExportResult(null);
      setExportError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              ? 'Paste a Google Docs URL or document ID to import.'
              : `Export "${activeDocTitle}" as a new Google Doc.`}
          </DialogDescription>
        </DialogHeader>

        {mode === 'import' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Link className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="https://docs.google.com/document/d/... or document ID"
                  value={docInput}
                  onChange={(e) => { setDocInput(e.target.value); setImportError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); }}
                  disabled={importing}
                  data-testid="input-gdoc-url"
                />
              </div>
              {importError && (
                <p className="text-sm text-destructive" data-testid="text-import-error">{importError}</p>
              )}
            </div>
            <Button
              onClick={handleImport}
              disabled={importing || !docInput.trim()}
              className="w-full bg-primary text-primary-foreground"
              data-testid="btn-confirm-import-gdoc"
            >
              {importing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" /> Import Document</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Make sure the document is accessible to your Google account.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {!exportResult ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  This will create a new Google Doc with your current document content.
                </p>
                {exportError && (
                  <p className="text-sm text-destructive mb-3" data-testid="text-export-error">{exportError}</p>
                )}
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
