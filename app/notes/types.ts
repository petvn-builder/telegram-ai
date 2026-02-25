export interface Entity {
  id: string
  name: string
  type: string
}

export interface Note {
  id: string
  user_id: string
  content: string
  created_at: string
}

export interface NoteWithEntities {
  id: string
  content: string
  created_at: string
  entities: Entity[]
}

export interface NoteDetail {
  id: string
  content: string
  created_at: string
  relatedEntities: Entity[]
}
