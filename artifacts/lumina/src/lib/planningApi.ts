import { apiFetch } from "./api";
import type { PlanningInput, PlanningKind, PlanningRecord } from "@/types/planning";

async function planningResponse(response: Response): Promise<PlanningRecord> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Could not save this planning entry. Please try again.");
  }
  return response.json();
}

export async function fetchPlanning(documentId: number): Promise<PlanningRecord[]> {
  const response = await apiFetch(`/api/documents/${documentId}/planning`);
  if (!response.ok) throw new Error("Could not load your story plan.");
  return response.json();
}

export async function createPlanning(documentId: number, input: PlanningInput): Promise<PlanningRecord> {
  return planningResponse(await apiFetch(`/api/documents/${documentId}/planning`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
}

export async function updatePlanning(documentId: number, id: number, input: PlanningInput): Promise<PlanningRecord> {
  return planningResponse(await apiFetch(`/api/documents/${documentId}/planning/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
}

export async function deletePlanning(documentId: number, id: number): Promise<void> {
  const response = await apiFetch(`/api/documents/${documentId}/planning/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Could not delete this planning entry.");
}

export async function reorderPlanning(documentId: number, kind: PlanningKind, ids: number[]): Promise<PlanningRecord[]> {
  const response = await apiFetch(`/api/documents/${documentId}/planning/order`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ids }),
  });
  if (!response.ok) throw new Error("Could not save the order. Please try again.");
  return response.json();
}
