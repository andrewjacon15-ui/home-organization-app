export interface Family {
  id: string
  name: string
  ownerId: string
  timezone: string
}

export interface Member {
  id: string
  displayName: string
  email: string
  color: string
  photoURL?: string
}

export interface Invite {
  email: string
  familyId: string
  invitedBy: string
}

export interface Chore {
  id: string
  title: string
  assigneeId: string | null
  /** YYYY-MM-DD, or null for "whenever". */
  dueDate: string | null
  done: boolean
  points: number
}

export type NewChore = Omit<Chore, 'id' | 'done'>

export interface MealPlan {
  breakfast: string
  lunch: string
  dinner: string
  notes: string
}

export type MealSlot = keyof MealPlan
