export interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: number;
  weight?: number;
  photoUrl?: string;
  notes?: string;
  ownerId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  userId?: string;
  attachments?: {
    type: 'image' | 'video';
    url: string;
  }[];
}

export interface HealthRecord {
  id: string;
  petId: string;
  type: 'vaccination' | 'medication' | 'vet_visit' | 'symptom';
  date: string;
  title: string;
  notes?: string;
  vetName?: string;
  medicationName?: string;
  dosage?: string;
  timestamp: any;
}

export interface TrainingTask {
  id: string;
  title: string;
  description: string;
  category: 'basic' | 'behavior' | 'advanced';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface TrainingProgress {
  id: string;
  petId: string;
  taskId: string;
  status: 'not_started' | 'in_progress' | 'mastered';
  lastPracticed: any;
  videoUrl?: string;
}

export interface Playdate {
  id: string;
  hostId: string;
  hostPetId: string;
  guestId?: string;
  guestPetId?: string;
  location: string;
  dateTime: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  notes?: string;
}

export interface SocialPost {
  id: string;
  userId: string;
  petId: string;
  content: string;
  imageUrl?: string;
  timestamp: any;
  likes: string[];
}

export interface ForumPost {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  commentCount: number;
  likeCount: number;
  likes: string[];
  isModerated: boolean;
  moderationReason?: string;
}

export interface ForumComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: any;
}

export interface ExpertQuestion {
  id: string;
  authorId: string;
  authorName: string;
  petId?: string;
  petName?: string;
  question: string;
  aiAnswer?: string;
  expertAnswer?: string;
  expertName?: string;
  status: 'pending' | 'answered' | 'escalated';
  createdAt: any;
}

export interface ShoppingItem {
  title: string;
  price: string;
  source: string;
  url: string;
  imageUrl?: string;
  rating?: string;
  dealInfo?: string;
}

export interface Coupon {
  code: string;
  description: string;
  expiry?: string;
  source: string;
}
