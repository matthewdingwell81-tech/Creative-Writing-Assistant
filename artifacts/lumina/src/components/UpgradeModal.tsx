import { Check, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade: () => void | Promise<void>;
}

export default function UpgradeModal({ open, onOpenChange, onUpgrade }: UpgradeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl" data-testid="upgrade-modal">
        <DialogHeader>
          <Crown className="mb-2 h-7 w-7 text-primary" aria-hidden="true" />
          <DialogTitle>Upgrade to Premium</DialogTitle>
          <DialogDescription>
            You’ve used today’s free AI queries. Your allowance resets at local midnight, or you can earn bonus queries by watching a rewarded ad.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 py-3 text-sm">
          {["Unlimited AI queries", "No ads", "Web portal access"].map(benefit => (
            <li key={benefit} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{benefit}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Premium purchases are coming soon. Compare plans for details.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button className="min-h-11" data-testid="btn-upgrade-now" onClick={() => { onOpenChange(false); void onUpgrade(); }}>Upgrade Now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
