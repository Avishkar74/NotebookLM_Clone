export type InspectorTab = "output" | "metadata" | "raw";

export interface UIState {
  isInspectorExpanded: boolean;
  activeInspectorTab: InspectorTab;
  selectedDocumentIds: string[];
}
