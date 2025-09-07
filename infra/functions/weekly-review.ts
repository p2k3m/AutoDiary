export interface WeeklyReviewResult {
  connectorsDigest?: {
    meetingsHours: number;
    topContacts: string[];
    photosCount: number;
  };
  aiSummary?: string;
}

export async function handler(): Promise<WeeklyReviewResult> {
  return {
    connectorsDigest: {
      meetingsHours: 0,
      topContacts: [],
      photosCount: 0,
    },
    aiSummary: '',
  };
}
