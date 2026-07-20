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
}

export interface Idea {
  id: number;
  documentId: number;
  content: string;
  createdAt: Date;
}
