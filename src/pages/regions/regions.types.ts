export interface Region {
  id: number;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  created_at: string;
}

export interface SaveRegionPayload {
  name: string;
}
