export interface Entity {
  id: string
  name: string
  type: string
}

export interface Space {
  id: string
  name: string
  note_count: number
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
  spaces: Space[]
}

export interface NoteDetail {
  id: string
  content: string
  created_at: string
  relatedEntities: Entity[]
}
