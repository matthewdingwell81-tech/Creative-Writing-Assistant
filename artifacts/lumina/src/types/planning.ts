export type PlanningKind = "character" | "relationship" | "timeline" | "worldbuilding" | "note";

export interface PlanningInput {
  kind: PlanningKind;
  title: string;
  content?: string;
  role?: string;
  motivations?: string;
  traits?: string;
  arc?: string;
  category?: string;
  timeLabel?: string;
  chapterId?: number | null;
  characterId?: number | null;
  relatedCharacterId?: number | null;
}

export interface PlanningRecord extends Required<PlanningInput> {
  id: number;
  documentId: number;
  position: number;
  createdAt: string;
  updatedAt: string;
}
