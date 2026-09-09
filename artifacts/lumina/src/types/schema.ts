export interface Document {
  id: number;
  userId: string;
  title: string;
  content: string;
  documentType: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  id: number;
  documentId: number;
  title: string;
  content: string;
  position: number;
  cardColor: 'lavender' | 'rose' | 'amber' | 'sage' | 'sky' | 'slate';
  synopsis: string;
}

export interface Idea {
  id: number;
  documentId: number;
  content: string;
  createdAt: Date;
}

export interface Research {
  id: number;
  documentId: number;
  title: string;
  content: string;
  type: "text" | "link" | "image";
  url: string | null;
  objectPath: string | null;
  mimeType: string | null;
  size: number | null;
  tags: string[];
  isGlobal: boolean;
  favorite: boolean;
  important: boolean;
  createdAt: Date;
  updatedAt: Date;
}
